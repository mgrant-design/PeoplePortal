const test = require('node:test'); const assert = require('node:assert');
const fs = require('fs'); const path = require('path'); const vm = require('vm');
const SRC = fs.readFileSync(path.join(__dirname, '..', '..', 'request.js'), 'utf8');

/* runs request.js in a fake browser; respond(url, opts) returns { status, json?, text? } */
function browser(respond) {
  const calls = []; let signedOut = 0, lastMessage = '';
  const window = { PD_GOOGLE_TOKEN: 'tok', PD_ON_SIGNED_OUT: (m) => { signedOut++; lastMessage = m; } };
  const fetch = async (url, opts) => {
    calls.push({ url, opts });
    const r = respond(url, opts);
    const text = r.text !== undefined ? r.text : JSON.stringify(r.json || {});
    return { ok: r.status >= 200 && r.status < 300, status: r.status, text: async () => text };
  };
  const ctx = { window, fetch, URLSearchParams, Error, JSON, encodeURIComponent };
  ctx.globalThis = ctx;
  vm.runInNewContext(SRC, ctx);
  return { api: window.pdApi, PdApiError: window.PdApiError, calls, get signedOut() { return signedOut; }, get lastMessage() { return lastMessage; } };
}

test('sends the Google token header', async () => {
  const b = browser(() => ({ status: 200, json: { ok: true } }));
  await b.api('/api/settings');
  assert.equal(b.calls[0].opts.headers['X-Google-Token'], 'tok');
  assert.equal(b.calls[0].opts.method, 'GET');
});
test('sends a JSON body on POST', async () => {
  const b = browser(() => ({ status: 200, json: { ok: true } }));
  const out = await b.api('/api/notify', { method: 'POST', body: { toEmail: 'a@puredental.com' } });
  assert.equal(b.calls[0].opts.headers['Content-Type'], 'application/json');
  assert.deepEqual(JSON.parse(b.calls[0].opts.body), { toEmail: 'a@puredental.com' });
  assert.deepEqual(out, { ok: true });
});
test('puts query values into the address', async () => {
  const b = browser(() => ({ status: 200, json: {} }));
  await b.api('/api/schedule', { query: { office: 'Garden City', weekKey: '2026-11-02' } });
  assert.equal(b.calls[0].url, '/api/schedule?office=Garden+City&weekKey=2026-11-02');
});
test("puts the server's error text on the thrown error", async () => {
  const b = browser(() => ({ status: 403, json: { error: 'Domain not allowed' } }));
  await assert.rejects(b.api('/api/roster'), (e) => e.message === 'Domain not allowed' && e.status === 403 && e instanceof b.PdApiError);
});
test('a 401 calls the signed-out handler once', async () => {
  const b = browser(() => ({ status: 401, json: { error: 'Not signed in' } }));
  await assert.rejects(b.api('/api/roster'));
  await assert.rejects(b.api('/api/notify'));
  assert.equal(b.signedOut, 1);
  assert.equal(b.lastMessage, 'Your sign-in expired. Sign in again.');
});
test('a non-JSON failure gets a readable message', async () => {
  const b = browser(() => ({ status: 502, text: '<html>Bad gateway</html>' }));
  await assert.rejects(b.api('/api/ai', { method: 'POST', body: {} }), (e) => e.message === "The server didn't answer (HTTP 502)" && e.status === 502);
});
test('after a successful call, a later expired sign-in is told again', async () => {
  let status = 401;
  const b = browser(() => ({ status, json: { error: 'Not signed in' } }));
  await assert.rejects(b.api('/api/settings'));
  status = 200;
  await b.api('/api/settings');
  status = 401;
  await assert.rejects(b.api('/api/settings'));
  assert.equal(b.signedOut, 2);
});

test('a refusal carries the server\'s whole answer, so a screen can act on its details', async () => {
  const b = browser(() => ({ status: 409, json: { error: 'Week is published', pendingRequired: true } }));
  await assert.rejects(b.api('/api/schedule', { method: 'POST', body: {} }), (e) => e.status === 409 && e.body && e.body.pendingRequired === true);
});
