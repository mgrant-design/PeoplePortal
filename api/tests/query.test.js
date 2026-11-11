const test = require('node:test'); const assert = require('node:assert');
const db = require('../_shared/cosmos');

test('a filter turns into a database query with its values passed separately', () => {
  const q = db.compileQuery([['kind', '=', 'timeoff'], ['payload.start', '<=', '2026-11-22'], { or: [['waitingOn', 'contains', 'a@x.com'], ['submittedBy', '=', 'a@x.com']] }]);
  assert.equal(q.query, 'SELECT * FROM c WHERE c["kind"] = @p0 AND c["payload"]["start"] <= @p1 AND (ARRAY_CONTAINS(c["waitingOn"], @p2) OR c["submittedBy"] = @p3)');
  assert.deepEqual(q.parameters, [{ name: '@p0', value: 'timeoff' }, { name: '@p1', value: '2026-11-22' }, { name: '@p2', value: 'a@x.com' }, { name: '@p3', value: 'a@x.com' }]);
});
test('the same filter checks a document the way the query would', () => {
  const f = [['kind', '=', 'timeoff'], ['payload.end', '>=', '2026-11-16'], { or: [['waitingOn', 'contains', 'a@x.com'], ['submittedBy', '=', 'a@x.com']] }];
  assert.equal(db.matches(f, { kind: 'timeoff', payload: { end: '2026-11-17' }, waitingOn: ['a@x.com'] }), true);
  assert.equal(db.matches(f, { kind: 'timeoff', payload: { end: '2026-11-17' }, waitingOn: [], submittedBy: 'b@x.com' }), false);
  assert.equal(db.matches(f, { kind: 'timeoff', payload: { end: '2026-11-10' }, submittedBy: 'a@x.com' }), false);
  assert.equal(db.matches([['kind', 'in', ['swapOffer', 'swapAccept']]], { kind: 'swapAccept' }), true);
});
test('a field name that is not a plain name is refused', () => {
  assert.throws(() => db.compileQuery([['kind"] OR 1=1 --', '=', 'x']]));
});
test('the "is one of" and "on or after" forms of a filter make the query the database expects', () => {
  const q = db.compileQuery([['kind', 'in', ['swapOffer', 'swapAccept']], ['payload.end', '>=', '2026-11-16']]);
  assert.equal(q.query, 'SELECT * FROM c WHERE ARRAY_CONTAINS(@p0, c["kind"]) AND c["payload"]["end"] >= @p1');
  assert.deepEqual(q.parameters, [{ name: '@p0', value: ['swapOffer', 'swapAccept'] }, { name: '@p1', value: '2026-11-16' }]);
  assert.equal(db.compileQuery([]).query, 'SELECT * FROM c');
});
