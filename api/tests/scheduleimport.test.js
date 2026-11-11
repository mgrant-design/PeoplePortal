const test = require('node:test'); const assert = require('node:assert');
const { loadEndpoint } = require('./helpers/endpoint');

const ada = { id: 'a1', first: 'Ada', last: 'Admin', workEmail: 'ada@puredental.com', department: 'IT', jobTitle: 'Systems', location: 'Manorville', status: 'Active' };
const eli = { id: 'e1', first: 'Eli', last: 'Emp', workEmail: 'eli@puredental.com', department: 'Clinical Team', jobTitle: 'Dental Assistant', location: 'Manorville', status: 'Active' };
const mia = { id: 'm1', first: 'Mia', last: 'Mgr', workEmail: 'mia@puredental.com', department: 'Front Desk', jobTitle: 'Office Manager', location: 'Manorville', status: 'Active' };
const employees = [ada, eli, mia];
const support = { users: [{ email: 'ada@puredental.com', admin: true }], managers: [] };
const WEEK = '2026-11-16';
const row = (shift, office = 'Manorville', weekKey = WEEK) => ({ office, weekKey, shift: { id: 'i-' + shift.start + (shift.empId || 'open'), date: '2026-11-17', end: '16:00', ...shift } });

function world(week) {
  const docs = week ? { [`${WEEK}__Manorville`]: { ...week, _etag: '"w1"' } } : {};
  const cosmos = async (c) => {
    if (!c.resId.includes('/colls/schedules')) return undefined;
    const doc = /\/docs\/([^/]+)$/.exec(c.resId);
    if (c.verb === 'GET' && doc) return docs[doc[1]] ? { status: 200, body: docs[doc[1]] } : { status: 404, body: {} };
    if (c.verb === 'POST') {
      if (c.ifMatch && docs[c.body.id] && docs[c.body.id]._etag !== c.ifMatch) return { status: 412, body: {} };
      docs[c.body.id] = { ...c.body, _etag: '"w2"' }; return { status: 200, body: c.body };
    }
    return undefined;
  };
  const run = (email, body) => loadEndpoint('scheduleimport', { identity: { email }, employees, support, cosmos }).call({ method: 'POST', body });
  return { docs, run, week: () => docs[`${WEEK}__Manorville`] };
}
const publishedWeek = { id: `${WEEK}__Manorville`, office: 'Manorville', weekKey: WEEK, published: true, publishedBy: 'mia@puredental.com', publishedAt: '2026-11-13T12:00:00.000Z', pubEmpIds: ['e1'],
  shifts: [{ id: 'old', empId: 'e1', date: '2026-11-17', start: '07:00', end: '15:00', pub: true }] };

test('importing into a published week leaves it published, in merge and in replace', async () => {
  for (const mode of ['merge', 'replace']) {
    const w = world(publishedWeek);
    const r = await w.run(ada.workEmail, { mode, shifts: [row({ empId: 'e1', start: '08:00' })] });
    assert.equal(r.status, 200, mode);
    assert.equal(w.week().published, true, mode); assert.equal(w.week().publishedBy, 'mia@puredental.com'); assert.deepEqual(w.week().pubEmpIds, ['e1']);
  }
});
test('a week that did not exist before starts unpublished', async () => {
  const w = world(null);
  await w.run(ada.workEmail, { mode: 'merge', shifts: [row({ empId: 'e1', start: '08:00' })] });
  assert.equal(w.week().published, false);
});
test('merge keeps the shifts already in the week', async () => {
  const w = world(publishedWeek);
  await w.run(ada.workEmail, { mode: 'merge', shifts: [row({ empId: 'e1', start: '08:00' })] });
  assert.deepEqual(w.week().shifts.map(s => s.id), ['old', 'i-08:00e1']);
});
test('a row with no person becomes an open shift', async () => {
  const w = world(null);
  const r = await w.run(ada.workEmail, { mode: 'merge', shifts: [row({ empId: '', open: true, start: '10:00', note: 'Unfilled' })] });
  assert.equal(r.status, 200); assert.equal(r.body.written, 1);
  const s = w.week().shifts[0];
  assert.equal(s.open, true); assert.equal(s.empId, ''); assert.equal(s.note, 'Unfilled');
});
test('a row that names someone not on the roster is still left out, and a row with no person that is not an open shift too', async () => {
  const w = world(null);
  const r = await w.run(ada.workEmail, { mode: 'merge', shifts: [row({ empId: 'ghost', start: '08:00' }), row({ empId: '', start: '09:00' }), row({ empId: 'e1', start: '10:00' })] });
  assert.equal(r.body.rejected, 2); assert.equal(r.body.written, 1);
});
test('only an admin imports', async () => {
  const r = await world(null).run(mia.workEmail, { mode: 'merge', shifts: [row({ empId: 'e1', start: '08:00' })] });
  assert.equal(r.status, 403);
});
test('an import that meets a week written to meanwhile says so and writes nothing', async () => {
  const w = world(publishedWeek);
  const ep = loadEndpoint('scheduleimport', { identity: { email: ada.workEmail }, employees, support, cosmos: async (c) => (c.verb === 'POST' && /\/schedules$/.test(c.resId) ? { status: 412, body: {} } : (/\/docs\//.test(c.resId) && c.verb === 'GET' ? { status: 200, body: { ...publishedWeek, _etag: '"w1"' } } : undefined)) });
  const r = await ep.call({ method: 'POST', body: { mode: 'merge', shifts: [row({ empId: 'e1', start: '08:00' })] } });
  assert.equal(r.status, 409);
});

test('an import that stops partway keeps a receipt of the weeks it wrote and says where it stopped', async () => {
  const docs = { [`${WEEK}__Manorville`]: { ...publishedWeek, _etag: '"w1"' }, ['2026-11-23__Manorville']: { ...publishedWeek, id: '2026-11-23__Manorville', weekKey: '2026-11-23', _etag: '"w1"' } };
  const receipts = [];
  const ep = loadEndpoint('scheduleimport', { identity: { email: ada.workEmail }, employees, support, cosmos: async (c) => {
    if (/\/colls\/importLog/.test(c.resId) && c.verb === 'POST') { receipts.push(c.body); return { status: 201, body: c.body }; }
    const doc = /\/schedules\/docs\/([^/]+)$/.exec(c.resId);
    if (doc && c.verb === 'GET') return docs[doc[1]] ? { status: 200, body: docs[doc[1]] } : { status: 404, body: {} };
    if (/\/schedules$/.test(c.resId) && c.verb === 'POST') return c.body.weekKey === '2026-11-23' ? { status: 412, body: {} } : { status: 200, body: c.body };
    return undefined;
  } });
  const r = await ep.call({ method: 'POST', body: { mode: 'merge', shifts: [row({ empId: 'e1', start: '08:00' }), row({ empId: 'e1', start: '08:00' }, 'Manorville', '2026-11-23')] } });
  assert.equal(r.status, 409);
  assert.deepEqual(r.body.weeks, [`${WEEK}__Manorville`]);
  assert.equal(receipts.length, 1); assert.deepEqual(receipts[0].weeks, [`${WEEK}__Manorville`]); assert.match(receipts[0].stopped, /2026-11-23/);
});
