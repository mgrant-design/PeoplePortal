const test = require('node:test'); const assert = require('node:assert');
const fs = require('fs'); const path = require('path'); const vm = require('vm');
const root = path.join(__dirname, '..', '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
/* one plain function out of a screen file, run on its own */
const fnFrom = (file, name) => {
  const src = read(file); const at = src.indexOf('function ' + name + '(');
  const end = src.indexOf('\nfunction ', at + 1);
  const ctx = {}; vm.runInNewContext(src.slice(at, end) + `\nthis.f = ${name};`, ctx); return ctx.f;
};

test('the dashboard and the sign-in celebration recognise a birthday sent without its year', () => {
  for (const [file, name] of [['dashboard.jsx', 'pdParseDate'], ['celebrate.jsx', 'celebParse']]) {
    const parse = fnFrom(file, name);
    const b = parse('03-14');
    assert.ok(b, file); assert.equal(b.mo, 3, file); assert.equal(b.d, 14, file);
    assert.equal(parse('1990-03-14').y, 1990, file);
  }
});
test('the Directory card shows a manager their team\'s personal email and birthday, as month and day', () => {
  const src = read('directory.jsx');
  const card = src.slice(src.indexOf('function ContactCard'), src.indexOf('function Directory('));
  assert.doesNotMatch(card, /sensitive/);
  assert.match(card, /canRecord && <DRow k="Personal email"/);
  assert.match(card, /canRecord && <DRow k="Date of birth" v=\{PD_ACCESS_RULES\.birthdayLabel\(emp\.birthdate\)\}/);
});
test('the full record shows personal details to whoever may open it, with the birthday as month and day', () => {
  const src = read('employee.jsx');
  assert.doesNotMatch(src, /canSensitive|Personal details visible to HR only/);
  assert.match(src, /<Row k="Personal email" v=\{emp\.personalEmail\} \/>/);
  assert.match(src, /<Row k="Date of birth" v=\{PD_ACCESS_RULES\.birthdayLabel\(emp\.birthdate\)\} \/>/);
});

test('the employee Dashboard counts the days since a start date without crashing', () => {
  const src = read('dashboard.jsx');
  const ctx = {};
  vm.runInNewContext(src.slice(src.indexOf('function pdParseDate('), src.indexOf('function pdToday(')) + src.slice(src.indexOf('function pdDaysSince('), src.indexOf('\n', src.indexOf('function pdDaysSince('))) + '\nthis.f = pdDaysSince;', ctx);
  const ninetyOneDaysAgo = new Date(Date.now() - 91 * 864e5);
  const iso = `${ninetyOneDaysAgo.getFullYear()}-${String(ninetyOneDaysAgo.getMonth() + 1).padStart(2, '0')}-${String(ninetyOneDaysAgo.getDate()).padStart(2, '0')}`;
  assert.ok(ctx.f(iso) >= 90 && ctx.f(iso) <= 92);
  assert.equal(ctx.f(''), null);
  assert.doesNotMatch(src, /s\.getTime\(\)/);
});
test('the Reviews page names no made-up review cycle', () => {
  assert.doesNotMatch(read('reviews.jsx'), /cycle 2026/i);
});
