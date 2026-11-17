/* api/reviews/index.js — the yearly performance review ("reviews" container, partition key
   /empId, one document per person per year at the offices), and the review questions
   (appState document "review-questions").
   GET                → { review, questions } for the caller; the manager's side is left out
                        until the manager shares it
   GET ?empId=        → { review } for someone the caller may see
   GET ?team=1        → { reviews } for everyone the caller may see, themselves excepted
   POST { action: 'save', empId, side: 'self' | 'manager', data: { ratings, comments, overall, done } }
   POST { action: 'share', empId }      → the manager shares a finished review
   POST { action: 'questions', questions } → HR and leadership set the questions */

const { handler, resolveCaller, HttpError } = require('../_shared/caller');
const { cosmos, queryAll, strip, collPath } = require('../_shared/cosmos');
const { reportingTree, seesAllOn } = require('../_shared/access-rules');

const REVIEWS = collPath('reviews');
const APP = collPath('appState');
const yearAtOffices = (ms) => Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric' }).format(new Date(ms)));
const blank = () => ({ ratings: {}, comments: {}, overall: '', done: false });

/* one side of a review, checked and trimmed: ratings 1 to 5 and comments by question id */
function cleanSide(d) {
  const src = d && typeof d === 'object' ? d : {};
  const ratings = {}, comments = {};
  Object.entries(src.ratings || {}).slice(0, 100).forEach(([k, v]) => { const n = Number(v); if (/^[\w-]{1,40}$/.test(k) && Number.isInteger(n) && n >= 1 && n <= 5) ratings[k] = n; });
  Object.entries(src.comments || {}).slice(0, 100).forEach(([k, v]) => { const t = String(v || '').slice(0, 2000); if (/^[\w-]{1,40}$/.test(k) && t) comments[k] = t; });
  return { ratings, comments, overall: String(src.overall || '').slice(0, 5000), done: !!src.done };
}

module.exports = handler(['GET', 'POST'], async ({ req, body }) => {
  const c = await resolveCaller(req);
  const { me, employees, access } = c;
  const year = yearAtOffices(Date.now());
  const everyone = access.caps.viewAll || seesAllOn(access, 'reviews');
  const tree = new Set(reportingTree(me, employees).map(e => e.id));
  const leads = (empId) => empId !== me.id && (everyone || tree.has(empId));
  const idFor = (empId) => `${empId}-${year}`;
  const readReview = async (empId) => {
    const r = await cosmos({ verb: 'GET', resId: `${REVIEWS}/docs/${idFor(empId)}`, path: `/${REVIEWS}/docs/${idFor(empId)}`, partitionKey: empId });
    if (r.status === 404) return null;
    if (r.status !== 200) throw new Error('review read failed: ' + r.status);
    return r.body;
  };
  /* what the employee themselves may see: the manager's side only once shared */
  const forEmployee = (doc) => {
    const r = doc ? strip(doc) : { empId: me.id, year, self: blank(), shared: false };
    if (!r.shared) delete r.manager;
    return { ...r, shared: !!r.shared };
  };

  if (req.method === 'GET') {
    const q = req.query || {};
    if (q.team) {
      const ids = employees.filter(e => leads(e.id)).map(e => e.id);
      const rows = ids.length ? (await queryAll(REVIEWS, [['empId', 'in', ids], ['year', '=', year]])).map(strip) : [];
      return { status: 200, body: { reviews: rows } };
    }
    if (q.empId && String(q.empId) !== me.id) {
      const empId = String(q.empId);
      if (!leads(empId)) throw new HttpError(403, 'Not allowed to see that review');
      const doc = await readReview(empId);
      return { status: 200, body: { review: doc ? strip(doc) : null } };
    }
    const qd = await cosmos({ verb: 'GET', resId: `${APP}/docs/review-questions`, path: `/${APP}/docs/review-questions`, partitionKey: 'review-questions' });
    return { status: 200, body: { review: forEmployee(await readReview(me.id)), questions: qd.status === 200 ? qd.body.questions : null } };
  }

  const input = body || {};

  if (input.action === 'questions') {
    if (!(access.flags.isHR || access.flags.isExec)) throw new HttpError(403, 'HR and leadership set the review questions');
    const list = Array.isArray(input.questions) ? input.questions.slice(0, 100) : null;
    const questions = list && list.map(x => ({ id: String((x && x.id) || '').slice(0, 40), category: String((x && x.category) || '').trim().slice(0, 80), text: String((x && x.text) || '').trim().slice(0, 500) }));
    if (!questions || questions.some(x => !/^[\w-]{1,40}$/.test(x.id) || !x.category || !x.text)) throw new HttpError(400, 'Each question needs a category and its words');
    const doc = { id: 'review-questions', type: 'review-questions', questions, updatedBy: c.identity.email, updatedAt: new Date().toISOString() };
    const r = await cosmos({ verb: 'POST', resId: APP, path: `/${APP}/docs`, body: doc, partitionKey: doc.type, upsert: true });
    if (r.status !== 200 && r.status !== 201) throw new Error('questions save failed: ' + r.status);
    return { status: 200, body: { questions } };
  }

  const empId = String(input.empId || '');
  if (input.action === 'save') {
    const which = input.side;
    if (which === 'self' ? empId !== me.id : !(which === 'manager' && leads(empId))) throw new HttpError(403, 'Not yours to write');
    // read, change only this side, and write with the version, so the other side's save is never lost
    for (let attempt = 0; attempt < 3; attempt++) {
      const cur = await readReview(empId);
      if (cur && cur.shared) throw new HttpError(409, 'This review has been shared and can’t be changed');
      const next = { ...(cur ? strip(cur) : { id: idFor(empId), empId, year, self: blank(), shared: false }), [which]: cleanSide(input.data), updatedAt: new Date().toISOString(), [which + 'By']: c.identity.email };
      const r = await cosmos({ verb: 'POST', resId: REVIEWS, path: `/${REVIEWS}/docs`, body: next, partitionKey: empId, upsert: !!cur, ifMatch: cur ? cur._etag : undefined });
      if (r.status === 412 || r.status === 409) continue;
      if (r.status !== 200 && r.status !== 201) throw new Error('review save failed: ' + r.status);
      return { status: 200, body: { review: which === 'self' ? forEmployee(r.body) : strip(r.body) } };
    }
    throw new HttpError(409, 'The review changed just now. Try again.');
  }

  if (input.action === 'share') {
    if (!leads(empId)) throw new HttpError(403, 'Not yours to share');
    const cur = await readReview(empId);
    if (!cur || !cur.manager || !cur.manager.done) throw new HttpError(409, 'Finish the manager review before sharing it');
    if (cur.shared) return { status: 200, body: { review: strip(cur) } };
    const r = await cosmos({ verb: 'POST', resId: REVIEWS, path: `/${REVIEWS}/docs`, body: { ...strip(cur), shared: true, sharedBy: c.identity.email, sharedAt: new Date().toISOString() }, partitionKey: empId, upsert: true, ifMatch: cur._etag });
    if (r.status === 412) throw new HttpError(409, 'The review changed just now. Try again.');
    if (r.status !== 200 && r.status !== 201) throw new Error('share failed: ' + r.status);
    return { status: 200, body: { review: strip(r.body) } };
  }

  throw new HttpError(400, "action must be 'save', 'share' or 'questions'");
});
