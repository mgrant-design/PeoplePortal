/* api/applicants/index.js — read & write the hiring pipeline (Cosmos `applicants` container).
   GET  /api/applicants  → { applicants: [...] } — scoped to what the caller may see.
   POST /api/applicants  → upsert ONE applicant record (body = the record). Returns { ok, applicant }.

   The record IS the applicant (parsed name/contact/address, résumé text, stage, feedback,
   notes, offer, working-interview, and a `resumes` list of pointers to PDFs held in Blob
   Storage — see api/resumeupload). Container partition key: /office.

   Security mirrors the other endpoints: valid Google token + domain lock, then the caller's
   identity is resolved from the live roster (never trusted from the client) and must have
   recruiting reach — company-wide (Admin / HR / Leadership) or team-level (Manager /
   Supervisor). Team-level callers only see and write applicants at their own office. */

const https = require('https');
const { verifyGoogleToken, tokenFromReq } = require('../_shared/auth');
const { cosmos, listAll, strip, collPath, cosmosConfigured, loadRosterAndSupport } = require('../_shared/cosmos');

const ALLOWED_DOMAINS = ['puredental.com', 'foureversmile.com', 'puredentallab.com'];
// Only she may approve+send an offer — checked server-side, never trusted from the client.
const OFFER_APPROVER_EMAIL = 'mgrant@puredental.com';   // TEMP: testing the pipeline before routing to HR
const OFFER_APPROVER_NAME = 'Amanda Vibert';

/* generic HTTPS POST, used for the Google Chat webhook (same pattern as api/schedule) */
function httpPost(urlStr, { headers = {}, body = '' } = {}) {
  return new Promise((resolve, reject) => {
    let url;
    try { url = new URL(urlStr); } catch (e) { return reject(new Error('bad url')); }
    const payload = typeof body === 'string' ? body : JSON.stringify(body);
    const opts = { hostname: url.hostname, path: url.pathname + url.search, method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload), ...headers } };
    const rq = https.request(opts, (res) => { let data = ''; res.on('data', c => data += c); res.on('end', () => resolve({ status: res.statusCode, body: data })); });
    rq.on('error', reject);
    rq.write(payload);
    rq.end();
  });
}

/* Google Chat ping to the onboarding team at two points in the offer flow: when it's
   submitted for approval, and when it's approved & sent to the candidate. Wired to a
   fixed webhook for now; swap in APPLICANTS_GCHAT_WEBHOOK once IT provisions one per env. */
async function notifyOfferEvent(rec, kind) {
  const summary = { gchat: false, simulated: false, errors: [] };
  const webhook = process.env.APPLICANTS_GCHAT_WEBHOOK || 'https://chat.googleapis.com/v1/spaces/AAQAkOiCoJI/messages?key=AIzaSyDdI0hCZtE6vySjMm-WEfRq3CPzqKqqsHI&token=fcyGX8KZCW7epE63Gqn8Y1fqFg0mJ0IL8Xy_GPzPC2E';
  const text = kind === 'submitted'
    ? `\ud83d\udcdd *Offer submitted for approval* \u2014 ${rec.name || 'Applicant'} (${rec.role || 'role TBD'}, ${rec.office || 'office TBD'}) is awaiting ${OFFER_APPROVER_NAME}'s review.`
    : `\ud83d\udce8 *Offer sent* \u2014 ${rec.name || 'Applicant'} (${rec.role || 'role TBD'}, ${rec.office || 'office TBD'}) approved by ${OFFER_APPROVER_NAME} and sent to the candidate for signature.`;
  try {
    const r = await httpPost(webhook, { body: { text } });
    summary.gchat = r.status >= 200 && r.status < 300;
    if (!summary.gchat) summary.errors.push('gchat ' + r.status);
  } catch (e) { summary.errors.push('gchat ' + e.message); }
  return summary;
}

/* Fold the office name to the same canonical label the client uses (rbac.jsx normLoc). */
function normLoc(l) {
  const s = (l || '').toLowerCase();
  if (!s) return 'Unassigned';
  if (s.includes('remote')) return 'Remote';
  if (s.includes('hauppauge')) return 'Hauppauge';
  if (s.includes('garden')) return 'Garden City';
  if (s.includes('manorville')) return 'Manorville';
  if (s.includes('wading')) return 'Wading River';
  if (s.includes('islandia')) return 'Islandia';
  if (s.includes('jersey')) return 'New Jersey';
  if (s.includes('buffalo')) return 'Buffalo';
  return l;
}

/* Compact port of deriveAccess (rbac.jsx): who can reach the ATS, and how wide. */
function recruitingAccess(me, usersByEmail, employees) {
  const perms = usersByEmail[(me.workEmail || '').toLowerCase()] || {};
  const dept = (me.department || '').toLowerCase();
  const title = (me.jobTitle || '').toLowerCase();
  const meEmail = (me.workEmail || '').toLowerCase();
  const isExec = /\b(ceo|chief|coo|cfo|president|owner|principal)\b/.test(title) || ['leadership', 'management team', 'management', 'pure management'].includes(dept);
  const isHR = /human resources|payroll/.test(dept) || /\b(human resources|payroll|people ops)\b/.test(title);
  const hasReports = employees.some(e => e.managerEmail && e.managerEmail.toLowerCase() === meEmail);
  const isSupervisor = (!!perms.supervisor || /\b(supervisor|team lead|lead)\b/.test(title)) && !/\b(manager|director)\b/.test(title) && !hasReports;
  const isManager = (!!perms.manager || me.isManager || hasReports || /\b(manager|director)\b/.test(title)) && !isSupervisor;
  const isAdmin = !!perms.admin;
  const viewAll = isAdmin || isHR || isExec;
  const viewTeam = isManager || isSupervisor;
  return { viewAll, viewTeam, canRecruit: viewAll || viewTeam };
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

  const coll = collPath('applicants');

  try {
    const { employees, support } = await loadRosterAndSupport();
    const me = employees.find(e => (e.workEmail || '').toLowerCase() === identity.email);
    if (!me) { context.res = { status: 403, headers, body: JSON.stringify({ error: 'No roster account for ' + identity.email }) }; return; }

    const usersByEmail = {};
    ((support && support.users) || []).forEach(u => { if (u && u.email) usersByEmail[u.email.toLowerCase()] = u; });
    const access = recruitingAccess(me, usersByEmail, employees);
    if (!access.canRecruit) { context.res = { status: 403, headers, body: JSON.stringify({ error: 'Not allowed to view applicants' }) }; return; }
    const myLoc = normLoc(me.location);

    /* ---------- READ ---------- */
    if (req.method === 'GET') {
      let docs;
      try { docs = (await listAll(coll)).map(strip); }
      catch (e) { context.res = { status: 500, headers, body: JSON.stringify({ error: 'read failed', detail: e.message }) }; return; }
      if (!access.viewAll) docs = docs.filter(d => normLoc(d.office) === myLoc);
      context.res = { status: 200, headers, body: JSON.stringify({ applicants: docs }) };
      return;
    }

    /* ---------- WRITE: upsert one applicant ---------- */
    let doc = req.body;
    if (typeof doc === 'string') { try { doc = JSON.parse(doc); } catch (e) { doc = null; } }
    if (!doc || typeof doc !== 'object' || !doc.id) {
      context.res = { status: 400, headers, body: JSON.stringify({ error: 'Body must be an applicant record with an id' }) }; return;
    }
    // team-level callers may only write applicants at their own office
    if (!access.viewAll && normLoc(doc.office) !== myLoc) {
      context.res = { status: 403, headers, body: JSON.stringify({ error: 'Applicant is outside your office' }) }; return;
    }
    // Both offer-flow transitions (submit-for-approval, approve-and-send) are tagged by the
    // client with _offerAction so we know to fire the matching Chat message. Approve is further
    // gated to the approver's identity, checked server-side; submit has no extra gate beyond
    // the normal recruiting-write check above. The tag itself is never persisted.
    const isApproveAction = doc._offerAction === 'approve';
    const isSubmitAction = doc._offerAction === 'submit';
    if (isApproveAction && identity.email.toLowerCase() !== OFFER_APPROVER_EMAIL) {
      context.res = { status: 403, headers, body: JSON.stringify({ error: 'Only Amanda Vibert can approve and send an offer' }) }; return;
    }
    const { _offerAction, ...clean } = doc;
    const rec = { ...clean, updatedBy: identity.email, updatedAt: new Date().toISOString() };
    const up = await cosmos({ verb: 'POST', resId: coll, path: `/${coll}/docs`, body: rec, partitionKey: rec.office, upsert: true });
    if (up.status !== 200 && up.status !== 201) {
      context.res = { status: 500, headers, body: JSON.stringify({ error: 'save failed', status: up.status, detail: up.body }) }; return;
    }
    let notify;
    if (isApproveAction) notify = await notifyOfferEvent(rec, 'approved');
    else if (isSubmitAction) notify = await notifyOfferEvent(rec, 'submitted');
    context.res = { status: 200, headers, body: JSON.stringify({ ok: true, applicant: strip(up.body), notify }) };
  } catch (err) {
    context.res = { status: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
