const test = require('node:test'); const assert = require('node:assert');
const fs = require('fs'); const path = require('path');
const { loadEndpoint } = require('./helpers/endpoint');
const ROOT = path.join(__dirname, '..', '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

const ada = { id: 'a1', first: 'Ada', last: 'Admin', workEmail: 'ada@puredental.com', department: 'IT', jobTitle: 'Systems', location: 'Manorville', status: 'Active' };
const eli = { id: 'e1', first: 'Eli', last: 'Emp', workEmail: 'eli@puredental.com', department: 'Clinical Team', jobTitle: 'Dental Assistant', location: 'Manorville', managerEmail: 'mia@puredental.com', status: 'Active' };
const mia = { id: 'm1', first: 'Mia', last: 'Mgr', workEmail: 'mia@puredental.com', department: 'Front Desk', jobTitle: 'Office Manager', location: 'Manorville', status: 'Active' };
const amy = { id: 'f1', first: 'Amy', last: 'Final', workEmail: 'amy@puredental.com', department: 'Human Resources', jobTitle: 'HR Director', location: 'Manorville', status: 'Active' };
const rob = { id: 'r1', first: 'Rob', last: 'Next', workEmail: 'rob@puredental.com', department: 'Human Resources', jobTitle: 'HR Generalist', location: 'Manorville', status: 'Active' };
const employees = [ada, eli, mia, amy, rob];

/* the appState, accessControl and approvals containers in memory */
function world(support) {
  const store = { appState: { 'roster-support': { id: 'roster-support', type: 'roster-support', _etag: '"s1"', ...support } }, accessControl: {}, approvals: {} };
  [{ id: 'ada@puredental.com', email: 'ada@puredental.com', admin: true }, ...(support.grants || [])].forEach(g => { store.accessControl[g.email] = g; });
  delete store.appState['roster-support'].grants;
  let v = 1;
  const cosmos = async (c) => {
    const m = /\/colls\/(appState|accessControl|approvals)(\/docs\/([^/]+))?$/.exec(c.resId);
    if (!m) return undefined;
    const coll = store[m[1]];
    if (c.verb === 'GET' && m[3]) return coll[m[3]] ? { status: 200, body: coll[m[3]] } : { status: 404, body: {} };
    if (c.verb === 'GET' && m[1] === 'approvals' && store.approvalsDown) return { status: 500, body: {} };
    if (c.verb === 'GET') return { status: 200, body: { Documents: Object.values(coll) } };
    if (c.verb === 'DELETE') { const had = !!coll[m[3]]; delete coll[m[3]]; return { status: had ? 204 : 404, body: {} }; }
    if (c.verb === 'POST') {
      const cur = coll[c.body.id];
      if (c.ifMatch && cur && cur._etag !== c.ifMatch) return { status: 412, body: {} };
      coll[c.body.id] = { ...c.body, _etag: '"v' + (++v) + '"' }; return { status: 200, body: coll[c.body.id] };
    }
    return undefined;
  };
  const as = (who, ep) => loadEndpoint(ep, { identity: { email: who.workEmail }, employees, support: { ...store.appState['roster-support'], users: [{ email: 'ada@puredental.com', admin: true }, ...(store.appState['roster-support'].users || [])] }, cosmos });
  return { store, as };
}

test('removing a grant also clears the old copy of it, so the grant does not come back', async () => {
  const w = world({ users: [{ email: 'eli@puredental.com', canPrint: true }], grants: [{ id: 'eli@puredental.com', email: 'eli@puredental.com', canPrint: true }] });
  const r = await w.as(ada, 'accesscontrol').call({ method: 'POST', body: { email: 'eli@puredental.com', remove: true } });
  assert.equal(r.status, 200);
  assert.equal(w.store.accessControl['eli@puredental.com'], undefined);
  assert.deepEqual(w.store.appState['roster-support'].users, []);
});
test('saving a grant also clears the old copy, so the saved grant is the only one', async () => {
  const w = world({ users: [{ email: 'eli@puredental.com', admin: true }, { email: 'mia@puredental.com', canPrint: true }] });
  await w.as(ada, 'accesscontrol').call({ method: 'POST', body: { email: 'eli@puredental.com', canPrint: true } });
  assert.deepEqual(w.store.appState['roster-support'].users.map(u => u.email), ['mia@puredental.com']);
});
test('permission grants are saved in one place only: the organization settings no longer take them', async () => {
  const w = world({ users: [] });
  const r = await w.as(ada, 'orgconfig').call({ method: 'POST', body: { section: 'users', value: [{ email: 'eli@puredental.com', admin: true }] } });
  assert.equal(r.status, 400);
  assert.doesNotMatch(read('orgconfig.jsx'), /'users',/);
});
test('the module switches save only what differs from the defaults, so a later default reaches everyone who never changed it', () => {
  const src = read('app.jsx');
  const fn = src.slice(src.indexOf('const setFlag = (id, val) =>'), src.indexOf('const flagOn ='));
  assert.match(fn, /FLAG_DEFAULTS\[k\] !== n\[k\]/);
  assert.doesNotMatch(fn, /saveOrgSection\('flags', n\)/);
});
test('when the approver setting changes, requests already waiting on that step go to the new approver, who is told', async () => {
  const w = world({ approvers: { timeoffFinal: 'amy@puredental.com', offboarding: [], offer: '' } });
  const sub = await w.as(eli, 'approvals').call({ method: 'POST', body: { action: 'submit', kind: 'timeoff', payload: { start: '2026-11-16', end: '2026-11-16', hours: 8, type: 'Vacation' } } });
  const id = sub.body.record.id;
  await w.as(mia, 'approvals').call({ method: 'POST', body: { action: 'decide', id, decision: 'approve' } });
  assert.deepEqual(w.store.approvals[id].waitingOn, ['amy@puredental.com']);
  const r = await w.as(ada, 'orgconfig').call({ method: 'POST', body: { section: 'approvers', value: { timeoffFinal: 'rob@puredental.com', offboarding: [], offer: '' } } });
  assert.equal(r.status, 200);
  assert.deepEqual(w.store.approvals[id].waitingOn, ['rob@puredental.com']);
  assert.deepEqual(w.store.approvals[id].steps[1].who, ['rob@puredental.com']);
  const told = (r.context.bindings.signalRMessages || []).filter(m => m.target === 'notify').map(m => m.userId);
  assert.deepEqual(told, ['rob@puredental.com']);
});
test('the Schedules setting says so when a person\'s role cannot schedule', () => {
  const src = read('hradmin.jsx');
  assert.match(src, /No scheduling access/);
  assert.match(src, /deriveAccessCore\(/);
});

const timeoff = { action: 'submit', kind: 'timeoff', payload: { start: '2026-11-16', end: '2026-11-16', hours: 8, type: 'Vacation' } };
const newFinal = { section: 'approvers', value: { timeoffFinal: 'rob@puredental.com', offboarding: [], offer: '' } };
test('a changed approver also gets the requests that have not reached their step yet', async () => {
  const w = world({ approvers: { timeoffFinal: 'amy@puredental.com', offboarding: [], offer: '' } });
  const id = (await w.as(eli, 'approvals').call({ method: 'POST', body: timeoff })).body.record.id;
  const r = await w.as(ada, 'orgconfig').call({ method: 'POST', body: newFinal });
  assert.equal(r.status, 200);
  // still with the manager, so nobody new is told yet
  assert.deepEqual(w.store.approvals[id].waitingOn, ['mia@puredental.com']);
  assert.deepEqual((r.context.bindings.signalRMessages || []).filter(m => m.target === 'notify'), []);
  await w.as(mia, 'approvals').call({ method: 'POST', body: { action: 'decide', id, decision: 'approve' } });
  assert.deepEqual(w.store.approvals[id].waitingOn, ['rob@puredental.com']);
});
test('an approver change that saved says so even when moving the waiting requests fails', async () => {
  const w = world({ approvers: { timeoffFinal: 'amy@puredental.com', offboarding: [], offer: '' } });
  w.store.approvalsDown = true;
  const r = await w.as(ada, 'orgconfig').call({ method: 'POST', body: newFinal });
  assert.equal(r.status, 200);
  assert.equal(w.store.appState['roster-support'].approvers.timeoffFinal, 'rob@puredental.com');
});
