/* api/feedback/index.js — feature requests & roadmap, in Cosmos ("feedback" container, partition key /id).
   GET  /api/feedback  → every request (everyone with a roster account may view — matches the brief:
                         "Anyone can submit and view feature requests; admins set status").
   POST /api/feedback  → { action: 'submit' | 'vote' | 'update' | 'addPlanned' | 'delete', ... }
     submit     — anyone: { title, desc, cat } → creates a request, by = caller's own name (server-resolved)
     vote       — anyone: { id } → adds the caller's email to that doc's voter list (once each, server-enforced)
     update     — admin only: { id, status?, eta? } → stamps completedAt when status becomes 'Complete'
     addPlanned — admin only: { title, desc, cat, eta } → creates a Planned-status card for the roadmap
     delete     — admin only: { id } → permanently removes a request/planned card

   Security mirrors api/accesscontrol: valid Google token, domain lock, caller resolved from the
   live roster, admin flag never trusted from the client. */

const { verifyGoogleToken, tokenFromReq } = require('../_shared/auth');
const { cosmos, listAll, strip, collPath, cosmosConfigured, loadRosterAndSupport } = require('../_shared/cosmos');

const ALLOWED_DOMAINS = ['puredental.com', 'foureversmile.com', 'puredentallab.com'];
const STATUSES = ['Submitted', 'Under review', 'Planned', 'In progress', 'Complete', 'Declined'];
const CATS = ['Scheduling', 'Onboarding', 'Time clock', 'Reports', 'Learning', 'Mobile', 'Other'];

function isAdminFor(me, usersByEmail) {
  return !!(usersByEmail[(me.workEmail || '').toLowerCase()] || {}).admin;
}

/* Who may reach the feature-requests / roadmap section. VIEW is manager-or-above (manager,
   HR, leadership, admin — not supervisor/employee); MANAGE (submit, vote, comment, react,
   status/planned/delete) is admin only. Resolved from the live roster, never from the client. */
function feedbackAccess(me, usersByEmail, employees) {
  const p = usersByEmail[(me.workEmail || '').toLowerCase()] || {};
  const dept = (me.department || '').toLowerCase();
  const title = (me.jobTitle || '').toLowerCase();
  const meEmail = (me.workEmail || '').toLowerCase();
  const isAdmin = !!p.admin;
  const isExec = /\b(ceo|chief|coo|cfo|president|owner|principal)\b/.test(title) || ['leadership', 'management team', 'management', 'pure management'].includes(dept);
  const isHR = /human resources|payroll/.test(dept) || /\b(human resources|payroll|people ops)\b/.test(title);
  const hasReports = employees.some(e => e.managerEmail && e.managerEmail.toLowerCase() === meEmail);
  const isManager = !!p.manager || me.isManager || hasReports || /\b(manager|director)\b/.test(title);
  return { isAdmin, canView: isAdmin || isHR || isExec || isManager, canManage: isAdmin };
}

/* Fire a direct notice to one person about activity on a feature request, and push it live on
   the same SignalR channel the client already listens on. Written straight to the notices
   container (feedback is company-wide, so this bypasses /api/notify's office scoping). Never
   notifies you about your own action, and never fails the comment/reaction if the notice does.
   category: 'mention' (comments/replies — badge + ding) or 'social' (reactions — quiet). */
async function notifyRecipient(context, { toEmail, toName, fromEmail, fromName, title, body, category, feedbackId, id }) {
  const to = (toEmail || '').toLowerCase();
  if (!to || to === (fromEmail || '').toLowerCase()) return;
  const NOTICES = collPath('notices');
  const notice = {
    id: id || ('nt-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7)),
    kind: 'notice', category: category || 'mention',
    fromEmail: (fromEmail || '').toLowerCase(), fromName: fromName || fromEmail,
    toEmail: to, toName: toName || to,
    title: String(title || '').slice(0, 200), body: String(body || '').slice(0, 2000),
    read: false, createdAt: new Date().toISOString(),
    deepLink: { view: 'feedback', feedbackId: feedbackId ? String(feedbackId).slice(0, 80) : undefined },
  };
  try {
    await cosmos({ verb: 'POST', resId: NOTICES, path: `/${NOTICES}/docs`, body: notice, partitionKey: to, upsert: true });
    context.bindings.signalRMessages = [...(context.bindings.signalRMessages || []), { userId: to, target: 'notify', arguments: [notice] }];
  } catch (e) { /* best-effort */ }
}

module.exports = async function (context, req) {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Google-Token',
  };
  if (req.method === 'OPTIONS') { context.res = { status: 204, headers }; return; }

  let identity;
  try { identity = await verifyGoogleToken(tokenFromReq(req)); }
  catch (e) { context.res = { status: 401, headers, body: JSON.stringify({ error: 'Not authenticated', detail: e.message }) }; return; }
  if (!ALLOWED_DOMAINS.includes(identity.email.split('@')[1] || '')) {
    context.res = { status: 403, headers, body: JSON.stringify({ error: 'Domain not allowed' }) }; return;
  }
  if (!cosmosConfigured()) { context.res = { status: 500, headers, body: JSON.stringify({ error: 'Missing Cosmos config' }) }; return; }

  const coll = collPath('feedback');
  // voters stays server-only (no reason to expose the full list to every viewer), but each
  // caller needs to know if THEY already voted — otherwise the client can't restore that
  // state after a refresh and a returning voter can trigger a phantom local re-vote.
  // ballots: server-only [{ e, v }] with v ∈ {-1,1,2} (down / up / double-up), one per person.
  // Legacy `voters` (plain emails) count as +1 each until the doc is next written.
  const ballotsOf = doc => {
    const out = (doc.ballots || []).filter(b => b && b.e && b.v).map(b => ({ e: b.e, v: b.v }));
    const seen = new Set(out.map(b => b.e));
    (doc.voters || []).forEach(e => { if (e && !seen.has(e)) { out.push({ e, v: 1 }); seen.add(e); } });
    return out;
  };
  const clean = doc => {
    const { voters, ballots, ...rest } = doc;
    const b = ballotsOf(doc);
    const up = b.reduce((s, x) => s + (x.v > 0 ? x.v : 0), 0);
    const down = b.reduce((s, x) => s + (x.v < 0 ? -x.v : 0), 0);
    return { ...rest, votes: up - down, upCount: up, downCount: down, myVote: (b.find(x => x.e === identity.email) || {}).v || 0 };
  };

  try {
    const { employees, support } = await loadRosterAndSupport();
    const me = employees.find(e => (e.workEmail || '').toLowerCase() === identity.email);
    if (!me) { context.res = { status: 403, headers, body: JSON.stringify({ error: 'No roster account for ' + identity.email }) }; return; }
    const usersByEmail = {};
    ((support && support.users) || []).forEach(u => { if (u.email) usersByEmail[u.email.toLowerCase()] = u; });
    const fbAccess = feedbackAccess(me, usersByEmail, employees);
    const admin = fbAccess.isAdmin;
    if (!fbAccess.canView) { context.res = { status: 403, headers, body: JSON.stringify({ error: 'Not allowed to view feature requests' }) }; return; }
    const myName = me.name || `${me.first || ''} ${me.last || ''}`.trim() || identity.email;

    /* ---------- READ ---------- */
    if (req.method === 'GET') {
      // listAll follows continuation tokens — a plain single-page GET silently drops
      // documents once the container grows past one page (see _shared/cosmos.js).
      const docs = (await listAll(coll)).map(strip).map(clean).sort((a, b) => (b.votes || 0) - (a.votes || 0));
      // Attach a comment count per request so the card badge shows without opening the
      // thread. One doc per post in feedbackComments (id = post id), holding the array.
      let counts = {};
      try {
        (await listAll(collPath('feedbackComments'))).forEach(d => { counts[d.id] = ((d.comments || []).length) || 0; });
      } catch (e) { /* container may be empty/absent — counts default to 0 */ }
      docs.forEach(d => { d.commentCount = counts[d.id] || 0; });
      context.res = { status: 200, headers, body: JSON.stringify({ items: docs }) };
      return;
    }

    /* ---------- WRITE ---------- */
    let input = req.body;
    if (typeof input === 'string') { try { input = JSON.parse(input); } catch (e) { input = null; } }
    if (!input || !input.action) { context.res = { status: 400, headers, body: JSON.stringify({ error: 'action is required' }) }; return; }
    // Reads (fetch a file / a thread) are fine for any viewer; everything else mutates and is
    // admin-only. Non-admin managers get read-only access to the section.
    if (!['getAttachment', 'getComments'].includes(input.action) && !admin) { context.res = { status: 403, headers, body: JSON.stringify({ error: 'Admin only' }) }; return; }

    if (input.action === 'submit') {
      if (!input.title || !String(input.title).trim()) { context.res = { status: 400, headers, body: JSON.stringify({ error: 'title is required' }) }; return; }
      // Optional gif: only a Giphy CDN URL is stored (no bytes). Restrict to Giphy hosts so
      // this field can't be turned into an arbitrary-image / tracking-pixel vector.
      let gifMeta = null;
      if (input.gif && input.gif.url && /^https:\/\/(media[0-9]*\.giphy\.com|i\.giphy\.com)\//.test(String(input.gif.url))) {
        gifMeta = {
          url: String(input.gif.url).slice(0, 500),
          width: Number(input.gif.width) || 0,
          height: Number(input.gif.height) || 0,
          title: String(input.gif.title || 'gif').slice(0, 200),
        };
      }
      const doc = {
        id: 'fr-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
        title: String(input.title).trim().slice(0, 200),
        desc: String(input.desc || '').trim().slice(0, 2000),
        cat: CATS.includes(input.cat) ? input.cat : 'Other',
        by: myName, byEmail: identity.email,
        status: 'Submitted', eta: '',
        ballots: [{ e: identity.email, v: 1 }],
        createdAt: new Date().toISOString(),
      };
      // Attachments: up to 5, each ≤ ~1.4 MB. Metadata (with a per-file id) rides on the doc as
      // an array; each file's bytes go to their OWN doc in feedback-attachments (keyed by that
      // file id, not the request id), so the feed stays light and files are fetched on demand.
      const rawAtts = Array.isArray(input.attachments) ? input.attachments : (input.attachment ? [input.attachment] : []);
      const incoming = rawAtts.filter(a => a && a.contentBase64).slice(0, 5);
      const attFiles = [];
      for (const a of incoming) {
        // Cosmos caps a document at 2 MB; base64 inflates ~37%, so refuse per-file overflow.
        if (String(a.contentBase64).length > 1900000) { context.res = { status: 413, headers, body: JSON.stringify({ error: 'Attachment too large — max ~1.4 MB each.' }) }; return; }
        attFiles.push({ fileId: doc.id + '-' + attFiles.length + '-' + Math.random().toString(36).slice(2, 7), name: String(a.name || 'file').slice(0, 255), size: Number(a.size) || 0, type: String(a.type || 'application/octet-stream').slice(0, 120), b64: String(a.contentBase64) });
      }
      if (attFiles.length) doc.attachments = attFiles.map(({ b64, ...m }) => m);
      if (gifMeta) doc.gif = gifMeta;
      const up = await cosmos({ verb: 'POST', resId: coll, path: `/${coll}/docs`, body: doc, partitionKey: doc.id, upsert: true });
      if (up.status !== 200 && up.status !== 201) { context.res = { status: 500, headers, body: JSON.stringify({ error: 'submit failed', status: up.status, detail: up.body }) }; return; }
      if (attFiles.length) {
        const attColl = collPath('feedback-attachments');
        for (const f of attFiles) {
          const attDoc = { id: f.fileId, reqId: doc.id, name: f.name, size: f.size, type: f.type, contentBase64: f.b64 };
          const ua = await cosmos({ verb: 'POST', resId: attColl, path: `/${attColl}/docs`, body: attDoc, partitionKey: f.fileId, upsert: true });
          if (ua.status !== 200 && ua.status !== 201) {
            // roll back the request AND any files already written so nothing half-shows / orphans
            await cosmos({ verb: 'DELETE', resId: `${coll}/docs/${doc.id}`, path: `/${coll}/docs/${doc.id}`, partitionKey: doc.id }).catch(() => {});
            for (const g of attFiles) await cosmos({ verb: 'DELETE', resId: `${attColl}/docs/${g.fileId}`, path: `/${attColl}/docs/${g.fileId}`, partitionKey: g.fileId }).catch(() => {});
            context.res = { status: 500, headers, body: JSON.stringify({ error: 'attachment save failed', status: ua.status, detail: ua.body }) }; return;
          }
        }
      }
      context.res = { status: 200, headers, body: JSON.stringify({ ok: true, item: clean(strip(up.body)) }) };
      return;
    }

    if (input.action === 'getAttachment') {
      const key = input.fileId || input.id;
      if (!key) { context.res = { status: 400, headers, body: JSON.stringify({ error: 'id is required' }) }; return; }
      const attColl = collPath('feedback-attachments');
      const r = await cosmos({ verb: 'GET', resId: `${attColl}/docs/${key}`, path: `/${attColl}/docs/${key}`, partitionKey: key });
      if (r.status !== 200) { context.res = { status: 404, headers, body: JSON.stringify({ error: 'attachment not found' }) }; return; }
      const a = strip(r.body);
      context.res = { status: 200, headers, body: JSON.stringify({ ok: true, name: a.name, type: a.type, size: a.size, contentBase64: a.contentBase64 }) };
      return;
    }

    if (input.action === 'getComments') {
      if (!input.id) { context.res = { status: 400, headers, body: JSON.stringify({ error: 'id is required' }) }; return; }
      const cColl = collPath('feedbackComments');
      const r = await cosmos({ verb: 'GET', resId: `${cColl}/docs/${input.id}`, path: `/${cColl}/docs/${input.id}`, partitionKey: input.id });
      const comments = r.status === 200 ? (strip(r.body).comments || []) : [];
      context.res = { status: 200, headers, body: JSON.stringify({ ok: true, comments }) };
      return;
    }

    if (input.action === 'addComment') {
      if (!input.id) { context.res = { status: 400, headers, body: JSON.stringify({ error: 'id is required' }) }; return; }
      const text = String(input.text || '').trim().slice(0, 2000);
      const cColl = collPath('feedbackComments');
      // Optional gif on the comment: Giphy CDN URL only, same host restriction as requests.
      let cGif = null;
      if (input.gif && input.gif.url && /^https:\/\/(media[0-9]*\.giphy\.com|i\.giphy\.com)\//.test(String(input.gif.url))) {
        cGif = { url: String(input.gif.url).slice(0, 500), width: Number(input.gif.width) || 0, height: Number(input.gif.height) || 0, title: String(input.gif.title || 'gif').slice(0, 200) };
      }
      if (!text && !cGif) { context.res = { status: 400, headers, body: JSON.stringify({ error: 'comment text is required' }) }; return; }
      const parentId = input.parentId ? String(input.parentId).slice(0, 80) : null;
      const comment = { id: 'c-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7), by: myName, byEmail: identity.email, text, createdAt: new Date().toISOString() };
      if (cGif) comment.gif = cGif;
      // One doc per post holds all its comments, so appending is a read-modify-write on that
      // single doc — guard it with the doc's _etag (If-Match) and retry on 412 so two people
      // commenting at once never clobber each other.
      let saved = null;
      for (let attempt = 0; attempt < 4 && !saved; attempt++) {
        const cur = await cosmos({ verb: 'GET', resId: `${cColl}/docs/${input.id}`, path: `/${cColl}/docs/${input.id}`, partitionKey: input.id });
        const exists = cur.status === 200;
        const etag = exists ? cur.body._etag : null;
        const doc = exists ? strip(cur.body) : { id: input.id, comments: [] };
        // single-level threading: a reply attaches to a top-level comment; a reply to a reply
        // is normalized up to that reply's parent so nesting never exceeds one level.
        if (parentId) { const p = (doc.comments || []).find(c => c.id === parentId); comment.parentId = p && p.parentId ? p.parentId : parentId; }
        doc.comments = [...(doc.comments || []), comment];
        const wr = await cosmos({ verb: 'POST', resId: cColl, path: `/${cColl}/docs`, body: doc, partitionKey: input.id, upsert: true, ifMatch: etag || undefined });
        if (wr.status === 200 || wr.status === 201) { saved = strip(wr.body); break; }
        if (wr.status !== 412) { context.res = { status: 500, headers, body: JSON.stringify({ error: 'comment save failed', status: wr.status, detail: wr.body }) }; return; }
        // 412 = someone else wrote first; loop re-reads and retries.
      }
      if (!saved) { context.res = { status: 409, headers, body: JSON.stringify({ error: 'Too busy — try again.' }) }; return; }
      // Notify: a reply pings the parent comment's author; a top-level comment pings the
      // request's author. Both are 'mention' (badge + ding). Self-actions are skipped inside.
      const cBody = text || (cGif ? 'sent a GIF' : '');
      if (comment.parentId) {
        const parent = (saved.comments || []).find(c => c.id === comment.parentId);
        if (parent) await notifyRecipient(context, { toEmail: parent.byEmail, toName: parent.by, fromEmail: identity.email, fromName: myName, title: `${myName} replied to your comment`, body: cBody, category: 'mention', feedbackId: input.id });
      } else {
        const rq = await cosmos({ verb: 'GET', resId: `${coll}/docs/${input.id}`, path: `/${coll}/docs/${input.id}`, partitionKey: input.id });
        if (rq.status === 200) { const rd = strip(rq.body); await notifyRecipient(context, { toEmail: rd.byEmail, toName: rd.by, fromEmail: identity.email, fromName: myName, title: `${myName} commented on “${rd.title || 'your request'}”`, body: cBody, category: 'mention', feedbackId: input.id }); }
      }
      context.res = { status: 200, headers, body: JSON.stringify({ ok: true, comment, comments: saved.comments || [] }) };
      return;
    }

    if (input.action === 'deleteComment') {
      if (!input.id || !input.commentId) { context.res = { status: 400, headers, body: JSON.stringify({ error: 'id and commentId are required' }) }; return; }
      const cColl = collPath('feedbackComments');
      const cur = await cosmos({ verb: 'GET', resId: `${cColl}/docs/${input.id}`, path: `/${cColl}/docs/${input.id}`, partitionKey: input.id });
      if (cur.status !== 200) { context.res = { status: 404, headers, body: JSON.stringify({ error: 'no comments' }) }; return; }
      const doc = strip(cur.body);
      const target = (doc.comments || []).find(c => c.id === input.commentId);
      if (!target) { context.res = { status: 404, headers, body: JSON.stringify({ error: 'comment not found' }) }; return; }
      // A commenter may delete their own. Only the author may delete a comment.
      if (target.byEmail !== identity.email) { context.res = { status: 403, headers, body: JSON.stringify({ error: 'Not allowed' }) }; return; }
      doc.comments = (doc.comments || []).filter(c => c.id !== input.commentId);
      const wr = await cosmos({ verb: 'POST', resId: cColl, path: `/${cColl}/docs`, body: doc, partitionKey: input.id, upsert: true, ifMatch: cur.body._etag });
      if (wr.status !== 200 && wr.status !== 201) { context.res = { status: 500, headers, body: JSON.stringify({ error: 'delete failed', status: wr.status }) }; return; }
      context.res = { status: 200, headers, body: JSON.stringify({ ok: true, comments: strip(wr.body).comments || [] }) };
      return;
    }

    if (input.action === 'reactComment') {
      if (!input.id || !input.commentId) { context.res = { status: 400, headers, body: JSON.stringify({ error: 'id and commentId are required' }) }; return; }
      const REACTIONS = ['heart', 'up', 'down', 'laugh', 'fire'];
      if (!REACTIONS.includes(input.emoji)) { context.res = { status: 400, headers, body: JSON.stringify({ error: 'invalid reaction' }) }; return; }
      const cColl = collPath('feedbackComments');
      // read-modify-write on the one comments doc, etag-guarded + retried, same as addComment.
      let saved = null;
      let didAdd = false;
      for (let attempt = 0; attempt < 4 && !saved; attempt++) {
        const cur = await cosmos({ verb: 'GET', resId: `${cColl}/docs/${input.id}`, path: `/${cColl}/docs/${input.id}`, partitionKey: input.id });
        if (cur.status !== 200) { context.res = { status: 404, headers, body: JSON.stringify({ error: 'no comments' }) }; return; }
        const doc = strip(cur.body);
        const target = (doc.comments || []).find(c => c.id === input.commentId);
        if (!target) { context.res = { status: 404, headers, body: JSON.stringify({ error: 'comment not found' }) }; return; }
        const r = target.reactions || {};
        // one reaction per person: clear this person from every emoji first, then set the chosen
        // one — unless they already had it, which makes this a toggle-off.
        const had = (r[input.emoji] || []).includes(identity.email);
        REACTIONS.forEach(k => { if (r[k]) r[k] = r[k].filter(e => e !== identity.email); });
        if (!had) r[input.emoji] = [...(r[input.emoji] || []), identity.email];
        didAdd = !had;
        REACTIONS.forEach(k => { if (r[k] && r[k].length === 0) delete r[k]; });
        target.reactions = r;
        const wr = await cosmos({ verb: 'POST', resId: cColl, path: `/${cColl}/docs`, body: doc, partitionKey: input.id, upsert: true, ifMatch: cur.body._etag });
        if (wr.status === 200 || wr.status === 201) { saved = strip(wr.body); break; }
        if (wr.status !== 412) { context.res = { status: 500, headers, body: JSON.stringify({ error: 'reaction save failed', status: wr.status }) }; return; }
      }
      if (!saved) { context.res = { status: 409, headers, body: JSON.stringify({ error: 'Too busy — try again.' }) }; return; }
      // Notify the comment's author — only when a reaction was ADDED (not toggled off). 'social'
      // so it lands quietly (no badge, no ding). One notice per comment (stable id) groups
      // repeat reactions into a single “N people reacted” entry that re-surfaces on each new one.
      if (didAdd) {
        const tc = (saved.comments || []).find(c => c.id === input.commentId);
        if (tc) {
          const total = REACTIONS.reduce((n, k) => n + ((tc.reactions || {})[k] || []).length, 0);
          await notifyRecipient(context, { id: 'nt-rx-' + input.commentId, toEmail: tc.byEmail, toName: tc.by, fromEmail: identity.email, fromName: myName, title: 'New reaction on your comment', body: `${total} ${total === 1 ? 'person has' : 'people have'} reacted to your comment.`, category: 'social', feedbackId: input.id });
        }
      }
      context.res = { status: 200, headers, body: JSON.stringify({ ok: true, comments: saved.comments || [] }) };
      return;
    }

    if (input.action === 'addPlanned') {
      if (!admin) { context.res = { status: 403, headers, body: JSON.stringify({ error: 'Admin only' }) }; return; }
      if (!input.title || !String(input.title).trim()) { context.res = { status: 400, headers, body: JSON.stringify({ error: 'title is required' }) }; return; }
      const doc = {
        id: 'fr-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
        title: String(input.title).trim().slice(0, 200),
        desc: String(input.desc || '').trim().slice(0, 2000),
        cat: CATS.includes(input.cat) ? input.cat : 'Scheduling',
        by: 'Product', byEmail: identity.email,
        status: 'Planned', eta: String(input.eta || '').slice(0, 60),
        ballots: [], planned: true,
        createdAt: new Date().toISOString(),
      };
      const up = await cosmos({ verb: 'POST', resId: coll, path: `/${coll}/docs`, body: doc, partitionKey: doc.id, upsert: true });
      if (up.status !== 200 && up.status !== 201) { context.res = { status: 500, headers, body: JSON.stringify({ error: 'add failed', status: up.status, detail: up.body }) }; return; }
      context.res = { status: 200, headers, body: JSON.stringify({ ok: true, item: clean(strip(up.body)) }) };
      return;
    }

    // remaining actions operate on an existing doc
    if (!input.id) { context.res = { status: 400, headers, body: JSON.stringify({ error: 'id is required' }) }; return; }
    const docRes = await cosmos({ verb: 'GET', resId: `${coll}/docs/${input.id}`, path: `/${coll}/docs/${input.id}`, partitionKey: input.id });
    if (docRes.status !== 200) { context.res = { status: 404, headers, body: JSON.stringify({ error: 'request not found' }) }; return; }
    const item = strip(docRes.body);

    let next;
    if (input.action === 'vote') {
      // Directional, capped, mutually-exclusive: a person's ballot is a single value in
      // {-1,0,1,2}. Up moves +1 toward the cap of 2; down moves −1 toward the floor of −1;
      // 0 clears the ballot. So a third up-click is a no-op, and one down-click on your +2
      // takes you to +1. Never both directions at once — it's one signed value per person.
      const dir = input.dir === 'down' ? 'down' : 'up';
      const b = ballotsOf(item);
      const cur = (b.find(x => x.e === identity.email) || {}).v || 0;
      const nv = dir === 'up' ? Math.min(cur + 1, 2) : Math.max(cur - 1, -1);
      const rest = b.filter(x => x.e !== identity.email);
      if (nv !== 0) rest.push({ e: identity.email, v: nv });
      const { voters: _legacy, ...base } = item;
      next = { ...base, ballots: rest };
    } else if (input.action === 'update') {
      if (!admin) { context.res = { status: 403, headers, body: JSON.stringify({ error: 'Admin only' }) }; return; }
      next = { ...item };
      if (input.status !== undefined && STATUSES.includes(input.status)) {
        // stamp the archive date when an item moves into a terminal state (Complete/Declined)
        const terminal = input.status === 'Complete' || input.status === 'Declined';
        const wasTerminal = item.status === 'Complete' || item.status === 'Declined';
        if (terminal && !wasTerminal) next.completedAt = new Date().toISOString();
        next.status = input.status;
      }
      if (input.eta !== undefined) next.eta = String(input.eta).slice(0, 60);
    } else if (input.action === 'delete') {
      if (!admin) { context.res = { status: 403, headers, body: JSON.stringify({ error: 'Admin only' }) }; return; }
      // Best-effort remove the attachment doc too (may not exist) so bytes don't orphan.
      const attColl = collPath('feedback-attachments');
      // legacy single doc (keyed by request id) + any per-file docs (multi-attachment model)
      await cosmos({ verb: 'DELETE', resId: `${attColl}/docs/${input.id}`, path: `/${attColl}/docs/${input.id}`, partitionKey: input.id }).catch(() => {});
      for (const f of (item.attachments || [])) { if (f && f.fileId) await cosmos({ verb: 'DELETE', resId: `${attColl}/docs/${f.fileId}`, path: `/${attColl}/docs/${f.fileId}`, partitionKey: f.fileId }).catch(() => {}); }
      // Best-effort remove this post's comment thread too.
      const cColl = collPath('feedbackComments');
      await cosmos({ verb: 'DELETE', resId: `${cColl}/docs/${input.id}`, path: `/${cColl}/docs/${input.id}`, partitionKey: input.id }).catch(() => {});
      const del = await cosmos({ verb: 'DELETE', resId: `${coll}/docs/${input.id}`, path: `/${coll}/docs/${input.id}`, partitionKey: input.id });
      if (del.status !== 204 && del.status !== 200 && del.status !== 404) { context.res = { status: 500, headers, body: JSON.stringify({ error: 'delete failed', status: del.status }) }; return; }
      context.res = { status: 200, headers, body: JSON.stringify({ ok: true, id: input.id }) };
      return;
    } else {
      context.res = { status: 400, headers, body: JSON.stringify({ error: 'unknown action' }) }; return;
    }

    const up = await cosmos({ verb: 'POST', resId: coll, path: `/${coll}/docs`, body: next, partitionKey: next.id, upsert: true });
    if (up.status !== 200 && up.status !== 201) { context.res = { status: 500, headers, body: JSON.stringify({ error: 'update failed', status: up.status, detail: up.body }) }; return; }
    context.res = { status: 200, headers, body: JSON.stringify({ ok: true, item: clean(strip(up.body)) }) };
    return;
  } catch (err) {
    const msg = err.message || 'error';
    context.res = { status: /No roster account/.test(msg) ? 403 : 500, headers, body: JSON.stringify({ error: msg }) };
  }
};
