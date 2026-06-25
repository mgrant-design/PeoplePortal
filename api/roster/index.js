const https = require('https');
const crypto = require('crypto');
const { verifyGoogleToken, tokenFromReq } = require('../_shared/auth');

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
      hostname: url.hostname, path: url.pathname, method: 'GET',
      headers: {
        'Authorization': auth, 'x-ms-date': date, 'x-ms-version': '2018-12-31',
        'Accept': 'application/json', 'Content-Type': 'application/json',
      }
    };
    const req = https.request(options, (res) => {
      let data = ''; res.on('data', c => data += c);
      res.on('end', () => { try { resolve({ status: res.statusCode, body: JSON.parse(data) }); } catch (e) { reject(new Error('parse: ' + data)); } });
    });
    req.on('error', reject); req.end();
  });
}

// ---- scoping logic, ported from rbac.jsx (deriveAccess + scopedEmployees) ----
function normLoc(l) {
  const s = (l || '').toLowerCase();
  if (!s) return 'Unassigned';
  if (s.includes('remote')) return 'Remote';
  if (s.includes('hauppauge')) return 'Hauppauge';
  if (s.includes('garden')) return 'Garden City';
  if (s.includes('manorville')) return 'Manorville';
  if (s.includes('wading')) return 'Wading River';
  if (s.includes('islandia')) return 'Islandia';
  if (s.includes('jersey')) return 'New Jersey';
  if (s.includes('buffalo')) return 'Buffalo';
  return l;
}

function deriveAccess(me, usersByEmail, managerEmails, employees) {
  const perms = usersByEmail[(me.workEmail || '').toLowerCase()] || {};
  const dept = (me.department || '').toLowerCase();
  const title = (me.jobTitle || '').toLowerCase();
  const meEmail = (me.workEmail || '').toLowerCase();

  const isExec = /\b(ceo|chief|coo|cfo|president|owner|principal)\b/.test(title) || ['leadership', 'management team', 'management', 'pure management'].includes(dept);
  const isHR = /human resources|payroll/.test(dept) || /\b(human resources|payroll|people ops)\b/.test(title);
  const isAccounting = /accounting/.test(dept) || /\b(controller|accountant|bookkeeper)\b/.test(title);
  const hasReports = employees.some(e => e.managerEmail && e.managerEmail.toLowerCase() === meEmail);
  const isSupervisor = (!!perms.supervisor || /\b(supervisor|team lead|lead)\b/.test(title)) && !/\b(manager|director)\b/.test(title) && !hasReports;
  const isManager = (!!perms.manager || me.isManager || managerEmails.has(meEmail) || hasReports || /\b(manager|director)\b/.test(title)) && !isSupervisor;
  const isAdmin = !!perms.admin;

  const viewAll = isAdmin || isHR || isExec;
  const viewTeam = isManager || isSupervisor;
  return { viewAll, viewTeam };
}

function scopedEmployees(me, access, employees) {
  if (access.viewAll) return employees;
  const meEmail = (me.workEmail || '').toLowerCase();
  if (access.viewTeam) {
    const set = new Set([me.id]);
    const myEmails = new Set([meEmail]);
    let changed = true;
    while (changed) {
      changed = false;
      employees.forEach(e => {
        if (!set.has(e.id) && e.managerEmail && myEmails.has(e.managerEmail.toLowerCase())) {
          set.add(e.id); myEmails.add((e.workEmail || '').toLowerCase()); changed = true;
        }
      });
    }
    return employees.filter(e => set.has(e.id));
  }
  return employees.filter(e => e.id === me.id);
}

module.exports = async function (context, req) {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  };
  if (req.method === 'OPTIONS') { context.res = { status: 204, headers }; return; }

  // --- identity: require a valid Google token ---
  let identity;
  try {
    identity = await verifyGoogleToken(tokenFromReq(req));
  } catch (e) {
    context.res = { status: 401, headers, body: JSON.stringify({ error: 'Not authenticated', detail: e.message }) };
    return;
  }
  // domain lock, server-side
  const allowedDomains = ['puredental.com', 'foureversmile.com', 'puredentallab.com'];
  const domain = identity.email.split('@')[1] || '';
  if (!allowedDomains.includes(domain)) {
    context.res = { status: 403, headers, body: JSON.stringify({ error: 'Domain not allowed' }) };
    return;
  }

  const endpoint = (process.env.COSMOS_ENDPOINT || '').replace(/\/$/, '');
  const key = process.env.COSMOS_KEY || '';
  const db = process.env.COSMOS_DB || 'portal';
  if (!endpoint || !key) { context.res = { status: 500, headers, body: JSON.stringify({ error: 'Missing Cosmos config' }) }; return; }

  const strip = ({ _rid, _self, _etag, _attachments, _ts, ...rest }) => rest;

  try {
    const rosterRes = await cosmosGet(endpoint, key, `dbs/${db}/colls/roster`);
    if (rosterRes.status !== 200) { context.res = { status: 500, headers, body: JSON.stringify({ error: 'roster read failed', status: rosterRes.status }) }; return; }
    const allEmployees = (rosterRes.body.Documents || []).map(strip);

    // reference data (optional)
    let ref = { offices: [], departments: [], titles: [], managers: [], users: [], offboarding: [] };
    try {
      const appRes = await cosmosGet(endpoint, key, `dbs/${db}/colls/appState`);
      if (appRes.status === 200) {
        const sup = (appRes.body.Documents || []).find(d => d.id === 'roster-support');
        if (sup) ref = { offices: sup.offices||[], departments: sup.departments||[], titles: sup.titles||[], managers: sup.managers||[], users: sup.users||[], offboarding: sup.offboarding||[] };
      }
    } catch (e) {}

    // find the caller in the roster
    const me = allEmployees.find(e => (e.workEmail || '').toLowerCase() === identity.email);
    if (!me) { context.res = { status: 403, headers, body: JSON.stringify({ error: 'No roster account for ' + identity.email }) }; return; }

    // build lookups for scoping
    const usersByEmail = {};
    (ref.users || []).forEach(u => { if (u.email) usersByEmail[u.email.toLowerCase()] = u; });
    const managerEmails = new Set((ref.managers || []).map(m => (m.email || '').toLowerCase()).filter(Boolean));

    const access = deriveAccess(me, usersByEmail, managerEmails, allEmployees);
    const visible = scopedEmployees(me, access, allEmployees);

    context.res = { status: 200, headers, body: JSON.stringify({ employees: visible, ...ref }) };
  } catch (err) {
    context.res = { status: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
