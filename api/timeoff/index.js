/* api/timeoff/index.js — read & write time-off requests in Cosmos.
   GET  /api/timeoff   → requests scoped to the caller (own / office / all)
   POST /api/timeoff   → { action: 'submit' | 'hr_confirm' | 'hr_insufficient'
                                  | 'approve' | 'deny', ... }

   Security mirrors api/roster & api/schedule: valid Google token, domain lock, and
   every action authorized server-side from the live roster. The Cosmos master key
   stays in env vars. Status machine: hr_review → mgr_review → approved|denied;
   unpaid skips HR (mgr_review); HR may mark 'insufficient'. */

const https = require('https');
const crypto = require('crypto');
const { verifyGoogleToken, tokenFromReq } = require('../_shared/auth');
const { loadAccessControl, applyAccessControl, listAll, collPath } = require('../_shared/cosmos');

function authHeader(verb, resType, resId, date, key) {
  const text = `${verb.toLowerCase()}\n${resType.toLowerCase()}\n${resId}\n${date.toLowerCase()}\n\n`;
  const sig = crypto.createHmac('sha256', Buffer.from(key, 'base64')).update(text).digest('base64');
  return encodeURIComponent(`type=master&ver=1.0&sig=${sig}`);
}
function cosmos({ endpoint, key, verb, resId, path, body, partitionKey, upsert }) {
  return new Promise((resolve, reject) => {
    const date = new Date().toUTCString();
    const auth = authHeader(verb, 'docs', resId, date, key);
    const url = new URL(path, endpoint);
    const payload = body ? JSON.stringify(body) : null;
    const headers = {
      'Authorization': auth, 'x-ms-date': date, 'x-ms-version': '2018-12-31',
      'Accept': 'application/json', 'Content-Type': 'application/json',
    };
    if (partitionKey !== undefined) headers['x-ms-documentdb-partitionkey'] = JSON.stringify([partitionKey]);
    if (upsert) headers['x-ms-documentdb-is-upsert'] = 'true';
    if (payload) headers['Content-Length'] = Buffer.byteLength(payload);
    const opts = { hostname: url.hostname, path: url.pathname, method: verb, headers };
    const rq = https.request(opts, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => { let p = {}; try { p = data ? JSON.parse(data) : {}; } catch (e) { return reject(new Error('parse: ' + data)); } resolve({ status: res.statusCode, body: p }); });
    });
    rq.on('error', reject);
    if (payload) rq.write(payload);
    rq.end();
  });
}

/* roles derived from the roster (compact port of rbac.jsx deriveAccess) */
function perms(me, usersByEmail, managerEmails, employees) {
  const p = usersByEmail[(me.workEmail || '').toLowerCase()] || {};
  const dept = (me.department || '').toLowerCase();
  const title = (me.jobTitle || '').toLowerCase();
  const meEmail = (me.workEmail || '').toLowerCase();
  const isExec = /\b(ceo|chief|coo|cfo|president|owner|principal)\b/.test(title) || ['leadership', 'management team', 'management', 'pure management'].includes(dept);
  const isHR = /human resources|payroll/.test(dept) || /\b(human resources|payroll|people ops)\b/.test(title);
  const hasReports = employees.some(e => e.managerEmail && e.managerEmail.toLowerCase() === meEmail);
  const isSupervisor = (!!p.supervisor || /\b(supervisor|team lead|lead)\b/.test(title)) && !/\b(manager|director)\b/.test(title) && !hasReports;
  const isManager = (!!p.manager || me.isManager || managerEmails.has(meEmail) || hasReports || /\b(manager|director)\b/.test(title)) && !isSupervisor;
  const isAdmin = !!p.admin;
  const viewAll = isAdmin || isHR || isExec;
  const viewTeam = isManager || isSupervisor;
  return { isHR: isHR || isAdmin, isManager: isManager || isSupervisor, viewAll, viewTeam, isAdmin };
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
  const allowed = ['puredental.com', 'foureversmile.com', 'puredentallab.com'];
  if (!allowed.includes(identity.email.split('@')[1] || '')) { context.res = { status: 403, headers, body: JSON.stringify({ error: 'Domain not allowed' }) }; return; }

  const endpoint = (process.env.COSMOS_ENDPOINT || '').replace(/\/$/, '');
  const key = process.env.COSMOS_KEY || '';
  const db = process.env.COSMOS_DB || 'portal';
  if (!endpoint || !key) { context.res = { status: 500, headers, body: JSON.stringify({ error: 'Missing Cosmos config' }) }; return; }

  const coll = `dbs/${db}/colls/timeoff`;
  const strip = ({ _rid, _self, _etag, _attachments, _ts, ...rest }) => rest;

  // resolve the caller in the roster + their permissions
  async function loadMe() {
    // listAll follows continuation tokens — a plain single-page GET silently drops
    // roster docs past one page (a real bug: a recently-added employee could 403 as
    // "no roster account" purely because their doc landed on a later page).
    const employees = (await listAll(collPath('roster'))).map(strip);
    let ref = { users: [], managers: [] };
    try {
      const a = await cosmos({ endpoint, key, verb: 'GET', resId: `dbs/${db}/colls/appState`, path: `/dbs/${db}/colls/appState/docs` });
      if (a.status === 200) { const sup = (a.body.Documents || []).find(d => d.id === 'roster-support'); if (sup) ref = { users: sup.users || [], managers: sup.managers || [] }; }
    } catch (e) {}
    const me = employees.find(e => (e.workEmail || '').toLowerCase() === identity.email);
    if (!me) throw new Error('No roster account for ' + identity.email);
    const usersByEmail = {}; (ref.users || []).forEach(u => { if (u.email) usersByEmail[u.email.toLowerCase()] = u; });
    try { applyAccessControl(usersByEmail, await loadAccessControl()); } catch (e) {}
    const managerEmails = new Set((ref.managers || []).map(m => (m.email || '').toLowerCase()).filter(Boolean));
    return { me, employees, access: perms(me, usersByEmail, managerEmails, employees), office: me.loc || me.location || 'Unassigned' };
  }

  try {
    const ctx = await loadMe();

    /* ---------- READ ---------- */
    if (req.method === 'GET') {
      let docs = (await listAll(coll)).map(strip);
      if (ctx.access.viewAll) { /* all */ }
      else if (ctx.access.viewTeam) docs = docs.filter(d => d.office === ctx.office);
      else docs = docs.filter(d => d.empId === ctx.me.id);
      context.res = { status: 200, headers, body: JSON.stringify({ requests: docs }) };
      return;
    }

    /* ---------- WRITE ---------- */
    let input = req.body;
    if (typeof input === 'string') { try { input = JSON.parse(input); } catch (e) { input = null; } }
    if (!input || !input.action) { context.res = { status: 400, headers, body: JSON.stringify({ error: 'action is required' }) }; return; }

    // submit: an employee creates a request for THEMSELVES (identity-derived, not client-trusted)
    if (input.action === 'submit') {
      const paid = input.type !== 'Unpaid';
      const doc = {
        id: 'to-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
        empId: ctx.me.id, name: ctx.me.name || `${ctx.me.first || ''} ${ctx.me.last || ''}`.trim(),
        office: ctx.office, loc: ctx.office,
        type: input.type || 'Vacation', paid,
        hours: Number(input.hours) || 0,
        avail: null, // PTO balance unknown until payroll (Paychex) is connected
        start: input.start || '', end: input.end || '', reason: input.reason || '',
        status: paid ? 'hr_review' : 'mgr_review',
        createdAt: new Date().toISOString(),
      };
      const up = await cosmos({ endpoint, key, verb: 'POST', resId: coll, path: `/${coll}/docs`, body: doc, partitionKey: doc.office, upsert: true });
      if (up.status !== 200 && up.status !== 201) { context.res = { status: 500, headers, body: JSON.stringify({ error: 'submit failed', status: up.status, detail: up.body }) }; return; }
      context.res = { status: 200, headers, body: JSON.stringify({ ok: true, request: strip(up.body) }) };
      return;
    }

    // status actions: need the existing doc (id + office for the partition)
    if (!input.id || !input.office) { context.res = { status: 400, headers, body: JSON.stringify({ error: 'id and office are required' }) }; return; }
    const docRes = await cosmos({ endpoint, key, verb: 'GET', resId: `${coll}/docs/${input.id}`, path: `/${coll}/docs/${input.id}`, partitionKey: input.office });
    if (docRes.status !== 200) { context.res = { status: 404, headers, body: JSON.stringify({ error: 'request not found' }) }; return; }
    const reqDoc = strip(docRes.body);

    const scopedOk = ctx.access.viewAll || (ctx.access.viewTeam && reqDoc.office === ctx.office);
    let next = null;
    if (input.action === 'hr_confirm') {
      if (!ctx.access.isHR) { context.res = { status: 403, headers, body: JSON.stringify({ error: 'HR only' }) }; return; }
      if (reqDoc.status !== 'hr_review') { context.res = { status: 409, headers, body: JSON.stringify({ error: 'not awaiting HR' }) }; return; }
      next = { ...reqDoc, status: 'mgr_review', hrConfirmed: true };
    } else if (input.action === 'hr_insufficient') {
      if (!ctx.access.isHR) { context.res = { status: 403, headers, body: JSON.stringify({ error: 'HR only' }) }; return; }
      next = { ...reqDoc, status: 'insufficient' };
    } else if (input.action === 'approve' || input.action === 'deny') {
      if (!scopedOk) { context.res = { status: 403, headers, body: JSON.stringify({ error: 'Not allowed to action this request' }) }; return; }
      if (reqDoc.status !== 'mgr_review') { context.res = { status: 409, headers, body: JSON.stringify({ error: 'not awaiting a manager' }) }; return; }
      next = { ...reqDoc, status: input.action === 'approve' ? 'approved' : 'denied', decidedBy: identity.email };
    } else {
      context.res = { status: 400, headers, body: JSON.stringify({ error: 'unknown action' }) }; return;
    }

    const up = await cosmos({ endpoint, key, verb: 'POST', resId: coll, path: `/${coll}/docs`, body: next, partitionKey: next.office, upsert: true });
    if (up.status !== 200 && up.status !== 201) { context.res = { status: 500, headers, body: JSON.stringify({ error: 'update failed', status: up.status, detail: up.body }) }; return; }
    context.res = { status: 200, headers, body: JSON.stringify({ ok: true, request: strip(up.body) }) };
  } catch (err) {
    const msg = err.message || 'error';
    const code = /No roster account/.test(msg) ? 403 : 500;
    context.res = { status: code, headers, body: JSON.stringify({ error: msg }) };
  }
};
