const test = require('node:test'); const assert = require('node:assert');
const fs = require('fs'); const path = require('path'); const vm = require('vm');
const root = path.join(__dirname, '..', '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

test('the page loads the request helper before the first screen that calls the server', () => {
  const html = read('index.html');
  const r = html.indexOf('<script src="request.js"></script>'), d = html.indexOf('src="data.jsx"');
  assert.ok(r > 0 && r < d);
});
test('an expired sign-in sends the person back to sign-in with a message', () => {
  assert.match(read('app.jsx'), /window\.PD_ON_SIGNED_OUT = \(message\) => \{ logout\(\); setRosterError\(message\); \}/);
});

test('a 401 at sign-in keeps the expired-sign-in message instead of replacing it', () => {
  assert.match(read('app.jsx'), /setRosterError\(e\.status === 401 \? 'Your sign-in expired\. Sign in again\.' :/);
});
test('a module switch is built from the saved switches, and a roster refresh updates them', () => {
  const app = read('app.jsx');
  assert.match(app, /const n = \{ \.\.\.savedFlags\(\), \[id\]: val \};/);
  assert.match(app, /loadRoster\(\)\.then\(\(\) => \{ setFlags\(savedFlags\(\)\); setRosterVersion/);
});
/* runs orgconfig.jsx with a stand-in pdApi; answer(path, opts) returns data or throws */
function orgScreen(answer) {
  const calls = [];
  const window = { HR: { offices: [{ name: 'Manorville' }] } };
  const ctx = { window, Error, Object, useState() {}, useCallback() {}, useEffect() {}, setTimeout,
    pdApi: async (p, o) => { calls.push({ p, o }); return answer(p, o); } };
  vm.runInNewContext(read('orgconfig.jsx'), ctx);
  return { window, calls, save: ctx.saveOrgSection || window.saveOrgSection };
}
test('settings saves send the section as the screen last saw it, and roll back on a conflict', async () => {
  const s = orgScreen(() => { const e = new Error('Someone else saved first'); e.status = 409; throw e; });
  await assert.rejects(s.save('offices', [{ name: 'Totowa' }]), /conflict/);
  assert.deepEqual(s.calls[0].o.body.previous, [{ name: 'Manorville' }]);
  assert.deepEqual(s.window.HR.offices, [{ name: 'Manorville' }]);
});
test('a settings save that fails for another reason passes on the server\'s message', async () => {
  const s = orgScreen(() => { const e = new Error('Domain not allowed'); e.status = 403; throw e; });
  await assert.rejects(s.save('offices', [{ name: 'Totowa' }]), /Domain not allowed/);
});
test('after a failed settings save, the next save is compared with what was really stored', async () => {
  let n = 0;
  const s = orgScreen(() => { if (n++ === 0) { const e = new Error('Server error'); e.status = 500; throw e; } return { ok: true }; });
  await assert.rejects(s.save('offices', [{ name: 'Totowa' }]), /Server error/);
  assert.deepEqual(s.window.HR.offices, [{ name: 'Manorville' }]);
  await s.save('offices', [{ name: 'Islandia' }]);
  assert.deepEqual(s.calls[1].o.body.previous, [{ name: 'Manorville' }]);
});
test('the week-start dialog explains a conflict in plain words', () => {
  assert.match(read('scheduler.jsx'), /Someone else just changed this\. Reload and try again\./);
});
test('the hours toast waits for the server to confirm the hours were sent', () => {
  const a = read('applicants.jsx');
  assert.match(a, /const sendWIHours = async[\s\S]{0,600}await pdApi\('\/api\/applicants'[\s\S]{0,400}sent to Accounting/);
  assert.equal(/onWI\(a\.id, \{ status: 'sent'/.test(a), false);
});
test('the Builder lists only offices the person may edit, and the Builder tab needs one', () => {
  assert.match(read('scheduler.jsx'), /const OFFICES = useMemo\(\(\) => editableOffices\(me, access\), \[me\.id, access\]\);/);
  assert.match(read('scheduleread.jsx'), /editableOffices\(me, access\)\.length > 0/);
  assert.equal(/fetchSchedAccess/.test(read('sched-core.jsx')), false);
});

/* ---- one schedule grid: the Schedule tab and the Builder share schedgrid.jsx ---- */
const topLevelNames = (file) => [...read(file).matchAll(/^(?:function\s+(\w+)|const\s+(\w+)\s*=)/gm)].map(m => m[1] || m[2]);
test('no schedule function or constant is defined in more than one of the three schedule files', () => {
  const files = ['scheduler.jsx', 'scheduleread.jsx', 'schedgrid.jsx'];
  const seen = {};
  files.forEach(f => topLevelNames(f).forEach(n => { (seen[n] = seen[n] || []).push(f); }));
  assert.deepEqual(Object.entries(seen).filter(([, where]) => where.length > 1), []);
});
test('every function the two old schedule files defined still exists, or was deleted on purpose', () => {
  const was = ['useSchedFit', 'schedOffices', 'editableOffices', 'officeRoster', 'deptHue', 'SchedShift', 'Scheduler', 'WeekStartModal', 'PublishAsk', 'Dropdown', 'SchedPortal', 'ShiftModal', 'ApprovalsPanel', 'NameModal', 'LoadTplModal',
    'RouseSchedFit', 'schedAll', 'RoschedOffices', 'RoofficeRoster', 'RodeptHue', 'RoSchedShift', 'ScheduleRead', 'ClaimConfirm', 'TimeOffDialog', 'SchedulePage'];
  const deletedOnPurpose = ['RouseSchedFit', 'RoschedOffices', 'RoofficeRoster', 'RodeptHue', 'RoSchedShift',   // replaced by the shared ones
    'ApprovalsPanel'];   // offers, claims and supervisors' changes are decided in the bell now
  const now = new Set(['scheduler.jsx', 'scheduleread.jsx', 'schedgrid.jsx'].flatMap(topLevelNames));
  assert.deepEqual(was.filter(n => !now.has(n) && !deletedOnPurpose.includes(n)), []);
  assert.deepEqual(deletedOnPurpose.filter(n => now.has(n)), []);
});
test('the page loads schedgrid.jsx before the screens that use it', () => {
  const html = read('index.html');
  assert.ok(html.indexOf("'schedgrid.jsx'") > 0 && html.indexOf("'schedgrid.jsx'") < html.indexOf("'scheduler.jsx'"));
});
test('the Builder works from the company directory, so a granted office and its people appear', () => {
  const g = read('schedgrid.jsx');
  assert.equal(/schedMine/.test(g) || /schedMine/.test(read('scheduler.jsx')), false);
  assert.match(g, /schedOffices\(schedAll\(\)\)/);
  assert.equal((read('scheduler.jsx').match(/editableOffices/g) || []).length >= 1 && /Object\.assign\(window, \{ Scheduler, editableOffices \}\)/.test(read('scheduler.jsx')), false);
});
test('when the offices a person may edit change, the Builder\'s view follows', () => {
  assert.match(read('scheduler.jsx'), /officesSeen\.current !== OFFICES\.join\('\|'\)\) \{ officesSeen\.current = OFFICES\.join\('\|'\); setOffices\(OFFICES\); \}/);
});
test('the Builder sends what changed, and puts its draft back over a newer week', () => {
  const s = read('scheduler.jsx');
  assert.match(s, /const changes = PD_WEEK\.diffWeek\(doc\._base \|\| \[\], doc\.shifts \|\| \[\]\);[\s\S]{0,200}action: 'save', office, weekKey, changes/);
  assert.match(s, /PD_WEEK\.applyChanges\(server\.shifts, PD_WEEK\.diffWeek\(draft\._base \|\| \[\], draft\.shifts\)\)/);
  assert.equal(/action: 'save', office, weekKey, shifts:/.test(s), false);
});
test('the page loads the week-merge file before the drafts store and the Builder', () => {
  const html = read('index.html');
  assert.ok(html.indexOf("'weekmerge.js'") > 0 && html.indexOf("'weekmerge.js'") < html.indexOf("'scheddrafts.js'"));
});

/* ---- approved time off on the schedule (Task 21; the data and both tabs came with the time-off task) ---- */
function schedCore(approvals) {
  const window = {};
  const ctx = { window, Object, Array, Date, Math, String, Number, JSON, localStorage: { getItem: () => null, setItem() {} },
    pdApi: async () => ({ timeOff: approvals }), findByEmail: (e) => (e === 'eli@puredental.com' ? { id: 'e1' } : null) };
  vm.runInNewContext(read('sched-core.jsx'), ctx);
  return { ...window, ...ctx };
}
test('a shift on an approved time-off day carries a warning', () => {
  const s = schedCore([]);
  const c = window_shiftConflicts(s);
  assert.ok(c.timeOff); assert.equal(c.shifts.length, 0);
});
function window_shiftConflicts(s) {
  return s.shiftConflicts({ shifts: [], timeOff: [{ empId: 'e1', dates: ['2026-12-01', '2026-12-02', '2026-12-03'] }], empId: 'e1', date: '2026-12-02', start: '08:00', end: '16:00' });
}
test('another day, or another person, carries no time-off warning', () => {
  const s = schedCore([]);
  const t = [{ empId: 'e1', dates: ['2026-12-01'] }];
  assert.equal(s.shiftConflicts({ shifts: [], timeOff: t, empId: 'e1', date: '2026-12-04', start: '08:00', end: '16:00' }).timeOff, null);
  assert.equal(s.shiftConflicts({ shifts: [], timeOff: t, empId: 'e2', date: '2026-12-01', start: '08:00', end: '16:00' }).timeOff, null);
});
test('three approved days read as three striped days on the person\'s row', async () => {
  const s = schedCore([{ email: 'eli@puredental.com', start: '2026-12-01', end: '2026-12-03' }]);
  const list = await s.fetchApprovedTimeOff({ from: '2026-11-30', to: '2026-12-06' });
  assert.deepEqual(list, [{ empId: 'e1', dates: ['2026-12-01', '2026-12-02', '2026-12-03'] }]);
});
test('offering, claiming and a supervisor\'s change go through the approvals, and the old request list is gone', () => {
  const r = read('scheduleread.jsx'), b = read('scheduler.jsx');
  assert.match(r, /submitApproval\('swapOffer'/); assert.match(r, /submitApproval\('swapAccept'/); assert.match(b, /submitApproval\('schedEdit'/);
  for (const [name, src] of [['scheduleread', r], ['scheduler', b], ['sched-core', read('sched-core.jsx')]]) {
    assert.equal(/action: '(offer|claim|swap_decide|edit|edit_decide)'/.test(src), false, name);
    assert.equal(/fetchSchedRequests|ApprovalsPanel|mySwaps/.test(src), false, name);
  }
});
test('the import screen says a published week stays published', () => {
  const s = read('schedule-import.jsx');
  assert.match(s, /A week that is already published stays published\./);
  assert.equal(/Imported weeks arrive unpublished/.test(s), false);
});
