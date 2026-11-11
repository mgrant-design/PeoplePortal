const test = require('node:test'); const assert = require('node:assert');
const fs = require('fs'); const path = require('path');
const API = path.join(__dirname, '..');
const ROOT = path.join(API, '..');
const EXEMPT = ['retentionCleanup', 'version', 'offersign'];
const PENDING = [];

const endpoints = fs.readdirSync(API, { withFileTypes: true })
  .filter(d => d.isDirectory() && fs.existsSync(path.join(API, d.name, 'function.json')))
  .map(d => d.name).filter(n => !EXEMPT.includes(n) && !PENDING.includes(n));

test('no endpoint carries its own copy of the shared checks', () => {
  const bad = [];
  for (const n of endpoints) {
    const src = fs.readFileSync(path.join(API, n, 'index.js'), 'utf8');
    if (!src.includes('resolveCaller(')) bad.push(`${n}: no resolveCaller`);
    if (/ALLOWED_DOMAINS|allowedDomains|WRITE_DOMAINS|\bALLOWED\s*=|\ballowed\s*=\s*\[/.test(src)) bad.push(`${n}: own domain list`);
    if (/human resources\|payroll/.test(src)) bad.push(`${n}: own role rules`);
    if (/createHmac/.test(src)) bad.push(`${n}: own database signing`);
  }
  assert.deepEqual(bad, []);
});

test('no screen calls the removed staffing-targets endpoint', () => {
  const screens = fs.readdirSync(ROOT).filter(f => /\.(jsx|js|html)$/.test(f));
  const hits = screens.filter(f => fs.readFileSync(path.join(ROOT, f), 'utf8').includes('/api/coverage'));
  assert.deepEqual(hits, []);
  assert.equal(fs.existsSync(path.join(API, 'coverage')), false);
});

test('only request.js sends the sign-in token or calls the server directly', () => {
  // offersign.js runs on the candidate's signing page, which has no Google sign-in;
  // version.jsx reads version.json and deferred-loader.js loads screen files.
  const allowed = ['request.js', 'offersign.js', 'version.jsx', 'deferred-loader.js'];
  const screens = fs.readdirSync(ROOT).filter(f => /\.(jsx|js|html)$/.test(f) && !allowed.includes(f) && f !== 'offersign.html');
  const hits = screens.filter(f => /X-Google-Token|\bfetch\(/.test(fs.readFileSync(path.join(ROOT, f), 'utf8')));
  assert.deepEqual(hits, []);
});

test('the office-name rule lives only in access-rules.js', () => {
  const files = [...fs.readdirSync(ROOT).filter(f => /\.(jsx|js)$/.test(f)).map(f => path.join(ROOT, f)),
    ...endpoints.map(n => path.join(API, n, 'index.js'))];
  const hits = files.filter(f => !f.endsWith('access-rules.js') && /function normLoc\b/.test(fs.readFileSync(f, 'utf8')));
  assert.deepEqual(hits.map(f => path.relative(ROOT, f)), []);
});

test('feature switches are saved on the server, not in the browser', () => {
  const app = fs.readFileSync(path.join(ROOT, 'app.jsx'), 'utf8');
  assert.equal(app.includes('pd_flags'), false);
  const defs = app.slice(app.indexOf('const FLAG_DEFS'), app.indexOf('];', app.indexOf('const FLAG_DEFS')));
  const ids = [...defs.matchAll(/\{ id: '(\w+)'/g)].map(m => m[1]).sort();
  assert.deepEqual(ids, Object.keys(require(path.join(ROOT, 'access-rules.js')).FEATURE_DEFAULTS || {}).sort());
});

test('only the shared notice writer builds notices', () => {
  const hits = endpoints.filter(n => /kind: 'notice'/.test(fs.readFileSync(path.join(API, n, 'index.js'), 'utf8')));
  assert.deepEqual(hits, []);
});

test('the approval kind names live only in approvals-text.js', () => {
  const files = [...fs.readdirSync(ROOT).filter(f => /\.(jsx|js)$/.test(f) && f !== 'approvals-text.js').map(f => path.join(ROOT, f)),
    ...endpoints.map(n => path.join(API, n, 'index.js'))];
  const hits = files.filter(f => /swapAccept:\s*'Shift swap'/.test(fs.readFileSync(f, 'utf8')));
  assert.deepEqual(hits.map(f => path.relative(ROOT, f)), []);
});

test('no code still mentions blackout requests', () => {
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap(d => {
    const p = path.join(dir, d.name);
    if (d.isDirectory()) return d.name.startsWith('.') || ['node_modules', 'tests', 'portal-docs'].includes(d.name) ? [] : walk(p);
    return /\.(jsx?|html)$/.test(d.name) ? [p] : [];
  });
  const hits = walk(ROOT).filter(f => /blackout_submit|BLACKOUT_HR/.test(fs.readFileSync(f, 'utf8')));
  assert.deepEqual(hits.map(f => path.relative(ROOT, f)), []);
  assert.equal(fs.existsSync(path.join(API, 'timeoff')), false);
});

test('the reporting-tree walk lives only in access-rules.js', () => {
  const files = [...fs.readdirSync(ROOT).filter(f => /\.(jsx|js)$/.test(f) && f !== 'access-rules.js').map(f => path.join(ROOT, f)),
    ...endpoints.map(n => path.join(API, n, 'index.js'))];
  const hits = files.filter(f => /while \(changed\)/.test(fs.readFileSync(f, 'utf8')));
  assert.deepEqual(hits.map(f => path.relative(ROOT, f)), []);
});

test('no code holds a Chat address or the offer approver', () => {
  const files = [...fs.readdirSync(ROOT).filter(f => /\.(jsx|js|html)$/.test(f)).map(f => path.join(ROOT, f)),
    ...fs.readdirSync(API, { withFileTypes: true }).filter(d => d.isDirectory() && fs.existsSync(path.join(API, d.name, 'index.js'))).map(d => path.join(API, d.name, 'index.js'))];
  const chat = files.filter(f => /chat\.googleapis\.com\/v1\/spaces/.test(fs.readFileSync(f, 'utf8')));
  assert.deepEqual(chat.map(f => path.relative(ROOT, f)), []);
  const approver = ['applicants.jsx', path.join('api', 'applicants', 'index.js'), path.join('api', 'offersign', 'index.js')]
    .filter(f => /OFFER_APPROVER|OFFER_EXECUTOR|@puredental\.com/.test(fs.readFileSync(path.join(ROOT, f), 'utf8')));
  assert.deepEqual(approver, []);
});

test('every endpoint that sends a notice or a live update has the live-push binding', () => {
  const missing = endpoints.filter(n => {
    const src = fs.readFileSync(path.join(API, n, 'index.js'), 'utf8');
    if (!/writeNotice\(|broadcast\(|signalRMessages/.test(src)) return false;
    const fj = JSON.parse(fs.readFileSync(path.join(API, n, 'function.json'), 'utf8'));
    return !fj.bindings.some(b => b.type === 'signalR' && b.direction === 'out' && b.name === 'signalRMessages');
  });
  assert.deepEqual(missing, []);
});

test('the hiring code names no real person', () => {
  const files = ['applicants.jsx', path.join('api', 'applicants', 'index.js'), path.join('api', 'offersign', 'index.js'), 'offersign.js', 'offersign.html'];
  const hits = files.filter(f => /Amanda|Vibert|Denise/.test(fs.readFileSync(path.join(ROOT, f), 'utf8')));
  assert.deepEqual(hits, []);
});

test('only the shared text-message file talks to the text service', () => {
  const hits = endpoints.filter(n => /twilio/i.test(fs.readFileSync(path.join(API, n, 'index.js'), 'utf8')));
  assert.deepEqual(hits, []);
  assert.ok(fs.existsSync(path.join(API, '_shared', 'sms.js')));
});

test('the rule for a work email\'s domain lives only in access-rules.js', () => {
  const files = [...fs.readdirSync(ROOT).filter(f => /\.(jsx|js)$/.test(f) && f !== 'access-rules.js').map(f => path.join(ROOT, f)),
    ...endpoints.map(n => path.join(API, n, 'index.js'))];
  const hits = files.filter(f => /foureversmile\.com/.test(fs.readFileSync(f, 'utf8')) && !/COMPANY_DOMAINS/.test(path.basename(f)));
  assert.deepEqual(hits.map(f => path.relative(ROOT, f)), []);
});
