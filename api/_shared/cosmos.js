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
   ifMatch      — an _etag for optimistic concurrency (refuses the write if the doc changed) */
function cosmos({ verb, resId, path, body, partitionKey, upsert, ifMatch, continuation, endpoint = ENDPOINT, key = KEY }) {
  return new Promise((resolve, reject) => {
    const date = new Date().toUTCString();
    const url = new URL(path, endpoint);
    const payload = body ? JSON.stringify(body) : null;
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
async function listAll(resId) {
  let docs = [], continuation;
  do {
    const res = await cosmos({ verb: 'GET', resId, path: `/${resId}/docs`, continuation });
    if (res.status !== 200) throw new Error('list failed: ' + res.status);
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
    return (await listAll(collPath('accessControl'))).map(strip);
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
  const employees = (await listAll(collPath('roster'))).map(strip);

  let support = null;
  try {
    const appDocs = await listAll(collPath('appState'));
    const doc = appDocs.find(d => d.id === 'roster-support');
    if (doc) support = strip(doc);
  } catch (e) { /* support is optional */ }

  // Fold the dedicated accessControl store into support.users so every caller of this
  // helper sees final permissions from one place (accessControl is authoritative).
  const accessDocs = await loadAccessControl();
  if (accessDocs.length) {
    const users = (support && Array.isArray(support.users)) ? support.users.slice() : [];
    const idx = {}; users.forEach((u, i) => { if (u && u.email) idx[u.email.toLowerCase()] = i; });
    accessDocs.forEach(a => { if (!a || !a.email) return; const k = a.email.toLowerCase(); if (idx[k] != null) users[idx[k]] = { ...users[idx[k]], ...a }; else users.push(a); });
    support = { ...(support || { id: 'roster-support', type: 'roster-support' }), users };
  }

  return { employees, support };
}

module.exports = { cosmos, listAll, strip, collPath, cosmosConfigured, loadRosterAndSupport, loadAccessControl, applyAccessControl, DB };
