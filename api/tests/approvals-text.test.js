const test = require('node:test'); const assert = require('node:assert');
const fs = require('fs'); const path = require('path'); const vm = require('vm');
const ROOT = path.join(__dirname, '..', '..');

function load() {
  const window = {};
  const ctx = { window, Object, String, Number, Math, Date, Array, JSON, localStorage: { getItem: () => null, setItem() {} } };
  ctx.globalThis = ctx;
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'sched-core.jsx'), 'utf8'), ctx);
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'approvals-text.js'), 'utf8'), ctx);
  return window.describeApproval;
}
/* the fixtures are in 2027; a date shows its year when that isn't the current year */
const yr = new Date().getFullYear() === 2027 ? '' : ', 2027';
const rec = (kind, payload, extra = {}) => ({ id: 'ap-1', kind, payload, submittedBy: 'jordan@puredental.com', submittedName: 'Jordan Avery', status: 'pending', steps: [], createdAt: '2027-01-02T15:00:00.000Z', ...extra });

test('time off reads as who, how many days, and the dates', () => {
  const d = load()(rec('timeoff', { start: '2027-01-04', end: '2027-01-06', hours: 24, type: 'PTO', reason: '' }));
  assert.deepEqual(d, { who: 'Jordan Avery', what: 'Time off, 3 days', when: `Jan 4${yr} to Jan 6${yr}`, detail: 'PTO · 24 hours' });
});
test('one day of time off reads as one date', () => {
  const d = load()(rec('timeoff', { start: '2027-01-04', end: '2027-01-04' }));
  assert.equal(d.what, 'Time off, 1 day'); assert.equal(d.when, `Jan 4${yr}`);
});
test('an offboarding notice reads as who and their last day', () => {
  const d = load()(rec('offboarding', { first: 'Sam', last: 'Lee', termStatus: 'Resigned', effective: '2027-02-14' }));
  assert.deepEqual(d, { who: 'Sam Lee', what: 'Offboarding notice · Resigned', when: `Last day Feb 14${yr}` });
});
test('a shift swap reads as the shift\'s day and times', () => {
  const d = load()(rec('swapAccept', { shift: { date: '2027-01-05', start: '08:00', end: '16:30', office: 'Manorville' }, fromName: 'Pat Kim' }));
  assert.deepEqual(d, { who: 'Jordan Avery', what: 'Shift swap with Pat Kim · Manorville', when: `Tue Jan 5${yr}, 8a–4:30p` });
});

test('the server\'s wording of a shift request carries its times, with no screen code loaded', () => {
  const T = require('../../approvals-text.js');
  const d = T.describeApproval({ kind: 'swapAccept', submittedName: 'Pat', payload: { fromName: 'Eli', shift: { date: '2026-11-17', start: '08:00', end: '16:30', office: 'Manorville' } } });
  assert.equal(d.when.endsWith('8a–4:30p'), true, d.when);
  assert.equal(T.time12('13:05'), '1:05p'); assert.equal(T.time12('00:00'), '12a');
});
test('a date in another year shows its year; one in this year does not', () => {
  const T = require('../../approvals-text.js');
  const y = new Date().getFullYear();
  assert.equal(T.dayLabel(`${y}-03-14`), 'Mar 14');
  assert.equal(T.dayLabel(`${y + 1}-01-05`), `Jan 5, ${y + 1}`);
});
test('the wording takes only the record, and the screens\' time format comes from it', () => {
  const fs = require('fs'), path = require('path');
  const R = (f) => fs.readFileSync(path.join(__dirname, '..', '..', f), 'utf8');
  assert.match(R('approvals-text.js'), /function describeApproval\(record\)/);
  assert.doesNotMatch(R('approvals.jsx') + R('api/approvals/index.js'), /describeApproval\([^)]*,/);
  assert.match(R('sched-core.jsx'), /function fmt12\(t\) \{ return window\.pdTime12\(t\); \}/);
  const html = R('index.html');
  assert.ok(html.indexOf('<script src="approvals-text.js"></script>') > 0 && html.indexOf('<script src="approvals-text.js"></script>') < html.indexOf('sched-core.jsx'));
  assert.doesNotMatch(html, /'approvals-text\.js'/);
});

test('"this year" is the year at the offices (US Eastern), whatever clock the server runs on', () => {
  const T = require('../../approvals-text.js');
  assert.equal(T.thisYear(new Date('2027-01-01T02:00:00Z')), 2026);   // 9 pm on Dec 31 in New York
  assert.equal(T.thisYear(new Date('2027-01-01T06:00:00Z')), 2027);
});
