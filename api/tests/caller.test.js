const test = require('node:test'); const assert = require('node:assert');
const path = require('path');
const { installStubs, makeContext } = require('./helpers/endpoint');
const CALLER = path.join(__dirname, '..', '_shared', 'caller.js');

const jo = { first: 'Jo', last: 'Lee', workEmail: 'jo.lee@puredental.com', department: 'Payroll', jobTitle: 'Payroll Specialist' };
const load = (opts) => { installStubs(opts); return require(CALLER); };
const req = (token = 't') => ({ method: 'GET', headers: token ? { 'x-google-token': token } : {} });

test('a request with no token is refused with 401', async () => {
  const { resolveCaller } = load({ identity: { email: jo.workEmail }, employees: [jo] });
  await assert.rejects(resolveCaller(req('')), (e) => e.status === 401 && e.message === 'Not signed in');
});
test('an email outside the company domains is refused with 403', async () => {
  const { resolveCaller } = load({ identity: { email: 'someone@gmail.com' }, employees: [jo] });
  await assert.rejects(resolveCaller(req()), (e) => e.status === 403 && e.message === 'Domain not allowed');
});
test('a signed-in person with no roster record is refused', async () => {
  const { resolveCaller } = load({ identity: { email: 'new.person@puredental.com' }, employees: [jo] });
  await assert.rejects(resolveCaller(req()), (e) => e.status === 403 && e.message === 'No roster account');
});
test('a payroll department member resolves as HR', async () => {
  const { resolveCaller } = load({ identity: { email: jo.workEmail }, employees: [jo] });
  const c = await resolveCaller(req());
  assert.equal(c.access.level, 'hr'); assert.equal(c.me.first, 'Jo');
});
test('a server with no database settings answers 500', async () => {
  const { resolveCaller } = load({ identity: { email: jo.workEmail }, employees: [jo], configured: false });
  await assert.rejects(resolveCaller(req()), (e) => e.status === 500 && e.message === 'Server is missing its database settings');
});
test('OPTIONS is answered with 204 and CORS headers', async () => {
  const { handler } = load({});
  const ctx = makeContext();
  await handler(['GET', 'POST'], async () => ({ status: 200, body: {} }))(ctx, { method: 'OPTIONS', headers: {} });
  assert.equal(ctx.res.status, 204);
  assert.equal(ctx.res.headers['Access-Control-Allow-Methods'], 'GET, POST, OPTIONS');
  assert.match(ctx.res.headers['Access-Control-Allow-Headers'], /X-Google-Token/);
});
test('an HttpError keeps its status', async () => {
  const { handler, HttpError } = load({});
  const ctx = makeContext();
  await handler(['POST'], async () => { throw new HttpError(409, 'x'); })(ctx, { method: 'POST', headers: {} });
  assert.equal(ctx.res.status, 409); assert.deepEqual(JSON.parse(ctx.res.body), { error: 'x' });
});
test('an unexpected error hides its message', async () => {
  const { handler } = load({});
  const ctx = makeContext(); let logged = '';
  ctx.log.error = (e) => { logged = String(e && e.message); };
  await handler(['GET'], async () => { throw new Error('secret detail'); })(ctx, { method: 'GET', headers: {} });
  assert.equal(ctx.res.status, 500); assert.doesNotMatch(ctx.res.body, /secret detail/);
  assert.deepEqual(JSON.parse(ctx.res.body), { error: 'Server error' }); assert.equal(logged, 'secret detail');
});
test('a JSON string body is parsed', async () => {
  const { handler } = load({});
  const ctx = makeContext(); let seen;
  await handler(['POST'], async ({ body }) => { seen = body; return { status: 200, body: { ok: true } }; })(ctx, { method: 'POST', headers: {}, body: '{"a":1}' });
  assert.equal(seen.a, 1); assert.equal(ctx.res.status, 200);
});
test('a method outside the list is refused with 405', async () => {
  const { handler } = load({});
  const ctx = makeContext();
  await handler(['GET'], async () => ({ status: 200, body: {} }))(ctx, { method: 'DELETE', headers: {} });
  assert.equal(ctx.res.status, 405);
});

/* ---- review follow-ups ---- */
const ann = { first: 'Ann', last: 'Ray', workEmail: 'Ann.Ray@PureDental.com', department: 'Front Desk', jobTitle: 'Coordinator' };
const bo = { first: 'Bo', last: 'Kim', workEmail: 'bo.kim@puredental.com', department: 'Front Desk', jobTitle: 'Coordinator', managerEmail: 'ann.ray@puredental.com' };

test('a person someone reports to resolves as a manager', async () => {
  const { resolveCaller } = load({ identity: { email: 'ann.ray@puredental.com' }, employees: [ann, bo] });
  assert.equal((await resolveCaller(req())).access.level, 'manager');
});
test('a person on the managers list resolves as a manager', async () => {
  const { resolveCaller } = load({ identity: { email: 'bo.kim@puredental.com' }, employees: [bo], support: { users: [], managers: [{ email: 'BO.KIM@puredental.com' }] } });
  assert.equal((await resolveCaller(req())).access.level, 'manager');
});
test('an admin grant in the access store makes the caller an admin', async () => {
  const { resolveCaller } = load({ identity: { email: 'bo.kim@puredental.com' }, employees: [bo], accessDocs: [{ id: 'bo.kim@puredental.com', email: 'Bo.Kim@puredental.com', admin: true }] });
  assert.equal((await resolveCaller(req())).access.level, 'admin');
});
test('a roster email in mixed case still matches the signed-in email', async () => {
  const { resolveCaller } = load({ identity: { email: 'ANN.RAY@puredental.com' }, employees: [ann] });
  assert.equal((await resolveCaller(req())).me.first, 'Ann');
});
test('a terminated employee is refused', async () => {
  const { resolveCaller } = load({ identity: { email: 'bo.kim@puredental.com' }, employees: [{ ...bo, status: 'Terminated' }] });
  await assert.rejects(resolveCaller(req()), (e) => e.status === 403 && e.message === 'This account is not active');
});
test('a missing sign-in setting on the server is a 500, not a sign-out', async () => {
  const { resolveCaller } = load({ identity: { email: jo.workEmail }, employees: [jo], verifyError: 'Server missing GOOGLE_CLIENT_ID' });
  await assert.rejects(resolveCaller(req()), (e) => e.status === 500 && e.message === 'Server is missing its sign-in settings');
});
test('a failed roster read answers Server error as JSON', async () => {
  const { handler, resolveCaller } = load({ identity: { email: jo.workEmail }, employees: [jo], cosmos: async (c) => (c.resId.endsWith('/roster') ? { status: 500, body: {} } : undefined) });
  const ctx = makeContext();
  await handler(['GET'], async ({ req }) => { await resolveCaller(req); return { status: 200, body: {} }; })(ctx, req());
  assert.equal(ctx.res.status, 500); assert.deepEqual(JSON.parse(ctx.res.body), { error: 'Server error' });
});
test('a body that is not JSON is refused with 400', async () => {
  const { handler } = load({});
  const ctx = makeContext();
  await handler(['POST'], async () => ({ status: 200, body: {} }))(ctx, { method: 'POST', headers: {}, body: '{oops' });
  assert.equal(ctx.res.status, 400); assert.deepEqual(JSON.parse(ctx.res.body), { error: 'Request body is not valid JSON' });
});
test('a 204 answer has no body', async () => {
  const { handler } = load({});
  const ctx = makeContext();
  await handler(['POST'], async () => ({ status: 204 }))(ctx, { method: 'POST', headers: {} });
  assert.equal(ctx.res.status, 204); assert.equal(ctx.res.body, undefined);
});
test('live push messages set by an endpoint survive the wrapper', async () => {
  const { handler } = load({});
  const ctx = makeContext();
  await handler(['POST'], async ({ context }) => { context.bindings.signalRMessages = [{ target: 'x', arguments: [1] }]; return { status: 200, body: {} }; })(ctx, { method: 'POST', headers: {} });
  assert.equal(ctx.bindings.signalRMessages.length, 1);
});
test('a missing settings document gives an empty object, not null', async () => {
  const { resolveCaller } = load({ identity: { email: jo.workEmail }, employees: [jo], support: null });
  const c = await resolveCaller(req());
  assert.deepEqual(c.support.users || [], []);
});
