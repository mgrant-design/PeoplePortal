const test = require('node:test'); const assert = require('node:assert');
const fs = require('fs'); const path = require('path');
const { loadEndpoint } = require('./helpers/endpoint');
const ROOT = path.join(__dirname, '..', '..');

const P = (id, first, extra = {}) => ({ id, first, last: first + 'son', workEmail: first.toLowerCase() + '@puredental.com', department: 'Clinical Team', jobTitle: 'Dental Assistant', location: 'Manorville', status: 'Active', ...extra });
const mia = P('m1', 'Mia', { department: 'Front Desk', jobTitle: 'Office Manager' });
const eli = P('e1', 'Eli', { managerEmail: 'mia@puredental.com' });
const pat = P('p1', 'Pat', { managerEmail: 'mia@puredental.com' });
const rex = P('r1', 'Rex', { department: 'Front Desk', jobTitle: 'Office Manager', location: 'Islandia' });
const oz = P('o1', 'Oz', { location: 'Islandia', managerEmail: 'rex@puredental.com' });
const hal = P('h1', 'Hal', { department: 'Human Resources', jobTitle: 'HR Generalist' });
const employees = [mia, eli, pat, rex, oz, hal];
const support = { users: [], managers: [], offices: [{ name: 'Manorville' }, { name: 'Islandia' }], weekStart: 1 };

/* punches, schedules and regular hours kept in memory, with versions and create-only writes */
function world({ shifts = [] } = {}) {
  const store = { punches: {}, schedules: {}, regularHours: {} };
  if (shifts.length) store.schedules['wk'] = { id: 'wk', office: 'Manorville', weekKey: '2026-11-16', published: true, shifts };
  let v = 1; let clock = Date.parse('2026-11-17T13:00:00Z');   // 8:00 am in New York
  const cosmos = async (c) => {
    const m = /\/colls\/(punches|schedules|regularHours)(\/docs\/([^/]+))?$/.exec(c.resId);
    if (!m) return undefined;
    const coll = store[m[1]];
    if (c.verb === 'GET' && m[3]) return coll[m[3]] ? { status: 200, body: coll[m[3]] } : { status: 404, body: {} };
    if (c.verb === 'GET') return { status: 200, body: { Documents: Object.values(coll) } };
    if (c.verb === 'DELETE') { const cur = coll[m[3]]; if (!cur) return { status: 404, body: {} }; if (c.ifMatch && cur._etag !== c.ifMatch) return { status: 412, body: {} }; delete coll[m[3]]; return { status: 204, body: {} }; }
    if (c.verb === 'POST') {
      const cur = coll[c.body.id];
      if (!c.upsert && cur) return { status: 409, body: {} };
      if (c.ifMatch && cur && cur._etag !== c.ifMatch) return { status: 412, body: {} };
      coll[c.body.id] = { ...c.body, _etag: '"v' + (++v) + '"' }; return { status: 200, body: coll[c.body.id] };
    }
    return undefined;
  };
  const as = (who) => {
    const ep = loadEndpoint('timeclock', { identity: { email: who.workEmail }, employees, support, cosmos });
    const realNow = Date.now;
    return { call: async (req) => { Date.now = () => clock; try { return await ep.call(req); } finally { Date.now = realNow; } } };
  };
  const act = (who, body) => as(who).call({ method: 'POST', body });
  const read = (who, query = {}) => as(who).call({ method: 'GET', query });
  return { store, as, act, read, advance: (mins) => { clock += mins * 60000; }, at: () => clock };
}

test('a clock-in survives a reload, and a second clock-in is refused while one is open', async () => {
  const w = world();
  const r = await w.act(eli, { action: 'in', location: 'Manorville' });
  assert.equal(r.status, 200);
  assert.equal((await w.act(eli, { action: 'in', location: 'Manorville' })).status, 409);
  const back = await w.read(eli);   // a fresh page load reads what the server holds
  assert.equal(back.body.open.in, w.at()); assert.equal(back.body.open.location, 'Manorville');
});
test('breaks and clock-out are saved, with the times taken from the server clock', async () => {
  const w = world();
  await w.act(eli, { action: 'in', location: 'Manorville', in: 0 });
  w.advance(240); await w.act(eli, { action: 'break' });
  w.advance(30); await w.act(eli, { action: 'break' });
  w.advance(270); const out = await w.act(eli, { action: 'out', out: 0 });
  assert.equal(out.status, 200);
  const back = await w.read(eli);
  assert.equal(back.body.open, null);
  assert.equal(back.body.punches.length, 1);
  const p = back.body.punches[0];
  assert.equal(p.breakMins, 30); assert.equal(p.out - p.in, 540 * 60000); assert.equal(p.status, 'pending');
});
test('clock-out with nothing open is refused, and an unknown location is refused', async () => {
  const w = world();
  assert.equal((await w.act(eli, { action: 'out' })).status, 409);
  assert.equal((await w.act(eli, { action: 'in', location: 'Nowhere' })).status, 400);
});
test('a manager sees a team member\'s hours; another office\'s manager and teammates do not', async () => {
  const w = world();
  await w.act(eli, { action: 'in', location: 'Manorville' }); w.advance(60); await w.act(eli, { action: 'out' });
  const team = await w.read(mia, { team: 1 });
  assert.equal(team.status, 200);
  assert.deepEqual(team.body.punches.map(p => p.empId), ['e1']);
  assert.deepEqual((await w.read(rex, { team: 1 })).body.punches, []);
  assert.equal((await w.read(pat, { empId: 'e1' })).status, 403);
  assert.equal((await w.read(hal, { empId: 'e1' })).body.punches.length, 1);   // HR sees everyone
});
test('a manager approves a team member\'s finished punch; nobody approves their own or someone else\'s team\'s', async () => {
  const w = world();
  await w.act(eli, { action: 'in', location: 'Manorville' }); w.advance(60); await w.act(eli, { action: 'out' });
  const id = (await w.read(eli)).body.punches[0].id;
  assert.equal((await w.act(eli, { action: 'approve', empId: 'e1', id })).status, 403);
  assert.equal((await w.act(rex, { action: 'approve', empId: 'e1', id })).status, 403);
  assert.equal((await w.act(mia, { action: 'approve', empId: 'e1', id })).status, 200);
  assert.equal((await w.read(eli)).body.punches[0].status, 'approved');
});
test('a clock-in is measured against the person\'s published shift that day, and against nothing when there is none', async () => {
  const w = world({ shifts: [{ id: 's1', empId: 'e1', date: '2026-11-17', start: '07:45', end: '16:00', pub: true }] });
  await w.act(eli, { action: 'in', location: 'Manorville' });
  const open = (await w.read(eli)).body.open;
  assert.equal(open.schedStartMin, 7 * 60 + 45); assert.equal(open.schedLoc, 'Manorville');
  await w.act(pat, { action: 'in', location: 'Manorville' });
  assert.equal((await w.read(pat)).body.open.schedStartMin, null);
});
test('the person\'s own overtime threshold comes back with their punches', async () => {
  const w = world();
  w.store.regularHours['eli@puredental.com'] = { id: 'eli@puredental.com', overtimeThreshold: 35 };
  assert.equal((await w.read(eli)).body.overtimeThreshold, 35);
  assert.equal((await w.read(pat)).body.overtimeThreshold, 40);
});

/* hours per week and overtime, shared by the screens */
const H = require('../../hours.js');
const punch = (startIso, hours, breakMins = 0) => { const s = Date.parse(startIso); return { in: s, out: s + hours * 3600000 + breakMins * 60000, breakMins }; };
test('overtime counts past 40 hours in a week, or past the person\'s own threshold', () => {
  const week = ['2026-11-16T13:00:00Z', '2026-11-17T13:00:00Z', '2026-11-18T13:00:00Z', '2026-11-19T13:00:00Z', '2026-11-20T13:00:00Z'];
  const ps = [...week.map(d => punch(d, 8, 30)), punch('2026-11-21T13:00:00Z', 1)];   // 41 hours worked
  const [w] = H.weeklyTotals(ps, { threshold: 40, weekStart: 1 });
  assert.equal(w.weekKey, '2026-11-16'); assert.equal(w.hours, 41); assert.equal(w.overtime, 1); assert.equal(w.regular, 40);
  assert.equal(H.weeklyTotals(ps, { threshold: 35, weekStart: 1 })[0].overtime, 6);
});
test('hours in two different weeks are never added together for overtime', () => {
  const ps = [punch('2026-11-15T13:00:00Z', 30), punch('2026-11-16T13:00:00Z', 30)];   // a Sunday and the next Monday
  const weeks = H.weeklyTotals(ps, { threshold: 40, weekStart: 1 });
  assert.deepEqual(weeks.map(w => [w.weekKey, w.hours, w.overtime]), [['2026-11-16', 30, 0], ['2026-11-09', 30, 0]]);
});

test('the time clock page shows only what is real', () => {
  const src = fs.readFileSync(path.join(ROOT, 'timeclock.jsx'), 'utf8');
  for (const s of ['Jun 22', 'Location verified', 'synced with Paychex', "setHours(8, 0, 0, 0)", '8:00 AM – 4:00 PM', 'Export', 'later phase', 'loadPunches', 'Discussed punctuality']) assert.ok(!src.includes(s), s);
  assert.match(src, /pdApi\('\/api\/timeclock'/);
  const seed = fs.readFileSync(path.join(ROOT, 'hrseed.jsx'), 'utf8');
  assert.doesNotMatch(seed, /SCHED_START_MIN/, 'with no shift there is no start time to be late against');
});
test('the Paychex switch is off unless an admin turns it on', () => {
  assert.equal(require('../../access-rules.js').FEATURE_DEFAULTS.paychex, false);
});
