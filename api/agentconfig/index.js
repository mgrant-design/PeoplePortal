/* api/agentconfig/index.js — read & write Riley's editable config (the Agent Dashboard).
   GET  /api/agentconfig                → { knowledge, routing, channels }
   POST /api/agentconfig  { section, value }
        → replace ONE section (knowledge | routing | channels) of the riley-config doc.

   This is what makes the Agent Dashboard's editor real: Riley's knowledge base, routing
   rules, and channel toggles move out of per-browser localStorage into Cosmos, so an edit
   made here changes Riley's answers for EVERYONE and survives a browser clear. The client
   (agent.jsx / buildRileySystem + answerFor) reads this same config, so the console is the
   live control surface, not a dead knob.

   No new container needed — the config lives as a single doc (id "riley-config",
   partition /type) in the existing `appState` collection, exactly like roster-support.

   Security mirrors the other endpoints: valid Google token + domain lock, then — because
   this config affects every new hire's experience — writes are ADMIN ONLY, derived from
   the live roster's user permissions (never trusted from the client). Reads are open to any
   authenticated company user, since Riley uses the config to answer everyone. Writes use the
   doc's _etag (If-Match) so two editors can't silently clobber each other. */

const { verifyGoogleToken, tokenFromReq } = require('../_shared/auth');
const { cosmos, collPath, cosmosConfigured, loadRosterAndSupport } = require('../_shared/cosmos');

const ALLOWED_DOMAINS = ['puredental.com', 'foureversmile.com', 'puredentallab.com'];
const SECTIONS = ['knowledge', 'routing', 'channels'];
const DOC_ID = 'riley-config';

/* Admin only. `users` (from roster-support) carries the per-account permission flags;
   perms.admin is the same flag rbac.jsx uses to grant the Administrator role. */
function isAdmin(me, usersByEmail) {
  const perms = usersByEmail[(me.workEmail || '').toLowerCase()] || {};
  return !!perms.admin;
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

    // read the current config doc (may not exist yet — first write creates it)
    let cfg = null;
    try {
      const res = await cosmos({ verb: 'GET', resId: appColl, path: `/${appColl}/docs` });
      if (res.status === 200) cfg = (res.body.Documents || []).find(d => d.id === DOC_ID) || null;
    } catch (e) { /* missing doc is fine */ }

    /* ---------- READ ---------- */
    if (req.method === 'GET') {
      const c = cfg || {};
      context.res = { status: 200, headers, body: JSON.stringify({
        knowledge: c.knowledge || [], routing: c.routing || [], channels: c.channels || [],
      }) };
      return;
    }

    /* ---------- WRITE: replace one section (Admin only) ---------- */
    const usersByEmail = {};
    ((support && support.users) || []).forEach(u => { if (u.email) usersByEmail[u.email.toLowerCase()] = u; });
    if (!isAdmin(me, usersByEmail)) {
      context.res = { status: 403, headers, body: JSON.stringify({ error: 'Only an administrator can edit the agent configuration' }) }; return;
    }

    let input = req.body;
    if (typeof input === 'string') { try { input = JSON.parse(input); } catch (e) { input = null; } }
    if (!input || !SECTIONS.includes(input.section) || !Array.isArray(input.value)) {
      context.res = { status: 400, headers, body: JSON.stringify({ error: 'Body must be { section: one of ' + SECTIONS.join('|') + ', value: [...] }' }) }; return;
    }

    // read-modify-write: start from the current doc (or a fresh skeleton), patch one section.
    // appState is partitioned by /type, so the doc carries a `type` and we partition by it.
    const base = cfg || { id: DOC_ID, type: DOC_ID };
    const next = { ...base, id: DOC_ID, type: base.type || DOC_ID, [input.section]: input.value, updatedBy: identity.email, updatedAt: new Date().toISOString() };

    const up = await cosmos({
      verb: 'POST', resId: appColl, path: `/${appColl}/docs`, body: next,
      partitionKey: next.type, upsert: true,
      ifMatch: cfg ? cfg._etag : undefined,
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
