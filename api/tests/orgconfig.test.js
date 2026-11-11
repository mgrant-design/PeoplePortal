const test = require('node:test'); const assert = require('node:assert');
const { loadEndpoint } = require('./helpers/endpoint');

const ada = { id: 'a1', first: 'Ada', last: 'Admin', workEmail: 'ada@puredental.com', department: 'IT', jobTitle: 'Systems', location: 'Manorville' };
const hal = { id: 'h1', first: 'Hal', last: 'HR', workEmail: 'hal@puredental.com', department: 'Human Resources', jobTitle: 'HR Generalist', location: 'Manorville' };
const eli = { id: 'e1', first: 'Eli', last: 'Emp', workEmail: 'eli@puredental.com', department: 'Clinical Team', jobTitle: 'Dental Assistant', location: 'Manorville' };
const employees = [ada, hal, eli];
const support = { _etag: '"e1"', users: [{ email: 'ada@puredental.com', admin: true }, { email: 'eli@puredental.com' }], managers: [], offices: [{ id: 'o1', name: 'Manorville' }], offboarding: [{ id: 'off1' }] };
const accessDocs = [{ id: 'hal@puredental.com', email: 'hal@puredental.com', canTerminate: true }];
const as = (email, extra = {}) => loadEndpoint('orgconfig', { identity: { email }, employees, support, accessDocs, ...extra });
const saved = (ep) => ep.calls.find(c => c.verb === 'POST' && c.resId.endsWith('/appState'));

test('nobody saves permission grants through the organization settings (they are saved in one place)', async () => {
  for (const who of [hal, ada]) {
    const r = await as(who.workEmail).call({ method: 'POST', body: { section: 'users', value: [{ email: 'eli@puredental.com', admin: true }] } });
    assert.equal(r.status, 400, who.first);
  }
});
test('saving offices does not copy access grants into users', async () => {
  const ep = as(hal.workEmail);
  const r = await ep.call({ method: 'POST', body: { section: 'offices', value: [{ id: 'o1', name: 'Manorville' }, { id: 'o2', name: 'Totowa' }] } });
  assert.equal(r.status, 200);
  assert.deepEqual(saved(ep).body.users, support.users);
});
test('a save sends the document version, and a stale save gets 409', async () => {
  const ep = as(hal.workEmail, { cosmos: async (c) => (c.verb === 'POST' && c.resId.endsWith('/appState') ? { status: 412, body: {} } : undefined) });
  const r = await ep.call({ method: 'POST', body: { section: 'offices', value: [] } });
  assert.equal(saved(ep).ifMatch, '"e1"');
  assert.equal(r.status, 409);
});
test('a plain employee reads only their own permission entry and no offboarding records', async () => {
  const r = await as(eli.workEmail).call({ method: 'GET' });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.users.map(u => u.email), ['eli@puredental.com']);
  assert.deepEqual(r.body.offboarding, []);
});

/* ---- Task 5 review follow-ups ---- */
test('a save made from an old copy of the section gets 409 and writes nothing', async () => {
  const ep = as(hal.workEmail);
  const r = await ep.call({ method: 'POST', body: { section: 'offices', value: [{ id: 'o3', name: 'Islandia' }], previous: [] } });
  assert.equal(r.status, 409); assert.equal(saved(ep), undefined);
});
test('a save made from the current copy goes through', async () => {
  const ep = as(hal.workEmail);
  const r = await ep.call({ method: 'POST', body: { section: 'offices', value: [], previous: support.offices } });
  assert.equal(r.status, 200);
});
test('a week-start save compares the number it started from', async () => {
  const stale = await as(hal.workEmail).call({ method: 'POST', body: { section: 'weekStart', value: 0, previous: 2 } });
  assert.equal(stale.status, 409);
  const ok = await as(hal.workEmail).call({ method: 'POST', body: { section: 'weekStart', value: '2', previous: 1 } });
  assert.equal(ok.status, 200);
});
test('a week start of 2 is stored as a number, and 5 is refused', async () => {
  const ep = as(hal.workEmail);
  await ep.call({ method: 'POST', body: { section: 'weekStart', value: '2' } });
  assert.strictEqual(saved(ep).body.weekStart, 2);
  const bad = await as(hal.workEmail).call({ method: 'POST', body: { section: 'weekStart', value: 5 } });
  assert.equal(bad.status, 400);
});
test('the first save creates the settings document with its type and no version check', async () => {
  const ep = loadEndpoint('orgconfig', { identity: { email: hal.workEmail }, employees, support: null });
  const r = await ep.call({ method: 'POST', body: { section: 'offices', value: [] } });
  assert.equal(r.status, 200);
  const w = saved(ep);
  assert.equal(w.body.type, 'roster-support'); assert.equal(w.partitionKey, 'roster-support'); assert.equal(w.ifMatch, undefined);
});
test('a failed read of the settings answers 500 and writes nothing', async () => {
  const ep = as(hal.workEmail, { cosmos: async (c) => (c.verb === 'GET' && c.resId.endsWith('/appState') ? { status: 500, body: {} } : undefined) });
  const r = await ep.call({ method: 'POST', body: { section: 'offices', value: [] } });
  assert.equal(r.status, 500); assert.equal(saved(ep), undefined);
});
test('HR reads every permission entry and the offboarding records', async () => {
  const r = await as(hal.workEmail).call({ method: 'GET' });
  assert.ok(r.body.users.length >= 2); assert.equal(r.body.offboarding.length, 1);
});
test('only an admin can save feature switches', async () => {
  const ep = as(hal.workEmail);
  const r = await ep.call({ method: 'POST', body: { section: 'flags', value: { library: false } } });
  assert.equal(r.status, 403); assert.equal(saved(ep), undefined);
});
test('switches must be known names with true or false', async () => {
  for (const value of [{ scrubs: 'yes' }, { bogus: true }, ['library']]) {
    const ep = as(ada.workEmail);
    const r = await ep.call({ method: 'POST', body: { section: 'flags', value } });
    assert.equal(r.status, 400, JSON.stringify(value)); assert.equal(saved(ep), undefined);
  }
});
test('an admin saves feature switches for everyone', async () => {
  const ep = as(ada.workEmail);
  const r = await ep.call({ method: 'POST', body: { section: 'flags', value: { library: false, scheduler: true } } });
  assert.equal(r.status, 200);
  assert.deepEqual(saved(ep).body.flags, { library: false, scheduler: true });
});
test('only an admin can save approvers', async () => {
  const ep = as(hal.workEmail);
  const r = await ep.call({ method: 'POST', body: { section: 'approvers', value: { timeoffFinal: 'hal@puredental.com', offboarding: [], offer: '' } } });
  assert.equal(r.status, 403); assert.equal(saved(ep), undefined);
});
test('approvers must be people on the roster', async () => {
  const ep = as(ada.workEmail);
  const bad = await ep.call({ method: 'POST', body: { section: 'approvers', value: { timeoffFinal: 'nobody@puredental.com', offboarding: [], offer: '' } } });
  assert.equal(bad.status, 400);
  const ok = await as(ada.workEmail).call({ method: 'POST', body: { section: 'approvers', value: { timeoffFinal: 'Hal@PureDental.com', offboarding: ['ada@puredental.com'], offer: 'hal@puredental.com' } } });
  assert.equal(ok.status, 200);
});
test('a module switch save made from an old copy answers 409', async () => {
  const ep = as(ada.workEmail, { support: { ...support, flags: { library: false } } });
  const r = await ep.call({ method: 'POST', body: { section: 'flags', value: { library: true, scrubs: false }, previous: {} } });
  assert.equal(r.status, 409); assert.equal(saved(ep), undefined);
});
test('an approver who has left the company is refused', async () => {
  const gone = { id: 'g1', first: 'Gus', last: 'Gone', workEmail: 'gus@puredental.com', department: 'Leadership', jobTitle: 'COO', location: 'Manorville', status: 'Terminated' };
  const r = await loadEndpoint('orgconfig', { identity: { email: ada.workEmail }, employees: [...employees, gone], support, accessDocs }).call({ method: 'POST', body: { section: 'approvers', value: { timeoffFinal: 'gus@puredental.com', offboarding: [], offer: '' } } });
  assert.equal(r.status, 400);
});
