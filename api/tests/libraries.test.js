/* The server's libraries must load on the Node version the live site runs. */
const test = require('node:test'); const assert = require('node:assert');
const fs = require('fs'); const path = require('path');
const API = path.join(__dirname, '..'); const ROOT = path.join(API, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(API, 'package.json'), 'utf8'));
const runtime = Number(/node:(\d+)/.exec(JSON.parse(fs.readFileSync(path.join(ROOT, 'staticwebapp.config.json'), 'utf8')).platform.apiRuntime)[1]);

test('every library the server lists is one its code loads', () => {
  const code = fs.readdirSync(API, { withFileTypes: true }).filter(d => d.isDirectory() && !['node_modules', 'tests'].includes(d.name))
    .flatMap(d => fs.readdirSync(path.join(API, d.name)).filter(f => f.endsWith('.js')).map(f => fs.readFileSync(path.join(API, d.name, f), 'utf8'))).join('\n');
  for (const name of Object.keys(pkg.dependencies)) assert.ok(code.includes(`require('${name}')`), name + ' is listed but never loaded');
});
test('the library versions are fixed by a lock file, and each one allows the live site\'s Node version', () => {
  const lock = JSON.parse(fs.readFileSync(path.join(API, 'package-lock.json'), 'utf8'));
  const tooNew = Object.entries(lock.packages).filter(([name, p]) => {
    const m = /^>=\s*(\d+)/.exec((p.engines && p.engines.node) || '');
    return name && m && Number(m[1]) > runtime;
  }).map(([name, p]) => `${name.replace(/^.*node_modules\//, '')}@${p.version} needs Node ${p.engines.node}`);
  assert.deepEqual(tooNew, []);
});
test('a build installs exactly the locked versions on the live Node version and checks each library loads before anything is deployed', () => {
  const wf = fs.readFileSync(path.join(ROOT, '.github', 'workflows', 'azure-static-web-apps-nice-mud-064dd7610.yml'), 'utf8');
  assert.match(wf, new RegExp(`node-version: '?${runtime}'?`));
  assert.match(wf, /npm ci/);
  const check = wf.indexOf('Check the API libraries load'), deploy = wf.indexOf('Build And Deploy');
  assert.ok(check > 0 && check < deploy);
  for (const name of Object.keys(pkg.dependencies)) assert.ok(wf.includes(`require('${name}')`), name);
});
test('installed libraries are never committed', () => {
  assert.match(fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8'), /^node_modules\/?$/m);
});
test('every deploy compiles each screen file, and runs the tests, before anything goes live', () => {
  const wf = fs.readFileSync(path.join(ROOT, '.github', 'workflows', 'azure-static-web-apps-nice-mud-064dd7610.yml'), 'utf8');
  const deploy = wf.indexOf('Build And Deploy');
  const compile = wf.indexOf('Compile the screens'), tests = wf.indexOf('Run the tests');
  assert.ok(compile > 0 && compile < deploy, 'compile step before the deploy');
  assert.ok(tests > 0 && tests < deploy, 'test step before the deploy');
  assert.match(wf, /@babel\/core@7/); assert.match(wf, /@babel\/preset-react@7/);
});
