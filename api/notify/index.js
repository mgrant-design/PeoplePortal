/* api/notify/index.js — direct notices (a person → a person), with an INSTANT push.

   GET  /api/notify  → the caller's own notices (newest first).
   POST /api/notify  → { toEmail, title, body, urgent } — send a notice to one person.

   Why this exists: the 5-minute poll is fine for time-off, but sometimes you need to reach
   someone RIGHT NOW. This writes the notice to Cosmos (so it survives / shows on their next
   load if they're offline) AND pushes it down their live SignalR connection, so if their tab
   is open it appears and dings immediately — no waiting for their poll.

   Who can send to whom: you can send to anyone you can already see. HR/admin/leadership
   (viewAll) can send to anyone; everyone else can send within their own office. Authorized
   here on the server from the live roster — never trusted from the client. */

const { verifyGoogleToken, tokenFromReq } = require('../_shared/auth');
const { cosmos, strip, collPath, cosmosConfigured, loadRosterAndSupport } = require('../_shared/cosmos');

const ALLOWED = ['puredental.com', 'foureversmile.com', 'puredentallab.com'];
const NOTICES = collPath('notices');

const officeOf = (e) => e.loc || e.location || 'Unassigned';
const nameOf = (e) => e.name || `${e.first || ''} ${e.last || ''}`.trim();

/* compact port of the roster→permissions logic used by api/timeoff: we only need viewAll
   (whether this caller may reach across offices). Everyone else is limited to their office. */
function canViewAll(me, support, employees) {
  const users = (support && support.users) || [];
  const usersByEmail = {}; users.forEach(u => { if (u.email) usersByEmail[u.email.toLowerCase()] = u; });
  const p = usersByEmail[(me.workEmail || '').toLowerCase()] || {};
  const dept = (me.department || '').toLowerCase();
  const title = (me.jobTitle || '').toLowerCase();
  const isExec = /\b(ceo|chief|coo|cfo|president|owner|principal)\b/.test(title) || ['leadership', 'management team', 'management', 'pure management'].includes(dept);
  const isHR = /human resources|payroll/.test(dept) || /\b(human resources|payroll|people ops)\b/.test(title);
  return !!p.admin || isHR || isExec;
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
  catch (e) { context.res = { status: 401, headers, body: JSON.stringify({ error: 'Not authenticated' }) }; return; }
  if (!ALLOWED.includes(identity.email.split('@')[1] || '')) {
    context.res = { status: 403, headers, body: JSON.stringify({ error: 'Domain not allowed' }) }; return;
  }
  if (!cosmosConfigured()) {
    context.res = { status: 500, headers, body: JSON.stringify({ error: 'Missing Cosmos config' }) }; return;
  }

  try {
    /* ---------- READ: my notices ---------- */
    if (req.method === 'GET') {
      const res = await cosmos({ verb: 'GET', resId: NOTICES, path: `/${NOTICES}/docs`, partitionKey: identity.email });
      if (res.status !== 200) { context.res = { status: 500, headers, body: JSON.stringify({ error: 'read failed', status: res.status }) }; return; }
      const notices = (res.body.Documents || []).map(strip).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
      context.res = { status: 200, headers, body: JSON.stringify({ notices }) };
      return;
    }

    /* ---------- WRITE: send a notice ---------- */
    let input = req.body;
    if (typeof input === 'string') { try { input = JSON.parse(input); } catch (e) { input = null; } }
    const toEmail = ((input && input.toEmail) || '').toLowerCase();
    if (!toEmail || !(input.title || input.body)) {
      context.res = { status: 400, headers, body: JSON.stringify({ error: 'toEmail and a title or body are required' }) }; return;
    }

    // resolve sender + recipient from the live roster, and authorize the send
    const { employees, support } = await loadRosterAndSupport();
    const me = employees.find(e => (e.workEmail || '').toLowerCase() === identity.email);
    if (!me) { context.res = { status: 403, headers, body: JSON.stringify({ error: 'No roster account for ' + identity.email }) }; return; }
    const recip = employees.find(e => (e.workEmail || '').toLowerCase() === toEmail);
    if (!recip) { context.res = { status: 404, headers, body: JSON.stringify({ error: 'Recipient not found' }) }; return; }

    const viewAll = canViewAll(me, support, employees);
    const sameOffice = officeOf(me) === officeOf(recip);
    if (!viewAll && !sameOffice) {
      context.res = { status: 403, headers, body: JSON.stringify({ error: 'You can only send to people in your office' }) }; return;
    }

    const notice = {
      id: 'nt-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
      kind: 'notice',
      fromEmail: identity.email, fromName: nameOf(me),
      toEmail, toName: nameOf(recip), office: officeOf(recip),
      title: String(input.title || '').slice(0, 200),
      body: String(input.body || '').slice(0, 2000),
      urgent: !!input.urgent, read: false,
      createdAt: new Date().toISOString(),
    };

    const up = await cosmos({ verb: 'POST', resId: NOTICES, path: `/${NOTICES}/docs`, body: notice, partitionKey: toEmail, upsert: true });
    if (up.status !== 200 && up.status !== 201) {
      context.res = { status: 500, headers, body: JSON.stringify({ error: 'send failed', status: up.status, detail: up.body }) }; return;
    }

    // INSTANT push: land it on the recipient's live connection (if any). Offline recipients
    // simply see it on their next GET / poll — the write above already persisted it.
    context.bindings.signalRMessages = [{ userId: toEmail, target: 'notify', arguments: [strip(notice)] }];

    context.res = { status: 200, headers, body: JSON.stringify({ ok: true, notice: strip(notice) }) };
  } catch (err) {
    const msg = err.message || 'error';
    const code = /No roster account/.test(msg) ? 403 : 500;
    context.res = { status: code, headers, body: JSON.stringify({ error: msg }) };
  }
};
