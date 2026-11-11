const test = require('node:test'); const assert = require('node:assert');
const fs = require('fs'); const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', '..', 'employee.jsx'), 'utf8');

test('the employee record shows no made-up events, documents, dates or review cycle', () => {
  for (const s of ['Home location set to', 'Location_Assignment.pdf', 'Primary location assigned', 'I-9_Signed.pdf', 'License_Verification.pdf', 'Offboarding_Record.pdf', '2026-06-14', '2025-01-01', 'Review cycle 2026']) {
    assert.ok(!src.includes(s), s);
  }
});
test('the Documents tab has no Print button that does nothing', () => {
  const docsTab = src.slice(src.indexOf("tab === 'Documents'"), src.indexOf("tab === 'Offboarding'"));
  assert.doesNotMatch(docsTab, /Print/);
});
test('a record with no events starts empty and says so plainly', () => {
  const start = src.slice(src.indexOf('const [events, setEvents] = useState('), src.indexOf('const [logging, setLogging]'));
  assert.match(start, /: \[\]/);
  assert.match(src, /filter === 'All' \? 'No events on file\.'/);
});
test('a new event is dated today unless changed', () => {
  const form = src.slice(src.indexOf('function LogEventForm'), src.indexOf('function EventCard'));
  assert.match(form, /useState\(todayIso\)/);
});
