const test = require('node:test'); const assert = require('node:assert');
const fs = require('fs'); const path = require('path');
const { loadEndpoint } = require('./helpers/endpoint');

const mia = { id: 'm1', first: 'Mia', last: 'Mgr', workEmail: 'mia@puredental.com', department: 'Front Desk', jobTitle: 'Office Manager', location: 'Manorville', status: 'Active' };
const eli = { id: 'e1', first: 'Eli', last: 'Emp', workEmail: 'eli@puredental.com', department: 'Clinical Team', jobTitle: 'Dental Assistant', location: 'Manorville', status: 'Active' };
const oz = { id: 'o1', first: 'Oz', last: 'Other', workEmail: 'oz@puredental.com', department: 'Clinical Team', jobTitle: 'Dental Assistant', location: 'Totowa', status: 'Active' };
const ada = { id: 'a1', first: 'Ada', last: 'Admin', workEmail: 'ada@puredental.com', department: 'IT', jobTitle: 'Systems', location: 'Manorville', status: 'Active' };
const employees = [mia, eli, oz, ada];

/* a one-collection store that keeps what is saved */
function world() {
  const docs = {};
  const cosmos = async (c) => {
    if (!c.resId.includes('/colls/regularHours')) return undefined;
    const one = /\/docs\/([^/]+)$/.exec(c.resId);
    if (c.verb === 'GET' && one) return docs[one[1]] ? { status: 200, body: docs[one[1]] } : { status: 404, body: {} };
    if (c.verb === 'GET') return { status: 200, body: { Documents: Object.values(docs) } };
    if (c.verb === 'POST') { docs[c.body.id] = c.body; return { status: 200, body: c.body }; }
    if (c.verb === 'DELETE' && one) { const had = !!docs[one[1]]; delete docs[one[1]]; return { status: had ? 204 : 404, body: {} }; }
    return undefined;
  };
  return { docs, as: (email) => loadEndpoint('reghours', { identity: { email }, employees, support: { users: [{ email: 'ada@puredental.com', admin: true }], managers: [] }, cosmos }) };
}
const day = { start: '09:00', end: '17:00', breakMins: 30 };

test('a new profile saved by a manager keeps the person\'s office, and the manager reads it back', async () => {
  const w = world();
  // the form sent no office or role for Eli (it built the profile from a short roster entry)
  const saved = await w.as(mia.workEmail).call({ method: 'POST', body: { action: 'save', profile: { id: 'eli@puredental.com', empId: 'e1', office: '', role: '', days: { mon: day } } } });
  assert.equal(saved.status, 200);
  assert.equal(saved.body.profile.office, 'Manorville'); assert.equal(saved.body.profile.role, 'Clinical Team');
  const back = await w.as(mia.workEmail).call({ method: 'GET' });
  assert.deepEqual(back.body.profiles.map(p => p.id), ['eli@puredental.com']);
});
test('a manager cannot set hours for someone at another office, even with no office sent', async () => {
  const r = await world().as(mia.workEmail).call({ method: 'POST', body: { action: 'save', profile: { id: 'oz@puredental.com', empId: 'o1', office: '', days: { mon: day } } } });
  assert.equal(r.status, 403);
});
test('a day\'s own office round-trips', async () => {
  const w = world();
  await w.as(mia.workEmail).call({ method: 'POST', body: { action: 'save', profile: { id: 'eli@puredental.com', empId: 'e1', office: 'Manorville', days: { mon: day, tue: { ...day, office: 'Islandia' } } } } });
  const back = await w.as(mia.workEmail).call({ method: 'GET' });
  const p = back.body.profiles[0];
  assert.equal(p.days.tue.office, 'Islandia'); assert.equal('office' in p.days.mon, false);
});
test('the form builds a blank profile from the person\'s own record, whichever name its office field has', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', '..', 'reghours-core.jsx'), 'utf8');
  const fn = src.slice(src.indexOf('function blankRegHours'), src.indexOf('/* ---- editor'));
  assert.match(fn, /emp\.loc \|\| emp\.location \|\| emp\.office/);
  assert.match(fn, /emp\.department \|\| emp\.dept/);
});

const save = (w, who, profile) => w.as(who.workEmail).call({ method: 'POST', body: { action: 'save', profile: { days: { mon: day }, ...profile } } });
test('a manager cannot write another office\'s profile by sending their own office, or someone else\'s employee id', async () => {
  const w = world();
  assert.equal((await save(w, mia, { id: 'oz@puredental.com', empId: 'o1', office: 'Manorville' })).status, 403);
  assert.equal((await save(w, mia, { id: 'oz@puredental.com', empId: 'e1', office: 'Manorville' })).status, 403);
  assert.deepEqual(Object.keys(w.docs), []);
});
test('a profile keeps the office the form sent, and its employee id comes from the roster', async () => {
  const w = world();
  const r = await save(w, ada, { id: 'oz@puredental.com', empId: 'e1', office: 'Manorville' });
  assert.equal(r.status, 200);
  assert.equal(r.body.profile.office, 'Manorville'); assert.equal(r.body.profile.empId, 'o1');
});
test('a manager files a profile only under their own office', async () => {
  const w = world();
  assert.equal((await save(w, mia, { id: 'eli@puredental.com', office: 'Totowa' })).status, 403);
});
test('hours cannot be saved for someone who is not on the roster', async () => {
  const w = world();
  assert.equal((await save(w, ada, { id: 'nobody@puredental.com' })).status, 404);
});
test('a manager deletes profiles in their own office only; an admin deletes any', async () => {
  const w = world();
  await save(w, ada, { id: 'oz@puredental.com' }); await save(w, ada, { id: 'eli@puredental.com' });
  const del = (who, id) => w.as(who.workEmail).call({ method: 'POST', body: { action: 'delete', id } });
  assert.equal((await del(mia, 'oz@puredental.com')).status, 403);
  assert.ok(w.docs['oz@puredental.com']);
  assert.equal((await del(mia, 'eli@puredental.com')).status, 200);
  assert.equal(w.docs['eli@puredental.com'], undefined);
  assert.equal((await del(ada, 'oz@puredental.com')).status, 200);
  assert.equal(w.docs['oz@puredental.com'], undefined);
});
