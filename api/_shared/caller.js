/* api/_shared/caller.js — who is asking, and the wrapper every endpoint runs inside. */

const auth = require('./auth');
const db = require('./cosmos');
const rules = require('./access-rules');

const { HttpError } = require('./errors');


async function resolveCaller(req) {
  const token = auth.tokenFromReq(req);
  if (!token) throw new HttpError(401, 'Not signed in');
  let identity;
  try { identity = await auth.verifyGoogleToken(token); }
  catch (e) {
    if (/GOOGLE_CLIENT_ID/.test(e && e.message)) throw new HttpError(500, 'Server is missing its sign-in settings', e);
    throw new HttpError(401, 'Not signed in', e);
  }
  if (!rules.domainAllowed(identity.email)) throw new HttpError(403, 'Domain not allowed');
  if (!db.cosmosConfigured()) throw new HttpError(500, 'Server is missing its database settings');

  const email = identity.email.toLowerCase();
  const { employees, support } = await db.loadRosterAndSupport();
  const me = employees.find(e => (e.workEmail || '').toLowerCase() === email);
  if (!me) throw new HttpError(403, 'No roster account');
  if (!rules.isActive(me)) throw new HttpError(403, 'This account is not active');

  const usersByEmail = {};
  ((support && support.users) || []).forEach(u => { if (u && u.email) usersByEmail[u.email.toLowerCase()] = u; });
  const access = accessFor(me, { employees, support });
  return { identity: { ...identity, email }, me, access, employees, support: support || {}, usersByEmail };
}

/* the access of any roster person, from the same inputs the caller's own access uses */
function accessFor(person, { employees, support }) {
  const email = (person.workEmail || '').toLowerCase();
  const perms = ((support && support.users) || []).find(u => u && (u.email || '').toLowerCase() === email) || {};
  return rules.deriveAccessCore({
    me: person, perms,
    hasReports: employees.some(e => (e.managerEmail || '').toLowerCase() === email),
    isListedManager: ((support && support.managers) || []).some(m => (m.email || '').toLowerCase() === email),
  });
}

/* fn({ context, req, body }) returns { status, body }. */
function handler(methods, fn) {
  const allowed = [...new Set([...methods.map(m => m.toUpperCase()), 'OPTIONS'])];
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': allowed.join(', '),
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Google-Token',
  };
  return async function (context, req) {
    const method = String(req.method || 'GET').toUpperCase();
    if (method === 'OPTIONS') { context.res = { status: 204, headers }; return; }
    if (!allowed.includes(method)) { context.res = { status: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) }; return; }
    let body = req.body;
    if (typeof body === 'string' && body.trim()) {
      try { body = JSON.parse(body); }
      catch (e) { context.res = { status: 400, headers, body: JSON.stringify({ error: 'Request body is not valid JSON' }) }; return; }
    } else if (typeof body === 'string') body = undefined;
    try {
      const out = (await fn({ context, req, body })) || {};
      const status = out.status || 200;
      context.res = status === 204 ? { status, headers } : { status, headers, body: JSON.stringify(out.body === undefined ? {} : out.body) };
    } catch (e) {
      if (e instanceof HttpError) {
        if (e.cause && context.log && typeof context.log.warn === 'function') context.log.warn(e.cause);
        context.res = { status: e.status, headers, body: JSON.stringify({ error: e.message }) };
        return;
      }
      if (context.log && typeof context.log.error === 'function') context.log.error(e);
      context.res = { status: 500, headers, body: JSON.stringify({ error: 'Server error' }) };
    }
  };
}

module.exports = { HttpError, resolveCaller, accessFor, handler };
