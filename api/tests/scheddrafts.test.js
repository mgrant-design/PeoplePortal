const test = require('node:test'); const assert = require('node:assert');
const fs = require('fs'); const path = require('path'); const vm = require('vm');
const ROOT = path.join(__dirname, '..', '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

function store() {
  const window = {};
  vm.runInNewContext(read('scheddrafts.js'), { window, JSON, Object, Array, Set, Map });
  return window.PD_DRAFTS;
}
const draft = (id) => ({ id: '2026-11-16__Manorville', office: 'Manorville', weekKey: '2026-11-16', published: false, shifts: [{ id, empId: 'e1', date: '2026-11-17', start: '08:00', end: '16:00' }] });

test('a draft put in the store comes back the same after switching away and back', () => {
  const d = store();
  d.put('2026-11-16', 'Manorville', draft('s1'));
  assert.equal(d.get('2026-11-23', 'Manorville'), null);   // another week has none
  assert.deepEqual(d.get('2026-11-16', 'Manorville').shifts.map(s => s.id), ['s1']);
  assert.equal(d.get('2026-11-16', 'Islandia'), null);      // another office has none
});
test('a stored draft is a copy: changing what was put in does not change the store', () => {
  const d = store(); const doc = draft('s1');
  d.put('2026-11-16', 'Manorville', doc); doc.shifts.push({ id: 'x' });
  assert.equal(d.get('2026-11-16', 'Manorville').shifts.length, 1);
});
test('clearing one office keeps the others, and the store knows when nothing is left', () => {
  const d = store();
  d.put('2026-11-16', 'Manorville', draft('s1')); d.put('2026-11-16', 'Islandia', { ...draft('s2'), office: 'Islandia' });
  assert.equal(d.hasAny(), true);
  d.clear('2026-11-16', 'Manorville');
  assert.equal(d.get('2026-11-16', 'Manorville'), null); assert.ok(d.get('2026-11-16', 'Islandia'));
  assert.equal(d.has('2026-11-16', ['Manorville']), false); assert.equal(d.has('2026-11-16', ['Manorville', 'Islandia']), true);
  d.clearWeek('2026-11-16', ['Islandia']);
  assert.equal(d.hasAny(), false);
});
test('repeat copies for future weeks are kept with the drafts', () => {
  const d = store();
  d.setRepeats([{ office: 'Manorville', weekKey: '2026-11-23', shift: { id: 'r1' } }]);
  assert.equal(d.hasAny(), true); assert.equal(d.getRepeats().length, 1);
  d.setRepeats([]); assert.equal(d.hasAny(), false);
});
test('the Builder keeps its edits in the store and puts them back when it opens', () => {
  const s = read('scheduler.jsx');
  assert.match(s, /PD_DRAFTS\.put\(weekKey, office,/);
  assert.match(s, /useEffect\(\(\) => load\('keep'\), \[offices\.join\('\|'\), weekKey\]\);/);
  assert.match(s, /PD_DRAFTS\.clear\(weekKey, office\)/);
});
test('leaving the Builder with unpublished changes asks, in the portal\'s own dialog, and keeps them', () => {
  assert.match(read('schedgrid.jsx'), /You have unpublished changes\. Leave anyway\?/);
  assert.match(read('scheduleread.jsx'), /PD_DRAFTS\.hasAny\(\)/);
  assert.match(read('app.jsx'), /PD_DRAFTS\.hasAny\(\)/);
  assert.equal(/window\.confirm\('You have unpublished changes — loading/.test(read('scheduler.jsx')), true);   // the refresh prompt stays: it discards
});
test('the page loads the drafts store before the Builder', () => {
  const html = read('index.html');
  assert.ok(html.indexOf("'scheddrafts.js'") > 0 && html.indexOf("'scheddrafts.js'") < html.indexOf("'scheduler.jsx'"));
});

test('the week and offices the Builder was showing are remembered, as copies', () => {
  const d = store();
  assert.equal(d.getView(), null);
  const v = { weekKey: '2026-11-23', offices: ['Manorville'] };
  d.setView(v); v.offices.push('x');
  assert.deepEqual(d.getView(), { weekKey: '2026-11-23', offices: ['Manorville'] });
});
test('signing out clears every draft, the repeats and the remembered view', () => {
  const d = store();
  d.put('2026-11-16', 'Manorville', draft('s1')); d.setRepeats([{ office: 'Manorville', weekKey: 'w', shift: { id: 'r' } }]); d.setView({ weekKey: 'w', offices: [] });
  d.clearAll();
  assert.equal(d.hasAny(), false); assert.equal(d.getView(), null); assert.deepEqual(d.getRepeats(), []);
});
test('the Builder keeps its drafts when a load fails, uses the keep-load for live updates and approvals, and reopens on the drafted week', () => {
  const s = read('scheduler.jsx');
  assert.match(s, /const failed = \{ v: false \}/);
  assert.match(s, /if \(failed\.v\) \{/);
  assert.equal(/onActed=\{load\}/.test(s), false);
  assert.equal(/load\(true\)/.test(s.replace(/\/\*[\s\S]*?\*\//g, '')) && /onChanged[\s\S]{0,300}load\(\);/.test(s), false);
  assert.match(s, /PD_DRAFTS\.getView\(\)/);
});
test('the page warns before closing with unpublished changes even when the Builder is closed, and signing out clears them', () => {
  const a = read('app.jsx');
  assert.match(a, /addEventListener\('beforeunload'[\s\S]{0,200}PD_DRAFTS\.hasAny\(\)/);
  assert.match(a, /PD_DRAFTS\.clearAll\(\)/);
  assert.match(a, /view === 'scheduler' \|\| view === 'myschedule'/);
});
