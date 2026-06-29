/* api/orgconfig/index.js — read & write the shared org-config doc (roster-support).
   GET  /api/orgconfig                 → { offices, departments, titles, managers, users, offboarding }
   POST /api/orgconfig  { section, value }
        → replace ONE section (e.g. section:"offices", value:[...]) of the roster-support doc.

   This is the persistence pilot: it migrates the appState editing that currently lives
   in the browser onto the server. It needs NO new container — roster-support already
   lives in the existing `appState` collection.

   Security mirrors the other endpoints: valid Google token + domain lock, then the
   caller must be Admin / HR / Leadership (derived from the live roster, never trusted
   from the client). Writes use the doc's _etag (If-Match) so two simultaneous editors
   can't silently clobber each other — a stale write returns 412 and the client retries. */

const { verifyGoogleToken, tokenFromReq } = require('../_shared/auth');
const { cosmos, strip, collPath, cosmosConfigured, loadRosterAndSupport } = require('../_shared/cosmos');

const ALLOWED_DOMAINS = ['puredental.com', 'foureversmile.com', 'puredentallab.com'];
const SECTIONS = ['offices', 'departments', 'titles', 'managers', 'users', 'offboarding'];

/* Admin / HR / Leadership only — compact port of deriveAccess(viewAll) from rbac.jsx */
function canManageOrg(me, usersByEmail) {
  const perms = usersByEmail[(me.workEmail || '').toLowerCase()] || {};
  const dept = (me.department || '').toLowerCase();
  const title = (me.jobTitle || '').toLowerCase();
  const isExec = /\b(ceo|chief|coo|cfo|president|owner|principal)\b/.test(title) || ['leadership', 'management team', 'management', 'pure management'].includes(dept);
  const isHR = /human resources|payroll/.test(dept) || /\b(human resources|payroll|people ops)\b/.test(title);
  return !!perms.admin || isHR || isExec;
}

module.exports = async function (context, req) {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Google-Token',
  };
  if (req.method === 'OPTIONS') { context.res = { status: 204, headers }; return; }

  // --- identity + domain lock ---
  let identity;
  try { identity = await verifyGoogleToken(tokenFromReq(req)); }
  catch (e) { context.res = { status: 401, headers, body: JSON.stringify({ error: 'Not authenticated', detail: e.message }) }; return; }
  if (!ALLOWED_DOMAINS.includes(identity.email.split('@')[1] || '')) {
    context.res = { status: 403, headers, body: JSON.stringify({ error: 'Domain not allowed' }) }; return;
  }
  if (!cosmosConfigured()) { context.res = { status: 500, headers, body: JSON.stringify({ error: 'Missing Cosmos config' }) }; return; }

  const appColl = collPath('appState');

  try {
    const { employees, support } = await loadRosterAndSupport();
    const me = employees.find(e => (e.workEmail || '').toLowerCase() === identity.email);
    if (!me) { context.res = { status: 403, headers, body: JSON.stringify({ error: 'No roster account for ' + identity.email }) }; return; }

    /* ---------- READ ---------- */
    if (req.method === 'GET') {
      const s = support || {};
      context.res = { status: 200, headers, body: JSON.stringify({
        offices: s.offices || [], departments: s.departments || [], titles: s.titles || [],
        managers: s.managers || [], users: s.users || [], offboarding: s.offboarding || [],
      }) };
      return;
    }

    /* ---------- WRITE: replace one section ---------- */
    // permission: only Admin / HR / Leadership may edit org config
    const usersByEmail = {};
    ((support && support.users) || []).forEach(u => { if (u.email) usersByEmail[u.email.toLowerCase()] = u; });
    if (!canManageOrg(me, usersByEmail)) {
      context.res = { status: 403, headers, body: JSON.stringify({ error: 'Not allowed to edit org config' }) }; return;
    }

    let input = req.body;
    if (typeof input === 'string') { try { input = JSON.parse(input); } catch (e) { input = null; } }
    if (!input || !SECTIONS.includes(input.section) || !Array.isArray(input.value)) {
      context.res = { status: 400, headers, body: JSON.stringify({ error: 'Body must be { section: one of ' + SECTIONS.join('|') + ', value: [...] }' }) }; return;
    }

    // read-modify-write: start from the current doc (or a fresh skeleton), patch the section.
    // appState is partitioned by /type, so the doc must carry a `type` and we partition by it.
    const base = support || { id: 'roster-support', type: 'roster-support' };
    const next = { ...base, type: base.type || 'roster-support', [input.section]: input.value, updatedBy: identity.email, updatedAt: new Date().toISOString() };

    // optimistic concurrency: only write if the doc hasn't changed since we read it
    const up = await cosmos({
      verb: 'POST', resId: appColl, path: `/${appColl}/docs`, body: next,
      partitionKey: next.type, upsert: true,
      ifMatch: support ? support._etag : undefined,
    });
    if (up.status === 412) { context.res = { status: 409, headers, body: JSON.stringify({ error: 'Someone else just saved — reload and retry' }) }; return; }
    if (up.status !== 200 && up.status !== 201) {
      context.res = { status: 500, headers, body: JSON.stringify({ error: 'write failed', status: up.status, detail: up.body }) }; return;
    }
    context.res = { status: 200, headers, body: JSON.stringify({ ok: true, [input.section]: input.value }) };
  } catch (err) {
    context.res = { status: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
