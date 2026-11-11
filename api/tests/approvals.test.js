const test = require('node:test'); const assert = require('node:assert');
const path = require('path');
const { loadEndpoint } = require('./helpers/endpoint');

const mia = { id: 'm1', first: 'Mia', last: 'Mgr', workEmail: 'mia@puredental.com', department: 'Front Desk', jobTitle: 'Office Manager', location: 'Manorville', status: 'Active' };
const amy = { id: 'a2', first: 'Amy', last: 'Final', workEmail: 'amy@puredental.com', department: 'Leadership', jobTitle: 'COO', location: 'Manorville', status: 'Active' };
const eli = { id: 'e1', first: 'Eli', last: 'Emp', workEmail: 'eli@puredental.com', department: 'Clinical Team', jobTitle: 'Dental Assistant', location: 'Manorville', managerEmail: 'mia@puredental.com', status: 'Active' };
const employees = [mia, amy, eli];
const support = { users: [], managers: [], approvers: { timeoffFinal: 'amy@puredental.com', offboarding: ['amy@puredental.com'], offer: 'amy@puredental.com' } };

/* a tiny approvals store shared across calls; saves honour If-Match */
function store() {
  const docs = {}; let n = 0;
  const cosmos = async (c) => {
    if (!c.resId.includes('/colls/approvals')) return undefined;
    if (c.verb === 'GET' && c.resId.endsWith('/colls/approvals')) return { status: 200, body: { Documents: Object.values(docs) } };
    if (c.verb === 'GET') { const id = c.resId.split('/').pop(); return docs[id] ? { status: 200, body: docs[id] } : { status: 404, body: {} }; }
    if (c.verb === 'POST') {
      const cur = docs[c.body.id];
      if (c.ifMatch && cur && cur._etag !== c.ifMatch) return { status: 412, body: {} };
      docs[c.body.id] = { ...c.body, _etag: '"v' + (++n) + '"' };
      return { status: 200, body: docs[c.body.id] };
    }
    return undefined;
  };
  return { docs, cosmos };
}
const as = (st, email) => loadEndpoint('approvals', { identity: { email }, employees, support, cosmos: st.cosmos });
const TO = { start: '2026-12-01', end: '2026-12-01', hours: 8, type: 'Vacation' };
const OB = { empId: 'e1', termStatus: 'Resigned', effective: '2026-12-31' };
const notices = (r) => (r.context.bindings.signalRMessages || []).filter(m => m.target === 'notify').map(m => m.userId);

test('the next approver gets a notice when the first step approves', async () => {
  const st = store();
  const sub = await as(st, eli.workEmail).call({ method: 'POST', body: { action: 'submit', kind: 'timeoff', payload: TO } });
  assert.equal(sub.status, 200); assert.deepEqual(notices(sub), ['mia@puredental.com']);
  const r = await as(st, mia.workEmail).call({ method: 'POST', body: { action: 'decide', id: sub.body.record.id, decision: 'approve' } });
  assert.equal(r.status, 200); assert.deepEqual(notices(r), ['amy@puredental.com']);
  assert.ok((r.context.bindings.signalRMessages || []).some(m => m.target === 'approvals-changed' && !m.userId));
});
test('the final approval runs the effect once, and a second decide changes nothing', async () => {
  const st = store();
  const sub = await as(st, mia.workEmail).call({ method: 'POST', body: { action: 'submit', kind: 'offboarding', payload: OB } });
  const ep = as(st, amy.workEmail);
  const mod = require(path.join(__dirname, '..', 'approvals', 'index.js'));
  let ran = 0; mod.EFFECTS.offboarding = async () => { ran++; };
  const first = await ep.call({ method: 'POST', body: { action: 'decide', id: sub.body.record.id, decision: 'approve' } });
  const second = await ep.call({ method: 'POST', body: { action: 'decide', id: sub.body.record.id, decision: 'approve' } });
  assert.equal(first.status, 200); assert.deepEqual(notices(first), ['mia@puredental.com']);
  assert.equal(second.status, 409); assert.equal(ran, 1);
});
test('GET lists only records waiting on the caller', async () => {
  const st = store();
  await as(st, eli.workEmail).call({ method: 'POST', body: { action: 'submit', kind: 'timeoff', payload: TO } });
  const forMia = await as(st, mia.workEmail).call({ method: 'GET' });
  const forAmy = await as(st, amy.workEmail).call({ method: 'GET' });
  const forEli = await as(st, eli.workEmail).call({ method: 'GET' });
  assert.equal(forMia.body.toApprove.length, 1); assert.equal(forAmy.body.toApprove.length, 0);
  assert.equal(forEli.body.toApprove.length, 0); assert.equal(forEli.body.mine.length, 1);
});
test('a submitter with no manager saves nothing', async () => {
  const st = store();
  const r = await loadEndpoint('approvals', { identity: { email: mia.workEmail }, employees, support, cosmos: st.cosmos }).call({ method: 'POST', body: { action: 'submit', kind: 'timeoff', payload: TO } });
  assert.equal(r.status, 409); assert.equal(r.body.error, 'No manager is on file for you. Ask HR to add one.');
  assert.equal(Object.keys(st.docs).length, 0);
});
test('two decides read together: one wins, the other gets 409, and the effect runs once', async () => {
  const st = store();
  const sub = await as(st, mia.workEmail).call({ method: 'POST', body: { action: 'submit', kind: 'offboarding', payload: OB } });
  const ep = as(st, amy.workEmail);
  const mod = require(path.join(__dirname, '..', 'approvals', 'index.js'));
  let ran = 0; mod.EFFECTS.offboarding = async () => { ran++; };
  const [a, b] = await Promise.all([1, 2].map(() => ep.call({ method: 'POST', body: { action: 'decide', id: sub.body.record.id, decision: 'approve' } })));
  assert.deepEqual([a.status, b.status].sort(), [200, 409]); assert.equal(ran, 1);
});
test('an effect that ran is not recorded as failed when the status save fails', async () => {
  const st = store();
  const sub = await as(st, mia.workEmail).call({ method: 'POST', body: { action: 'submit', kind: 'offboarding', payload: OB } });
  let saves = 0;
  const ep = loadEndpoint('approvals', { identity: { email: amy.workEmail }, employees, support, cosmos: async (c) => {
    if (c.verb === 'POST' && c.resId.endsWith('/colls/approvals') && ++saves === 2) return { status: 500, body: {} };
    return st.cosmos(c);
  } });
  const mod = require(path.join(__dirname, '..', 'approvals', 'index.js'));
  mod.EFFECTS.offboarding = async () => {};
  const r = await ep.call({ method: 'POST', body: { action: 'decide', id: sub.body.record.id, decision: 'approve' } });
  assert.equal(r.status, 200);
  assert.notEqual(st.docs[sub.body.record.id].effect, 'failed');
  assert.deepEqual(notices(r), ['mia@puredental.com']);
});
test('an end date before the start date is refused', async () => {
  const st = store();
  const r = await as(st, eli.workEmail).call({ method: 'POST', body: { action: 'submit', kind: 'timeoff', payload: { start: '2026-12-03', end: '2026-12-01', hours: 8, type: 'Vacation' } } });
  assert.equal(r.status, 400); assert.equal(Object.keys(st.docs).length, 0);
});
test('approving as unpaid tells the employee it is unpaid', async () => {
  const st = store();
  const sub = await as(st, eli.workEmail).call({ method: 'POST', body: { action: 'submit', kind: 'timeoff', payload: { start: '2026-12-01', end: '2026-12-03', hours: 24, type: 'Vacation', reason: '' } } });
  await as(st, mia.workEmail).call({ method: 'POST', body: { action: 'decide', id: sub.body.record.id, decision: 'approve' } });
  const r = await as(st, amy.workEmail).call({ method: 'POST', body: { action: 'decide', id: sub.body.record.id, decision: 'approve', option: 'unpaid' } });
  assert.equal(r.status, 200);
  const toEli = (r.context.bindings.signalRMessages || []).find(m => m.target === 'notify' && m.userId === 'eli@puredental.com');
  assert.equal(toEli.arguments[0].body, "Your time off from Dec 1 to Dec 3 is approved as unpaid, because there isn't enough paid time off.");
  assert.equal(st.docs[sub.body.record.id].paid, false);
});
test('the final time-off approval must say paid or unpaid', async () => {
  const st = store();
  const sub = await as(st, eli.workEmail).call({ method: 'POST', body: { action: 'submit', kind: 'timeoff', payload: { start: '2026-12-01', end: '2026-12-01', hours: 8, type: 'Vacation' } } });
  await as(st, mia.workEmail).call({ method: 'POST', body: { action: 'decide', id: sub.body.record.id, decision: 'approve' } });
  const r = await as(st, amy.workEmail).call({ method: 'POST', body: { action: 'decide', id: sub.body.record.id, decision: 'approve' } });
  assert.equal(r.status, 400);
});
test('approved time off in a date range is listed for the caller\'s office, with only the dates', async () => {
  const st = store();
  const oz = { id: 'o1', first: 'Oz', last: 'Other', workEmail: 'oz@puredental.com', department: 'Clinical Team', jobTitle: 'Dental Assistant', location: 'Totowa', status: 'Active' };
  const both = [...employees, oz];
  const mk = (id, who, start, end, status = 'approved', kind = 'timeoff') => { st.docs[id] = { id, kind, submittedBy: who, submittedName: who, status, payload: { start, end, hours: 8, type: 'Sick', reason: 'private' }, steps: [] }; };
  mk('a', 'eli@puredental.com', '2026-12-01', '2026-12-02');
  mk('b', 'eli@puredental.com', '2026-12-20', '2026-12-21');
  mk('c', 'oz@puredental.com', '2026-12-01', '2026-12-01');
  mk('d', 'eli@puredental.com', '2026-12-03', '2026-12-03', 'pending');
  const q = { kind: 'timeoff', status: 'approved', from: '2026-11-30', to: '2026-12-06' };
  const forMia = await loadEndpoint('approvals', { identity: { email: mia.workEmail }, employees: both, support, cosmos: st.cosmos }).call({ method: 'GET', query: q });
  assert.deepEqual(forMia.body.timeOff, [{ email: 'eli@puredental.com', start: '2026-12-01', end: '2026-12-02' }]);
  const forOz = await loadEndpoint('approvals', { identity: { email: oz.workEmail }, employees: both, support, cosmos: st.cosmos }).call({ method: 'GET', query: q });
  assert.deepEqual(forOz.body.timeOff, [{ email: 'oz@puredental.com', start: '2026-12-01', end: '2026-12-01' }]);
});
test('the result goes to the submitter as a message; requests to decide are actions', async () => {
  const st = store();
  const sub = await as(st, mia.workEmail).call({ method: 'POST', body: { action: 'submit', kind: 'offboarding', payload: OB } });
  const ask = (sub.context.bindings.signalRMessages || []).find(m => m.target === 'notify');
  assert.equal(ask.arguments[0].category, 'action');
  const r = await as(st, amy.workEmail).call({ method: 'POST', body: { action: 'decide', id: sub.body.record.id, decision: 'deny' } });
  const result = (r.context.bindings.signalRMessages || []).find(m => m.target === 'notify' && m.userId === 'mia@puredental.com');
  assert.equal(result.arguments[0].category, 'message');
});
test('a manager can start a notice only for their own team', async () => {
  const st = store();
  const oz = { id: 'o1', first: 'Oz', last: 'Other', workEmail: 'oz@puredental.com', department: 'Clinical Team', jobTitle: 'Dental Assistant', location: 'Totowa', status: 'Active' };
  const ep = () => loadEndpoint('approvals', { identity: { email: mia.workEmail }, employees: [...employees, oz], support, cosmos: st.cosmos });
  const outside = await ep().call({ method: 'POST', body: { action: 'submit', kind: 'offboarding', payload: { empId: 'o1', termStatus: 'Resigned', effective: '2026-12-31' } } });
  assert.equal(outside.status, 403);
  const own = await ep().call({ method: 'POST', body: { action: 'submit', kind: 'offboarding', payload: { empId: 'e1', termStatus: 'Resigned', effective: '2026-12-31', first: 'Fake' } } });
  assert.equal(own.status, 200);
  assert.equal(own.body.record.payload.first, 'Eli');   // person details come from the roster
});
test('an employee cannot start an offboarding notice', async () => {
  const st = store();
  const r = await as(st, eli.workEmail).call({ method: 'POST', body: { action: 'submit', kind: 'offboarding', payload: { empId: 'e1', termStatus: 'Resigned', effective: '2026-12-31' } } });
  assert.equal(r.status, 403);
});
const finalNotice = async (payload, option) => {
  const st = store();
  const sub = await as(st, eli.workEmail).call({ method: 'POST', body: { action: 'submit', kind: 'timeoff', payload } });
  await as(st, mia.workEmail).call({ method: 'POST', body: { action: 'decide', id: sub.body.record.id, decision: 'approve' } });
  const r = await as(st, amy.workEmail).call({ method: 'POST', body: { action: 'decide', id: sub.body.record.id, decision: 'approve', option } });
  return (r.context.bindings.signalRMessages || []).find(m => m.target === 'notify' && m.userId === 'eli@puredental.com').arguments[0].body;
};
test('approving as paid, for one day, says so', async () => {
  assert.equal(await finalNotice({ start: '2026-12-01', end: '2026-12-01', hours: 8, type: 'Vacation' }, 'paid'), 'Your time off on Dec 1 is approved.');
});
test('unpaid time off the employee asked for as unpaid gives no balance reason', async () => {
  assert.equal(await finalNotice({ start: '2026-12-01', end: '2026-12-02', hours: 16, type: 'Unpaid' }, 'unpaid'), 'Your time off from Dec 1 to Dec 2 is approved as unpaid.');
});
test('the Offboarding page list: team and own notices for a manager, all for HR, refused for an employee', async () => {
  const st = store();
  const hal = { id: 'h1', first: 'Hal', last: 'HR', workEmail: 'hal@puredental.com', department: 'Human Resources', jobTitle: 'HR Generalist', location: 'Manorville', status: 'Active' };
  const oz = { id: 'o1', first: 'Oz', last: 'Other', workEmail: 'oz@puredental.com', department: 'Clinical Team', jobTitle: 'Dental Assistant', location: 'Totowa', status: 'Active' };
  const all = [...employees, hal, oz];
  const mk = (id, empId, by) => { st.docs[id] = { id, kind: 'offboarding', status: 'pending', submittedBy: by, submittedName: by, payload: { empId, first: empId }, steps: [] }; };
  mk('t', 'e1', 'hal@puredental.com'); mk('x', 'o1', 'hal@puredental.com');
  const get = (email) => loadEndpoint('approvals', { identity: { email }, employees: all, support, cosmos: st.cosmos }).call({ method: 'GET', query: { kind: 'offboarding' } });
  assert.deepEqual((await get(mia.workEmail)).body.offboarding.map(r => r.id), ['t']);
  assert.deepEqual((await get(hal.workEmail)).body.offboarding.map(r => r.id).sort(), ['t', 'x']);
  assert.equal((await get(eli.workEmail)).status, 403);
});
test('nobody starts a notice for themselves, for someone who has left, or twice for one person', async () => {
  const st = store();
  const hal = { id: 'h1', first: 'Hal', last: 'HR', workEmail: 'hal@puredental.com', department: 'Human Resources', jobTitle: 'HR Generalist', location: 'Manorville', status: 'Active' };
  const gone = { id: 'g1', first: 'Gus', last: 'Gone', workEmail: 'gus@puredental.com', location: 'Manorville', status: 'Terminated' };
  const ep = () => loadEndpoint('approvals', { identity: { email: hal.workEmail }, employees: [...employees, hal, gone], support, cosmos: st.cosmos });
  const send = (empId) => ep().call({ method: 'POST', body: { action: 'submit', kind: 'offboarding', payload: { empId, termStatus: 'Resigned', effective: '2026-12-31' } } });
  assert.equal((await send('h1')).status, 403);
  assert.equal((await send('g1')).status, 400);
  assert.equal((await send('e1')).status, 200);
  assert.equal((await send('e1')).status, 409);
});

test('the time-off form fills 8 hours for each weekday in the range, not for weekend days', () => {
  const fs = require('fs'), path = require('path'), vm = require('vm');
  const src = fs.readFileSync(path.join(__dirname, '..', '..', 'notifications.jsx'), 'utf8');
  const at = src.indexOf('function weekdaysBetween(');
  assert.ok(at >= 0);
  const ctx = {}; vm.runInNewContext(src.slice(at, src.indexOf('\n}', at) + 2) + '\nthis.f = weekdaysBetween;', ctx);
  assert.equal(ctx.f('2026-11-13', '2026-11-16'), 2);   // Friday to Monday
  assert.equal(ctx.f('2026-11-14', '2026-11-15'), 0);   // a weekend
  assert.equal(ctx.f('2026-11-16', '2026-11-20'), 5);
  assert.match(src, /weekdaysBetween\(n\.start, n\.end\) \* 8/);
  assert.match(src, /flash\('Couldn’t send the request \(' \+ \(\(e && e\.message\) \|\| 'error'\) \+ '\)', false\)/);
});

test('reading approvals asks the database for the matching requests instead of reading them all', async () => {
  const { loadEndpoint: load } = require('./helpers/endpoint');
  const mia = { id: 'm1', first: 'Mia', last: 'Mgr', workEmail: 'mia@puredental.com', department: 'Front Desk', jobTitle: 'Office Manager', location: 'Manorville', status: 'Active' };
  for (const query of [{}, { kind: 'timeoff', status: 'approved', from: '2026-11-16', to: '2026-11-22' }]) {
    const ep = load('approvals', { identity: { email: mia.workEmail }, employees: [mia], support: { users: [], managers: [] } });
    const r = await ep.call({ method: 'GET', query });
    assert.equal(r.status, 200);
    const whole = ep.calls.filter(c => c.verb === 'GET' && /\/colls\/approvals$/.test(c.resId) && !c.fromQuery);
    assert.equal(whole.length, 0, JSON.stringify(query));
    assert.ok(ep.calls.some(c => c.query && /\/colls\/approvals$/.test(c.resId)));
  }
});
