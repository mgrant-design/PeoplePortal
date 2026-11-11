const test = require('node:test'); const assert = require('node:assert');
const { loadEndpoint } = require('./helpers/endpoint');

const sam = { id: 'u1', first: 'Sam', last: 'Sup', workEmail: 'sam@puredental.com', department: 'Clinical Team', jobTitle: 'Team Lead', location: 'Manorville', status: 'Active' };
const eli = { id: 'e1', first: 'Eli', last: 'Emp', workEmail: 'eli@puredental.com', department: 'Clinical Team', jobTitle: 'Dental Assistant', location: 'Manorville', status: 'Active' };
const employees = [sam, eli];
const weeks = [
  { id: '2026-11-02__Manorville', office: 'Manorville', weekKey: '2026-11-02', published: true, shifts: [{ id: 's1', empId: 'e1', date: '2026-11-03', start: '08:00', end: '16:00' }] },
  { id: '2026-11-09__Manorville', office: 'Manorville', weekKey: '2026-11-09', published: false, shifts: [] },
];
const lists = async (c) => (c.verb === 'GET' && c.resId.endsWith('/schedules') ? { status: 200, body: { Documents: weeks } } : undefined);
const as = (email, extra = {}) => loadEndpoint('schedule', { identity: { email }, employees, support: { users: [], managers: [] }, cosmos: lists, ...extra });

test('a supervisor at one office cannot publish another office', async () => {
  const r = await as(sam.workEmail).call({ method: 'POST', body: { action: 'publish', office: 'Totowa', weekKey: '2026-11-02' } });
  assert.equal(r.status, 403); assert.equal(r.body.error, 'No edit access to Totowa');
});
test('a Cosmos failure while reading the roster returns JSON', async () => {
  const r = await as(eli.workEmail, { cosmos: async (c) => (c.resId.endsWith('/roster') ? { status: 500, body: {} } : undefined) }).call({ method: 'GET', query: { office: 'Manorville' } });
  assert.equal(r.status, 500); assert.deepEqual(r.body, { error: 'Server error' });
});
test('an employee reads only published weeks', async () => {
  const r = await as(eli.workEmail).call({ method: 'GET', query: { office: 'Manorville' } });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.schedules.map(d => d.weekKey), ['2026-11-02']);
});
test('a supervisor reads drafts at their own office', async () => {
  const r = await as(sam.workEmail).call({ method: 'GET', query: { office: 'Manorville' } });
  assert.equal(r.body.schedules.length, 2);
});
test('publishing texts each scheduled person through the shared text file', async () => {
  Object.assign(process.env, { TWILIO_ACCOUNT_SID: 'ACtest', TWILIO_AUTH_TOKEN: 'tok', TWILIO_FROM: '+15550000000' });
  try {
    const week = weeks[0];
    const ep = loadEndpoint('schedule', { identity: { email: sam.workEmail }, employees: [sam, { ...eli, mobile: '631-555-0199' }], support: { users: [], managers: [] },
      cosmos: async (c) => {
        if (c.verb === 'GET' && c.resId.endsWith('/schedules')) return { status: 200, body: { Documents: weeks } };
        if (c.verb === 'GET' && c.resId.includes('/schedules/docs/')) return { status: 200, body: week };
        return undefined;
      } });
    const r = await ep.call({ method: 'POST', body: { action: 'publish', office: 'Manorville', weekKey: '2026-11-02' } });
    assert.equal(r.status, 200);
    const sent = ep.net.filter(c => c.hostname === 'api.twilio.com').map(c => new URLSearchParams(c.body).get('To'));
    assert.deepEqual(sent, ['+16315550199']);
  } finally { for (const k of ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_FROM']) delete process.env[k]; }
});

/* ---- who schedules which office and team comes from the profile's Schedules setting ---- */
const R = require('../../access-rules.js');
const mia = { id: 'm1', first: 'Mia', last: 'Mgr', workEmail: 'mia@puredental.com', department: 'Front Desk', jobTitle: 'Office Manager', location: 'Manorville', status: 'Active' };
const hal = { id: 'h1', first: 'Hal', last: 'HR', workEmail: 'hal@puredental.com', department: 'Human Resources', jobTitle: 'HR Generalist', location: 'Manorville', status: 'Active' };
const ada = { id: 'a1', first: 'Ada', last: 'Admin', workEmail: 'ada@puredental.com', department: 'IT', jobTitle: 'Systems', location: 'Manorville', status: 'Active' };
const hy = { id: 'y1', first: 'Hy', last: 'Gienist', workEmail: 'hy@puredental.com', department: 'Hygiene', jobTitle: 'Hygienist', location: 'Manorville', status: 'Active' };
const roster = [mia, hal, ada, hy, eli];
const offices = ['Manorville', 'Islandia', 'Totowa'].map(name => ({ name }));
const shiftFor = (empId) => ({ id: 'n1-' + empId, empId, date: '2026-11-17', start: '08:00', end: '16:00' });
const sched = (email, settings = {}, extra = {}) => loadEndpoint('schedule', { identity: { email }, employees: roster,
  support: { users: [{ email: ada.workEmail, admin: true }], managers: [], offices }, accessDocs: settings.doc ? [{ id: email, email, ...settings.doc }] : [], cosmos: lists, ...extra });
const post = (ep, body) => ep.call({ method: 'POST', body: { weekKey: '2026-11-16', ...body } });
const saveWeek = (ep, office, shifts = []) => post(ep, { action: 'save', office, changes: { add: shifts, update: [], remove: [] } });

test('a manager with no setting schedules their own office only', async () => {
  const ep = sched(mia.workEmail);
  assert.equal((await saveWeek(ep, 'Manorville')).status, 200);
  assert.equal((await saveWeek(ep, 'Islandia')).status, 403);
});
test('a manager with two locations publishes both, and a third is refused', async () => {
  const ep = sched(mia.workEmail, { doc: { schedLocations: ['Manorville', 'Islandia'] } });
  assert.equal((await saveWeek(ep, 'Manorville')).status, 200);
  assert.equal((await saveWeek(ep, 'Islandia')).status, 200);
  const third = await saveWeek(ep, 'Totowa');
  assert.equal(third.status, 403); assert.equal(third.body.error, 'No edit access to Totowa');
});
test('all locations lets a manager schedule every office', async () => {
  const ep = sched(mia.workEmail, { doc: { schedLocations: ['*'] } });
  for (const o of ['Manorville', 'Islandia', 'Totowa']) assert.equal((await saveWeek(ep, o)).status, 200, o);
});
test('HR and leadership read every office but edit only where their setting says', async () => {
  const none = sched(hal.workEmail);
  assert.equal((await saveWeek(none, 'Manorville')).status, 403);
  const some = sched(hal.workEmail, { doc: { schedLocations: ['Islandia'] } });
  assert.equal((await saveWeek(some, 'Islandia')).status, 200); assert.equal((await saveWeek(some, 'Manorville')).status, 403);
});
test('an admin schedules every office', async () => {
  const ep = sched(ada.workEmail);
  assert.equal((await saveWeek(ep, 'Totowa')).status, 200);
});
test('a team limit blocks a shift for another department', async () => {
  const ep = sched(mia.workEmail, { doc: { schedTeams: ['Hygiene'] } });
  const refused = await saveWeek(ep, 'Manorville', [shiftFor('e1')]);
  assert.equal(refused.status, 403); assert.equal(refused.body.error, 'You can’t schedule Eli Emp: Clinical Team is not one of your teams');
  assert.equal((await saveWeek(ep, 'Manorville', [shiftFor('y1')])).status, 200);
});
test('all teams, or no team setting, has no team limit', async () => {
  for (const doc of [{ schedTeams: ['*'] }, {}]) assert.equal((await saveWeek(sched(mia.workEmail, { doc }), 'Manorville', [shiftFor('e1')])).status, 200);
});
test('the old per-office grants are gone', async () => {
  const ep = sched(ada.workEmail);
  assert.equal((await post(ep, { action: 'access_set', office: 'Manorville', email: 'x@puredental.com', level: 'edit' })).status, 400);
  const r = await ep.call({ method: 'GET', query: { access: 1 } });
  assert.equal(r.body.access, undefined);
  assert.equal(ep.calls.some(c => /schedAccess/.test(c.resId)), false);
});
test('the Builder offers exactly the offices publishing would accept', () => {
  const all = ['Manorville', 'Islandia', 'Totowa'];
  const edits = (who, perms) => all.filter(o => R.scheduleLevel({ me: who, perms, ...R.deriveAccessCore({ me: who, perms, hasReports: false, isListedManager: false }), office: o }) === 'edit');
  assert.deepEqual(edits(mia, {}), ['Manorville']);
  assert.deepEqual(edits(mia, { schedLocations: ['Islandia', 'Totowa'] }), ['Islandia', 'Totowa']);
  assert.deepEqual(edits(hal, {}), []);
  assert.deepEqual(edits(ada, { admin: true }), all);
});

/* ---- findings from the review of the access rule ---- */
const weekWith = (shifts) => ({ id: '2026-11-16__Manorville', office: 'Manorville', weekKey: '2026-11-16', published: false, shifts });
const withWeek = (shifts) => async (c) => {
  if (c.verb === 'GET' && /\/schedules\/docs\//.test(c.resId)) return { status: 200, body: weekWith(shifts) };
  return lists(c);
};
test('a team-limited manager can save a week that already holds other teams\' shifts, changing only their own', async () => {
  const there = shiftFor('e1');   // Eli, Clinical Team, put there by someone else
  const ep = () => sched(mia.workEmail, { doc: { schedTeams: ['Hygiene'] } }, { cosmos: withWeek([there]) });
  const ok = await saveWeek(ep(), 'Manorville', [shiftFor('y1')]);
  assert.equal(ok.status, 200);
  const moved = await post(ep(), { action: 'save', office: 'Manorville', changes: { add: [], update: [{ shift: { ...there, empId: 'm1' }, was: there }], remove: [] } });
  assert.equal(moved.status, 403);   // handing that shift to Front Desk is a change the limit refuses
});
test('the offices a Builder offers come from the whole company\'s offices, not the manager\'s own team', () => {
  const who = { me: mia, perms: { schedLocations: ['Islandia'] }, ...R.deriveAccessCore({ me: mia, perms: { schedLocations: ['Islandia'] }, hasReports: true, isListedManager: false }) };
  assert.deepEqual(R.editableOfficeNames(who, ['Manorville', 'Islandia', 'Totowa']), ['Islandia']);
  assert.deepEqual(R.editableOfficeNames({ ...who, perms: {}, ...R.deriveAccessCore({ me: mia, perms: {}, hasReports: true, isListedManager: false }) }, ['Manorville', 'Islandia']), ['Manorville']);
});

/* ---- publishing adds changes to the stored week ---- */
const stored = (shifts) => ({ id: '2026-11-16__Manorville', office: 'Manorville', weekKey: '2026-11-16', published: true, shifts, _etag: '"v1"' });
const base = shiftFor('y1');
test('a save adds the manager\'s changes to the week as it is now, keeping an offer made meanwhile', async () => {
  const offered = { ...base, offered: true, offeredBy: 'y1' };
  const ep = sched(mia.workEmail, {}, { cosmos: withWeek([offered]) });
  const r = await saveWeek(ep, 'Manorville', [shiftFor('e1')]);
  assert.equal(r.status, 200);
  const put = ep.calls.find(c => c.verb === 'POST' && /\/schedules$/.test(c.resId));
  assert.deepEqual(put.body.shifts.map(s => s.id), [base.id, shiftFor('e1').id]);
  assert.equal(put.body.shifts[0].offered, true);
});
test('a save of a shift someone changed meanwhile answers 409 and writes nothing', async () => {
  const ep = sched(mia.workEmail, {}, { cosmos: withWeek([{ ...base, offered: true, offeredBy: 'y1' }]) });
  const r = await post(ep, { action: 'save', office: 'Manorville', changes: { add: [], update: [{ shift: { ...base, end: '17:00' }, was: base }], remove: [] } });
  assert.equal(r.status, 409); assert.equal(r.body.conflict, true);
  assert.equal(ep.calls.some(c => c.verb === 'POST' && /\/schedules$/.test(c.resId)), false);
});
test('a save that meets a newer version of the week answers 409', async () => {
  const ep = sched(mia.workEmail, {}, { cosmos: async (c) => (c.verb === 'POST' && /\/schedules$/.test(c.resId) ? { status: 412, body: {} } : withWeek([base])(c)) });
  const r = await saveWeek(ep, 'Manorville', [shiftFor('e1')]);
  assert.equal(r.status, 409); assert.equal(r.body.conflict, true);
});
test('the version of the week that was read is sent with the write', async () => {
  const ep = sched(mia.workEmail, {}, { cosmos: async (c) => (/\/schedules\/docs\//.test(c.resId) && c.verb === 'GET' ? { status: 200, body: stored([base]) } : lists(c)) });
  await saveWeek(ep, 'Manorville', [shiftFor('e1')]);
  assert.equal(ep.calls.find(c => c.verb === 'POST' && /\/schedules$/.test(c.resId)).ifMatch, '"v1"');
});
test('a whole-week list is no longer accepted by save', async () => {
  const r = await post(sched(mia.workEmail), { action: 'save', office: 'Manorville', shifts: [shiftFor('e1')] });
  assert.equal(r.status, 400);
});

test('a team limit also covers changing or removing another team\'s shift in a save', async () => {
  const there = shiftFor('e1');
  const mk = () => sched(mia.workEmail, { doc: { schedTeams: ['Hygiene'] } }, { cosmos: withWeek([there]) });
  const retime = await post(mk(), { action: 'save', office: 'Manorville', changes: { add: [], update: [{ shift: { ...there, end: '17:00' }, was: there }], remove: [] } });
  assert.equal(retime.status, 403);
  const remove = await post(mk(), { action: 'save', office: 'Manorville', changes: { add: [], update: [], remove: [{ id: there.id, was: there }] } });
  assert.equal(remove.status, 403);
});
test('a save with an enormous list of changes is refused', async () => {
  const many = Array.from({ length: 2001 }, (_, i) => ({ ...shiftFor('y1'), id: 'x' + i }));
  assert.equal((await saveWeek(sched(mia.workEmail), 'Manorville', many)).status, 400);
});

test('refusals on the Schedule tab do not show a success check', () => {
  const src = require('fs').readFileSync(require('path').join(__dirname, '..', '..', 'scheduleread.jsx'), 'utf8');
  assert.match(src, /flash\(e\.message, false\)/);
  assert.doesNotMatch(src, /catch \(e\) \{ flash\(e\.message\); \}/);
  assert.match(src, /toast\.ok \? 'check' : 'x'/);
});
/* the Builder's publish, repeats, clash message and messages are run in builder-logic.test.js */

test('the schedule endpoint uses the caller\'s access as the shared caller check worked it out', () => {
  const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'schedule', 'index.js'), 'utf8');
  assert.doesNotMatch(src, /deriveAccessCore/);
  const body = src.slice(src.indexOf("module.exports = handler("));
  assert.doesNotMatch(body, /^    \/\* ================= READ/m, 'the handler body is indented like the rest of the file');
});
test('data.jsx no longer carries a note about where scheduling went', () => {
  const src = require('fs').readFileSync(require('path').join(__dirname, '..', '..', 'data.jsx'), 'utf8');
  assert.doesNotMatch(src, /Scheduling moved to sched-core/);
});
