const test = require('node:test'); const assert = require('node:assert');
const { loadEndpoint } = require('./helpers/endpoint');

const P = (id, first, extra = {}) => ({ id, first, last: first + 'son', workEmail: first.toLowerCase() + '@puredental.com', department: 'Clinical Team', jobTitle: 'Dental Assistant', location: 'Manorville', status: 'Active', ...extra });
const mia = P('m1', 'Mia', { department: 'Front Desk', jobTitle: 'Office Manager' });
const eli = P('e1', 'Eli', { managerEmail: 'mia@puredental.com' });
const pat = P('p1', 'Pat', { managerEmail: 'mia@puredental.com' });
const sue = P('s1', 'Sue', { jobTitle: 'Team Lead', managerEmail: 'mia@puredental.com' });   // a supervisor
const rex = P('r1', 'Rex', { department: 'Front Desk', jobTitle: 'Office Manager', location: 'Islandia' });   // another office's manager
const employees = [mia, eli, pat, sue, rex];
const support = { users: [], managers: [], offices: [{ name: 'Manorville' }, { name: 'Islandia' }], approvers: {} };
const WEEK = '2026-11-16';
const shift = (id, empId, extra = {}) => ({ id, empId, date: '2026-11-17', start: '08:00', end: '16:00', pub: true, ...extra });

/* approvals and schedule weeks kept in memory; each doc carries a version so If-Match is honoured */
function world(shifts = [shift('s1', 'e1')], published = true, accessDocs = []) {
  const store = { approvals: {}, schedules: { [`${WEEK}__Manorville`]: { id: `${WEEK}__Manorville`, office: 'Manorville', weekKey: WEEK, published, shifts, _etag: '"w1"' } } };
  let v = 1;
  const cosmos = async (c) => {
    const m = /\/colls\/(approvals|schedules)(\/docs\/([^/]+))?$/.exec(c.resId);
    if (!m) return undefined;
    const coll = store[m[1]];
    if (c.verb === 'GET' && m[3]) return coll[m[3]] ? { status: 200, body: coll[m[3]] } : { status: 404, body: {} };
    if (c.verb === 'GET') return { status: 200, body: { Documents: Object.values(coll) } };
    if (c.verb === 'POST') {
      const cur = coll[c.body.id];
      if (c.ifMatch && cur && cur._etag !== c.ifMatch) return { status: 412, body: {} };
      if (!c.upsert && cur) return { status: 409, body: {} };
      coll[c.body.id] = { ...c.body, _etag: '"v' + (++v) + '"' }; return { status: 200, body: coll[c.body.id] };
    }
    return undefined;
  };
  const as = (name, email) => (ep) => loadEndpoint(ep, { identity: { email }, employees, support, accessDocs, cosmos });
  const approve = (who, id, extra = {}) => as(null, who.workEmail)('approvals').call({ method: 'POST', body: { action: 'decide', id, decision: 'approve', ...extra } });
  const submit = (who, kind, payload) => as(null, who.workEmail)('approvals').call({ method: 'POST', body: { action: 'submit', kind, payload } });
  const week = () => store.schedules[`${WEEK}__Manorville`];
  const notifiedUsers = (r) => (r.context.bindings.signalRMessages || []).filter(m => m.target === 'notify').map(m => m.userId);
  return { store, as, approve, submit, week, notifiedUsers };
}
const where = { office: 'Manorville', weekKey: WEEK, shiftId: 's1' };

test('offering a shift asks the owner\'s manager, and the shift is offered only once that is approved', async () => {
  const w = world();
  const sub = await w.submit(eli, 'swapOffer', where);
  assert.equal(sub.status, 200); assert.deepEqual(w.notifiedUsers(sub), ['mia@puredental.com']);
  assert.equal(w.week().shifts[0].offered, undefined);
  const r = await w.approve(mia, sub.body.record.id);
  assert.equal(r.status, 200);
  assert.equal(w.week().shifts[0].offered, true); assert.equal(w.week().shifts[0].offeredBy, 'e1');
  assert.deepEqual(w.notifiedUsers(r), ['eli@puredental.com']);
});
test('only the shift\'s own person offers it, in a published week, once at a time', async () => {
  const w = world();
  assert.equal((await w.submit(pat, 'swapOffer', where)).status, 403);
  assert.equal((await w.submit(eli, 'swapOffer', { ...where, shiftId: 'nope' })).status, 404);
  assert.equal((await world([shift('s1', 'e1')], false).submit(eli, 'swapOffer', where)).status, 404);
  assert.equal((await w.submit(eli, 'swapOffer', where)).status, 200);
  assert.equal((await w.submit(eli, 'swapOffer', where)).status, 409);
});
test('a claim before the offer is approved is refused', async () => {
  const w = world();
  await w.submit(eli, 'swapOffer', where);
  const early = await w.submit(pat, 'swapAccept', where);
  assert.equal(early.status, 409);
});
test('the shift moves only after both approvals, and both people are told', async () => {
  const w = world();
  const offer = await w.submit(eli, 'swapOffer', where);
  await w.approve(mia, offer.body.record.id);
  const claim = await w.submit(pat, 'swapAccept', where);
  assert.equal(claim.status, 200); assert.deepEqual(w.notifiedUsers(claim), ['mia@puredental.com']);
  assert.equal(w.week().shifts[0].empId, 'e1');   // still Eli's until the claim is approved
  const done = await w.approve(mia, claim.body.record.id);
  assert.equal(w.week().shifts[0].empId, 'p1');
  assert.equal(w.week().shifts[0].offered, undefined); assert.equal(w.week().shifts[0].offeredBy, undefined);
  assert.deepEqual(w.notifiedUsers(done).sort(), ['eli@puredental.com', 'pat@puredental.com']);
});
test('an unassigned shift can be claimed without an offer, and a shift already claimed cannot be claimed again', async () => {
  const w = world([shift('s1', '', { open: true })]);
  assert.equal((await w.submit(pat, 'swapAccept', where)).status, 200);
  assert.equal((await w.submit(sue, 'swapAccept', where)).status, 409);
});
test('you cannot claim your own shift', async () => {
  const w = world([shift('s1', 'e1', { offered: true, offeredBy: 'e1' })]);
  assert.equal((await w.submit(eli, 'swapAccept', where)).status, 400);
});
test('an offer cannot be withdrawn while a claim on it waits', async () => {
  const w = world([shift('s1', 'e1', { offered: true, offeredBy: 'e1' })]);
  await w.submit(pat, 'swapAccept', where);
  const r = await w.as(null, eli.workEmail)('schedule').call({ method: 'POST', body: { action: 'retract', office: 'Manorville', weekKey: WEEK, shiftId: 's1' } });
  assert.equal(r.status, 409);
  const free = world([shift('s1', 'e1', { offered: true, offeredBy: 'e1' })]);
  assert.equal((await free.as(null, eli.workEmail)('schedule').call({ method: 'POST', body: { action: 'retract', office: 'Manorville', weekKey: WEEK, shiftId: 's1' } })).status, 200);
  assert.equal(free.week().shifts[0].offered, undefined);
});
test('a swap whose shift changed before the approval is not applied and says so', async () => {
  const w = world();
  const offer = await w.submit(eli, 'swapOffer', where);
  w.week().shifts[0].empId = 'p1';   // someone else's change landed first
  const r = await w.approve(mia, offer.body.record.id);
  assert.equal(r.status, 200); assert.equal(w.week().shifts[0].offered, undefined);
  assert.equal(w.store.approvals[offer.body.record.id].effect, 'failed');
});
test('a supervisor\'s change to a published week goes only to their own manager, and applies when approved', async () => {
  const w = world();
  const sub = await w.submit(sue, 'schedEdit', { office: 'Manorville', weekKey: WEEK, change: { op: 'add', shift: shift('n1', 'p1', { pub: undefined }) } });
  assert.equal(sub.status, 200); assert.deepEqual(w.notifiedUsers(sub), ['mia@puredental.com']);   // not Rex, another office's manager
  assert.equal(w.week().shifts.length, 1);
  await w.approve(mia, sub.body.record.id);
  assert.deepEqual(w.week().shifts.map(s => s.id), ['s1', 'n1']);
  const rm = await w.submit(sue, 'schedEdit', { office: 'Manorville', weekKey: WEEK, change: { op: 'remove', shiftId: 's1' } });
  await w.approve(mia, rm.body.record.id);
  assert.deepEqual(w.week().shifts.map(s => s.id), ['n1']);
});
test('only someone who may schedule that office sends a schedule change, and a manager edits directly', async () => {
  const w = world();
  const change = { op: 'add', shift: shift('n1', 'p1') };
  assert.equal((await w.submit(pat, 'schedEdit', { office: 'Manorville', weekKey: WEEK, change })).status, 403);
  assert.equal((await w.submit(sue, 'schedEdit', { office: 'Islandia', weekKey: WEEK, change })).status, 403);
});
test('the old swap and edit actions are gone from the schedule endpoint, with their request list', async () => {
  const w = world();
  for (const action of ['offer', 'claim', 'swap_decide', 'edit', 'edit_decide']) {
    const r = await w.as(null, eli.workEmail)('schedule').call({ method: 'POST', body: { action, office: 'Manorville', weekKey: WEEK, shiftId: 's1', change: { op: 'add', shift: shift('x', 'e1') } } });
    assert.equal(r.status, 400, action);
  }
  const reqs = await w.as(null, mia.workEmail)('schedule').call({ method: 'GET', query: { requests: 1 } });
  assert.equal(reqs.body.requests, undefined);
});
test('a supervisor limited to some teams cannot send a change for another team, adding or removing', async () => {
  const w = world([shift('s1', 'e1')], true, [{ id: 'sue@puredental.com', email: 'sue@puredental.com', schedTeams: ['Hygiene'] }]);
  const add = await w.submit(sue, 'schedEdit', { office: 'Manorville', weekKey: WEEK, change: { op: 'add', shift: shift('n1', 'p1') } });
  assert.equal(add.status, 403);
  const rm = await w.submit(sue, 'schedEdit', { office: 'Manorville', weekKey: WEEK, change: { op: 'remove', shiftId: 's1' } });
  assert.equal(rm.status, 403);
});

/* ---- review fixes for Tasks 20 to 23 ---- */
const editOf = (change) => ({ office: 'Manorville', weekKey: WEEK, change });
test('an approved schedule change is not applied over a shift that changed after it was sent', async () => {
  const w = world([shift('s1', 'e1', { offered: true, offeredBy: 'e1' })]);
  const sub = await w.submit(sue, 'schedEdit', editOf({ op: 'update', shift: shift('s1', 'e1', { start: '09:00', end: '17:00', pub: undefined }) }));
  assert.equal(sub.status, 200);
  const claim = await w.submit(pat, 'swapAccept', where);
  await w.approve(mia, claim.body.record.id);   // Pat now holds the shift
  assert.equal(w.week().shifts[0].empId, 'p1');
  const done = await w.approve(mia, sub.body.record.id);
  assert.equal(done.status, 200);
  assert.equal(w.week().shifts[0].empId, 'p1'); assert.equal(w.week().shifts[0].start, '08:00');   // Pat's shift untouched
  assert.equal(w.store.approvals[sub.body.record.id].effect, 'failed');
});
test('an approved removal does not delete a shift that was handed to someone else after it was sent', async () => {
  const w = world([shift('s1', 'e1', { offered: true, offeredBy: 'e1' })]);
  const sub = await w.submit(sue, 'schedEdit', editOf({ op: 'remove', shiftId: 's1' }));
  const claim = await w.submit(pat, 'swapAccept', where);
  await w.approve(mia, claim.body.record.id);
  await w.approve(mia, sub.body.record.id);
  assert.deepEqual(w.week().shifts.map(s => s.id), ['s1']);
});
test('an approved schedule change to a shift that is up for grabs keeps it up for grabs', async () => {
  const w = world([shift('s1', 'e1', { offered: true, offeredBy: 'e1' })]);
  const sub = await w.submit(sue, 'schedEdit', editOf({ op: 'update', shift: shift('s1', 'e1', { start: '09:00', end: '17:00', pub: undefined }) }));
  await w.approve(mia, sub.body.record.id);
  assert.equal(w.week().shifts[0].start, '09:00');
  assert.equal(w.week().shifts[0].offered, true); assert.equal(w.week().shifts[0].offeredBy, 'e1');
});
test('a person told "approved" is told the truth when the schedule could not be changed', async () => {
  const w = world();
  const offer = await w.submit(eli, 'swapOffer', where);
  w.week().shifts[0].empId = 'p1';
  const r = await w.approve(mia, offer.body.record.id);
  const note = (r.context.bindings.signalRMessages || []).filter(m => m.target === 'notify');
  assert.deepEqual(note.map(m => m.userId), ['eli@puredental.com']);
  const stored = Object.values(w.store.notices || {});
  const text = JSON.stringify(r.context.bindings.signalRMessages) + JSON.stringify(stored);
  assert.doesNotMatch(text, /Teammates can now claim/);
  assert.match(text, /approved, but nothing was changed/); assert.match(text, /approved, not applied/);
});
test('a team-limited supervisor cannot hand another team\'s existing shift to their own team', async () => {
  const eliShift = shift('s1', 'e1');   // Eli is on the Clinical Team; Sue is limited to Hygiene
  const hyg = P('h1', 'Hal', { department: 'Hygiene', managerEmail: 'mia@puredental.com' });
  employees.push(hyg);
  try {
    const w = world([eliShift], true, [{ id: 'sue@puredental.com', email: 'sue@puredental.com', schedTeams: ['Hygiene'] }]);
    const upd = await w.submit(sue, 'schedEdit', editOf({ op: 'update', shift: shift('s1', 'h1', { pub: undefined }) }));
    assert.equal(upd.status, 403);
    const addOver = await w.submit(sue, 'schedEdit', editOf({ op: 'add', shift: shift('s1', 'h1', { pub: undefined }) }));
    assert.equal(addOver.status, 403);
  } finally { employees.pop(); }
});

test('everyone reading the week sees that a claim or an offer is waiting on a shift', async () => {
  const w = world([shift('s1', 'e1', { offered: true, offeredBy: 'e1' }), shift('s2', 'p1')]);
  await w.submit(pat, 'swapAccept', where);
  await w.submit(pat, 'swapOffer', { ...where, shiftId: 's2' });
  for (const who of [eli, sue]) {
    const r = await w.as(null, who.workEmail)('schedule').call({ method: 'GET', query: { office: 'Manorville', weekKey: WEEK } });
    const by = Object.fromEntries(r.body.schedules[0].shifts.map(s => [s.id, s]));
    assert.equal(by.s1.claimPending, true, who.first); assert.equal(by.s2.offerPending, true, who.first);
  }
  assert.equal(w.week().shifts[0].claimPending, undefined, 'the marks are not stored');
});

test('two claims sent at the same moment: one is saved, the other is told someone already claimed', async () => {
  const w = world([shift('s1', 'e1', { offered: true, offeredBy: 'e1' })]);
  const [a, b] = await Promise.all([w.submit(pat, 'swapAccept', where), w.submit(sue, 'swapAccept', where)]);
  assert.deepEqual([a.status, b.status].sort(), [200, 409]);
  assert.equal(Object.values(w.store.approvals).filter(r => r.kind === 'swapAccept' && r.status === 'pending').length, 1);
});
test('after a claim is denied, the shift can be claimed again', async () => {
  const w = world([shift('s1', 'e1', { offered: true, offeredBy: 'e1' })]);
  const first = await w.submit(pat, 'swapAccept', where);
  await w.as(null, mia.workEmail)('approvals').call({ method: 'POST', body: { action: 'decide', id: first.body.record.id, decision: 'deny' } });
  assert.equal((await w.submit(sue, 'swapAccept', where)).status, 200);
});
test('someone whose shift a manager put up for grabs is told it was reassigned, not that their offer was taken', async () => {
  const w = world([shift('s1', 'e1', { open: true })]);
  const claim = await w.submit(pat, 'swapAccept', where);
  const done = await w.approve(mia, claim.body.record.id);
  const toEli = (done.context.bindings.signalRMessages || []).filter(m => m.target === 'notify' && m.userId === 'eli@puredental.com').map(m => m.arguments[0]);
  assert.equal(toEli.length, 1);
  assert.doesNotMatch(toEli[0].title, /offered/); assert.match(toEli[0].title, /reassigned/);
});
test('a schedule change whose shift date is outside its week is refused', async () => {
  const w = world();
  const r = await w.submit(sue, 'schedEdit', { office: 'Manorville', weekKey: WEEK, change: { op: 'add', shift: shift('n1', 'p1', { date: '2026-11-30', pub: undefined }) } });
  assert.equal(r.status, 400);
});

test('the notices about a swap give the shift\'s day and times', async () => {
  const w = world();
  const offer = await w.submit(eli, 'swapOffer', where);
  const r = await w.approve(mia, offer.body.record.id);
  const body = (r.context.bindings.signalRMessages || []).filter(m => m.target === 'notify').map(m => m.arguments[0].body).join(' ');
  assert.match(body, /Nov 17 8a–4p shift/);
});

test('a supervisor\'s change made against an older copy of a shift is refused once the shift has changed', async () => {
  const w = world();
  const seen = shift('s1', 'e1');                       // the shift as the supervisor's screen has it
  w.week().shifts[0] = shift('s1', 'e1', { start: '10:00', end: '18:00' });   // a manager retimed it since
  const upd = await w.submit(sue, 'schedEdit', editOf({ op: 'update', shift: shift('s1', 'e1', { start: '09:00', end: '17:00', pub: undefined }), was: seen }));
  assert.equal(upd.status, 409);
  const rm = await w.submit(sue, 'schedEdit', editOf({ op: 'remove', shiftId: 's1', was: seen }));
  assert.equal(rm.status, 409);
  const ok = await w.submit(sue, 'schedEdit', editOf({ op: 'remove', shiftId: 's1', was: w.week().shifts[0] }));
  assert.equal(ok.status, 200);
});
