const test = require('node:test'); const assert = require('node:assert');
const { loadEndpoint } = require('./helpers/endpoint');

const hal = { id: 'h1', first: 'Hal', last: 'HR', workEmail: 'hal@puredental.com', department: 'Human Resources', jobTitle: 'HR Generalist', location: 'Manorville' };
const ada = { id: 'a1', first: 'Ada', last: 'Admin', workEmail: 'ada@puredental.com', department: 'IT', jobTitle: 'Systems', location: 'Manorville' };
const mia = { id: 'm1', first: 'Mia', last: 'Mgr', workEmail: 'mia@puredental.com', department: 'Front Desk', jobTitle: 'Office Manager', location: 'Manorville' };
const employees = [hal, ada, mia];
const support = { users: [{ email: 'ada@puredental.com', admin: true }], managers: [], approvers: { timeoffFinal: '', offboarding: [], offer: 'hal@puredental.com' } };
const CHAT = 'https://chat.test/hook';
test.beforeEach(() => { process.env.APPLICANTS_GCHAT_WEBHOOK = CHAT; });
const stored = () => [
  { id: 'c1', office: 'Manorville', name: 'Cal Cand', role: 'Hygienist', stage: 'offer', offer: { status: 'draft', role: 'Hygienist', payType: 'Hourly', pay: '$41.50' }, workingInterview: { status: 'scheduled', hours: '4', rate: '$38.00' } },
  { id: 'c2', office: 'Totowa', name: 'Tia Cand', role: 'Assistant', stage: 'applied' },
];
const as = (email, docs = stored()) => loadEndpoint('applicants', { identity: { email }, employees, support,
  cosmos: async (c) => (c.verb === 'GET' && c.resId.endsWith('/applicants') ? { status: 200, body: { Documents: docs } } : undefined) });
const saved = (ep) => ep.calls.find(c => c.verb === 'POST' && c.resId.endsWith('/applicants'));
const c1 = (patch = {}) => ({ ...stored()[0], ...patch });

test('a save made by a test is recorded, not sent to the Chat space', async () => {
  const ep = as(hal.workEmail);
  const r = await ep.call({ method: 'POST', body: c1({ stage: 'hired' }) });
  assert.equal(r.status, 200);
  assert.equal(ep.net.length, 1); assert.equal(ep.net[0].hostname, 'chat.test');
});
test('a manager lists only their office', async () => {
  const r = await as(mia.workEmail).call({ method: 'GET' });
  assert.deepEqual(r.body.applicants.map(a => a.id), ['c1']);
});
test('a manager\'s list carries no pay', async () => {
  const r = await as(mia.workEmail).call({ method: 'GET' });
  const a = r.body.applicants[0];
  assert.equal('pay' in a.offer, false); assert.equal('rate' in a.workingInterview, false);
  assert.equal(JSON.stringify(r.body).includes('41.50'), false); assert.equal(JSON.stringify(r.body).includes('38.00'), false);
  assert.equal(a.offer.role, 'Hygienist'); assert.equal(a.workingInterview.hours, '4');
});
test('an admin\'s list carries no pay', async () => {
  const r = await as(ada.workEmail).call({ method: 'GET' });
  assert.equal(JSON.stringify(r.body).includes('41.50'), false);
});
test('HR\'s list carries pay', async () => {
  const r = await as(hal.workEmail).call({ method: 'GET' });
  const a = r.body.applicants.find(x => x.id === 'c1');
  assert.equal(a.offer.pay, '$41.50'); assert.equal(a.workingInterview.rate, '$38.00');
});
test('a manager\'s save keeps the stored pay and sends none back', async () => {
  const ep = as(mia.workEmail);
  const r = await ep.call({ method: 'POST', body: c1({ offer: { status: 'draft', role: 'Lead Hygienist', payType: 'Hourly' }, workingInterview: { status: 'scheduled', hours: '6' } }) });
  assert.equal(r.status, 200);
  assert.equal(saved(ep).body.offer.pay, '$41.50'); assert.equal(saved(ep).body.offer.role, 'Lead Hygienist');
  assert.equal(saved(ep).body.workingInterview.rate, '$38.00'); assert.equal(saved(ep).body.workingInterview.hours, '6');
  assert.equal(JSON.stringify(r.body).includes('41.50'), false); assert.equal(JSON.stringify(r.body).includes('38.00'), false);
});
test('a manager cannot set or change pay', async () => {
  const changed = as(mia.workEmail);
  await changed.call({ method: 'POST', body: c1({ offer: { status: 'draft', pay: '$99.00' }, workingInterview: { status: 'scheduled', rate: '$99.00' } }) });
  assert.equal(saved(changed).body.offer.pay, '$41.50'); assert.equal(saved(changed).body.workingInterview.rate, '$38.00');
  const fresh = as(mia.workEmail);
  await fresh.call({ method: 'POST', body: { id: 'c9', office: 'Manorville', name: 'New Cand', offer: { status: 'draft', pay: '$99.00' } } });
  assert.equal('pay' in saved(fresh).body.offer, false);
});
test('HR sets the pay', async () => {
  const ep = as(hal.workEmail);
  const r = await ep.call({ method: 'POST', body: c1({ offer: { status: 'draft', pay: '$44.00' } }) });
  assert.equal(saved(ep).body.offer.pay, '$44.00'); assert.equal(r.body.applicant.offer.pay, '$44.00');
});
test('the Chat notice about an offer carries no pay', async () => {
  const ep = as(hal.workEmail);
  await ep.call({ method: 'POST', body: c1({ _offerAction: 'submit', offer: { status: 'pending_approval', pay: '$41.50' } }) });
  assert.equal(ep.net.length, 1); assert.equal(ep.net[0].body.includes('41.50'), false);
});
test('when the stored record cannot be read, the save is refused, so stored pay and the link are never wiped', async () => {
  for (const who of [mia, hal]) {
    const ep = loadEndpoint('applicants', { identity: { email: who.workEmail }, employees, support,
      cosmos: async (c) => (c.verb === 'GET' && c.resId.endsWith('/applicants') ? { status: 500, body: {} } : undefined) });
    const r = await ep.call({ method: 'POST', body: c1({ stage: 'hired' }) });
    assert.equal(r.status, 500); assert.equal(saved(ep), undefined);
  }
});
const removed = (ep) => ep.calls.filter(c => c.verb === 'DELETE').map(c => [c.resId.split('/').pop(), c.partitionKey]);
test('moving an applicant to another office leaves one record', async () => {
  const ep = as(hal.workEmail);
  const r = await ep.call({ method: 'POST', body: c1({ office: 'Totowa' }) });
  assert.equal(r.status, 200); assert.equal(saved(ep).partitionKey, 'Totowa');
  assert.deepEqual(removed(ep), [['c1', 'Manorville']]);
});
test('a manager cannot save another office\'s applicant under their own office', async () => {
  const ep = as(mia.workEmail);
  const r = await ep.call({ method: 'POST', body: { id: 'c2', office: 'Manorville', name: 'Tia Cand' } });
  assert.equal(r.status, 403); assert.equal(saved(ep), undefined);
});
test('when two copies of an applicant exist, a save keeps the one at its office and removes the other', async () => {
  const docs = [{ ...stored()[0], office: 'Totowa', offer: { status: 'draft', pay: '$10.00' } }, stored()[0]];
  const ep = as(hal.workEmail, docs);
  const mgr = as(ada.workEmail, docs);
  await mgr.call({ method: 'POST', body: c1({ offer: { status: 'draft' } }) });
  assert.equal(saved(mgr).body.offer.pay, '$41.50');
  await ep.call({ method: 'POST', body: c1() });
  assert.deepEqual(removed(ep), [['c1', 'Totowa']]);
});
test('an offer or working interview that is not a record is refused', async () => {
  for (const patch of [{ offer: 'none' }, { offer: [1] }, { workingInterview: 7 }]) {
    const ep = as(mia.workEmail);
    const r = await ep.call({ method: 'POST', body: c1(patch) });
    assert.equal(r.status, 400, JSON.stringify(patch)); assert.equal(saved(ep), undefined);
  }
});
test('each endpoint\'s outside calls are recorded under that endpoint', async () => {
  const a = as(hal.workEmail);
  const b = as(hal.workEmail);
  await a.call({ method: 'POST', body: c1({ stage: 'hired' }) });
  assert.equal(a.net.length, 1); assert.equal(b.net.length, 0);
});
test('a failed Chat post is reported in the answer and the save still succeeds', async () => {
  const ep = loadEndpoint('applicants', { identity: { email: hal.workEmail }, employees, support, netStatus: 500,
    cosmos: async (c) => (c.verb === 'GET' && c.resId.endsWith('/applicants') ? { status: 200, body: { Documents: stored() } } : undefined) });
  const r = await ep.call({ method: 'POST', body: c1({ stage: 'hired' }) });
  assert.equal(r.status, 200); assert.equal(r.body.notify.gchat, false);
});

/* ---- the offer approver and the Chat address come from settings ---- */
const submit = (ep, patch = {}) => ep.call({ method: 'POST', body: c1({ _offerAction: 'submit', offer: { ...stored()[0].offer, status: 'pending_approval' }, ...patch }) });
const approve = (ep, patch = {}) => ep.call({ method: 'POST', headers: { host: 'portal.test' }, body: c1({ _offerAction: 'approve', offer: { ...stored()[0].offer, status: 'sent' }, ...patch }) });
const noticesTo = (r) => (r.context.bindings.signalRMessages || []).filter(m => m.target === 'notify');

test('with no Chat address set, a save posts nothing and says so', async () => {
  delete process.env.APPLICANTS_GCHAT_WEBHOOK;
  const ep = as(hal.workEmail);
  const r = await ep.call({ method: 'POST', body: c1({ stage: 'hired' }) });
  assert.equal(r.status, 200); assert.equal(ep.net.length, 0); assert.equal(r.body.notify.gchat, false);
});
test('a manager submits an offer, and the approver is told in the portal without the pay', async () => {
  const ep = as(mia.workEmail);
  const r = await submit(ep, { offer: { status: 'pending_approval', role: 'Hygienist' } });
  assert.equal(r.status, 200);
  const n = noticesTo(r);
  assert.deepEqual(n.map(m => m.userId), ['hal@puredental.com']);
  assert.deepEqual(n[0].arguments[0].deepLink, { view: 'applicants', applicantId: 'c1' });
  assert.equal(JSON.stringify(n).includes('41.50'), false);
  assert.equal(saved(ep).body.offer.pay, '$41.50');
});
test('with no offer approver set, submitting is refused', async () => {
  const ep = loadEndpoint('applicants', { identity: { email: mia.workEmail }, employees, support: { ...support, approvers: { offer: '' } },
    cosmos: async (c) => (c.verb === 'GET' && c.resId.endsWith('/applicants') ? { status: 200, body: { Documents: stored() } } : undefined) });
  const r = await submit(ep);
  assert.equal(r.status, 409); assert.equal(r.body.error, 'No approver is set for this yet. An admin sets it on the Organization page.');
  assert.equal(saved(ep), undefined);
});
test('only the set approver can approve and send an offer', async () => {
  const admin = as(ada.workEmail);
  assert.equal((await approve(admin)).status, 403); assert.equal(saved(admin), undefined);
  const ep = as(hal.workEmail);
  const r = await approve(ep);
  assert.equal(r.status, 200); assert.equal(saved(ep).body.offer.status, 'sent');
  assert.ok(saved(ep).body.offer.signToken);
  assert.ok(ep.net[0].body.includes('approved by Hal HR'));
});
test('the approver\'s changes are what is stored and sent', async () => {
  const ep = as(hal.workEmail);
  await approve(ep, { offer: { ...stored()[0].offer, status: 'sent', pay: '$45.00', role: 'Lead Hygienist' } });
  assert.equal(saved(ep).body.offer.pay, '$45.00'); assert.equal(saved(ep).body.offer.role, 'Lead Hygienist');
});
test('an offer cannot go out without pay', async () => {
  const ep = as(hal.workEmail);
  const r = await approve(ep, { offer: { status: 'sent', role: 'Hygienist', pay: '' } });
  assert.equal(r.status, 400); assert.equal(saved(ep), undefined);
});

/* ---- a sent offer: the candidate's link, and who may change it ---- */
const sentDocs = () => [{ ...stored()[0], offer: { status: 'sent', role: 'Hygienist', payType: 'Hourly', pay: '$41.50', signToken: 'real-token', signTokenExpires: 99 } }];
const sentRec = (patch = {}, offerPatch = {}) => ({ ...sentDocs()[0], offer: { status: 'sent', role: 'Hygienist', payType: 'Hourly', ...offerPatch }, ...patch });
test('a later save keeps the candidate\'s link working', async () => {
  const ep = as(mia.workEmail, sentDocs());
  const r = await ep.call({ method: 'POST', body: sentRec({ notes: 'Called to confirm' }) });
  assert.equal(r.status, 200);
  assert.equal(saved(ep).body.offer.signToken, 'real-token'); assert.equal(saved(ep).body.offer.signTokenExpires, 99);
  assert.equal(JSON.stringify(r.body).includes('real-token'), false);
});
test('nobody can plant a candidate link', async () => {
  const onSent = as(mia.workEmail, sentDocs());
  await onSent.call({ method: 'POST', body: sentRec({}, { signToken: 'mine', signTokenExpires: 1 }) });
  assert.equal(saved(onSent).body.offer.signToken, 'real-token');
  const onDraft = as(mia.workEmail);
  await onDraft.call({ method: 'POST', body: c1({ offer: { ...stored()[0].offer, signToken: 'mine' } }) });
  assert.equal('signToken' in saved(onDraft).body.offer, false);
});
test('after an offer is sent, a change to it by anyone but the approver is not kept', async () => {
  const kept = sentDocs()[0].offer;
  for (const body of [sentRec({}, { role: 'Lead Hygienist' }), sentRec({}, { status: 'draft' }), { ...sentDocs()[0], offer: null }, sentRec({ notes: 'from an old page' }, { status: 'pending_approval' })]) {
    const ep = as(mia.workEmail, sentDocs());
    const r = await ep.call({ method: 'POST', body });
    assert.equal(r.status, 200); assert.deepEqual(saved(ep).body.offer, kept);
  }
  const ep = as(hal.workEmail, sentDocs());
  const r = await ep.call({ method: 'POST', body: sentRec({}, { status: 'draft', pay: '$41.50' }) });
  assert.equal(r.status, 200); assert.equal(saved(ep).body.offer.status, 'draft');
  assert.equal('signToken' in saved(ep).body.offer, false);   // the old link stops working while it is revised
});
test('after the candidate answers through their link, other saves still go through', async () => {
  const signed = [{ ...stored()[0], stage: 'hired', offer: { status: 'signed', role: 'Hygienist', pay: '$41.50', signature: 'Cal Cand', signToken: null, signTokenExpires: null } }];
  for (const who of [mia, ada]) {
    const ep = as(who.workEmail, signed);
    const r = await ep.call({ method: 'POST', body: { ...signed[0], notes: 'Start paperwork', offer: { status: 'signed', role: 'Hygienist', signature: 'Cal Cand', signToken: null, signTokenExpires: null } } });
    assert.equal(r.status, 200); assert.equal(saved(ep).body.notes, 'Start paperwork');
    assert.deepEqual(saved(ep).body.offer, signed[0].offer);
  }
});
test('a Chat post about an offer needs a real change to the offer', async () => {
  const ep = as(mia.workEmail);
  await ep.call({ method: 'POST', body: c1({ _offerAction: 'declined' }) });
  await ep.call({ method: 'POST', body: c1({ _offerAction: 'submit' }) });
  assert.equal(ep.net.length, 0);
});
test('with no site address, no link is sent and the answer says so', async () => {
  const ep = as(hal.workEmail);
  const r = await ep.call({ method: 'POST', body: c1({ _offerAction: 'approve', phone: '(631) 555-0123', offer: { ...stored()[0].offer, status: 'sent' } }) });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.emailResult, { sent: false, reason: 'no site address' }); assert.deepEqual(r.body.textResult, { sent: false, reason: 'no site address' });
});
test('an offer is marked sent only by approving it', async () => {
  const ep = as(hal.workEmail);
  const r = await ep.call({ method: 'POST', body: c1({ offer: { ...stored()[0].offer, status: 'sent' } }) });
  assert.equal(r.status, 400); assert.equal(saved(ep), undefined);
});
test('submitting is refused when the approver has left', async () => {
  const left = [{ ...hal, status: 'Terminated' }, ada, mia];
  const ep = loadEndpoint('applicants', { identity: { email: mia.workEmail }, employees: left, support,
    cosmos: async (c) => (c.verb === 'GET' && c.resId.endsWith('/applicants') ? { status: 200, body: { Documents: stored() } } : undefined) });
  const r = await submit(ep);
  assert.equal(r.status, 409); assert.equal(saved(ep), undefined);
});

/* ---- the offer goes out by text as well as email ---- */
const withTexts = (fn) => async () => {
  Object.assign(process.env, { TWILIO_ACCOUNT_SID: 'ACtest', TWILIO_AUTH_TOKEN: 'tok', TWILIO_FROM: '+15550000000' });
  try { await fn(); } finally { for (const k of ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_FROM']) delete process.env[k]; }
};
const texts = (ep) => ep.net.filter(c => c.hostname === 'api.twilio.com').map(c => Object.fromEntries(new URLSearchParams(c.body)));
test('approving texts the candidate the same signing link, with no pay in the text', withTexts(async () => {
  const ep = as(hal.workEmail);
  const r = await approve(ep, { phone: '(631) 555-0123' });
  assert.equal(r.status, 200); assert.deepEqual(r.body.textResult, { sent: true });
  const t = texts(ep);
  assert.equal(t.length, 1); assert.equal(t[0].To, '+16315550123');
  const token = saved(ep).body.offer.signToken;
  assert.ok(t[0].Body.includes('/offersign.html?id=c1&token=' + token));
  assert.equal(t[0].Body.includes('41.50'), false);
}));
test('with no text settings, the offer still goes out and the answer says no text was sent', async () => {
  const ep = as(hal.workEmail);
  const r = await approve(ep, { phone: '(631) 555-0123' });
  assert.equal(r.status, 200); assert.deepEqual(r.body.textResult, { sent: false, reason: 'not configured' });
  assert.equal(texts(ep).length, 0);
});
test('a candidate with no mobile number gets no text, and the answer says why', withTexts(async () => {
  const ep = as(hal.workEmail);
  const r = await approve(ep);
  assert.deepEqual(r.body.textResult, { sent: false, reason: 'no mobile number on file' });
}));

/* ---- working interview hours go to HR and Accounting ---- */
const acc = { id: 'k1', first: 'Kit', last: 'Books', workEmail: 'kit@puredental.com', department: 'Accounting', jobTitle: 'Accountant', location: 'Manorville' };
const wiDocs = (wi = {}) => [{ ...stored()[0], workingInterview: { status: 'completed', date: '2026-12-02', hours: '6', rate: '$38.00', ...wi } }];
const asWith = (email, docs) => loadEndpoint('applicants', { identity: { email }, employees: [...employees, acc], support,
  cosmos: async (c) => (c.verb === 'GET' && c.resId.endsWith('/applicants') ? { status: 200, body: { Documents: docs } } : undefined) });
const sendHours = (ep, docs, wi = {}) => ep.call({ method: 'POST', body: { ...docs[0], workingInterview: { status: 'sent', date: '2026-12-02', hours: '6', ...wi } } });
test('sending working interview hours tells HR and Accounting the candidate, the day and the hours, never the rate', async () => {
  const docs = wiDocs();
  const r = await sendHours(asWith(mia.workEmail, docs), docs);
  assert.equal(r.status, 200);
  const n = noticesTo(r);
  assert.deepEqual(n.map(m => m.userId).sort(), ['hal@puredental.com', 'kit@puredental.com']);
  const text = n[0].arguments[0].title + ' ' + n[0].arguments[0].body;
  assert.ok(text.includes('Cal Cand') && text.includes('6 hours') && text.includes('Dec 2'));
  assert.equal(JSON.stringify(n).includes('38.00'), false);
  assert.deepEqual(r.body.hoursNotice, { sent: 2 });
});
test('hours are not sent without a day and a number of hours', async () => {
  const docs = wiDocs({ hours: '' });
  const ep = asWith(mia.workEmail, docs);
  const r = await sendHours(ep, docs, { hours: '' });
  assert.equal(r.status, 400); assert.equal(saved(ep), undefined);
});
test('hours already sent are not announced again on a later save', async () => {
  const docs = wiDocs({ status: 'sent' });
  const r = await sendHours(asWith(mia.workEmail, docs), docs);
  assert.equal(r.status, 200); assert.equal(noticesTo(r).length, 0);
});

test('someone who may not see pay is told whether pay is on file, without the amount', async () => {
  const r = await as('mia@puredental.com').call({ method: 'GET' });
  const offer = r.body.applicants.find(a => a.offer).offer;
  assert.equal('pay' in offer, false); assert.equal(typeof offer.payOnFile, 'boolean');
  const src = require('fs').readFileSync(require('path').join(__dirname, '..', '..', 'applicants.jsx'), 'utf8');
  assert.match(src, /const noPay = canPay \? !o\.pay : !o\.payOnFile;/);
  assert.match(src, /disabled=\{noPay\}/);
});
test('reopening a rejected applicant keeps a sent, signed or declined offer unless the approver reopens it', () => {
  const src = require('fs').readFileSync(require('path').join(__dirname, '..', '..', 'applicants.jsx'), 'utf8');
  const fn = src.slice(src.indexOf('const reopen = (id) =>'), src.indexOf('const addApplicant'));
  assert.match(fn, /isApprover/);
});
test('the offer records whether the job is full-time, part-time or per diem', () => {
  const src = require('fs').readFileSync(require('path').join(__dirname, '..', '..', 'applicants.jsx'), 'utf8');
  assert.match(src, /<AF label="Employment type">/);
});
