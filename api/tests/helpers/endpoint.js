/* Test helper: loads server code with the Google sign-in check and the database
   replaced by stand-ins the test controls. */
const path = require('path');
const API = path.join(__dirname, '..', '..');
const SHARED = path.join(API, '_shared');

/* No test reaches the network. Server code that calls out (Chat, text messages, the GIF
   search, the model) gets its request recorded and answered with no body. `current` is
   the endpoint being called: { net: [], netStatus }. */
let current = { net: [], netStatus: 200 };
function recordedRequest(...args) {
  const cb = typeof args[args.length - 1] === 'function' ? args.pop() : null;
  const opts = Object.assign({}, ...args.map(a => (typeof a === 'string' ? (() => { const u = new URL(a); return { hostname: u.hostname, path: u.pathname + u.search }; })() : a)));
  const target = current;
  const call = { hostname: opts.hostname, path: opts.path, method: opts.method || 'GET', body: '' };
  target.net.push(call);
  const rq = {
    on() { return rq; }, once() { return rq; }, setTimeout() { return rq; }, destroy() {},
    write(chunk) { call.body += chunk; },
    end(chunk) {
      if (chunk) call.body += chunk;
      setImmediate(() => {
        const res = { statusCode: target.netStatus, headers: {}, setEncoding() {}, on(ev, fn) { if (ev === 'end') setImmediate(fn); return res; } };
        if (cb) cb(res);
      });
    },
  };
  return rq;
}
const recordedGet = (...args) => { const rq = recordedRequest(...args); rq.end(); return rq; };
for (const mod of [require('https'), require('http')]) { mod.request = recordedRequest; mod.get = recordedGet; }
globalThis.fetch = async () => { throw new Error('tests do not reach the network'); };
/* settings that switch on real sending never come in from the shell */
for (const k of Object.keys(process.env)) if (/_KEY$|_TOKEN$|_WEBHOOK$|_CONNECTION_STRING$|^TWILIO_|^GMAIL_/.test(k)) delete process.env[k];

function freshApiModules() {
  for (const k of Object.keys(require.cache)) {
    if (k.startsWith(API + path.sep) && !k.includes(`${path.sep}node_modules${path.sep}`) && !k.includes(`${path.sep}tests${path.sep}`)) delete require.cache[k];
  }
}

/* identity: what a valid token resolves to (null = every token is rejected).
   verifyError: a message the sign-in check throws instead.
   cosmos(call): answers a database call, or returns undefined to use the default,
   which serves roster, appState and accessControl from employees, support, accessDocs. */
function installStubs({ identity = null, verifyError, employees = [], support = { users: [], managers: [] }, accessDocs = [], cosmos, configured = true, netStatus = 200 } = {}) {
  freshApiModules();
  const wire = { net: [], netStatus };
  current = wire;
  const authId = require.resolve(path.join(SHARED, 'auth.js'));
  require.cache[authId] = { id: authId, filename: authId, loaded: true, exports: {
    verifyGoogleToken: async (token) => {
      if (verifyError) throw new Error(verifyError);
      if (!token || !identity) throw new Error('invalid token');
      return { ...identity, email: String(identity.email).toLowerCase() };
    },
    tokenFromReq: (req) => (req.headers && req.headers['x-google-token']) || '',
  } };

  const db = require(path.join(SHARED, 'cosmos.js'));
  const calls = [];
  const lists = {
    roster: employees,
    appState: support ? [{ id: 'roster-support', type: 'roster-support', ...support }] : [],
    accessControl: accessDocs,
  };
  db.cosmos = async (c) => {
    if (c.query) {
      calls.push(c);
      const list = await db.cosmos({ verb: 'GET', resId: c.resId, path: c.path, fromQuery: true });
      if (list.status !== 200) return list;
      return { status: 200, body: { Documents: ((list.body && list.body.Documents) || []).filter(d => db.matches(c.filter, d)) } };
    }
    calls.push(c);
    const custom = cosmos ? await cosmos(c) : undefined;
    if (custom !== undefined) return custom;
    if (c.verb === 'GET' && /\/colls\/[^/]+$/.test(c.resId)) {
      const coll = c.resId.split('/').pop();
      return { status: 200, body: { Documents: lists[coll] || [] } };
    }
    return { status: 200, body: c.body || {} };
  };
  db.cosmosConfigured = () => configured;
  return { calls, wire };
}

function makeContext(bindings = {}) {
  const log = Object.assign(() => {}, { error: () => {}, warn: () => {} });
  return { log, bindings: { ...bindings }, res: null };
}

function loadEndpoint(name, opts = {}) {
  const { calls, wire } = installStubs(opts);
  const fn = require(path.join(API, name, 'index.js'));
  return {
    calls, net: wire.net,
    call: async ({ method = 'GET', body, query = {}, token = 't', headers = {}, bindings = {} } = {}) => {
      const context = makeContext(bindings);
      current = wire;   // outside calls made during this call belong to this endpoint
      await fn(context, { method, body, query, headers: { ...(token ? { 'x-google-token': token } : {}), ...headers } });
      let b = context.res && context.res.body;
      if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { /* leave as text */ } }
      return { status: context.res && context.res.status, body: b, headers: context.res && context.res.headers, context };
    },
  };
}

module.exports = { installStubs, loadEndpoint, makeContext };
