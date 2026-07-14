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

const { verifyGoogleToken, tokenFromReq } = require('../_shared/auth');
const { cosmos, listAll, strip, collPath, cosmosConfigured, loadRosterAndSupport } = require('../_shared/cosmos');

const ALLOWED_DOMAINS = ['puredental.com', 'foureversmile.com', 'puredentallab.com'];

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
    const rec = { ...doc, updatedBy: identity.email, updatedAt: new Date().toISOString() };
    const up = await cosmos({ verb: 'POST', resId: coll, path: `/${coll}/docs`, body: rec, partitionKey: rec.office, upsert: true });
    if (up.status !== 200 && up.status !== 201) {
      context.res = { status: 500, headers, body: JSON.stringify({ error: 'save failed', status: up.status, detail: up.body }) }; return;
    }
    context.res = { status: 200, headers, body: JSON.stringify({ ok: true, applicant: strip(up.body) }) };
  } catch (err) {
    context.res = { status: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
