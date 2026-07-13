/* api/accesscontrol/index.js — the dedicated access-control store.
   GET  /api/accesscontrol            → list all permission-override docs (admin/HR/leadership)
   POST /api/accesscontrol            → upsert one person's overrides (admin only)
                                        body: { email, admin?, canPrint?, canSuspend?,
                                                canTerminate?, canDelete?, manager?, supervisor? }
   POST /api/accesscontrol { email, remove: true } → delete that person's override doc (admin only)

   This is access-control.json reincarnated as its own Cosmos container ("accessControl",
   partition key /id, one doc per person keyed by lowercased email) — a standalone
   permission store edited independently of HR/roster data. Security mirrors the other
   endpoints: valid Google token + domain lock, caller resolved from the live roster,
   permissions never trusted from the client. */

const { verifyGoogleToken, tokenFromReq } = require('../_shared/auth');
const { cosmos, strip, collPath, cosmosConfigured, loadRosterAndSupport } = require('../_shared/cosmos');

const ALLOWED_DOMAINS = ['puredental.com', 'foureversmile.com', 'puredentallab.com'];
const FIELDS = ['admin', 'canPrint', 'canSuspend', 'canTerminate', 'canDelete', 'manager', 'supervisor'];

/* Derive the caller's standing from the roster (title/department) + their merged
   permission flags. viewAll = admin/HR/leadership; only admin may write. */
function standing(me, usersByEmail) {
  const perms = usersByEmail[(me.workEmail || '').toLowerCase()] || {};
  const dept = (me.department || '').toLowerCase();
  const title = (me.jobTitle || '').toLowerCase();
  const isExec = /\b(ceo|chief|coo|cfo|president|owner|principal)\b/.test(title) || ['leadership', 'management team', 'management', 'pure management'].includes(dept);
  const isHR = /human resources|payroll/.test(dept) || /\b(human resources|payroll|people ops)\b/.test(title);
  const isAdmin = !!perms.admin;
  return { isAdmin, viewAll: isAdmin || isHR || isExec };
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

  const coll = collPath('accessControl');

  try {
    // loadRosterAndSupport already folds accessControl into support.users, so the
    // caller's own admin flag resolves correctly here.
    const { employees, support } = await loadRosterAndSupport();
    const me = employees.find(e => (e.workEmail || '').toLowerCase() === identity.email);
    if (!me) { context.res = { status: 403, headers, body: JSON.stringify({ error: 'No roster account for ' + identity.email }) }; return; }
    const usersByEmail = {};
    ((support && support.users) || []).forEach(u => { if (u.email) usersByEmail[u.email.toLowerCase()] = u; });
    const who = standing(me, usersByEmail);

    /* ---------- READ ---------- */
    if (req.method === 'GET') {
      if (!who.viewAll) { context.res = { status: 403, headers, body: JSON.stringify({ error: 'Not allowed to view permissions' }) }; return; }
      const res = await cosmos({ verb: 'GET', resId: coll, path: `/${coll}/docs` });
      if (res.status !== 200) { context.res = { status: 500, headers, body: JSON.stringify({ error: 'read failed', status: res.status }) }; return; }
      const docs = (res.body.Documents || []).map(strip);
      context.res = { status: 200, headers, body: JSON.stringify({ overrides: docs }) };
      return;
    }

    /* ---------- WRITE (admin only) ---------- */
    if (!who.isAdmin) { context.res = { status: 403, headers, body: JSON.stringify({ error: 'Only an administrator can edit permissions' }) }; return; }

    let input = req.body;
    if (typeof input === 'string') { try { input = JSON.parse(input); } catch (e) { input = null; } }
    if (!input || !input.email) { context.res = { status: 400, headers, body: JSON.stringify({ error: 'email is required' }) }; return; }
    const id = String(input.email).toLowerCase();

    // remove: delete this person's override doc entirely
    if (input.remove) {
      const del = await cosmos({ verb: 'DELETE', resId: `${coll}/docs/${id}`, path: `/${coll}/docs/${id}`, partitionKey: id });
      if (del.status !== 204 && del.status !== 404) { context.res = { status: 500, headers, body: JSON.stringify({ error: 'delete failed', status: del.status }) }; return; }
      context.res = { status: 200, headers, body: JSON.stringify({ ok: true, removed: id }) };
      return;
    }

    // upsert: keep only the known permission fields the client sent
    const doc = { id, email: id, updatedBy: identity.email, updatedAt: new Date().toISOString() };
    FIELDS.forEach(f => { if (input[f] !== undefined) doc[f] = !!input[f]; });
    const up = await cosmos({ verb: 'POST', resId: coll, path: `/${coll}/docs`, body: doc, partitionKey: id, upsert: true });
    if (up.status !== 200 && up.status !== 201) { context.res = { status: 500, headers, body: JSON.stringify({ error: 'save failed', status: up.status, detail: up.body }) }; return; }
    context.res = { status: 200, headers, body: JSON.stringify({ ok: true, override: strip(up.body) }) };
  } catch (err) {
    const msg = err.message || 'error';
    context.res = { status: /No roster account/.test(msg) ? 403 : 500, headers, body: JSON.stringify({ error: msg }) };
  }
};
