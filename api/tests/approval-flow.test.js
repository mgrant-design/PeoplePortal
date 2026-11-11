const test = require('node:test'); const assert = require('node:assert');
const F = require('../_shared/approval-flow');

const eli = { id: 'e1', first: 'Eli', last: 'Emp', workEmail: 'eli@puredental.com', managerEmail: 'Mia@PureDental.com' };
const approvers = { timeoffFinal: 'amanda@puredental.com', offboarding: ['robert@puredental.com', 'amanda@puredental.com'], offer: 'amanda@puredental.com' };
const staff = ['mia', 'amanda', 'robert'].map(n => ({ workEmail: n + '@puredental.com', status: 'Active' }));
const TO = { start: '2026-12-01', end: '2026-12-01', hours: 8, type: 'Vacation' };
const OB = { empId: 'e1', termStatus: 'Resigned', effective: '2026-12-31' };
const make = (kind, submitter = eli, a = approvers) => F.createRecord({ kind, payload: kind === 'timeoff' ? TO : kind === 'offboarding' ? OB : { x: 1 }, submitter, employees: [eli, ...staff], approvers: a, now: 1000 });

test('time off goes to the submitter\'s manager, then the final approver', () => {
  const r = make('timeoff');
  assert.deepEqual(r.steps.map(s => s.who), [['mia@puredental.com'], ['amanda@puredental.com']]);
  assert.equal(r.status, 'pending'); assert.equal(r.submittedBy, 'eli@puredental.com');
});
test('a submitter with no manager is refused before anything saves', () => {
  assert.throws(() => make('timeoff', { ...eli, managerEmail: '' }), e => e.status === 409 && e.message === 'No manager is on file for you. Ask HR to add one.');
});
test('an empty approver setting is refused', () => {
  assert.throws(() => make('offer', eli, {}), e => e.status === 409 && e.message === 'No approver is set for this yet. An admin sets it on the Organization page.');
});
test('someone outside the current step cannot decide', () => {
  assert.throws(() => F.decide(make('timeoff'), { by: 'amanda@puredental.com', decision: 'approve' }, 2000), e => e.status === 403 && e.message === 'This is not yours to decide.');
});
test('a deny ends the flow', () => {
  const out = F.decide(make('timeoff'), { by: 'mia@puredental.com', decision: 'deny', note: 'Short-staffed' }, 2000);
  assert.equal(out.finished, true); assert.equal(out.outcome, 'denied'); assert.equal(out.record.status, 'denied');
});
test('an approval moves to the next step without finishing', () => {
  const out = F.decide(make('timeoff'), { by: 'mia@puredental.com', decision: 'approve' }, 2000);
  assert.equal(out.finished, false); assert.equal(out.outcome, null);
  assert.deepEqual(out.record.steps.map(s => s.status), ['approved', 'pending']);
});
test('any one listed offboarding approver finishes the flow', () => {
  const out = F.decide(make('offboarding'), { by: 'robert@puredental.com', decision: 'approve' }, 2000);
  assert.equal(out.finished, true); assert.equal(out.outcome, 'approved');
});
test('a decided record cannot be decided again', () => {
  const done = F.decide(make('offboarding'), { by: 'robert@puredental.com', decision: 'approve' }, 2000).record;
  assert.throws(() => F.decide(done, { by: 'amanda@puredental.com', decision: 'approve' }, 3000), e => e.status === 409 && e.message === 'This was already decided.');
});
test('an unknown kind is refused', () => {
  assert.throws(() => make('lunch'), e => e.status === 400);
});
test('a manager who has left counts as no manager', () => {
  const mia = { workEmail: 'mia@puredental.com', status: 'Terminated' };
  assert.throws(() => F.createRecord({ kind: 'timeoff', payload: TO, submitter: eli, employees: [eli, mia], approvers, now: 1 }), e => e.status === 409 && /No manager is on file/.test(e.message));
});
test('approvers who have left are skipped', () => {
  const rob = { workEmail: 'robert@puredental.com', status: 'Suspended' };
  const amanda = { workEmail: 'amanda@puredental.com', status: 'Active' };
  const mia = { workEmail: 'mia@puredental.com', status: 'Active' };
  const r = F.createRecord({ kind: 'offboarding', payload: OB, submitter: eli, employees: [eli, rob, amanda, mia], approvers, now: 1 });
  assert.deepEqual(r.steps[0].who, ['amanda@puredental.com']);
});
test('a kind named like a built-in property is refused with 400', () => {
  assert.throws(() => make('constructor'), e => e.status === 400);
});

test('a request records who it is waiting on, step by step, and nobody once it is finished', () => {
  const F = require('../_shared/approval-flow');
  const people = [{ id: 'e', workEmail: 'e@puredental.com', managerEmail: 'm@puredental.com', status: 'Active' }, { id: 'm', workEmail: 'm@puredental.com', status: 'Active' }, { id: 'a', workEmail: 'a@puredental.com', status: 'Active' }];
  const r = F.createRecord({ kind: 'timeoff', payload: { start: '2026-11-16', end: '2026-11-16', hours: 8 }, submitter: people[0], employees: people, approvers: { timeoffFinal: 'a@puredental.com' }, now: 1 });
  assert.deepEqual(r.waitingOn, ['m@puredental.com']);
  const one = F.decide(r, { by: 'm@puredental.com', decision: 'approve' }, 2).record;
  assert.deepEqual(one.waitingOn, ['a@puredental.com']);
  const two = F.decide(one, { by: 'a@puredental.com', decision: 'approve', option: 'paid' }, 3).record;
  assert.deepEqual(two.waitingOn, []);
});
test('the step that chooses paid or unpaid says so on the record itself', () => {
  const F = require('../_shared/approval-flow');
  const people = [{ id: 'e', workEmail: 'e@puredental.com', managerEmail: 'm@puredental.com', status: 'Active' }, { id: 'm', workEmail: 'm@puredental.com', status: 'Active' }, { id: 'a', workEmail: 'a@puredental.com', status: 'Active' }];
  const r = F.createRecord({ kind: 'timeoff', payload: { start: '2026-11-16', end: '2026-11-16', hours: 8 }, submitter: people[0], employees: people, approvers: { timeoffFinal: 'a@puredental.com' }, now: 1 });
  assert.equal(r.steps[0].options, undefined); assert.deepEqual(r.steps[1].options, ['paid', 'unpaid']);
  const src = require('fs').readFileSync(require('path').join(__dirname, '..', '..', 'approvals.jsx'), 'utf8');
  assert.match(src, /record\.steps\[step\]\.options/);
  assert.doesNotMatch(src, /step === record\.steps\.length - 1/);
  const api = require('fs').readFileSync(require('path').join(__dirname, '..', 'approvals', 'index.js'), 'utf8');
  assert.doesNotMatch(api, /record\.steps\[record\.steps\.length - 1\]\.option/);
});
