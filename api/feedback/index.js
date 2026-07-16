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
  const clean = doc => { const { voters, ...rest } = doc; return { ...rest, votes: (voters || []).length, voted: (voters || []).includes(identity.email) }; };

  try {
    const { employees, support } = await loadRosterAndSupport();
    const me = employees.find(e => (e.workEmail || '').toLowerCase() === identity.email);
    if (!me) { context.res = { status: 403, headers, body: JSON.stringify({ error: 'No roster account for ' + identity.email }) }; return; }
    const usersByEmail = {};
    ((support && support.users) || []).forEach(u => { if (u.email) usersByEmail[u.email.toLowerCase()] = u; });
    const admin = isAdminFor(me, usersByEmail);
    const myName = me.name || `${me.first || ''} ${me.last || ''}`.trim() || identity.email;

    /* ---------- READ ---------- */
    if (req.method === 'GET') {
      // listAll follows continuation tokens — a plain single-page GET silently drops
      // documents once the container grows past one page (see _shared/cosmos.js).
      const docs = (await listAll(coll)).map(strip).map(clean).sort((a, b) => (b.votes || 0) - (a.votes || 0));
      context.res = { status: 200, headers, body: JSON.stringify({ items: docs }) };
      return;
    }

    /* ---------- WRITE ---------- */
    let input = req.body;
    if (typeof input === 'string') { try { input = JSON.parse(input); } catch (e) { input = null; } }
    if (!input || !input.action) { context.res = { status: 400, headers, body: JSON.stringify({ error: 'action is required' }) }; return; }

    if (input.action === 'submit') {
      if (!input.title || !String(input.title).trim()) { context.res = { status: 400, headers, body: JSON.stringify({ error: 'title is required' }) }; return; }
      const doc = {
        id: 'fr-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
        title: String(input.title).trim().slice(0, 200),
        desc: String(input.desc || '').trim().slice(0, 2000),
        cat: CATS.includes(input.cat) ? input.cat : 'Other',
        by: myName, byEmail: identity.email,
        status: 'Submitted', eta: '',
        voters: [identity.email],
        createdAt: new Date().toISOString(),
      };
      const up = await cosmos({ verb: 'POST', resId: coll, path: `/${coll}/docs`, body: doc, partitionKey: doc.id, upsert: true });
      if (up.status !== 200 && up.status !== 201) { context.res = { status: 500, headers, body: JSON.stringify({ error: 'submit failed', status: up.status, detail: up.body }) }; return; }
      context.res = { status: 200, headers, body: JSON.stringify({ ok: true, item: clean(strip(up.body)) }) };
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
        voters: [], planned: true,
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
      const voters = item.voters || [];
      if (voters.includes(identity.email)) { context.res = { status: 200, headers, body: JSON.stringify({ ok: true, item: clean(item) }) }; return; }
      next = { ...item, voters: [...voters, identity.email] };
    } else if (input.action === 'update') {
      if (!admin) { context.res = { status: 403, headers, body: JSON.stringify({ error: 'Admin only' }) }; return; }
      next = { ...item };
      if (input.status !== undefined && STATUSES.includes(input.status)) {
        if (input.status === 'Complete' && item.status !== 'Complete') next.completedAt = new Date().toISOString();
        next.status = input.status;
      }
      if (input.eta !== undefined) next.eta = String(input.eta).slice(0, 60);
    } else if (input.action === 'delete') {
      if (!admin) { context.res = { status: 403, headers, body: JSON.stringify({ error: 'Admin only' }) }; return; }
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
