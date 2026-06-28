/* api/schedule/index.js — read & write published schedules in Cosmos.
   GET  /api/schedule[?office=&weekKey=]  → list saved schedules (optionally filtered)
   POST /api/schedule                     → publish (upsert) one office's week

   Security mirrors api/roster: a valid Google ID token is required, the email is
   domain-locked, and (for writes) the caller must have scheduling rights derived
   from the live roster — never trusted from the client. The Cosmos master key
   lives only in env vars; the browser never sees it. */

const https = require('https');
const crypto = require('crypto');
const { verifyGoogleToken, tokenFromReq } = require('../_shared/auth');

/* ---- Cosmos REST helpers (master-key HMAC signing, same scheme as api/roster) ---- */
function authHeader(verb, resType, resId, date, key) {
  const text = `${verb.toLowerCase()}\n${resType.toLowerCase()}\n${resId}\n${date.toLowerCase()}\n\n`;
  const sig = crypto.createHmac('sha256', Buffer.from(key, 'base64')).update(text).digest('base64');
  return encodeURIComponent(`type=master&ver=1.0&sig=${sig}`);
}

// resId is the resource being signed (collection path for list/upsert); path is the URL path.
function cosmos({ endpoint, key, verb, resId, path, body, partitionKey, upsert }) {
  return new Promise((resolve, reject) => {
    const date = new Date().toUTCString();
    const auth = authHeader(verb, 'docs', resId, date, key);
    const url = new URL(path, endpoint);
    const payload = body ? JSON.stringify(body) : null;
    const headers = {
      'Authorization': auth,
      'x-ms-date': date,
      'x-ms-version': '2018-12-31',
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    };
    if (partitionKey !== undefined) headers['x-ms-documentdb-partitionkey'] = JSON.stringify([partitionKey]);
    if (upsert) headers['x-ms-documentdb-is-upsert'] = 'true';
    if (payload) headers['Content-Length'] = Buffer.byteLength(payload);
    const opts = { hostname: url.hostname, path: url.pathname, method: verb, headers };
    const req = https.request(opts, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        let parsed = {};
        try { parsed = data ? JSON.parse(data) : {}; } catch (e) { return reject(new Error('parse: ' + data)); }
        resolve({ status: res.statusCode, body: parsed });
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

/* ---- scheduling permission, derived from the roster (compact port of rbac.jsx) ---- */
function canSchedule(me, usersByEmail, managerEmails, employees) {
  const perms = usersByEmail[(me.workEmail || '').toLowerCase()] || {};
  const dept = (me.department || '').toLowerCase();
  const title = (me.jobTitle || '').toLowerCase();
  const meEmail = (me.workEmail || '').toLowerCase();
  const isExec = /\b(ceo|chief|coo|cfo|president|owner|principal)\b/.test(title) || ['leadership', 'management team', 'management', 'pure management'].includes(dept);
  const isHR = /human resources|payroll/.test(dept) || /\b(human resources|payroll|people ops)\b/.test(title);
  const hasReports = employees.some(e => e.managerEmail && e.managerEmail.toLowerCase() === meEmail);
  const isSupervisor = (!!perms.supervisor || /\b(supervisor|team lead|lead)\b/.test(title)) && !/\b(manager|director)\b/.test(title) && !hasReports;
  const isManager = (!!perms.manager || me.isManager || managerEmails.has(meEmail) || hasReports || /\b(manager|director)\b/.test(title)) && !isSupervisor;
  const isAdmin = !!perms.admin;
  return isAdmin || isHR || isExec || isManager || isSupervisor;
}

module.exports = async function (context, req) {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Google-Token',
  };
  if (req.method === 'OPTIONS') { context.res = { status: 204, headers }; return; }

  // --- identity: require a valid Google token, then domain-lock ---
  let identity;
  try {
    identity = await verifyGoogleToken(tokenFromReq(req));
  } catch (e) {
    context.res = { status: 401, headers, body: JSON.stringify({ error: 'Not authenticated', detail: e.message }) };
    return;
  }
  const allowedDomains = ['puredental.com', 'foureversmile.com', 'puredentallab.com'];
  if (!allowedDomains.includes(identity.email.split('@')[1] || '')) {
    context.res = { status: 403, headers, body: JSON.stringify({ error: 'Domain not allowed' }) };
    return;
  }

  const endpoint = (process.env.COSMOS_ENDPOINT || '').replace(/\/$/, '');
  const key = process.env.COSMOS_KEY || '';
  const db = process.env.COSMOS_DB || 'portal';
  if (!endpoint || !key) { context.res = { status: 500, headers, body: JSON.stringify({ error: 'Missing Cosmos config' }) }; return; }

  const coll = `dbs/${db}/colls/schedules`;
  const strip = ({ _rid, _self, _etag, _attachments, _ts, ...rest }) => rest;

  try {
    /* ---------- READ: list saved schedules ---------- */
    if (req.method === 'GET') {
      const res = await cosmos({ endpoint, key, verb: 'GET', resId: coll, path: `/${coll}/docs` });
      if (res.status !== 200) { context.res = { status: 500, headers, body: JSON.stringify({ error: 'read failed', status: res.status, detail: res.body }) }; return; }
      let docs = (res.body.Documents || []).map(strip);
      const office = req.query && req.query.office;
      const weekKey = req.query && req.query.weekKey;
      if (office) docs = docs.filter(d => d.office === office);
      if (weekKey) docs = docs.filter(d => d.weekKey === weekKey);
      context.res = { status: 200, headers, body: JSON.stringify({ schedules: docs }) };
      return;
    }

    /* ---------- WRITE: publish (upsert) one office's week ---------- */
    if (req.method === 'POST') {
      // authorize against the live roster (server-side; never trust the client)
      const rosterRes = await cosmos({ endpoint, key, verb: 'GET', resId: `dbs/${db}/colls/roster`, path: `/dbs/${db}/colls/roster/docs` });
      if (rosterRes.status !== 200) { context.res = { status: 500, headers, body: JSON.stringify({ error: 'roster read failed', status: rosterRes.status }) }; return; }
      const employees = (rosterRes.body.Documents || []).map(strip);

      let ref = { users: [], managers: [] };
      try {
        const appRes = await cosmos({ endpoint, key, verb: 'GET', resId: `dbs/${db}/colls/appState`, path: `/dbs/${db}/colls/appState/docs` });
        if (appRes.status === 200) {
          const sup = (appRes.body.Documents || []).find(d => d.id === 'roster-support');
          if (sup) ref = { users: sup.users || [], managers: sup.managers || [] };
        }
      } catch (e) {}

      const me = employees.find(e => (e.workEmail || '').toLowerCase() === identity.email);
      if (!me) { context.res = { status: 403, headers, body: JSON.stringify({ error: 'No roster account for ' + identity.email }) }; return; }

      const usersByEmail = {};
      (ref.users || []).forEach(u => { if (u.email) usersByEmail[u.email.toLowerCase()] = u; });
      const managerEmails = new Set((ref.managers || []).map(m => (m.email || '').toLowerCase()).filter(Boolean));

      if (!canSchedule(me, usersByEmail, managerEmails, employees)) {
        context.res = { status: 403, headers, body: JSON.stringify({ error: 'Not allowed to publish schedules' }) };
        return;
      }

      // validate input
      let input = req.body;
      if (typeof input === 'string') { try { input = JSON.parse(input); } catch (e) { input = null; } }
      if (!input || !input.office || !input.weekKey) {
        context.res = { status: 400, headers, body: JSON.stringify({ error: 'office and weekKey are required' }) };
        return;
      }

      // build the document — server stamps who/when, not the client
      const doc = {
        id: `${input.weekKey}__${input.office}`,
        office: input.office,
        weekKey: input.weekKey,
        cells: input.cells || {},
        open: input.open || {},
        status: 'published',
        publishedBy: identity.email,
        publishedAt: new Date().toISOString(),
      };

      const up = await cosmos({ endpoint, key, verb: 'POST', resId: coll, path: `/${coll}/docs`, body: doc, partitionKey: doc.office, upsert: true });
      if (up.status !== 200 && up.status !== 201) {
        context.res = { status: 500, headers, body: JSON.stringify({ error: 'write failed', status: up.status, detail: up.body }) };
        return;
      }
      context.res = { status: 200, headers, body: JSON.stringify({ ok: true, schedule: strip(up.body) }) };
      return;
    }

    context.res = { status: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  } catch (err) {
    context.res = { status: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
