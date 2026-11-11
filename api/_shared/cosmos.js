/* api/_shared/cosmos.js — Cosmos DB REST helpers, shared by every data endpoint.
   This is the exact signing + request scheme already proven in api/schedule and
   api/settings, lifted into one place so new endpoints are a few lines, not 270.

   Master-key HMAC signing per:
   https://learn.microsoft.com/rest/api/cosmos-db/access-control-on-cosmosdb-resources

   Usage:
     const { cosmos, strip, collPath } = require('../_shared/cosmos');
     const coll = collPath('userSettings');                       // dbs/portal/colls/userSettings
     await cosmos({ verb:'GET',  resId: coll, path:`/${coll}/docs` });               // list
     await cosmos({ verb:'POST', resId: coll, path:`/${coll}/docs`, body: doc,
                    partitionKey: doc.empId, upsert:true });                          // upsert
     await cosmos({ verb:'GET',  resId:`${coll}/docs/${id}`, path:`/${coll}/docs/${id}`,
                    partitionKey: id });                                              // point-read
*/

const https = require('https');
const crypto = require('crypto');

const ENDPOINT = (process.env.COSMOS_ENDPOINT || '').replace(/\/$/, '');
const KEY = process.env.COSMOS_KEY || '';
const DB = process.env.COSMOS_DB || 'portal';

/* true when the function app has its Cosmos env vars — call this to fail fast with a clear 500 */
function cosmosConfigured() { return !!(ENDPOINT && KEY); }

/* build the path for a collection, e.g. collPath('roster') → 'dbs/portal/colls/roster' */
function collPath(name) { return `dbs/${DB}/colls/${name}`; }

/* drop Cosmos' internal system properties before returning a doc to the client */
function strip(doc) { const { _rid, _self, _etag, _attachments, _ts, ...rest } = doc || {}; return rest; }

function authHeader(verb, resType, resId, date, key) {
  const text = `${verb.toLowerCase()}\n${resType.toLowerCase()}\n${resId}\n${date.toLowerCase()}\n\n`;
  const sig = crypto.createHmac('sha256', Buffer.from(key, 'base64')).update(text).digest('base64');
  return encodeURIComponent(`type=master&ver=1.0&sig=${sig}`);
}

/* One Cosmos REST call.
   resId        — the resource being signed (collection path for list/upsert; doc path for point ops)
   path         — the URL path (usually '/' + resId, or collection + '/docs')
   partitionKey — the partition value (sent as the x-ms-documentdb-partitionkey header)
   upsert       — true to allow POST to update an existing doc with the same id
   ifMatch      — an _etag for optimistic concurrency (refuses the write if the doc changed)
   query        — { query, parameters }: runs a query across the container instead (POST) */
function cosmos({ verb, resId, path, body, partitionKey, upsert, ifMatch, continuation, query, endpoint = ENDPOINT, key = KEY }) {
  return new Promise((resolve, reject) => {
    const date = new Date().toUTCString();
    const url = new URL(path, endpoint);
    const payload = query ? JSON.stringify(query) : body ? JSON.stringify(body) : null;
    const headers = {
      'Authorization': authHeader(verb, 'docs', resId, date, key),
      'x-ms-date': date,
      'x-ms-version': '2018-12-31',
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    };
    if (partitionKey !== undefined) headers['x-ms-documentdb-partitionkey'] = JSON.stringify([partitionKey]);
    if (upsert) headers['x-ms-documentdb-is-upsert'] = 'true';
    if (ifMatch) headers['If-Match'] = ifMatch;
    if (continuation) headers['x-ms-continuation'] = continuation;
    if (query) {
      headers['Content-Type'] = 'application/query+json';
      headers['x-ms-documentdb-isquery'] = 'True';
      headers['x-ms-documentdb-query-enablecrosspartition'] = 'True';
    }
    if (payload) headers['Content-Length'] = Buffer.byteLength(payload);

    const rq = https.request({ hostname: url.hostname, path: url.pathname + (url.search || ''), method: verb, headers }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => { let p = {}; try { p = data ? JSON.parse(data) : {}; } catch (e) { return reject(new Error('parse: ' + data)); } resolve({ status: res.statusCode, body: p, continuation: res.headers['x-ms-continuation'] }); });
    });
    rq.on('error', reject);
    if (payload) rq.write(payload);
    rq.end();
  });
}

/* List every document in a container, following continuation tokens. A plain feed GET
   only returns one page — without this, a container past the page limit would silently
   drop documents (e.g. an employee added after the roster grows past ~100 docs). */
async function listAll(resId, { partitionKey } = {}) {
  let docs = [], continuation;
  do {
    const res = await module.exports.cosmos({ verb: 'GET', resId, path: `/${resId}/docs`, continuation, partitionKey });
    if (res.status !== 200) throw new Error('list failed: ' + res.status);
    docs = docs.concat(res.body.Documents || []);
    continuation = res.continuation;
  } while (continuation);
  return docs;
}

/* A filter is a list of conditions that must all hold: [field, op, value] with op one of
   '=', '<=', '>=', 'contains' (the field is a list holding value), 'in' (value is a list
   holding the field), or { or: [conditions] }. Fields are dotted names ("payload.start").
   compileQuery makes the database query; matches checks one document the same way. */
const FIELD = /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)*$/;
function compileQuery(filter) {
  const parameters = [];
  const param = (v) => { const name = '@p' + parameters.length; parameters.push({ name, value: v }); return name; };
  const field = (f) => { if (!FIELD.test(f)) throw new Error('bad field name: ' + f); return 'c' + f.split('.').map(k => `["${k}"]`).join(''); };
  const one = (cond) => {
    if (cond && cond.or) return '(' + cond.or.map(one).join(' OR ') + ')';
    const [f, op, v] = cond;
    if (op === 'contains') return `ARRAY_CONTAINS(${field(f)}, ${param(v)})`;
    if (op === 'in') return `ARRAY_CONTAINS(${param(v)}, ${field(f)})`;
    if (!['=', '<=', '>='].includes(op)) throw new Error('bad operator: ' + op);
    return `${field(f)} ${op} ${param(v)}`;
  };
  return { query: 'SELECT * FROM c' + (filter.length ? ' WHERE ' + filter.map(one).join(' AND ') : ''), parameters };
}
function matches(filter, doc) {
  const get = (f) => f.split('.').reduce((o, k) => (o == null ? undefined : o[k]), doc);
  const one = (cond) => {
    if (cond && cond.or) return cond.or.some(one);
    const [f, op, v] = cond; const x = get(f);
    if (op === 'contains') return Array.isArray(x) && x.includes(v);
    if (op === 'in') return v.includes(x);
    if (x === undefined) return false;
    return op === '=' ? x === v : op === '<=' ? x <= v : x >= v;
  };
  return filter.every(one);
}
/* the documents in a container that match a filter, following continuation tokens */
async function queryAll(resId, filter) {
  const query = compileQuery(filter);
  let docs = [], continuation;
  do {
    const res = await module.exports.cosmos({ verb: 'POST', resId, path: `/${resId}/docs`, query, filter, continuation });
    if (res.status !== 200) throw new Error('query failed: ' + res.status);
    docs = docs.concat(res.body.Documents || []);
    continuation = res.continuation;
  } while (continuation);
  return docs;
}

/* Read the dedicated accessControl container: per-person permission overrides
   (admin / canPrint / canSuspend / canTerminate / canDelete / manager / supervisor),
   one doc per person keyed by lowercased email (id). Kept in its OWN container so
   permissions are edited independently of HR/roster data. Missing container → []. */
async function loadAccessControl() {
  try {
    return (await module.exports.listAll(collPath('accessControl'))).map(strip);
  } catch (e) { return []; }
}

/* Fold accessControl docs onto a usersByEmail map (accessControl wins per key). */
function applyAccessControl(usersByEmail, accessDocs) {
  (accessDocs || []).forEach(a => { if (!a || !a.email) return; const k = a.email.toLowerCase(); usersByEmail[k] = { ...(usersByEmail[k] || {}), ...a }; });
  return usersByEmail;
}

/* Convenience: read the full roster + the roster-support doc (offices/departments/
   titles/managers/users/offboarding). Most write endpoints need these to resolve the
   caller and check permissions, so this saves repeating the two reads everywhere. */
async function loadRosterAndSupport() {
  const employees = (await module.exports.listAll(collPath('roster'))).map(strip);

  let support = null;
  try {
    const appDocs = await module.exports.listAll(collPath('appState'));
    const doc = appDocs.find(d => d.id === 'roster-support');
    if (doc) support = strip(doc);
  } catch (e) { /* support is optional */ }

  // Fold the dedicated accessControl store into support.users so every caller of this
  // helper sees final permissions from one place (accessControl is authoritative).
  const accessDocs = await module.exports.loadAccessControl();
  if (accessDocs.length) {
    const users = (support && Array.isArray(support.users)) ? support.users.slice() : [];
    const idx = {}; users.forEach((u, i) => { if (u && u.email) idx[u.email.toLowerCase()] = i; });
    accessDocs.forEach(a => { if (!a || !a.email) return; const k = a.email.toLowerCase(); if (idx[k] != null) users[idx[k]] = { ...users[idx[k]], ...a }; else users.push(a); });
    support = { ...(support || { id: 'roster-support', type: 'roster-support' }), users };
  }

  return { employees, support };
}

/* The roster-support doc exactly as stored, with its _etag and without the access grants
   merged in. Writers start from this, so a save never copies grants into roster-support. */
async function loadSupportForWrite() {
  const docs = await module.exports.listAll(collPath('appState'));
  return docs.find(d => d.id === 'roster-support') || null;
}

module.exports = { cosmos, listAll, queryAll, compileQuery, matches, strip, collPath, cosmosConfigured, loadRosterAndSupport, loadSupportForWrite, loadAccessControl, applyAccessControl, DB };
