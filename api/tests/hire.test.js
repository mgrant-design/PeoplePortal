const test = require('node:test'); const assert = require('node:assert');
const { loadEndpoint } = require('./helpers/endpoint');

const DAY = 24 * 60 * 60 * 1000;
const hal = { id: 'h1', first: 'Hal', last: 'HR', workEmail: 'hal@puredental.com', department: 'Human Resources', jobTitle: 'HR Generalist', location: 'Manorville', status: 'Active' };
const mia = { id: 'm1', first: 'Mia', last: 'Mgr', workEmail: 'mia@puredental.com', department: 'Front Desk', jobTitle: 'Office Manager', location: 'Manorville', status: 'Active' };
const support = { users: [], managers: [], approvers: { offer: 'hal@puredental.com' } };
const cand = (patch = {}, offer = {}) => ({ id: 'c1', office: 'Manorville', name: 'Cal Cand', first: 'Cal', last: 'Cand', email: 'cal@example.com', phone: '(631) 555-0123',
  role: 'Hygienist', dept: 'Hygiene', stage: 'offer', requestedByEmail: 'mia@puredental.com',
  offer: { status: 'sent', role: 'Lead Hygienist', startDate: '2027-01-04', pay: '$41.50', signToken: 'tok-1', signTokenExpires: Date.now() + DAY, ...offer }, ...patch });
/* applicants and roster kept in memory; rosterFails makes roster writes fail */
function world({ applicant = cand(), employees = [hal, mia], rosterFails = false } = {}) {
  const apps = { [applicant.id]: applicant }; const roster = employees.slice(); const state = { rosterFails };
  const cosmos = async (c) => {
    if (c.resId.includes('/colls/applicants')) {
      if (c.verb === 'GET') return { status: 200, body: { Documents: Object.values(apps) } };
      if (c.verb === 'POST') { apps[c.body.id] = c.body; return { status: 200, body: c.body }; }
    }
    if (/\/colls\/audit$/.test(c.resId) && c.verb === 'POST') { state.audits = [...(state.audits || []), c.body]; return { status: 201, body: c.body }; }
    if (c.resId.includes('/colls/roster')) {
      if (c.verb === 'GET') return { status: 200, body: { Documents: roster } };
      if (c.verb === 'POST') {
        if (state.rosterFails) return { status: 503, body: {} };
        const at = roster.findIndex(e => e.id === c.body.id);
        if (at >= 0 && c.upsert) { roster[at] = c.body; return { status: 200, body: c.body }; }
        if (at >= 0) return { status: 409, body: {} };
        if (state.onRosterWrite) state.onRosterWrite(apps);
        roster.push(c.body); return { status: 201, body: c.body };
      }
    }
    return undefined;
  };
  const sign = () => loadEndpoint('offersign', { employees, support, cosmos }).call({ method: 'POST', token: '', body: { id: 'c1', token: 'tok-1', decision: 'signed', signature: 'Cal Cand' } });
  const save = (email, body) => loadEndpoint('applicants', { identity: { email }, employees, support, cosmos }).call({ method: 'POST', body });
  const hires = () => roster.filter(e => e.hiredFromApplicantId);
  return { apps, roster, state, sign, save, hires };
}

test('the candidate\'s signature creates the employee from the offer', async () => {
  const w = world();
  const r = await w.sign();
  assert.equal(r.status, 200);
  const [e] = w.hires();
  assert.equal(w.hires().length, 1);
  assert.deepEqual({ first: e.first, last: e.last, jobTitle: e.jobTitle, department: e.department, location: e.location, startDate: e.startDate, status: e.status },
    { first: 'Cal', last: 'Cand', jobTitle: 'Lead Hygienist', department: 'Hygiene', location: 'Manorville', startDate: '2027-01-04', status: 'Active' });
  assert.equal(e.workEmail, 'cal.cand@puredental.com'); assert.equal(e.personalEmail, 'cal@example.com'); assert.equal(e.mobile, '(631) 555-0123');
  assert.equal(e.managerEmail, 'mia@puredental.com'); assert.equal(e.hiredFromApplicantId, 'c1');
  assert.equal('pay' in e, false);
  assert.equal(w.apps.c1.employeeId, e.id);
  assert.ok((r.context.bindings.signalRMessages || []).some(m => m.target === 'roster-changed'));
});
test('a New Jersey hire gets a foureversmile.com address', async () => {
  const w = world({ applicant: cand({ office: 'Totowa' }) });
  await w.sign();
  assert.equal(w.hires()[0].workEmail, 'cal.cand@foureversmile.com');
});
test('a work email already in use gets a number', async () => {
  const w = world({ employees: [hal, mia, { id: 'x1', first: 'Cal', last: 'Cand', workEmail: 'Cal.Cand@puredental.com', status: 'Active' }] });
  await w.sign();
  assert.equal(w.hires()[0].workEmail, 'cal.cand2@puredental.com');
});
test('accents, spaces and punctuation in a name are left out of the address', async () => {
  const w = world({ applicant: cand({ first: 'María José', last: "O'Neil-Guzmán", name: "María José O'Neil-Guzmán" }) });
  await w.sign();
  assert.equal(w.hires()[0].workEmail, 'mariajose.oneilguzman@puredental.com');
});
test('a signature the approver records by hand creates the employee too', async () => {
  const w = world();
  const r = await w.save(hal.workEmail, cand({ stage: 'hired' }, { status: 'signed', signature: 'Cal Cand', signedAt: 1 }));
  assert.equal(r.status, 200); assert.equal(w.hires().length, 1); assert.equal(w.apps.c1.employeeId, w.hires()[0].id);
});
test('one applicant makes one employee, however many times it is saved', async () => {
  const w = world();
  await w.sign();
  await w.save(hal.workEmail, { ...w.apps.c1, notes: 'again' });
  await w.save(mia.workEmail, { ...w.apps.c1, notes: 'and again', employeeId: undefined });
  assert.equal(w.hires().length, 1);
});
test('if the employee cannot be created, the signature still stands and the next save tries again', async () => {
  const w = world({ rosterFails: true });
  const r = await w.sign();
  assert.equal(r.status, 200); assert.equal(w.apps.c1.offer.status, 'signed'); assert.equal(w.hires().length, 0);
  w.state.rosterFails = false;
  await w.save(mia.workEmail, { ...w.apps.c1, notes: 'Welcome call done' });
  assert.equal(w.hires().length, 1);
});

test('an old signed offer is not turned into a second employee by a later save', async () => {
  const old = cand({ stage: 'hired' }, { status: 'signed', signature: 'Cal Cand', signedAt: 1, signToken: null });
  const w = world({ applicant: old });
  const r = await w.save(hal.workEmail, { ...old, notes: 'a note' });
  assert.equal(r.status, 200); assert.equal(w.hires().length, 0);
});
test('someone already on the roster with the same personal email is linked, not added again', async () => {
  const w = world({ employees: [hal, mia, { id: 'p1', first: 'Calvin', last: 'Candle', workEmail: 'calvin.candle@puredental.com', personalEmail: 'CAL@example.com', status: 'Active' }] });
  await w.sign();
  assert.equal(w.hires().length, 0); assert.equal(w.apps.c1.employeeId, 'p1');
});
test('two signings at once make one employee', async () => {
  const w = world();
  await Promise.all([w.sign(), w.save(hal.workEmail, cand({ stage: 'hired' }, { status: 'signed', signature: 'Cal Cand', signedAt: 1 }))]);
  assert.equal(w.hires().length, 1);
});
test('names with letters that have no plain form still make an address', async () => {
  const w = world({ applicant: cand({ first: 'Øyvind', last: 'Ærø', name: 'Øyvind Ærø' }) });
  await w.sign();
  assert.equal(w.hires()[0].workEmail, 'oyvind.aero@puredental.com');
});
test('a name with no Latin letters makes no employee and the next save tries again', async () => {
  const w = world({ applicant: cand({ first: '李', last: '雷', name: '李 雷' }) });
  const r = await w.sign();
  assert.equal(r.status, 200); assert.equal(w.hires().length, 0); assert.equal(w.apps.c1.hirePending, true);
});
test('a dentist hire keeps provider status', async () => {
  const w = world({ applicant: cand({ provider: true, role: 'Associate Dentist' }, { role: 'Associate Dentist' }) });
  await w.sign();
  const e = w.hires()[0];
  assert.equal(e.provider, true); assert.equal(e.providerType, 'Dentist');
});
test('an edit saved while the employee is being created is not lost', async () => {
  const w = world();
  w.state.onRosterWrite = (apps) => { apps.c1 = { ...apps.c1, notes: 'edited meanwhile' }; };
  await w.sign();
  assert.equal(w.apps.c1.notes, 'edited meanwhile'); assert.ok(w.apps.c1.employeeId); assert.equal(w.apps.c1.hirePending, false);
});
test('the drawn signature is stored but not sent in the applicant list', async () => {
  const png = 'data:image/png;base64,iVBORw0KGgo=';
  const w = world({ applicant: cand({ stage: 'hired', employeeId: 'x' }, { status: 'signed', signature: 'Cal Cand', signatureImage: png }) });
  const list = await loadEndpoint('applicants', { identity: { email: hal.workEmail }, employees: [hal, mia], support, cosmos: async (c) => (c.verb === 'GET' && c.resId.endsWith('/applicants') ? { status: 200, body: { Documents: Object.values(w.apps) } } : undefined) }).call({ method: 'GET' });
  assert.equal(JSON.stringify(list.body).includes('iVBOR'), false);
  await w.save(mia.workEmail, { ...list.body.applicants[0], notes: 'n' });
  assert.equal(w.apps.c1.offer.signatureImage, png);
});

/* ---- employment type, rehires, and a hire that stays a hire ---- */
test('the new hire\'s employment type comes from the offer', async () => {
  const w = world({ applicant: cand({}, { employmentType: 'Part-time' }) });
  await w.sign();
  assert.equal(w.hires()[0].employmentType, 'Part-time');
});
test('someone who worked here before is brought back on their old record, not added twice', async () => {
  const old = { id: 'o9', first: 'Cal', last: 'Cand', workEmail: 'cal.cand@puredental.com', personalEmail: 'cal@example.com', jobTitle: 'Assistant', location: 'Totowa', status: 'Terminated', startDate: '2020-02-03' };
  const w = world({ employees: [hal, mia, old] });
  await w.sign();
  assert.equal(w.roster.length, 3);
  const back = w.roster.find(e => e.id === 'o9');
  assert.equal(back.status, 'Active'); assert.equal(back.startDate, '2027-01-04'); assert.equal(back.jobTitle, 'Lead Hygienist'); assert.equal(back.location, 'Manorville');
  assert.equal(back.hiredFromApplicantId, 'c1'); assert.equal(w.apps.c1.employeeId, 'o9');
});
test('a returning person with a new personal email is found by their mobile number', async () => {
  const old = { id: 'o9', first: 'Cal', last: 'Cand', workEmail: 'cal.cand@puredental.com', personalEmail: 'old@example.com', mobile: '631-555-0123', status: 'Terminated' };
  const w = world({ employees: [hal, mia, old] });
  await w.sign();
  assert.equal(w.roster.length, 3); assert.equal(w.roster.find(e => e.id === 'o9').status, 'Active');
});
test('a save from a browser that has not seen the hire cannot move a hired applicant back', async () => {
  const w = world({ applicant: cand({ stage: 'hired', employeeId: 'e77' }, { status: 'signed' }) });
  const r = await w.save(hal.workEmail, { ...cand({ stage: 'offer' }, { status: 'signed' }), notes: 'stale' });
  assert.equal(r.status, 200);
  assert.equal(w.apps.c1.stage, 'hired'); assert.equal(w.apps.c1.notes, 'stale');
});

test('a new hire who shares a mobile number with a current employee gets their own record', async () => {
  const dee = { id: 'd5', first: 'Dee', last: 'Other', workEmail: 'dee.other@puredental.com', personalEmail: 'dee@example.com', mobile: '631-555-0123', status: 'Active' };
  const w = world({ employees: [hal, mia, dee] });
  await w.sign();
  assert.equal(w.roster.length, 4);
  assert.equal(w.hires().length, 1); assert.equal(w.hires()[0].first, 'Cal'); assert.notEqual(w.apps.c1.employeeId, 'd5');
});
test('bringing someone back writes the status change to the audit log', async () => {
  const old = { id: 'o9', first: 'Cal', last: 'Cand', workEmail: 'cal.cand@puredental.com', personalEmail: 'cal@example.com', status: 'Terminated' };
  const w = world({ employees: [hal, mia, old] });
  await w.sign();
  assert.equal((w.state.audits || []).length, 1);
  const a = w.state.audits[0];
  assert.equal(a.kind, 'status-change'); assert.equal(a.targetId, 'o9'); assert.equal(a.from, 'Terminated'); assert.equal(a.to, 'Active');
  assert.match(a.reason, /signed offer/i);
});
test('a save from a browser that has not seen the hire cannot mark a hired applicant rejected', async () => {
  const w = world({ applicant: cand({ stage: 'hired', employeeId: 'e77' }, { status: 'signed' }) });
  const r = await w.save(hal.workEmail, { ...cand({ stage: 'offer', rejected: true, rejectedAt: 5, rejectedFrom: 'offer' }, { status: 'signed' }) });
  assert.equal(r.status, 200);
  assert.equal(w.apps.c1.stage, 'hired'); assert.ok(!w.apps.c1.rejected); assert.equal(w.apps.c1.rejectedAt, undefined);
});
