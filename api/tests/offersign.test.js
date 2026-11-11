const test = require('node:test'); const assert = require('node:assert');
const { loadEndpoint } = require('./helpers/endpoint');

const DAY = 24 * 60 * 60 * 1000;
const rec = (offer = {}) => ({ id: 'c1', office: 'Manorville', name: 'Cal Cand', role: 'Hygienist', stage: 'offer',
  offer: { status: 'sent', role: 'Hygienist', startDate: '2027-01-04', pay: '$41.50', signToken: 'tok-1', signTokenExpires: Date.now() + DAY, ...offer } });
/* a one-record applicants store that keeps what is saved */
function page(first) {
  const docs = { c1: first };
  const ep = loadEndpoint('offersign', { cosmos: async (c) => {
    if (!c.resId.includes('/colls/applicants')) return undefined;
    if (c.verb === 'GET') return { status: 200, body: { Documents: Object.values(docs) } };
    if (c.verb === 'POST') { docs[c.body.id] = c.body; return { status: 200, body: c.body }; }
    return undefined;
  } });
  const saves = () => ep.calls.filter(c => c.verb === 'POST' && c.resId.endsWith('/applicants')).length;
  return { ep, docs, saves, open: (token = 'tok-1') => ep.call({ method: 'GET', token: '', query: { id: 'c1', token } }),
    send: (body, token = 'tok-1') => ep.call({ method: 'POST', token: '', body: { id: 'c1', token, ...body } }) };
}
const PNG = 'data:image/png;base64,iVBORw0KGgo=';

test('the candidate opens the offer with their link and sees the pay', async () => {
  const r = await page(rec()).open();
  assert.equal(r.status, 200); assert.equal(r.body.offer.pay, '$41.50');
});
test('an expired link is refused', async () => {
  const p = page(rec({ signTokenExpires: Date.now() - 1000 }));
  assert.equal((await p.open()).status, 404);
  assert.equal((await p.send({ decision: 'signed', signature: 'Cal Cand' })).status, 404); assert.equal(p.saves(), 0);
});
test('a wrong link is refused', async () => {
  const p = page(rec());
  assert.equal((await p.open('nope')).status, 404);
});
test('a used link is refused, and a second signature changes nothing', async () => {
  const p = page(rec());
  const first = await p.send({ decision: 'signed', signature: 'Cal Cand' });
  assert.equal(first.status, 200); assert.equal(p.docs.c1.offer.status, 'signed'); assert.equal(p.docs.c1.stage, 'hired');
  const signedAt = p.docs.c1.offer.signedAt; const savesAfterFirst = p.saves();
  const second = await p.send({ decision: 'signed', signature: 'Someone Else' });
  assert.equal(second.status, 404); assert.equal(p.saves(), savesAfterFirst);
  assert.equal(p.docs.c1.offer.signature, 'Cal Cand'); assert.equal(p.docs.c1.offer.signedAt, signedAt);
  assert.equal((await p.open()).status, 404);
});
test('a drawn signature is kept with the typed name', async () => {
  const p = page(rec());
  const r = await p.send({ decision: 'signed', signature: 'Cal Cand', signatureImage: PNG });
  assert.equal(r.status, 200); assert.equal(p.docs.c1.offer.signatureImage, PNG);
});
test('a drawing that is not a small PNG image is refused', async () => {
  for (const signatureImage of ['javascript:alert(1)', 'data:text/html;base64,AAAA', 'data:image/png;base64,' + 'A'.repeat(400000)]) {
    const p = page(rec());
    const r = await p.send({ decision: 'signed', signature: 'Cal Cand', signatureImage });
    assert.equal(r.status, 400); assert.equal(p.saves(), 0);
  }
});
test('a failed save tells the candidate plainly, with no database detail', async () => {
  const ep = loadEndpoint('offersign', { cosmos: async (c) => {
    if (c.verb === 'GET' && c.resId.endsWith('/applicants')) return { status: 200, body: { Documents: [rec()] } };
    if (c.verb === 'POST' && c.resId.endsWith('/applicants')) return { status: 503, body: {} };
    return undefined;
  } });
  const r = await ep.call({ method: 'POST', token: '', body: { id: 'c1', token: 'tok-1', decision: 'signed', signature: 'Cal Cand' } });
  assert.equal(r.status, 500); assert.deepEqual(r.body, { error: 'We couldn’t save your answer. Please try again.' });
});
