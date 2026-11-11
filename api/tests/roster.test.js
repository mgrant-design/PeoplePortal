const test = require('node:test'); const assert = require('node:assert');
const { loadEndpoint } = require('./helpers/endpoint');

const hal = { id: 'h1', first: 'Hal', last: 'HR', workEmail: 'hal@puredental.com', department: 'Human Resources', jobTitle: 'HR Generalist', location: 'Manorville', status: 'Active' };
const mia = { id: 'm1', first: 'Mia', last: 'Mgr', workEmail: 'mia@puredental.com', department: 'Front Desk', jobTitle: 'Office Manager', location: 'Manorville', status: 'Active' };
const eli = { id: 'e1', first: 'Eli', last: 'Emp', workEmail: 'eli@puredental.com', department: 'Clinical Team', jobTitle: 'Dental Assistant', location: 'Manorville', managerEmail: 'mia@puredental.com', status: 'Active', mobile: '555' };
const oz = { id: 'o1', first: 'Oz', last: 'Other', workEmail: 'oz@puredental.com', department: 'Clinical Team', jobTitle: 'Dental Assistant', location: 'Totowa', status: 'Active' };
const tia = { id: 't1', first: 'Tia', last: 'Gone', workEmail: 'tia@puredental.com', department: 'Clinical Team', jobTitle: 'Dental Assistant', location: 'Manorville', managerEmail: 'mia@puredental.com', status: 'Terminated' };
const employees = [hal, mia, eli, oz, tia];
const support = { users: [{ email: 'hal@puredental.com', canPrint: true }, { email: 'mia@puredental.com' }, { email: 'eli@puredental.com' }], managers: [], offboarding: [{ id: 'off1', first: 'Old', last: 'Hire' }] };
const as = (email) => loadEndpoint('roster', { identity: { email }, employees, support });
const update = (ep, id, patch, extra = {}) => ep.call({ method: 'POST', body: { action: 'update', id, patch, ...extra } });
const wrote = (ep) => ep.calls.some(c => c.verb === 'POST' && c.resId.endsWith('/roster'));

test('a manager cannot edit their own record', async () => {
  const ep = as(mia.workEmail);
  const r = await update(ep, 'm1', { mobile: '1' });
  assert.equal(r.status, 403); assert.equal(wrote(ep), false);
});
test('a manager cannot edit someone outside their team', async () => {
  const ep = as(mia.workEmail);
  const r = await update(ep, 'o1', { mobile: '1' });
  assert.equal(r.status, 403); assert.equal(wrote(ep), false);
});
test("a manager cannot change a team member's job title", async () => {
  const ep = as(mia.workEmail);
  const r = await update(ep, 'e1', { jobTitle: 'HR Director' });
  assert.equal(r.status, 403); assert.equal(wrote(ep), false);
});
test("a manager can change a team member's mobile number", async () => {
  const ep = as(mia.workEmail);
  const r = await update(ep, 'e1', { mobile: '631-555-0100' });
  assert.equal(r.status, 200); assert.equal(wrote(ep), true);
});
test("HR can change anyone's job title", async () => {
  const ep = as(hal.workEmail);
  const r = await update(ep, 'o1', { jobTitle: 'Lead Assistant' });
  assert.equal(r.status, 200);
});
test('reactivating a terminated employee needs permission and a signature', async () => {
  const noPerm = await update(as(mia.workEmail), 't1', { status: 'Active' });
  assert.equal(noPerm.status, 403);
  const noSig = await update(as(hal.workEmail), 't1', { status: 'Active' });
  assert.equal(noSig.status, 400); assert.equal(noSig.body.needsSignature, true);
  const ok = await update(as(hal.workEmail), 't1', { status: 'Active' }, { signature: 'Hal HR' });
  assert.equal(ok.status, 200);
});
test('a plain employee receives only their own permission entry', async () => {
  const r = await as(eli.workEmail).call({ method: 'GET' });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.users.map(u => u.email), ['eli@puredental.com']);
});
test('a plain employee receives no offboarding records', async () => {
  const r = await as(eli.workEmail).call({ method: 'GET' });
  assert.deepEqual(r.body.offboarding, []);
});
test('HR receives every permission entry and the offboarding records', async () => {
  const r = await as(hal.workEmail).call({ method: 'GET' });
  assert.equal(r.body.users.length, 3); assert.equal(r.body.offboarding.length, 1);
});

/* ---- Task 4 review follow-ups ---- */
const sue = { id: 's2', first: 'Sue', last: 'Spend', workEmail: 'sue@puredental.com', department: 'Front Desk', jobTitle: 'Coordinator', location: 'Manorville', status: 'Active' };
const sam = { id: 'u1', first: 'Sam', last: 'Sup', workEmail: 'sam@puredental.com', department: 'Clinical Team', jobTitle: 'Team Lead', location: 'Manorville', status: 'Active' };
const all2 = [...employees, sue, sam];
const with2 = (email, users = support.users) => loadEndpoint('roster', { identity: { email }, employees: all2, support: { ...support, users } });

test('a manager with See Everyone still edits only their own team', async () => {
  const ep = with2(mia.workEmail, [...support.users, { email: 'mia@puredental.com', seeAll: true }]);
  const r = await update(ep, 'o1', { mobile: '1' });
  assert.equal(r.status, 403); assert.equal(wrote(ep), false);
});
test('the suspend permission alone cannot move someone out of Terminated', async () => {
  const tib = { id: 't2', first: 'Tib', last: 'Gone', workEmail: 'tib@puredental.com', department: 'Front Desk', jobTitle: 'Coordinator', location: 'Manorville', managerEmail: 'sue@puredental.com', status: 'Terminated' };
  const ep = loadEndpoint('roster', { identity: { email: sue.workEmail }, employees: [...all2, tib], support: { ...support, users: [...support.users, { email: 'sue@puredental.com', canSuspend: true }] } });
  const r = await update(ep, 't2', { status: 'Suspended' }, { signature: 'Sue Spend' });
  assert.equal(r.status, 403); assert.equal(wrote(ep), false);
});
test("a manager cannot change a team member's department, manager or work email", async () => {
  for (const patch of [{ department: 'Human Resources' }, { managerEmail: 'hal@puredental.com' }, { workEmail: 'new.eli@puredental.com' }]) {
    const ep = as(mia.workEmail);
    const r = await update(ep, 'e1', patch);
    assert.equal(r.status, 403, JSON.stringify(patch)); assert.equal(wrote(ep), false);
  }
});
test("a supervisor's update is refused", async () => {
  const ep = with2(sam.workEmail);
  const r = await update(ep, 'e1', { mobile: '1' });
  assert.equal(r.status, 403); assert.equal(wrote(ep), false);
});
test('a reactivation without permission writes nothing', async () => {
  const ep = as(mia.workEmail);
  await update(ep, 't1', { status: 'Active' });
  assert.equal(wrote(ep), false);
});
test('a manager cannot create a record that would carry HR access', async () => {
  const ep = as(mia.workEmail);
  const r = await ep.call({ method: 'POST', body: { action: 'create', employee: { first: 'New', last: 'Person', workEmail: 'new.person@puredental.com', location: 'Manorville', department: 'Human Resources' } } });
  assert.equal(r.status, 403); assert.equal(wrote(ep), false);
});
test('a record cannot be created as Terminated without permission and a signature', async () => {
  const ep = as(mia.workEmail);
  const r = await ep.call({ method: 'POST', body: { action: 'create', employee: { first: 'New', last: 'Person', workEmail: 'new.person@puredental.com', location: 'Manorville', status: 'Terminated' } } });
  assert.equal(r.status, 403); assert.equal(wrote(ep), false);
});
test('creating a record mints an 8-character id in the shared partition and announces it', async () => {
  const ep = as(mia.workEmail);
  const r = await ep.call({ method: 'POST', body: { action: 'create', employee: { first: 'New', last: 'Person', workEmail: 'new.person@puredental.com', location: 'Manorville', department: 'Front Desk' } } });
  assert.equal(r.status, 200);
  const w = ep.calls.find(c => c.verb === 'POST' && c.resId.endsWith('/roster'));
  assert.match(w.body.id, /^[0-9a-f]{8}$/); assert.deepEqual(w.partitionKey, {}); assert.equal(w.upsert, false);
  assert.equal(r.context.bindings.signalRMessages[0].target, 'roster-changed');
});
test('terminating someone writes an audit record', async () => {
  const ep = as(hal.workEmail);
  const r = await update(ep, 'e1', { status: 'Terminated' }, { signature: 'Hal HR', reason: 'test' });
  assert.equal(r.status, 200);
  const a = ep.calls.find(c => c.verb === 'POST' && c.resId.endsWith('/audit'));
  assert.equal(a.body.to, 'Terminated'); assert.equal(a.body.byEmail, 'hal@puredental.com');
});
test('a scoped caller still gets the company-wide directory', async () => {
  const r = await as(eli.workEmail).call({ method: 'GET' });
  assert.ok(Array.isArray(r.body.directory) && r.body.directory.length >= 4);
});
test('the roster sends the saved switches', async () => {
  const r = await loadEndpoint('roster', { identity: { email: eli.workEmail }, employees, support: { ...support, flags: { library: false } } }).call({ method: 'GET' });
  assert.equal(r.status, 200); assert.deepEqual(r.body.flags, { library: false });
});
test('a manager receives only their own team\'s offboarding records', async () => {
  const recs = [{ id: 'r1', empId: 'e1', first: 'Eli' }, { id: 'r2', empId: 'o1', first: 'Oz', manager: 'Mia Mgr' }];
  const r = await loadEndpoint('roster', { identity: { email: mia.workEmail }, employees, support: { ...support, offboarding: recs } }).call({ method: 'GET' });
  assert.deepEqual(r.body.offboarding.map(x => x.id), ['r1']);
});
test('a manager with See Everyone for Offboarding receives every offboarding record', async () => {
  const recs = [{ id: 'r1', empId: 'e1' }, { id: 'r2', empId: 'o1' }];
  const users = [...support.users.filter(u => u.email !== 'mia@puredental.com'), { email: 'mia@puredental.com', seeAll: true, seeAllPages: ['offboarding'] }];
  const r = await loadEndpoint('roster', { identity: { email: mia.workEmail }, employees, support: { ...support, users, offboarding: recs } }).call({ method: 'GET' });
  assert.deepEqual(r.body.offboarding.map(x => x.id), ['r1', 'r2']);
});

/* ---- personal details for managers: the birthday without the year ---- */
const withBirthdays = employees.map(e => ({ ...e, birthdate: { e1: '1990-03-14', t1: '3/4/1988', m1: '1985-07-02', o1: '1979-12-25', h1: '1980-01-09' }[e.id], personalEmail: e.first.toLowerCase() + '@home.example' }));
const asB = (email) => loadEndpoint('roster', { identity: { email }, employees: withBirthdays, support });
test("a manager's roster response carries their team's birthdays with no year", async () => {
  const r = await asB(mia.workEmail).call({ method: 'GET' });
  const by = Object.fromEntries(r.body.employees.map(e => [e.id, e]));
  assert.equal(by.e1.birthdate, '03-14'); assert.equal(by.t1.birthdate, '03-04');
  assert.equal(by.e1.personalEmail, 'eli@home.example'); assert.equal(by.e1.mobile, '555');
  assert.doesNotMatch(JSON.stringify(r.body), /1990|1988/);
});
test("a manager's own record keeps their full birth date", async () => {
  const r = await asB(mia.workEmail).call({ method: 'GET' });
  assert.equal(r.body.employees.find(e => e.id === 'm1').birthdate, '1985-07-02');
});
test("HR's roster response carries the birth year", async () => {
  const r = await asB(hal.workEmail).call({ method: 'GET' });
  assert.equal(r.body.employees.find(e => e.id === 'e1').birthdate, '1990-03-14');
});
test("a manager's saved edit comes back with no birth year", async () => {
  const ep = loadEndpoint('roster', { identity: { email: mia.workEmail }, employees: withBirthdays, support,
    cosmos: async (c) => (c.verb === 'POST' && c.resId.endsWith('/roster')) ? { status: 200, body: { ...c.body } } : undefined });
  const r = await update(ep, 'e1', { mobile: '631-555-0100' });
  assert.equal(r.status, 200); assert.equal(r.body.employee.birthdate, '03-14');
});

/* ---- See Everyone for other pages widens the people, not their personal details ---- */
const seeAllFor = (pages) => loadEndpoint('roster', { identity: { email: mia.workEmail }, employees: withBirthdays.map(e => e.id === 'o1' ? { ...e, mobile: '999', address: '1 Main St', emergencyName: 'Kin', emergencyPhone: '111' } : e),
  support: { ...support, users: [...support.users.filter(u => u.email !== 'mia@puredental.com'), { email: 'mia@puredental.com', seeAll: true, seeAllPages: pages }] } });
test('See Everyone for another page sends the people outside the team without their personal details', async () => {
  const r = await seeAllFor(['schedule']).call({ method: 'GET' });
  const oz = r.body.employees.find(e => e.id === 'o1');
  assert.ok(oz, 'the person outside the team is still sent, for the schedule page');
  for (const k of ['mobile', 'personalEmail', 'birthdate', 'address', 'emergencyName', 'emergencyPhone']) assert.equal(oz[k], undefined, k);
  const eli = r.body.employees.find(e => e.id === 'e1');
  assert.equal(eli.personalEmail, 'eli@home.example'); assert.equal(eli.birthdate, '03-14');   // the team keeps theirs
});
test('See Everyone for employee records sends personal details for everyone, without the year', async () => {
  const r = await seeAllFor(['emprecord']).call({ method: 'GET' });
  const oz = r.body.employees.find(e => e.id === 'o1');
  assert.equal(oz.mobile, '999'); assert.equal(oz.birthdate, '12-25');
});
test("a manager's created record comes back with no birth year", async () => {
  const asMia = loadEndpoint('roster', { identity: { email: mia.workEmail }, employees: withBirthdays, support,
    cosmos: async (c) => (c.verb === 'POST' && c.resId.endsWith('/roster')) ? { status: 200, body: { ...c.body, birthdate: '1999-05-06' } } : undefined });
  const r = await asMia.call({ method: 'POST', body: { action: 'create', employee: { first: 'Ned', last: 'New', workEmail: 'ned.new@puredental.com', location: 'Manorville', managerEmail: 'mia@puredental.com' } } });
  assert.equal(r.status, 200, JSON.stringify(r.body)); assert.equal(r.body.employee.birthdate, '05-06');
});
