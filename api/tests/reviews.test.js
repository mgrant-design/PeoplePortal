const test = require('node:test'); const assert = require('node:assert');
const fs = require('fs'); const path = require('path');
const { loadEndpoint } = require('./helpers/endpoint');
const ROOT = path.join(__dirname, '..', '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

const P = (id, first, extra = {}) => ({ id, first, last: first + 'son', workEmail: first.toLowerCase() + '@puredental.com', department: 'Clinical Team', jobTitle: 'Dental Assistant', location: 'Manorville', status: 'Active', ...extra });
const mia = P('m1', 'Mia', { department: 'Front Desk', jobTitle: 'Office Manager' });
const eli = P('e1', 'Eli', { managerEmail: 'mia@puredental.com' });
const pat = P('p1', 'Pat', { managerEmail: 'mia@puredental.com' });
const rex = P('r1', 'Rex', { department: 'Front Desk', jobTitle: 'Office Manager', location: 'Islandia' });
const hal = P('h1', 'Hal', { department: 'Human Resources', jobTitle: 'HR Generalist' });
const employees = [mia, eli, pat, rex, hal];

function world() {
  const store = { reviews: {}, appState: {} };
  let v = 1;
  const cosmos = async (c) => {
    const m = /\/colls\/(reviews|appState)(\/docs\/([^/]+))?$/.exec(c.resId);
    if (!m) return undefined;
    const coll = store[m[1]];
    if (c.verb === 'GET' && m[3]) return coll[m[3]] ? { status: 200, body: coll[m[3]] } : { status: 404, body: {} };
    if (c.verb === 'GET') return { status: 200, body: { Documents: Object.values(coll) } };
    if (c.verb === 'POST') {
      const cur = coll[c.body.id];
      if (!c.upsert && cur) return { status: 409, body: {} };
      if (c.ifMatch && cur && cur._etag !== c.ifMatch) return { status: 412, body: {} };
      coll[c.body.id] = { ...c.body, _etag: '"v' + (++v) + '"' }; return { status: 200, body: coll[c.body.id] };
    }
    return undefined;
  };
  const ep = (who) => loadEndpoint('reviews', { identity: { email: who.workEmail }, employees, support: { users: [], managers: [] }, cosmos });
  return { store, act: (who, body) => ep(who).call({ method: 'POST', body }), get: (who, query = {}) => ep(who).call({ method: 'GET', query }) };
}
const side = (rating, extra = {}) => ({ ratings: { q1: rating }, comments: { q1: 'note ' + rating }, overall: 'overall ' + rating, done: false, ...extra });

test('a saved draft is still there on the next visit', async () => {
  const w = world();
  assert.equal((await w.act(eli, { action: 'save', empId: 'e1', side: 'self', data: side(4) })).status, 200);
  const back = await w.get(eli);
  assert.equal(back.body.review.self.ratings.q1, 4); assert.equal(back.body.review.self.overall, 'overall 4');
});
test('an employee does not see the manager\'s review until the manager shares it', async () => {
  const w = world();
  await w.act(mia, { action: 'save', empId: 'e1', side: 'manager', data: side(3, { done: true }) });
  const before = await w.get(eli);
  assert.equal(before.body.review.manager, undefined); assert.equal(before.body.review.shared, false);
  assert.equal((await w.act(mia, { action: 'share', empId: 'e1' })).status, 200);
  const after = await w.get(eli);
  assert.equal(after.body.review.manager.ratings.q1, 3); assert.equal(after.body.review.shared, true);
});
test('the employee\'s and the manager\'s saves never overwrite each other', async () => {
  const w = world();
  await w.act(eli, { action: 'save', empId: 'e1', side: 'self', data: side(5) });
  await w.act(mia, { action: 'save', empId: 'e1', side: 'manager', data: side(2) });
  await w.act(eli, { action: 'save', empId: 'e1', side: 'self', data: side(4) });
  const r = (await w.get(mia, { empId: 'e1' })).body.review;
  assert.equal(r.self.ratings.q1, 4); assert.equal(r.manager.ratings.q1, 2);
});
test('only the person writes their self-review, and only their manager, HR or leadership the manager review', async () => {
  const w = world();
  assert.equal((await w.act(pat, { action: 'save', empId: 'e1', side: 'self', data: side(1) })).status, 403);
  assert.equal((await w.act(eli, { action: 'save', empId: 'e1', side: 'manager', data: side(5) })).status, 403);
  assert.equal((await w.act(rex, { action: 'save', empId: 'e1', side: 'manager', data: side(1) })).status, 403);
  assert.equal((await w.act(hal, { action: 'save', empId: 'e1', side: 'manager', data: side(3) })).status, 200);
  assert.equal((await w.get(pat, { empId: 'e1' })).status, 403);
});
test('a review is shared only once the manager has finished it, and a shared review is not changed afterwards', async () => {
  const w = world();
  await w.act(mia, { action: 'save', empId: 'e1', side: 'manager', data: side(3) });
  assert.equal((await w.act(mia, { action: 'share', empId: 'e1' })).status, 409);
  await w.act(mia, { action: 'save', empId: 'e1', side: 'manager', data: side(3, { done: true }) });
  await w.act(mia, { action: 'share', empId: 'e1' });
  assert.equal((await w.act(mia, { action: 'save', empId: 'e1', side: 'manager', data: side(1, { done: true }) })).status, 409);
  assert.equal((await w.act(eli, { action: 'save', empId: 'e1', side: 'self', data: side(1) })).status, 409);
});
test('a manager sees their team\'s reviews in one list', async () => {
  const w = world();
  await w.act(eli, { action: 'save', empId: 'e1', side: 'self', data: side(4) });
  await w.act(pat, { action: 'save', empId: 'p1', side: 'self', data: side(2) });
  assert.deepEqual((await w.get(mia, { team: 1 })).body.reviews.map(r => r.empId).sort(), ['e1', 'p1']);
  assert.deepEqual((await w.get(rex, { team: 1 })).body.reviews, []);
});
test('HR and leadership save the review questions for everyone; others cannot', async () => {
  const w = world();
  const qs = [{ id: 'q1', category: 'Teamwork', text: 'Works well with others.' }];
  assert.equal((await w.act(mia, { action: 'questions', questions: qs })).status, 403);
  assert.equal((await w.act(hal, { action: 'questions', questions: qs })).status, 200);
  assert.deepEqual((await w.get(eli)).body.questions, qs);
  assert.equal((await w.act(hal, { action: 'questions', questions: [{ id: 'q1', category: '', text: '' }] })).status, 400);
});

test('the reviews page reads and writes the server, Back keeps what was saved, and the question box keeps focus while typing', () => {
  const src = read('reviews.jsx');
  assert.match(src, /pdApi\('\/api\/reviews'/);
  assert.doesNotMatch(src, /function loadReviews|persistReviews/);
  assert.doesNotMatch(src, /const Form = \(\) =>/, 'a component defined inside another remounts on each keystroke and drops focus');
  assert.doesNotMatch(read('app.jsx'), /pd_review_questions/);
});
test('the employee record\'s Performance tab shows the saved review', () => {
  const src = read('employee.jsx');
  assert.match(src, /pdApi\('\/api\/reviews', \{ query: \{ empId: emp\.id \} \}\)/);
  assert.doesNotMatch(src, /loadReviews/);
});
