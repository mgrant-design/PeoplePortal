const test = require('node:test'); const assert = require('node:assert');
const fs = require('fs'); const path = require('path');
const { loadEndpoint } = require('./helpers/endpoint');
const ROOT = path.join(__dirname, '..', '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const U = require('../../uniform-rules.js');

const NOW = Date.parse('2026-11-17T15:00:00Z');
const P = (id, first, extra = {}) => ({ id, first, last: first + 'son', workEmail: first.toLowerCase() + '@puredental.com', department: 'Clinical Team', jobTitle: 'Dental Assistant', location: 'Manorville', status: 'Active', startDate: '2025-01-06', employmentType: 'Full-time', ...extra });
const eli = P('e1', 'Eli', { managerEmail: 'mia@puredental.com' });
const pip = P('p1', 'Pip', { employmentType: 'Part-time' });
const bea = P('b1', 'Bea', { employmentType: '' });
const fay = P('f1', 'Fay', { department: 'Front Desk', jobTitle: 'Front Desk Coordinator' });
const new1 = P('n1', 'Ned', { startDate: '2026-10-01' });
const acc = P('a1', 'Abe', { department: 'Accounting', jobTitle: 'Accountant' });
const top = (qty = 1, extra = {}) => ({ productId: 'top', fit: 'Women', size: 'M', color: 'black', qty, ...extra });
const item = (productId, qty = 1) => ({ productId, fit: 'Women', size: 'M', color: 'blue', qty });
const order = (items, extra = {}) => ({ items, logo: 'pure', embroideredName: 'Eli', payMethod: 'payroll', ...extra });

test('a full-time clinical employee gets 2 tops, 2 pants, 2 undershirts and 1 jacket; more is on them', () => {
  const o = U.buildOrder(eli, order([top(3), item('pant_s', 2), item('layer', 2), item('jacket', 1)]), [], NOW);
  const by = Object.fromEntries(o.items.map(i => [i.productId, [i.companyQty, i.employeeQty]]));
  assert.deepEqual(by, { top: [2, 1], pant_s: [2, 0], layer: [2, 0], jacket: [1, 0] });
  assert.equal(o.employeeTotal, 11.5);
});
test('a part-time employee gets 1 of each', () => {
  const o = U.buildOrder(pip, order([top(2)]), [], NOW);
  assert.deepEqual([o.items[0].companyQty, o.items[0].employeeQty], [1, 1]);
});
test('with no full-time or part-time on record, nothing is free for now', () => {
  const o = U.buildOrder(bea, order([top(1)]), [], NOW);
  assert.deepEqual([o.items[0].companyQty, o.items[0].employeeQty], [0, 1]);
  assert.equal(U.eligibility(bea, [], NOW).reason, 'noType');
  assert.equal(U.eligibility(P('d1', 'Dot', { employmentType: 'Per diem' }), [], NOW).reason, 'noType');
});
test('front desk can order only a jacket, paid by payroll deduction', () => {
  assert.throws(() => U.buildOrder(fay, order([top(1)]), [], NOW), (e) => e.status === 400);
  const o = U.buildOrder(fay, order([item('jacket', 1)], { payMethod: 'card' }), [], NOW);
  assert.deepEqual([o.items[0].companyQty, o.items[0].employeeQty, o.payMethod], [0, 1, 'payroll']);
});
test('ordering before day 90 is refused, and so is ordering by someone whose role has no uniforms', () => {
  assert.throws(() => U.buildOrder(new1, order([top(1)]), [], NOW), (e) => e.status === 403 && /90/.test(e.message));
  assert.throws(() => U.buildOrder(acc, order([top(1)]), [], NOW), (e) => e.status === 403);
});
test('the allowance resets every April 1: last year\'s orders do not count', () => {
  const prior = (iso) => [{ status: 'approved', createdAt: iso, items: [{ cat: 'top', companyQty: 2 }] }];
  assert.equal(U.buildOrder(eli, order([top(1)]), prior('2026-03-31T15:00:00Z'), NOW).items[0].companyQty, 1);
  assert.equal(U.buildOrder(eli, order([top(1)]), prior('2026-04-02T15:00:00Z'), NOW).items[0].companyQty, 0);
  assert.equal(U.buildOrder(eli, order([top(1)]), [{ ...prior('2026-04-02T15:00:00Z')[0], status: 'denied' }], NOW).items[0].companyQty, 1);
});
test('prices and items come from the catalog, never from the browser', () => {
  const o = U.buildOrder(eli, order([{ ...top(3), price: 0.01, name: 'Free top' }]), [], NOW);
  assert.equal(o.items[0].price, 11.5); assert.equal(o.items[0].name, 'Modern-Fit V-Neck Top');
  assert.throws(() => U.buildOrder(eli, order([item('cape', 1)]), [], NOW), (e) => e.status === 400);
  assert.throws(() => U.buildOrder(eli, order([{ ...top(1), size: 'Huge' }]), [], NOW), (e) => e.status === 400);
  assert.throws(() => U.buildOrder(eli, order([]), [], NOW), (e) => e.status === 400);
});

/* the order flow, through the approvals */
const denise = P('d9', 'Denise', { department: 'Operations', jobTitle: 'Operations Manager' });
const mia = P('m1', 'Mia', { department: 'Front Desk', jobTitle: 'Office Manager' });
const ada = P('a9', 'Ada', { department: 'IT', jobTitle: 'Systems' });
const people = [eli, pip, denise, mia, ada];
function world(approvers = { uniform: 'denise@puredental.com' }) {
  const store = { approvals: {} }; let v = 1;
  const cosmos = async (c) => {
    const m = /\/colls\/(approvals)(\/docs\/([^/]+))?$/.exec(c.resId);
    if (!m) return undefined;
    const coll = store.approvals;
    if (c.verb === 'GET' && m[3]) return coll[m[3]] ? { status: 200, body: coll[m[3]] } : { status: 404, body: {} };
    if (c.verb === 'GET') return { status: 200, body: { Documents: Object.values(coll) } };
    if (c.verb === 'POST') { const cur = coll[c.body.id]; if (!c.upsert && cur) return { status: 409, body: {} }; if (c.ifMatch && cur && cur._etag !== c.ifMatch) return { status: 412, body: {} }; coll[c.body.id] = { ...c.body, _etag: '"v' + (++v) + '"' }; return { status: 200, body: coll[c.body.id] }; }
    return undefined;
  };
  const ep = (who) => loadEndpoint('approvals', { identity: { email: who.workEmail }, employees: people, support: { users: [{ email: 'ada@puredental.com', admin: true }], managers: [], approvers }, cosmos });
  const call = async (who, req) => { const real = Date.now; Date.now = () => NOW; try { return await ep(who).call(req); } finally { Date.now = real; } };
  return { store, submit: (who, payload) => call(who, { method: 'POST', body: { action: 'submit', kind: 'uniform', payload } }), decide: (who, id, decision) => call(who, { method: 'POST', body: { action: 'decide', id, decision } }),
    list: (who) => call(who, { method: 'GET', query: { kind: 'uniform' } }), sent: (who, ids, sent = true) => call(who, { method: 'POST', body: { action: 'markSent', ids, sent } }) };
}
const told = (r) => (r.context.bindings.signalRMessages || []).filter(m => m.target === 'notify').map(m => m.userId);

test('an order goes to the uniform approver alone, not the employee\'s manager, and the server works out what is free', async () => {
  const w = world();
  const r = await w.submit(eli, order([{ ...top(3), price: 0 }]));
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual(told(r), ['denise@puredental.com']);
  const p = r.body.record.payload;
  assert.deepEqual([p.items[0].companyQty, p.items[0].employeeQty, p.items[0].price, p.employeeTotal], [2, 1, 11.5, 11.5]);
});
test('with no uniform approver chosen, an order is refused and nothing is saved', async () => {
  const w = world({});
  assert.equal((await w.submit(eli, order([top(1)]))).status, 409);
  assert.deepEqual(Object.keys(w.store.approvals), []);
});
test('an earlier order this year uses up the allowance, unless it was denied', async () => {
  const w = world();
  const first = await w.submit(eli, order([top(2)]));
  const second = await w.submit(eli, order([top(1)]));
  assert.equal(second.body.record.payload.items[0].companyQty, 0);
  await w.decide(denise, first.body.record.id, 'deny');
  const third = await w.submit(eli, order([top(1)]));
  assert.equal(third.body.record.payload.items[0].companyQty, 1);
});
test('the approver lists the orders and marks approved ones sent, and back; nobody else can', async () => {
  const w = world();
  const a = await w.submit(eli, order([top(1)])); const b = await w.submit(pip, order([top(1)]));
  await w.decide(denise, a.body.record.id, 'approve');
  assert.equal((await w.list(mia)).status, 403);
  assert.deepEqual((await w.list(denise)).body.orders.map(o => o.id).sort(), [a.body.record.id, b.body.record.id].sort());
  assert.equal((await w.list(ada)).status, 200);   // admins see them too
  assert.equal((await w.sent(mia, [a.body.record.id])).status, 403);
  const r = await w.sent(denise, [a.body.record.id, b.body.record.id]);
  assert.equal(r.status, 200);
  assert.equal(w.store.approvals[a.body.record.id].sent, true);
  assert.ok(!w.store.approvals[b.body.record.id].sent, 'a pending order is not marked sent');
  await w.sent(denise, [a.body.record.id], false);
  assert.equal(w.store.approvals[a.body.record.id].sent, false);
});

test('the uniform approver is chosen on the Organization page', async () => {
  assert.match(read('orgeditor.jsx'), /single\('uniform'/);
  const support = { users: [{ email: 'ada@puredental.com', admin: true }], managers: [] };
  const docs = { 'roster-support': { id: 'roster-support', type: 'roster-support', _etag: '"1"' } };
  const ep = loadEndpoint('orgconfig', { identity: { email: ada.workEmail }, employees: people, support, accessDocs: [{ id: 'ada@puredental.com', email: 'ada@puredental.com', admin: true }], cosmos: async (c) => {
    if (!/\/colls\/appState/.test(c.resId)) return undefined;
    if (c.verb === 'GET') return { status: 200, body: { Documents: Object.values(docs) } };
    if (c.verb === 'POST') { docs[c.body.id] = { ...c.body, _etag: '"2"' }; return { status: 200, body: c.body }; }
  } });
  const r = await ep.call({ method: 'POST', body: { section: 'approvers', value: { timeoffFinal: '', offboarding: [], offer: '', uniform: 'Denise@puredental.com' } } });
  assert.equal(r.status, 200); assert.equal(docs['roster-support'].approvers.uniform, 'denise@puredental.com');
});
test('Scrubs is called Uniforms wherever a person sees it, and the page shows only what is real', () => {
  const app = read('app.jsx'), page = read('scrubs.jsx'), data = read('scrubs-data.jsx'), dash = read('dashboard.jsx');
  assert.doesNotMatch(app, /label: 'Scrubs/); assert.match(app, /label: 'Uniforms'/);
  for (const s of ['Staff Scrub Orders', 'Shop Scrubs', 'PRODUCT PHOTO COMING SOON', 'Reset demo', 'eligibility review', 'Analytics', 'Mark delivered', 'Upload invoice', 'CID', 'Charge a card at checkout', 'Goes to your manager'])
    assert.ok(!page.includes(s) && !data.includes(s), s);
  assert.doesNotMatch(dash, /scrubs allowance|clinical wear/i);
  assert.match(page, /'Sent'/); assert.match(page, /markSent/);
});
test('full-time or part-time comes from the person\'s record, never from their employee number', () => {
  const rb = read('reportbuilder.jsx');
  assert.doesNotMatch(rb, /hashId\(e\.id \+ 'ft'\)/);
  assert.match(rb, /employmentType/);
});
