const test = require('node:test'); const assert = require('node:assert');
const W = require('../../weekmerge.js');

const sh = (id, extra = {}) => ({ id, empId: 'e1', date: '2026-11-17', start: '08:00', end: '16:00', ...extra });
const week = (shifts) => ({ id: '2026-11-16__Manorville', office: 'Manorville', weekKey: '2026-11-16', published: true, shifts });

test('what a manager added, changed and removed is the difference between the week they opened and their draft', () => {
  const base = [sh('a'), sh('b'), sh('c')];
  const draft = [sh('a'), sh('b', { end: '17:00' }), sh('n')];
  const c = W.diffWeek(base, draft);
  assert.deepEqual(c.add.map(s => s.id), ['n']);
  assert.deepEqual(c.update.map(u => [u.shift.id, u.was.end, u.shift.end]), [['b', '16:00', '17:00']]);
  assert.deepEqual(c.remove.map(r => r.id), ['c']);
});
test('an employee\'s offer made after the Builder loaded survives a publish', () => {
  const stored = week([sh('a', { offered: true, offeredBy: 'e1' }), sh('b')]);   // the offer landed on the server
  const merged = W.mergeWeek(stored, { add: [sh('n', { empId: 'e2' })], update: [], remove: [] });
  assert.deepEqual(merged.shifts.map(s => s.id), ['a', 'b', 'n']);
  assert.equal(merged.shifts[0].offered, true);
});
test('an approved swap survives a publish', () => {
  const stored = week([sh('a', { empId: 'e2' })]);   // was e1's when the Builder loaded; the swap gave it to e2
  const merged = W.mergeWeek(stored, { add: [sh('n')], update: [], remove: [] });
  assert.equal(merged.shifts.find(s => s.id === 'a').empId, 'e2');
});
test('a change to a shift someone else changed meanwhile is a conflict', () => {
  const stored = week([sh('a', { offered: true, offeredBy: 'e1' })]);
  assert.throws(() => W.mergeWeek(stored, { add: [], update: [{ shift: sh('a', { end: '17:00' }), was: sh('a') }], remove: [] }), e => e.status === 409 && e.conflicts.length === 1);
  assert.throws(() => W.mergeWeek(stored, { add: [], update: [], remove: [{ id: 'a', was: sh('a') }] }), e => e.status === 409);
});
test('changing a shift that someone removed meanwhile is a conflict, and removing one already gone is not', () => {
  assert.throws(() => W.mergeWeek(week([]), { add: [], update: [{ shift: sh('a', { end: '17:00' }), was: sh('a') }], remove: [] }), e => e.status === 409);
  const merged = W.mergeWeek(week([sh('b')]), { add: [], update: [], remove: [{ id: 'a', was: sh('a') }] });
  assert.deepEqual(merged.shifts.map(s => s.id), ['b']);
});
test('adding the same shift twice adds it once, and a different shift with the same id is a conflict', () => {
  assert.equal(W.mergeWeek(week([sh('a')]), { add: [sh('a')], update: [], remove: [] }).shifts.length, 1);
  assert.throws(() => W.mergeWeek(week([sh('a')]), { add: [sh('a', { end: '17:00' })], update: [], remove: [] }), e => e.status === 409);
});
test('publishing by someone else does not make every shift look changed', () => {
  const stored = week([sh('a', { pub: true }), sh('b', { pub: true })]);   // stamped when someone published meanwhile
  const merged = W.mergeWeek(stored, { add: [], update: [{ shift: sh('a', { end: '17:00' }), was: sh('a') }], remove: [] });
  assert.equal(merged.shifts[0].end, '17:00');
});
test('applying changes to a newer week keeps what clashes out and says which', () => {
  const r = W.applyChanges([sh('a', { offered: true }), sh('b')], { add: [sh('n')], update: [{ shift: sh('a', { end: '17:00' }), was: sh('a') }, { shift: sh('b', { end: '17:00' }), was: sh('b') }], remove: [] });
  assert.deepEqual(r.shifts.map(s => [s.id, s.end]), [['a', '16:00'], ['b', '17:00'], ['n', '16:00']]);
  assert.deepEqual(r.conflicts.map(c => c.id), ['a']);
});
