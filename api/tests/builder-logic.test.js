/* The Builder's and the Schedule tab's logic that has no screen parts, run for real. */
const test = require('node:test'); const assert = require('node:assert');
const fs = require('fs'); const path = require('path'); const vm = require('vm');
const ROOT = path.join(__dirname, '..', '..');
const PD_WEEK = require('../../weekmerge.js');

function block(file, from, to, names, extra = {}) {
  const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const a = src.indexOf(from), b = src.indexOf(to);
  assert.ok(a >= 0 && b > a, `${file} has its logic block`);
  const ctx = { PD_WEEK, Promise, Error, Math, Date, Set, Map, Array, Object, JSON, String, ...extra };
  vm.runInNewContext(src.slice(a, b) + '\n' + names.map(n => `this.${n} = ${n};`).join('\n'), ctx);
  return ctx;
}
const people = [{ id: 'e1', name: 'Eli Test' }, { id: 'p1', name: 'Pat Kim' }];
const builder = (extra = {}) => block('scheduler.jsx', '/* ---- Builder logic with no screen parts ---- */', '/* ---- end of Builder logic ---- */',
  ['makeFlash', 'clashText', 'sendChangesForApproval', 'saveDraftChanges', 'saveHeldRepeats', 'publishSummary'],
  { schedAll: () => people, shiftRange: (s) => `${s.start}–${s.end}`, ...extra });
const sh = (id, empId, extra = {}) => ({ id, empId, date: '2026-11-17', start: '08:00', end: '16:00', ...extra });
const refusedAsPublished = () => { const e = new Error('Week is published'); e.body = { pendingRequired: true }; return e; };

test('a new message replaces the one showing and gets its own full time', () => {
  const shown = []; const timers = []; let cleared = 0;
  const flash = builder().makeFlash((t) => shown.push(t), { set: (fn, ms) => { timers.push({ fn, ms }); return timers.length; }, clear: (id) => { if (id) cleared++; } });
  flash('first'); flash('second', false, 8000);
  assert.deepEqual(shown, [{ m: 'first', ok: true }, { m: 'second', ok: false }]);
  assert.equal(cleared, 1, 'the first message\'s timer is cancelled, so it cannot hide the second early');
  assert.equal(timers[1].ms, 8000);
  timers[1].fn(); assert.equal(shown[2], null);
});
test('the clash message names up to three shifts by person, day and times, and counts the rest', () => {
  const B = builder();
  assert.equal(B.clashText([sh('a', 'e1')]), 'Eli Test, Tue, Nov 17 08:00–16:00');
  const five = B.clashText([sh('a', 'e1'), sh('b', 'p1'), sh('c', ''), sh('d', 'e1'), sh('e', 'e1')]);
  assert.match(five, /^Eli Test, .*; Pat Kim, .*; Open shift, .* and 2 more$/);
});
test('a supervisor\'s requests carry each shift as their screen had it', async () => {
  const sent = [];
  const changes = PD_WEEK.diffWeek([sh('s1', 'e1'), sh('s2', 'p1')], [sh('s1', 'e1', { start: '09:00' }), sh('n1', 'p1')]);
  const r = await builder().sendChangesForApproval('Manorville', '2026-11-16', changes, async (kind, body) => { sent.push([kind, body]); });
  assert.equal(r.sent, 3); assert.equal(r.failedCount, 0);
  const by = Object.fromEntries(sent.map(([, b]) => [b.change.op, b.change]));
  assert.equal(by.update.was.start, '08:00'); assert.equal(by.remove.was.id, 's2'); assert.equal(by.add.was, undefined);
  assert.ok(sent.every(([kind, b]) => kind === 'schedEdit' && b.office === 'Manorville' && b.weekKey === '2026-11-16'));
});
test('when a manager published the week meanwhile, a supervisor\'s draft goes to their manager and only what could not be sent stays', async () => {
  const base = [sh('s1', 'e1'), sh('s2', 'p1')];
  const doc = { _base: base, shifts: [sh('s1', 'e1', { start: '09:00' }), sh('n1', 'p1')] };
  const submit = async (kind, body) => { if (body.change.op === 'update') throw new Error('No manager is on file'); };
  const r = await builder().saveDraftChanges({ office: 'Manorville', weekKey: '2026-11-16', doc, isSup: true, save: async () => { throw refusedAsPublished(); }, submit });
  assert.equal(r.publish, undefined); assert.equal(r.note.ok, false); assert.match(r.note.m, /2 changes went to your manager; 1 couldn’t be sent \(No manager is on file\)/);
  const left = PD_WEEK.diffWeek(base, r.remaining);
  assert.deepEqual([left.add.length, left.update.length, left.remove.length], [0, 1, 0], 'only the unsent change is still a draft, so nothing is sent twice');
  const all = await builder().saveDraftChanges({ office: 'Manorville', weekKey: '2026-11-16', doc, isSup: true, save: async () => { throw refusedAsPublished(); }, submit: async () => {} });
  assert.equal(all.clear, true); assert.equal(all.note.ok, true);
});
test('a draft that saves is cleared and published; one that fails stays and says so; a manager is never rerouted', async () => {
  const doc = { _base: [], shifts: [sh('n1', 'p1')] };
  const saved = [];
  const ok = await builder().saveDraftChanges({ office: 'Manorville', weekKey: '2026-11-16', doc, isSup: false, save: async (b) => { saved.push(b); }, submit: async () => {} });
  assert.deepEqual([ok.publish, ok.clear, ok.note], [true, true, undefined]); assert.equal(saved[0].changes.add.length, 1);
  let asked = 0;
  const bad = await builder().saveDraftChanges({ office: 'Manorville', weekKey: '2026-11-16', doc, isSup: false, save: async () => { throw refusedAsPublished(); }, submit: async () => { asked++; } });
  assert.equal(bad.publish, undefined); assert.equal(bad.clear, undefined); assert.equal(bad.note.ok, false); assert.equal(asked, 0);
});
test('a held repeat copy that fails is kept; one aimed at a published week goes to the supervisor\'s manager', async () => {
  const held = [{ office: 'Manorville', weekKey: '2026-11-23', shift: sh('r1', 'e1', { date: '2026-11-24' }) }, { office: 'Manorville', weekKey: '2026-11-30', shift: sh('r2', 'e1', { date: '2026-12-01' }) }];
  const sent = [];
  const save = async (b) => { if (b.weekKey === '2026-11-23') throw refusedAsPublished(); throw new Error('The server didn\'t answer'); };
  const r = await builder().saveHeldRepeats(held, { isSup: true, save, submit: async (kind, body) => { sent.push(body.weekKey); } });
  assert.deepEqual(sent, ['2026-11-23']);
  assert.deepEqual(r.kept.map(k => k.shift.id), ['r2']);
  assert.equal(r.notes.length, 1); assert.equal(r.notes[0].ok, false); assert.match(r.notes[0].m, /2026-11-30.*kept/);
});
test('one Publish shows one message, with the problems first', () => {
  const B = builder();
  assert.equal(B.publishSummary([]), null);
  const s = B.publishSummary([{ m: 'Islandia week published.', ok: true }, { m: 'Manorville: 1 couldn’t be sent.', ok: false }]);
  assert.equal(s.ok, false); assert.equal(s.m, 'Manorville: 1 couldn’t be sent. Islandia week published.'); assert.ok(s.ms >= 8000);
  assert.equal(B.publishSummary([{ m: 'Islandia week published.', ok: true }]).ok, true);
});
test('the Builder itself uses these: one message per Publish, and its own requests carry the shift as seen', () => {
  const src = fs.readFileSync(path.join(ROOT, 'scheduler.jsx'), 'utf8');
  const pub = src.slice(src.indexOf('const publish = async'), src.indexOf('/* ---- lay standing regular hours'));
  assert.equal((pub.match(/flash\(/g) || []).length, 1, 'publish shows its messages once, at the end');
  assert.match(pub, /publishSummary\(notes\)/); assert.match(pub, /saveDraftChanges\(/); assert.match(pub, /saveHeldRepeats\(/);
  assert.match(src, /op: 'remove', shiftId: form\.shift\.id, was: form\.shift/);
  assert.match(src, /makeFlash\(setToast\)/);
});

test('the Schedule tab marks a shift as waiting from the week itself and from the viewer\'s own requests', () => {
  const S = block('scheduleread.jsx', '/* ---- Schedule tab logic with no screen parts ---- */', '/* ---- end of Schedule tab logic ---- */', ['waitingShiftIds']);
  const mine = [{ kind: 'swapAccept', payload: { shiftId: 'mine1' } }, { kind: 'swapOffer', payload: { shiftId: 'mine2' } }];
  const shifts = [{ id: 'a', claimPending: true }, { id: 'b', offerPending: true }, { id: 'c' }];
  assert.deepEqual([...S.waitingShiftIds('swapAccept', mine, shifts)].sort(), ['a', 'mine1']);
  assert.deepEqual([...S.waitingShiftIds('swapOffer', mine, shifts)].sort(), ['b', 'mine2']);
  const src = fs.readFileSync(path.join(ROOT, 'scheduleread.jsx'), 'utf8');
  assert.match(src, /waitingShiftIds\('swapAccept', appr, \[\.\.\.shifts, \.\.\.allShifts\]\)/);
});
