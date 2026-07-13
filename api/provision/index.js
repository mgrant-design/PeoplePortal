/* api/provision/index.js — create real Denticon accounts for a new hire.
   POST /api/provision  → { role: 'hygienist'|'dentist'|'frontdesk'|'insurance',
                            apps: ['denticon','denticon_provider', ...] }

   Round one wires DENTICON ONLY. Google / NexHealth / DoseSpot are returned as
   'skipped' so the client shows them un-created rather than faking success.

   Security mirrors api/settings & api/timeoff: valid Google token + domain lock,
   caller resolved from the live roster (never trusted from the client). A caller
   provisions their OWN accounts (the onboarding "Accounts & access" step); the
   subject is always the signed-in employee. Every attempt is written to the
   `provisioning` collection (partition key: /empId) for an audit trail. */

const https = require('https');
const { verifyGoogleToken, tokenFromReq } = require('../_shared/auth');
const { cosmos, strip, collPath, cosmosConfigured, loadRosterAndSupport } = require('../_shared/cosmos');

/* Authoritative role → Denticon security template + modules. Server-owned so the
   client can't grant itself a template it shouldn't have. Seeded from the values in
   data.jsx ROLE_ACCOUNT_RULES — confirm against Denticon's real template names. */
const ROLE_DENTICON = {
  hygienist: { template: 'Clinical — Hygienist',   provider: true,  modules: ['Charting', 'Perio', 'Imaging'] },
  dentist:   { template: 'Provider — Doctor',      provider: true,  modules: ['Charting', 'Treatment Plans', 'E-Claims', 'Imaging'] },
  frontdesk: { template: 'Front Office',           provider: false, modules: ['Scheduling', 'Ledger'] },
  insurance: { template: 'Billing & Insurance',    provider: false, modules: ['Claims', 'Ledger', 'Reports'] },
};

/* Generic JSON-over-HTTPS request (used for the Denticon call). */
function httpsJson({ method, urlStr, headers, body }) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const payload = body ? JSON.stringify(body) : null;
    const h = { 'Accept': 'application/json', ...headers };
    if (payload) h['Content-Length'] = Buffer.byteLength(payload);
    const rq = https.request({ hostname: url.hostname, path: url.pathname + (url.search || ''), method, headers: h }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => { let p = {}; try { p = data ? JSON.parse(data) : {}; } catch (e) { p = { raw: data }; } resolve({ status: res.statusCode, body: p }); });
    });
    rq.on('error', reject);
    if (payload) rq.write(payload);
    rq.end();
  });
}

/* The one Denticon-specific call. Endpoint path and field names are the single spot
   to align with Denticon's Partner API docs — everything else around it is done.
   Credentials live in Function env vars, never in code. */
async function createDenticonAccount({ subject, appId, rule }) {
  const base = (process.env.DENTICON_BASE_URL || '').replace(/\/$/, '');
  const apiKey = process.env.DENTICON_API_KEY || '';
  if (!base || !apiKey) {
    return { app: appId, status: 'error', error: 'Denticon not configured (set DENTICON_BASE_URL and DENTICON_API_KEY)' };
  }
  const provider = appId === 'denticon_provider';
  const first = subject.first || (subject.name || '').split(' ')[0] || '';
  const last = subject.last || (subject.name || '').split(' ').slice(1).join(' ') || '';
  const payload = {
    firstName: first,
    lastName: last,
    email: subject.workEmail || '',
    securityTemplate: rule.template,
    modules: rule.modules,
    isProvider: provider,
  };
  if (provider && subject.npi) payload.npi = subject.npi;

  try {
    const res = await httpsJson({
      method: 'POST',
      urlStr: base + '/v1/users',
      headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
      body: payload,
    });
    if (res.status < 200 || res.status >= 300) {
      return { app: appId, status: 'error', error: 'Denticon responded ' + res.status, detail: res.body };
    }
    return {
      app: appId,
      status: 'created',
      template: rule.template,
      login: {
        username: res.body.username || res.body.userName || subject.workEmail || '',
        externalId: res.body.id || res.body.userId || null,
      },
    };
  } catch (e) {
    return { app: appId, status: 'error', error: e.message || 'Denticon request failed' };
  }
}

module.exports = async function (context, req) {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Google-Token',
  };
  if (req.method === 'OPTIONS') { context.res = { status: 204, headers }; return; }

  let identity;
  try { identity = await verifyGoogleToken(tokenFromReq(req)); }
  catch (e) { context.res = { status: 401, headers, body: JSON.stringify({ error: 'Not authenticated', detail: e.message }) }; return; }
  const allowed = ['puredental.com', 'foureversmile.com', 'puredentallab.com'];
  if (!allowed.includes(identity.email.split('@')[1] || '')) { context.res = { status: 403, headers, body: JSON.stringify({ error: 'Domain not allowed' }) }; return; }

  if (!cosmosConfigured()) { context.res = { status: 500, headers, body: JSON.stringify({ error: 'Missing Cosmos config' }) }; return; }

  let input = req.body;
  if (typeof input === 'string') { try { input = JSON.parse(input); } catch (e) { input = null; } }
  if (!input || !Array.isArray(input.apps) || !input.apps.length) {
    context.res = { status: 400, headers, body: JSON.stringify({ error: 'apps array is required' }) }; return;
  }

  const rule = ROLE_DENTICON[input.role];
  if (!rule) { context.res = { status: 400, headers, body: JSON.stringify({ error: 'unknown role: ' + input.role }) }; return; }

  try {
    // resolve the subject = the signed-in caller, from the live roster
    const { employees } = await loadRosterAndSupport();
    const subject = employees.find(e => (e.workEmail || '').toLowerCase() === identity.email);
    if (!subject) { context.res = { status: 403, headers, body: JSON.stringify({ error: 'No roster account for ' + identity.email }) }; return; }
    const empId = subject.id;
    const coll = collPath('provisioning');

    const results = [];
    for (const appId of input.apps) {
      // round one: Denticon only. Other systems reported as skipped (not faked).
      if (appId !== 'denticon' && appId !== 'denticon_provider') {
        results.push({ app: appId, status: 'skipped', note: 'not wired yet' });
        continue;
      }
      if (appId === 'denticon_provider' && !rule.provider) {
        results.push({ app: appId, status: 'skipped', note: 'role has no provider record' });
        continue;
      }

      const r = await createDenticonAccount({ subject, appId, rule });
      results.push(r);

      // audit every attempt (success or error) to Cosmos
      const doc = {
        id: `${empId}:${appId}`,
        empId,
        app: appId,
        template: rule.template,
        status: r.status,
        login: r.login || null,
        error: r.error || null,
        provisionedBy: identity.email,
        at: new Date().toISOString(),
      };
      try {
        await cosmos({ verb: 'POST', resId: coll, path: `/${coll}/docs`, body: doc, partitionKey: empId, upsert: true });
      } catch (e) { /* audit write is best-effort; the provisioning result still returns */ }
    }

    const anyError = results.some(r => r.status === 'error');
    context.res = { status: anyError ? 502 : 200, headers, body: JSON.stringify({ ok: !anyError, results }) };
  } catch (err) {
    const msg = err.message || 'error';
    context.res = { status: /No roster account/.test(msg) ? 403 : 500, headers, body: JSON.stringify({ error: msg }) };
  }
};
