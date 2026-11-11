const test = require('node:test'); const assert = require('node:assert');
const { loadEndpoint } = require('./helpers/endpoint');

const ada = { id: 'e1', first: 'Ada', last: 'Admin', workEmail: 'ada@puredental.com', department: 'IT', jobTitle: 'Systems', location: 'Manorville' };
const mia = { id: 'e2', first: 'Mia', last: 'Mgr', workEmail: 'mia@puredental.com', department: 'Front Desk', jobTitle: 'Office Manager', location: 'Manorville' };
const eli = { id: 'e3', first: 'Eli', last: 'Emp', workEmail: 'eli@puredental.com', department: 'Clinical Team', jobTitle: 'Dental Assistant', location: 'Manorville', managerEmail: 'mia@puredental.com' };
const sam = { id: 'e4', first: 'Sam', last: 'Sup', workEmail: 'sam@puredental.com', department: 'Clinical Team', jobTitle: 'Team Lead', location: 'Manorville' };
const oz = { id: 'e5', first: 'Oz', last: 'Other', workEmail: 'oz@puredental.com', department: 'Clinical Team', jobTitle: 'Dental Assistant', location: 'Totowa' };
const employees = [ada, mia, eli, sam, oz];
const support = { users: [{ email: 'ada@puredental.com', admin: true }], managers: [] };
const as = (email, extra = {}) => ({ identity: { email }, employees, support, ...extra });

test('accesscontrol: a manager cannot list permissions', async () => {
  const r = await loadEndpoint('accesscontrol', as(mia.workEmail)).call({ method: 'GET' });
  assert.equal(r.status, 403);
});
test('accesscontrol: an admin saves a grant under the lowercased email', async () => {
  const ep = loadEndpoint('accesscontrol', as(ada.workEmail));
  const r = await ep.call({ method: 'POST', body: { email: 'Eli@PureDental.com', canPrint: true } });
  assert.equal(r.status, 200);
  const up = ep.calls.find(c => c.verb === 'POST' && c.upsert);
  assert.equal(up.body.id, 'eli@puredental.com'); assert.equal(up.body.canPrint, true);
});
test('accesscontrol stores schedLocations as a list', async () => {
  const ep = loadEndpoint('accesscontrol', as(ada.workEmail));
  const r = await ep.call({ method: 'POST', body: { email: 'eli@puredental.com', schedLocations: ['Manorville', 'Islandia'], schedTeams: ['*'] } });
  assert.equal(r.status, 200);
  const up = ep.calls.find(c => c.verb === 'POST' && c.upsert);
  assert.deepEqual(up.body.schedLocations, ['Manorville', 'Islandia']); assert.deepEqual(up.body.schedTeams, ['*']);
});
test('accesscontrol refuses a schedLocations that isn\'t a list', async () => {
  const ep = loadEndpoint('accesscontrol', as(ada.workEmail));
  const r = await ep.call({ method: 'POST', body: { email: 'eli@puredental.com', schedLocations: 'Manorville' } });
  assert.equal(r.status, 400); assert.equal(ep.calls.some(c => c.upsert), false);
});
test('accesscontrol refuses a schedTeams that isn\'t a list, and keeps only real names in lists', async () => {
  const bad = loadEndpoint('accesscontrol', as(ada.workEmail));
  assert.equal((await bad.call({ method: 'POST', body: { email: 'eli@puredental.com', schedTeams: 'Hygiene' } })).status, 400);
  const ep = loadEndpoint('accesscontrol', as(ada.workEmail));
  await ep.call({ method: 'POST', body: { email: 'eli@puredental.com', schedLocations: ['Manorville', '', { x: 1 }, 7] } });
  assert.deepEqual(ep.calls.find(c => c.upsert).body.schedLocations, ['Manorville']);
});
test('ai: a company account with no roster record is refused', async () => {
  const r = await loadEndpoint('ai', as('nobody@puredental.com')).call({ method: 'POST', body: { messages: [{ role: 'user', content: 'hi' }] } });
  assert.equal(r.status, 403);
});
test('giphy: a company account with no roster record is refused', async () => {
  const r = await loadEndpoint('giphy', as('nobody@puredental.com')).call({ method: 'GET', query: { q: 'cat' } });
  assert.equal(r.status, 403);
});
test('resumeupload: an employee who cannot recruit is refused', async () => {
  const r = await loadEndpoint('resumeupload', as(eli.workEmail)).call({ method: 'POST', body: { applicantId: 'a1', filename: 'x.pdf', contentBase64: 'AA==' } });
  assert.equal(r.status, 403);
});
test('notify: a manager cannot message someone at another office', async () => {
  const r = await loadEndpoint('notify', as(mia.workEmail)).call({ method: 'POST', body: { toEmail: oz.workEmail, title: 'hi' } });
  assert.equal(r.status, 403);
});
test('notify: a message to a colleague is pushed live to that person', async () => {
  const r = await loadEndpoint('notify', as(mia.workEmail)).call({ method: 'POST', body: { toEmail: eli.workEmail, title: 'hi' } });
  assert.equal(r.status, 200);
  assert.equal(r.context.bindings.signalRMessages[0].userId, eli.workEmail);
});
test('settings: a person reads only their own settings', async () => {
  const ep = loadEndpoint('settings', as(eli.workEmail));
  const r = await ep.call({ method: 'GET' });
  assert.equal(r.status, 200);
  assert.ok(ep.calls.some(c => c.verb === 'GET' && c.resId.endsWith('/userSettings/docs/e3')));
});
test('reghours: a supervisor cannot save regular hours', async () => {
  const r = await loadEndpoint('reghours', as(sam.workEmail)).call({ method: 'POST', body: { action: 'save', profile: { id: sam.workEmail } } });
  assert.equal(r.status, 403);
});
test('feedback: an employee cannot open the roadmap', async () => {
  const r = await loadEndpoint('feedback', as(eli.workEmail)).call({ method: 'GET' });
  assert.equal(r.status, 403);
});
test('applicants: a manager can list applicants', async () => {
  const r = await loadEndpoint('applicants', as(mia.workEmail)).call({ method: 'GET' });
  assert.equal(r.status, 200);
});
test('applicants: an employee is refused', async () => {
  const r = await loadEndpoint('applicants', as(eli.workEmail)).call({ method: 'GET' });
  assert.equal(r.status, 403);
});
test('negotiate: a person can only open a live connection as themselves', async () => {
  const ep = loadEndpoint('negotiate', as(eli.workEmail));
  const bad = await ep.call({ method: 'GET', query: { userId: mia.workEmail }, bindings: { connectionInfo: { url: 'u' } } });
  assert.equal(bad.status, 403);
  const ok = await ep.call({ method: 'GET', query: { userId: eli.workEmail }, bindings: { connectionInfo: { url: 'u' } } });
  assert.equal(ok.status, 200); assert.deepEqual(ok.body, { url: 'u' });
});

/* ---- Task 3 review follow-ups ---- */
const failWrite = (suffix) => ({ cosmos: async (c) => (c.verb === 'POST' && c.resId.endsWith(suffix) ? { status: 503, body: { m: 'x' } } : undefined) });

test('applicants: a supervisor is refused', async () => {
  const r = await loadEndpoint('applicants', as(sam.workEmail)).call({ method: 'GET' });
  assert.equal(r.status, 403);
});
test('resumeupload: a manager gets past the permission check', async () => {
  const r = await loadEndpoint('resumeupload', as(mia.workEmail)).call({ method: 'POST', body: { applicantId: 'a1', filename: 'x.pdf', contentBase64: 'AA==' } });
  assert.notEqual(r.status, 403);
});
test('feedback: an admin submits a request', async () => {
  const r = await loadEndpoint('feedback', as(ada.workEmail)).call({ method: 'POST', body: { action: 'submit', title: 'Dark mode on the schedule', cat: 'Other' } });
  assert.equal(r.status, 200); assert.equal(r.body.ok, true);
});
test('feedback: a failed database write answers Server error with no database status', async () => {
  const r = await loadEndpoint('feedback', as(ada.workEmail, failWrite('/feedback'))).call({ method: 'POST', body: { action: 'submit', title: 'x', cat: 'Other' } });
  assert.equal(r.status, 500); assert.deepEqual(r.body, { error: 'Server error' });
});
test('applicants: a saved record comes back without the candidate sign token', async () => {
  const r = await loadEndpoint('applicants', as(ada.workEmail)).call({ method: 'POST', body: { id: 'a9', office: 'Manorville', name: 'Cand', offer: { status: 'draft', signToken: 'secret' } } });
  assert.equal(r.status, 200); assert.equal(r.body.ok, true);
  assert.equal(r.body.applicant.offer.signToken, undefined);
});
test('applicants: a failed save answers Server error with no database status', async () => {
  const r = await loadEndpoint('applicants', as(ada.workEmail, failWrite('/applicants'))).call({ method: 'POST', body: { id: 'a9', office: 'Manorville', name: 'Cand' } });
  assert.equal(r.status, 500); assert.deepEqual(r.body, { error: 'Server error' });
});
