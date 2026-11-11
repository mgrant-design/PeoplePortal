const test = require('node:test'); const assert = require('node:assert');
const { loadEndpoint } = require('./helpers/endpoint');

const ada = { id: 'a1', first: 'Ada', last: 'Admin', workEmail: 'ada@puredental.com', department: 'IT', jobTitle: 'Systems', location: 'Manorville', status: 'Active' };
const eli = { id: 'e1', first: 'Eli', last: 'Emp', workEmail: 'eli@puredental.com', department: 'Clinical Team', jobTitle: 'Dental Assistant', location: 'Manorville', status: 'Active' };
const mia = { id: 'm1', first: 'Mia', last: 'Mgr', workEmail: 'mia@puredental.com', department: 'Front Desk', jobTitle: 'Office Manager', location: 'Manorville', status: 'Active' };
const employees = [ada, eli, mia];
const support = { users: [{ email: 'ada@puredental.com', admin: true }], managers: [] };
const WEEK = '2026-11-16', ID = `${WEEK}__Manorville`;
const stored = () => ({ id: ID, office: 'Manorville', weekKey: WEEK, published: true, publishedBy: 'mia@puredental.com', pubEmpIds: ['e1'], shifts: [{ id: 'old', empId: 'e1', date: '2026-11-17', start: '07:00', end: '15:00', pub: true }], _etag: '"w1"' });

/* a week store that can answer a read with any status, and models create-only writes */
function world({ readStatus = 200, have = true, beforeWrite } = {}) {
  const docs = have ? { [ID]: stored() } : {};
  const writes = [];
  const cosmos = async (c) => {
    if (!c.resId.includes('/colls/schedules')) return undefined;
    const doc = /\/docs\/([^/]+)$/.exec(c.resId);
    if (c.verb === 'GET' && doc) {
      if (readStatus !== 200) return { status: readStatus, body: {} };
      return docs[doc[1]] ? { status: 200, body: docs[doc[1]] } : { status: 404, body: {} };
    }
    if (c.verb === 'POST') {
      if (beforeWrite) { beforeWrite(docs); }
      writes.push({ id: c.body.id, upsert: !!c.upsert, ifMatch: c.ifMatch });
      const cur = docs[c.body.id];
      if (!c.upsert && cur) return { status: 409, body: {} };
      if (c.ifMatch && cur && cur._etag !== c.ifMatch) return { status: 412, body: {} };
      docs[c.body.id] = { ...c.body, _etag: '"w2"' }; return { status: 200, body: docs[c.body.id] };
    }
    return undefined;
  };
  const call = (ep, email, body) => loadEndpoint(ep, { identity: { email }, employees, support, cosmos }).call({ method: 'POST', body });
  return { docs, writes, call };
}
const add = { id: 'n1', empId: 'e1', date: '2026-11-18', start: '08:00', end: '16:00' };

test('a week read that fails is not taken for a week that does not exist: a save writes nothing', async () => {
  for (const readStatus of [429, 500]) {
    const w = world({ readStatus });
    const r = await w.call('schedule', mia.workEmail, { action: 'save', office: 'Manorville', weekKey: WEEK, changes: { add: [add], update: [], remove: [] } });
    assert.notEqual(r.status, 200, String(readStatus)); assert.equal(w.writes.length, 0, String(readStatus));
    assert.equal(w.docs[ID].shifts.length, 1);
  }
});
test('a week read that fails is not taken for a week that does not exist: an import writes nothing', async () => {
  const w = world({ readStatus: 429 });
  const r = await w.call('scheduleimport', ada.workEmail, { mode: 'replace', shifts: [{ office: 'Manorville', weekKey: WEEK, shift: { ...add } }] });
  assert.notEqual(r.status, 200); assert.equal(w.writes.length, 0);
  assert.equal(w.docs[ID].shifts.length, 1);
});
test('a week that is new is written create-only, so a second writer cannot overwrite it', async () => {
  const w = world({ have: false });
  const r = await w.call('schedule', mia.workEmail, { action: 'save', office: 'Manorville', weekKey: WEEK, changes: { add: [add], update: [], remove: [] } });
  assert.equal(r.status, 200);
  assert.equal(w.writes[0].upsert, false);
  const second = await w.call('scheduleimport', ada.workEmail, { mode: 'replace', shifts: [{ office: 'Manorville', weekKey: WEEK, shift: { ...add, id: 'x' } }] });
  assert.equal(second.status, 200);   // the week exists now, so this one reads it and updates with its version
  assert.equal(w.writes[1].upsert, true);
});
test('a save that finds the week was created by someone else in between is told to retry, and overwrites nothing', async () => {
  const w = world({ have: false, beforeWrite: (docs) => { docs[ID] = stored(); } });
  const r = await w.call('schedule', mia.workEmail, { action: 'save', office: 'Manorville', weekKey: WEEK, changes: { add: [add], update: [], remove: [] } });
  assert.equal(r.status, 409);
  assert.deepEqual(w.docs[ID].shifts.map(s => s.id), ['old']);
});
