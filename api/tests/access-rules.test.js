const test = require('node:test'); const assert = require('node:assert');
const R = require('../../access-rules.js');
const me = (o) => ({ jobTitle: '', department: '', ...o });
test('a payroll department member is HR and sees pay', () => {
  const a = R.deriveAccessCore({ me: me({ department: 'Payroll' }), perms: {}, hasReports: false, isListedManager: false });
  assert.equal(a.level, 'hr'); assert.equal(a.caps.payroll, true); assert.equal(a.caps.viewAll, true);
});
test('an admin flag alone does not show pay', () => {
  const a = R.deriveAccessCore({ me: me({}), perms: { admin: true }, hasReports: false, isListedManager: false });
  assert.equal(a.level, 'admin'); assert.equal(a.caps.payroll, false);
});
test('someone with direct reports is a manager', () => {
  const a = R.deriveAccessCore({ me: me({ jobTitle: 'Office Manager' }), perms: {}, hasReports: true, isListedManager: false });
  assert.equal(a.level, 'manager'); assert.equal(a.caps.viewTeam, true);
});
test('a team lead with no reports is a supervisor', () => {
  const a = R.deriveAccessCore({ me: me({ jobTitle: 'Team Lead' }), perms: {}, hasReports: false, isListedManager: false });
  assert.equal(a.level, 'supervisor');
});
test('a CEO title is leadership and sees everyone', () => {
  const a = R.deriveAccessCore({ me: me({ jobTitle: 'CEO' }), perms: {}, hasReports: false, isListedManager: false });
  assert.equal(a.level, 'leadership'); assert.equal(a.caps.viewAll, true);
});
test('only the three company domains are allowed', () => {
  assert.equal(R.domainAllowed('a.b@foureversmile.com'), true);
  assert.equal(R.domainAllowed('a.b@gmail.com'), false);
});
test('the unread capabilities are gone and recruiting stays', () => {
  const a = R.deriveAccessCore({ me: me({}), perms: { admin: true }, hasReports: false, isListedManager: false });
  for (const k of ['approveOffboard', 'del', 'prehireOnly', 'feedbackManage']) assert.equal(k in a.caps, false);
  assert.equal('isDirector' in a.flags, false);
  assert.equal(a.caps.recruiting, true);
});
test('previewing another level changes the capabilities too', () => {
  const a = R.deriveAccessCore({ me: me({}), perms: { admin: true }, hasReports: false, isListedManager: false, viewAs: 'supervisor' });
  assert.equal(a.level, 'supervisor'); assert.equal(a.caps.viewTeam, true); assert.equal(a.caps.manageUsers, false);
});

test('with no setting, a manager schedules their own office', () => {
  assert.deepEqual(R.schedulableOffices({ me: me({ location: 'Manorville' }), perms: {}, allOffices: ['Manorville', 'Islandia'] }), ['Manorville']);
});
test('all locations gives every office', () => {
  assert.deepEqual(R.schedulableOffices({ me: me({ location: 'Manorville' }), perms: { schedLocations: ['*'] }, allOffices: ['Manorville', 'Islandia'] }), ['Manorville', 'Islandia']);
});
test('a list is limited to real offices', () => {
  assert.deepEqual(R.schedulableOffices({ me: me({ location: 'Islandia' }), perms: { schedLocations: ['Manorville', 'Nowhere'] }, allOffices: ['Manorville', 'Islandia'] }), ['Manorville']);
});
test('Totowa is part of the New Jersey office on the server and the screens', () => {
  assert.equal(R.normLoc('Totowa, NJ'), 'New Jersey');
  assert.equal(R.normLoc(''), 'Unassigned');
});
test('office names are matched by their folded form', () => {
  const allOffices = ['garden city office', 'Manorville'];
  assert.deepEqual(R.schedulableOffices({ me: me({ location: 'Garden City' }), perms: { schedLocations: ['Garden City'] }, allOffices }), ['Garden City']);
  assert.deepEqual(R.schedulableOffices({ me: me({ location: 'Garden City' }), perms: { schedLocations: ['*'] }, allOffices }), ['Garden City', 'Manorville']);
});
test('a person with no location and no setting schedules no real office', () => {
  assert.deepEqual(R.schedulableOffices({ me: me({ location: '' }), perms: {}, allOffices: ['Manorville'] }), ['Unassigned']);
});
test('the reporting tree follows manager emails down every level', () => {
  const people = [
    { id: 'm', workEmail: 'mia@puredental.com' },
    { id: 'e', workEmail: 'eli@puredental.com', managerEmail: 'MIA@puredental.com' },
    { id: 'g', workEmail: 'gus@puredental.com', managerEmail: 'eli@puredental.com' },
    { id: 'x', workEmail: 'xan@puredental.com', managerEmail: 'other@puredental.com' },
  ];
  assert.deepEqual(R.reportingTree(people[0], people).map(e => e.id), ['m', 'e', 'g']);
});
test('the offboarding list scopes by reporting line, not last name', () => {
  const mia = { id: 'm', workEmail: 'mia@puredental.com', last: 'Lee' };
  const people = [mia, { id: 'e', workEmail: 'eli@puredental.com', managerEmail: 'mia@puredental.com' }, { id: 's', workEmail: 'sam@puredental.com', last: 'Lee' }];
  const records = [{ empId: 'e', first: 'Eli' }, { empId: 's', first: 'Sam', manager: 'Pat Lee', requestedBy: 'Kim Lee' }];
  assert.deepEqual(R.offboardingInTree(records, mia, people).map(r => r.first), ['Eli']);
});
test('See Everyone covers a page when its page list is empty or names the page', () => {
  const a = (perms) => R.deriveAccessCore({ me: me({ jobTitle: 'Office Manager' }), perms, hasReports: true, isListedManager: false });
  assert.equal(R.seesAllOn(a({ seeAll: true, seeAllPages: ['offboarding'] }), 'offboarding'), true);
  assert.equal(R.seesAllOn(a({ seeAll: true, seeAllPages: [] }), 'offboarding'), true);
  assert.equal(R.seesAllOn(a({ seeAll: true, seeAllPages: ['reviews'] }), 'offboarding'), false);
  assert.equal(R.seesAllOn(a({}), 'offboarding'), false);
});

test('a birthday without its year, from either stored form, and how it reads', () => {
  assert.equal(R.monthDay('1990-03-14'), '03-14'); assert.equal(R.monthDay('3/4/1988'), '03-04');
  assert.equal(R.monthDay(''), ''); assert.equal(R.monthDay('not a date'), '');
  assert.equal(R.birthdayLabel('03-14'), 'March 14'); assert.equal(R.birthdayLabel('1990-03-14'), '1990-03-14');
});
