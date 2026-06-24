const https = require('https');
const crypto = require('crypto');

function getAuthHeader(verb, resourceType, resourceId, date, key) {
  const text = `${verb.toLowerCase()}\n${resourceType.toLowerCase()}\n${resourceId}\n${date.toLowerCase()}\n\n`;
  const sig = crypto.createHmac('sha256', Buffer.from(key, 'base64')).update(text).digest('base64');
  return encodeURIComponent(`type=master&ver=1.0&sig=${sig}`);
}

function cosmosGet(endpoint, key, resourceId) {
  return new Promise((resolve, reject) => {
    const date = new Date().toUTCString();
    const auth = getAuthHeader('get', 'docs', resourceId, date, key);
    const url = new URL('/' + resourceId + '/docs', endpoint);
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
      res.on('data', c => data += c);
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
  if (req.method === 'OPTIONS') { context.res = { status: 204, headers }; return; }

  const endpoint = (process.env.COSMOS_ENDPOINT || '').replace(/\/$/, '');
  const key = process.env.COSMOS_KEY || '';
  const db = process.env.COSMOS_DB || 'portal';

  if (!endpoint || !key) {
    context.res = { status: 500, headers, body: JSON.stringify({ error: 'Missing COSMOS_ENDPOINT or COSMOS_KEY' }) };
    return;
  }

  const strip = ({ _rid, _self, _etag, _attachments, _ts, ...rest }) => rest;

  try {
    // 1) people from the roster container
    const rosterRes = await cosmosGet(endpoint, key, `dbs/${db}/colls/roster`);
    if (rosterRes.status !== 200) {
      context.res = { status: 500, headers, body: JSON.stringify({ error: 'roster read failed', status: rosterRes.status, detail: rosterRes.body }) };
      return;
    }
    const employees = (rosterRes.body.Documents || []).map(strip);

    // 2) reference data from appState (id: roster-support). Optional — empty arrays if absent.
    let ref = { offices: [], departments: [], titles: [], managers: [], users: [], offboarding: [] };
    try {
      const appRes = await cosmosGet(endpoint, key, `dbs/${db}/colls/appState`);
      if (appRes.status === 200) {
        const supportDoc = (appRes.body.Documents || []).find(d => d.id === 'roster-support');
        if (supportDoc) {
          ref = {
            offices: supportDoc.offices || [],
            departments: supportDoc.departments || [],
            titles: supportDoc.titles || [],
            managers: supportDoc.managers || [],
            users: supportDoc.users || [],
            offboarding: supportDoc.offboarding || [],
          };
        }
      }
    } catch (e) { /* reference data optional — roster still serves */ }

    context.res = {
      status: 200,
      headers,
      body: JSON.stringify({ employees, ...ref }),
    };
  } catch (err) {
    context.res = { status: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
