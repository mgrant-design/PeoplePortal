const https = require('https');
const crypto = require('crypto');

function getAuthHeader(verb, resourceType, resourceId, date, key) {
  const text = `${verb.toLowerCase()}\n${resourceType.toLowerCase()}\n${resourceId}\n${date.toLowerCase()}\n\n`;
  const sig = crypto.createHmac('sha256', Buffer.from(key, 'base64')).update(text).digest('base64');
  return encodeURIComponent(`type=master&ver=1.0&sig=${sig}`);
}

function cosmosRequest(endpoint, key, path, resourceType, resourceId) {
  return new Promise((resolve, reject) => {
    const date = new Date().toUTCString();
    const auth = getAuthHeader('get', resourceType, resourceId, date, key);
    const url = new URL(path, endpoint);
    const options = {
      hostname: url.hostname,
      path: url.pathname,
      method: 'GET',
      headers: {
        'Authorization': auth,
        'x-ms-date': date,
        'x-ms-version': '2018-12-31',
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      }
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch (e) { reject(new Error('JSON parse error: ' + data)); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

module.exports = async function (context, req) {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
  };

  if (req.method === 'OPTIONS') {
    context.res = { status: 204, headers };
    return;
  }

  const endpoint = (process.env.COSMOS_ENDPOINT || '').replace(/\/$/, '');
  const key = process.env.COSMOS_KEY || '';
  const db = process.env.COSMOS_DB || 'portal';
  const container = process.env.COSMOS_CONTAINER || 'roster';

  if (!endpoint || !key) {
    context.res = { status: 500, headers, body: JSON.stringify({ error: 'Missing COSMOS_ENDPOINT or COSMOS_KEY' }) };
    return;
  }

  try {
    const resourceId = `dbs/${db}/colls/${container}`;
    const path = `/${resourceId}/docs`;
    const result = await cosmosRequest(endpoint, key, path, resourceType, resourceId);

    if (result.status !== 200) {
      context.res = { status: 500, headers, body: JSON.stringify({ error: 'Cosmos error', status: result.status, detail: result.body }) };
      return;
    }

    const docs = result.body.Documents || [];
    const clean = docs.map(({ _rid, _self, _etag, _attachments, _ts, ...emp }) => emp);
    const employees = clean.filter(r => !r.docType || r.docType === 'employee');
    const offices = clean.filter(r => r.docType === 'office').map(({ docType, ...o }) => o);
    const managers = clean.filter(r => r.docType === 'manager').map(({ docType, ...m }) => m);
    const users = clean.filter(r => r.docType === 'user').map(({ docType, ...u }) => u);
    const offboarding = clean.filter(r => r.docType === 'offboarding').map(({ docType, ...o }) => o);

    context.res = {
      status: 200,
      headers,
      body: JSON.stringify({ employees, offices, departments: [], titles: [], managers, users, offboarding }),
    };
  } catch (err) {
    context.res = { status: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
