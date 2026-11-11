const test = require('node:test'); const assert = require('node:assert');
const fs = require('fs'); const path = require('path'); const vm = require('vm');
const { loadEndpoint } = require('./helpers/endpoint');
const ROOT = path.join(__dirname, '..', '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

const P = (id, first, loc = 'Manorville') => ({ id, first, last: first + 'son', workEmail: first.toLowerCase() + '@puredental.com', department: 'Clinical Team', jobTitle: 'Dental Assistant', location: loc, status: 'Active' });
const eli = P('e1', 'Eli'), oz = P('o1', 'Oz', 'Totowa');
const employees = [eli, oz];
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex').toString('base64');

/* blob containers kept in memory, shared by every session the test opens */
function storage(people = employees) {
  const containers = {};
  const client = (name) => {
    const c = () => containers[name];
    return {
      name,
      async createIfNotExists() { containers[name] = containers[name] || {}; },
      async *listBlobsFlat() {
        if (!c()) { const e = new Error('ContainerNotFound'); e.statusCode = 404; throw e; }
        for (const [n, b] of Object.entries(c())) yield { name: n, properties: { lastModified: b.at, contentType: b.type } };
      },
      getBlockBlobClient(n) {
        return {
          async upload(buf, len, opts) { if (!c()) throw new Error('no container'); c()[n] = { buf: Buffer.from(buf), type: opts.blobHTTPHeaders.blobContentType, at: new Date('2026-11-10T12:00:00Z') }; },
          async downloadToBuffer() { const b = c() && c()[n]; if (!b) { const e = new Error('BlobNotFound'); e.statusCode = 404; throw e; } return b.buf; },
          async deleteIfExists() { if (c() && c()[n]) { delete c()[n]; return { succeeded: true }; } return { succeeded: false }; },
          async getProperties() { const b = c() && c()[n]; if (!b) { const e = new Error('BlobNotFound'); e.statusCode = 404; throw e; } return { contentType: b.type, lastModified: b.at }; },
        };
      },
    };
  };
  const as = (who) => {
    const ep = loadEndpoint('photo', { identity: { email: who.workEmail }, employees: people, support: { users: [], managers: [] } });
    require(path.join(ROOT, 'api', '_shared', 'blobs.js')).containerClient = client;
    return ep;
  };
  return { containers, as, client };
}

test('a person cannot upload a photo for someone else', async () => {
  const s = storage();
  const r = await s.as(eli).call({ method: 'POST', body: { empId: 'o1', contentType: 'image/png', contentBase64: PNG } });
  assert.equal(r.status, 403);
  assert.equal(s.containers.photos && s.containers.photos.o1, undefined);
});
test('a photo uploaded in one session is served to another person in another session', async () => {
  const s = storage();
  const up = await s.as(eli).call({ method: 'POST', body: { contentType: 'image/png', contentBase64: PNG } });
  assert.equal(up.status, 200);
  assert.ok(s.containers.photos.e1, 'stored under the uploader\'s own id in the "photos" container');
  const list = await s.as(oz).call({ method: 'GET' });
  assert.deepEqual(Object.keys(list.body.photos), ['e1']);
  const one = await s.as(oz).call({ method: 'GET', query: { id: 'e1' } });
  assert.equal(one.status, 200); assert.equal(one.body.dataUrl, 'data:image/png;base64,' + PNG);
});
test('only an image of a modest size is accepted', async () => {
  const s = storage();
  assert.equal((await s.as(eli).call({ method: 'POST', body: { contentType: 'application/pdf', contentBase64: PNG } })).status, 400);
  const big = Buffer.alloc(600 * 1024).toString('base64');
  assert.equal((await s.as(eli).call({ method: 'POST', body: { contentType: 'image/jpeg', contentBase64: big } })).status, 400);
  assert.equal((await s.as(eli).call({ method: 'POST', body: { contentType: 'image/png' } })).status, 400);
});
test('with no photos yet, the list is empty and a photo answers 404', async () => {
  const s = storage();
  assert.deepEqual((await s.as(oz).call({ method: 'GET' })).body.photos, {});
  assert.equal((await s.as(oz).call({ method: 'GET', query: { id: 'e1' } })).status, 404);
});
test('signed-out callers get no photos', async () => {
  const s = storage();
  const r = await s.as(eli).call({ method: 'GET', token: '' });
  assert.equal(r.status, 401);
});

/* the screens' photo store */
function photoStore(api, timers = []) {
  const window = { pdApi: api };
  vm.runInNewContext(read('photos.js'), { window, Promise, Object, Set, Date, setTimeout: (fn) => { timers.push(fn); return timers.length; } });
  return window.PD_PHOTOS;
}
const tick = () => new Promise(r => setTimeout(r, 0));
test('the screens ask which people have a photo once, and fetch only those photos, once each', async () => {
  const calls = [];
  const P_ = photoStore(async (url, opts = {}) => {
    calls.push(opts.query ? 'one:' + opts.query.id : 'list');
    return opts.query ? { dataUrl: 'data:image/png;base64,' + opts.query.id } : { photos: { e1: '2026-11-10T12:00:00Z' } };
  });
  P_.load('e1'); P_.load('o1'); P_.load('e1');
  await tick(); await tick(); await tick();
  assert.equal(P_.get('e1'), 'data:image/png;base64,e1'); assert.equal(P_.get('o1'), null);
  assert.deepEqual(calls.sort(), ['list', 'one:e1']);
});
test('an uploaded photo shows at once for the uploader, and the change is announced', async () => {
  const sent = [];
  const P_ = photoStore(async (url, opts = {}) => { if (opts.method === 'POST') { sent.push(opts.body); return { ok: true }; } return { photos: {} }; });
  let heard = 0; P_.subscribe('e1', () => heard++);
  await P_.upload('e1', 'data:image/jpeg;base64,QUJD');
  assert.deepEqual(sent, [{ contentType: 'image/jpeg', contentBase64: 'QUJD' }]);
  assert.equal(P_.get('e1'), 'data:image/jpeg;base64,QUJD'); assert.ok(heard >= 1);
});
test('a failed upload leaves the old photo in place and says so', async () => {
  const P_ = photoStore(async (url, opts = {}) => { if (opts.method === 'POST') throw new Error('The server didn\'t answer'); return { photos: {} }; });
  await assert.rejects(P_.upload('e1', 'data:image/jpeg;base64,QUJD'));
  assert.equal(P_.get('e1'), null);
});

test('photos no longer live in browser storage', () => {
  for (const f of fs.readdirSync(ROOT).filter(f => /\.(jsx|js)$/.test(f))) assert.doesNotMatch(read(f), /pd_photo_/, f);
});
test('résumés go to a blob container whose name Azure accepts (lowercase)', () => {
  for (const f of ['api/resumeupload/index.js', 'api/retentionCleanup/index.js']) {
    assert.doesNotMatch(read(f), /parsedResumes/, f); assert.match(read(f), /'parsedresumes'/, f);
  }
});

test('a picked picture is drawn on white, so a transparent background does not turn black', () => {
  const src = read('profile.jsx');
  const fn = src.slice(src.indexOf('function shrinkPhoto'), src.indexOf('function PhotoUploader'));
  const fill = fn.indexOf("fillStyle = '#fff'"), rect = fn.indexOf('fillRect('), draw = fn.indexOf('drawImage(');
  assert.ok(fill > 0 && rect > fill && draw > rect);
});
test('blob storage is opened in one place', () => {
  const files = [];
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).forEach(f => {
    const p = path.join(d, f.name);
    if (f.isDirectory()) { if (!['node_modules', 'tests'].includes(f.name)) walk(p); } else if (f.name.endsWith('.js')) files.push(p);
  });
  walk(path.join(ROOT, 'api'));
  const opening = files.filter(f => /BlobServiceClient/.test(fs.readFileSync(f, 'utf8'))).map(f => path.relative(ROOT, f));
  assert.deepEqual(opening, [path.join('api', '_shared', 'blobs.js')]);
});
test('a résumé upload goes to the parsedresumes container through the shared opener', async () => {
  const ada = { id: 'a1', first: 'Ada', last: 'Admin', workEmail: 'ada@puredental.com', department: 'Human Resources', jobTitle: 'HR Director', location: 'Manorville', status: 'Active' };
  const ep = loadEndpoint('resumeupload', { identity: { email: ada.workEmail }, employees: [...employees, ada], support: { users: [], managers: [] } });
  const opened = [];
  require(path.join(ROOT, 'api', '_shared', 'blobs.js')).containerClient = (name) => { opened.push(name); return { async createIfNotExists() {}, getBlockBlobClient: (n) => ({ url: 'blob:' + n, async upload() {} }) }; };
  const r = await ep.call({ method: 'POST', body: { applicantId: 'ap1', filename: 'cv.pdf', contentBase64: 'JVBERi0=' } });
  assert.equal(r.status, 200, JSON.stringify(r.body)); assert.deepEqual(opened, ['parsedresumes']);
});

/* ---- photos of people who have left ---- */
const PNGbuf = Buffer.from(PNG, 'base64');
const seed = (s, ids) => { s.containers.photos = {}; ids.forEach(id => { s.containers.photos[id] = { buf: PNGbuf, type: 'image/png', at: new Date('2026-11-10T12:00:00Z') }; }); };
test('a photo of someone who has left is not served', async () => {
  const gone = { ...P('g1', 'Gus'), status: 'Terminated' };
  const s = storage([eli, oz, gone]); seed(s, ['e1', 'g1']);
  assert.deepEqual(Object.keys((await s.as(oz).call({ method: 'GET' })).body.photos), ['e1']);
  assert.equal((await s.as(oz).call({ method: 'GET', query: { id: 'g1' } })).status, 404);
});
test('terminating someone removes their photo', async () => {
  const hr = { ...P('h1', 'Hal'), department: 'Human Resources', jobTitle: 'HR Director' };
  const s = storage(); seed(s, ['e1']);
  const ep = loadEndpoint('roster', { identity: { email: hr.workEmail }, employees: [eli, oz, hr], support: { users: [], managers: [] } });
  require(path.join(ROOT, 'api', '_shared', 'blobs.js')).containerClient = s.client;
  const r = await ep.call({ method: 'POST', body: { action: 'update', id: 'e1', patch: { status: 'Terminated' }, signature: 'Hal Halson', reason: 'left' } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(s.containers.photos.e1, undefined);
});
test('the nightly cleanup removes photos of people who have left or are no longer on the roster', async () => {
  const gone = { ...P('g1', 'Gus'), status: 'Terminated' };
  const s = storage(); seed(s, ['e1', 'g1', 'x9']);
  process.env.RETENTION_JOB_SECRET = 'test-secret'; process.env.AZURE_STORAGE_CONNECTION_STRING = 'test';
  try {
    const ep = loadEndpoint('retentionCleanup', { identity: null, employees: [eli, oz, gone], support: { users: [], managers: [] } });
    require(path.join(ROOT, 'api', '_shared', 'blobs.js')).containerClient = s.client;
    const r = await ep.call({ method: 'POST', headers: { 'x-retention-secret': 'test-secret' }, token: '' });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.deepEqual(Object.keys(s.containers.photos), ['e1']);
  } finally { delete process.env.RETENTION_JOB_SECRET; delete process.env.AZURE_STORAGE_CONNECTION_STRING; }
});

test('a failed photo request is tried again, and the photo shows once it answers', async () => {
  let up = false; const calls = []; const timers = [];
  const P_ = photoStore(async (url, opts = {}) => {
    calls.push(opts.query ? 'one' : 'list');
    if (!up) throw new Error('Server error');
    return opts.query ? { dataUrl: 'data:image/png;base64,AA' } : { photos: { e1: 'x' } };
  }, timers);
  let heard = 0; P_.subscribe('e1', () => heard++);
  P_.load('e1'); P_.load('o1');
  await tick(); await tick(); await tick();
  assert.equal(P_.get('e1'), null);
  assert.deepEqual(calls, ['list'], 'two people waiting share one failed list request');
  assert.equal(timers.length, 1, 'one retry is scheduled');
  up = true; timers.shift()();
  await tick(); await tick(); await tick(); await tick();
  assert.equal(P_.get('e1'), 'data:image/png;base64,AA'); assert.ok(heard >= 1);
});
test('a photo that is gone by the time it is asked for shows initials and is not asked for again', async () => {
  const timers = [];
  const P_ = photoStore(async (url, opts = {}) => {
    if (opts.query) { const e = new Error('No photo'); e.status = 404; throw e; }
    return { photos: { e1: 'x' } };
  }, timers);
  P_.load('e1'); await tick(); await tick(); await tick();
  assert.equal(P_.get('e1'), null); assert.equal(timers.length, 0);
});
test('a photo request that keeps failing stops being retried after five tries', async () => {
  const calls = []; const timers = [];
  const P_ = photoStore(async () => { calls.push(1); throw new Error('Server error'); }, timers);
  P_.load('e1');
  for (let i = 0; i < 20; i++) { await tick(); await tick(); await tick(); if (!timers.length) break; timers.shift()(); }
  assert.equal(calls.length, 5); assert.equal(timers.length, 0); assert.equal(P_.get('e1'), null);
});
