const test = require('node:test'); const assert = require('node:assert');
const fs = require('fs'); const path = require('path');
const root = path.join(__dirname, '..', '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const screens = fs.readdirSync(root).filter(f => /\.(jsx|js)$/.test(f));

test('no screen says admins see pay', () => {
  for (const f of screens) assert.doesNotMatch(read(f), /HR, Accounting,? (and|&|&amp;) Admins/, f);
  assert.doesNotMatch(read('applicants.jsx'), /HR &amp; Leadership only|visible only to HR &amp; Leadership/);
});

test('only HR and Accounting see the pay fields in an offer', () => {
  // who may send an offer, and that it carries pay, is checked on the server (applicants.test.js)
  assert.match(read('applicants.jsx'), /const canPay = access\.caps\.payroll;/);
});

test('the sign-in domain check uses the shared rules', () => {
  const r = read('rbac.jsx');
  assert.match(r, /PD_ACCESS_RULES\.domainAllowed/);
  assert.doesNotMatch(r, /COMPANY_DOMAINS\.includes\(d\)/);
});

test('the version check does not count the tests folder as a broken endpoint', async () => {
  const fn = require('../version/index.js');
  const context = { log: () => {}, res: null };
  await fn(context, { method: 'GET', headers: {} });
  const body = typeof context.res.body === 'string' ? JSON.parse(context.res.body) : context.res.body;
  assert.ok(!(body.unregistered || []).includes('tests'), JSON.stringify(body.unregistered));
});

/* ---- Task 4 review: screens follow the new roster rules ---- */
test('the edit dialog asks for a signature when someone leaves Terminated or Suspended', () => {
  const e = read('editrecord.jsx');
  assert.match(e, /SIGNED_STATUSES\.includes\(emp\.status\)/);
  assert.match(e, /Sign and reactivate/);
});
test('managers get an edit form without job title, department or work email', () => {
  const e = read('editrecord.jsx');
  assert.match(e, /MANAGER_FIELDS = ADMIN_FIELDS\.filter/);
  assert.match(read('employee.jsx'), /fields=\{access\.caps\.viewAll \? ADMIN_FIELDS : MANAGER_FIELDS\}/);
});
test('a manager sees no Edit button on their own record', () => {
  assert.match(read('employee.jsx'), /access\.caps\.viewAll \|\| emp\.id !== me\.id/);
});
test('offboarding counts and tabs show only to people who can see offboarding', () => {
  assert.match(read('dashboard.jsx'), /access\.caps\.offboardView &&/);
  assert.match(read('employee.jsx'), /access\.caps\.offboardView \? \['Offboarding'\] : \[\]/);
});
