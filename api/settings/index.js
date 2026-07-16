/* api/settings/index.js — per-employee appearance settings in Cosmos (userSettings).
   GET  /api/settings  → the caller's own settings (or null)
   POST /api/settings  → upsert the caller's settings (body = the prefs object)

   Auth mirrors the other endpoints: valid Google token + domain lock. The caller's
   empId is resolved from the roster (never trusted from the client); each user can
   only read/write their own doc. Container partition key: /empId. */

const https = require('https');
const crypto = require('crypto');
const { verifyGoogleToken, tokenFromReq } = require('../_shared/auth');
const { listAll, collPath } = require('../_shared/cosmos');

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
    const rq = https.request({ hostname: url.hostname, path: url.pathname, method: verb, headers }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => { let p = {}; try { p = data ? JSON.parse(data) : {}; } catch (e) { return reject(new Error('parse: ' + data)); } resolve({ status: res.statusCode, body: p }); });
    });
    rq.on('error', reject);
    if (payload) rq.write(payload);
    rq.end();
  });
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

  const coll = `dbs/${db}/colls/userSettings`;
  const strip = ({ _rid, _self, _etag, _attachments, _ts, ...rest }) => rest;

  try {
    // resolve the caller's empId from the roster — listAll follows continuation tokens,
    // a plain single-page GET would silently drop roster docs past one page.
    const me = (await listAll(collPath('roster'))).find(e => (e.workEmail || '').toLowerCase() === identity.email);
    if (!me) { context.res = { status: 403, headers, body: JSON.stringify({ error: 'No roster account for ' + identity.email }) }; return; }
    const empId = me.id;

    if (req.method === 'GET') {
      const res = await cosmos({ endpoint, key, verb: 'GET', resId: `${coll}/docs/${empId}`, path: `/${coll}/docs/${empId}`, partitionKey: empId });
      if (res.status === 404) { context.res = { status: 200, headers, body: JSON.stringify({ settings: null }) }; return; }
      if (res.status !== 200) { context.res = { status: 500, headers, body: JSON.stringify({ error: 'read failed', status: res.status }) }; return; }
      const doc = strip(res.body);
      context.res = { status: 200, headers, body: JSON.stringify({ settings: doc.prefs || null }) };
      return;
    }

    // POST: upsert the caller's own settings
    let input = req.body;
    if (typeof input === 'string') { try { input = JSON.parse(input); } catch (e) { input = null; } }
    if (!input || typeof input !== 'object') { context.res = { status: 400, headers, body: JSON.stringify({ error: 'settings object required' }) }; return; }

    const doc = { id: empId, empId, prefs: input, updatedAt: new Date().toISOString() };
    const up = await cosmos({ endpoint, key, verb: 'POST', resId: coll, path: `/${coll}/docs`, body: doc, partitionKey: empId, upsert: true });
    if (up.status !== 200 && up.status !== 201) { context.res = { status: 500, headers, body: JSON.stringify({ error: 'save failed', status: up.status, detail: up.body }) }; return; }
    context.res = { status: 200, headers, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    const msg = err.message || 'error';
    context.res = { status: /No roster account/.test(msg) ? 403 : 500, headers, body: JSON.stringify({ error: msg }) };
  }
};
