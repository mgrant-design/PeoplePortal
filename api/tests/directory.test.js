/* Deactivating several people at once from the Directory. */
const test = require('node:test'); const assert = require('node:assert');
const fs = require('fs'); const path = require('path'); const vm = require('vm');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', '..', f), 'utf8');
function logic() {
  const src = read('directory.jsx');
  const a = src.indexOf('/* ---- Directory logic with no screen parts ---- */'), b = src.indexOf('/* ---- end of Directory logic ---- */');
  assert.ok(a >= 0 && b > a, 'directory.jsx has its logic block');
  const ctx = { Promise, Error }; vm.runInNewContext(src.slice(a, b) + '\nthis.canDeactivate = canDeactivate; this.deactivatePeople = deactivatePeople;', ctx);
  return ctx;
}
const p = (id, extra = {}) => ({ id, name: 'Person ' + id, status: 'Active', ...extra });

test('only an active person other than yourself can be ticked', () => {
  const { canDeactivate } = logic(); const me = { id: 'me' };
  assert.equal(canDeactivate(p('a'), me), true);
  assert.equal(canDeactivate(p('me'), me), false);
  assert.equal(canDeactivate(p('t', { status: 'Terminated' }), me), false);
  assert.equal(canDeactivate(p('s', { status: 'Suspended' }), me), true);
});
test('each ticked person is set to Terminated with the one signature and reason', async () => {
  const sent = [];
  const out = await logic().deactivatePeople([p('a'), p('b')], { signature: 'Ada Admin', reason: 'Left the company' }, async (body) => { sent.push(body); return { id: body.id, status: 'Terminated' }; });
  assert.deepEqual(JSON.parse(JSON.stringify(sent)), [
    { action: 'update', id: 'a', patch: { status: 'Terminated' }, signature: 'Ada Admin', reason: 'Left the company' },
    { action: 'update', id: 'b', patch: { status: 'Terminated' }, signature: 'Ada Admin', reason: 'Left the company' }]);
  assert.deepEqual(out.done.map(e => e.id), ['a', 'b']); assert.equal(out.failed.length, 0);
});
test('one refused save does not stop the rest, and is reported with its reason', async () => {
  const out = await logic().deactivatePeople([p('a'), p('b'), p('c')], { signature: 'Ada Admin', reason: '' },
    async (body) => { if (body.id === 'b') throw new Error('Not allowed to terminate'); return { id: body.id, status: 'Terminated' }; });
  assert.deepEqual(out.done.map(e => e.id), ['a', 'c']);
  assert.deepEqual(JSON.parse(JSON.stringify(out.failed)), [{ id: 'b', name: 'Person b', message: 'Not allowed to terminate' }]);
});
test('the Directory offers it to someone who may terminate, and the app passes who is signed in', () => {
  const src = read('directory.jsx');
  assert.match(src, /const canBulk = !!\(access && access\.caps && access\.caps\.terminate\);/);
  assert.match(src, /\{canBulk && /);
  assert.match(src, /deactivatePeople\(chosen, \{ signature: signature\.trim\(\), reason: reason\.trim\(\) \}, saveEmpRecord\)/);
  assert.match(read('app.jsx'), /<Directory employees=\{DIRECTORY\} access=\{access\} me=\{me\} /);
});

test('the deactivate controls are labelled with the action alone', () => {
  const src = read('directory.jsx');
  assert.doesNotMatch(src, /Deactivate people<|Sign and deactivate/);
  assert.match(src, />Deactivate<\/button>/);
  assert.match(src, /\{chosen\.length\} selected/);
});
