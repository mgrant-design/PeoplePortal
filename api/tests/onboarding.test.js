/* The Onboarding page lists people hired through a signed offer, from saved staff records.
   The mock-up onboarding screens, their data and their switches are gone. */
const test = require('node:test'); const assert = require('node:assert');
const fs = require('fs'); const path = require('path'); const vm = require('vm');
const ROOT = path.join(__dirname, '..', '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const screenFiles = () => fs.readdirSync(ROOT).filter(f => /\.(jsx|js|html)$/.test(f) && f !== 'PORTAL-CONTEXT.html');

function onboardingLogic() {
  const src = read('onboardingstatus.jsx');
  const a = src.indexOf('/* ---- Onboarding logic with no screen parts ---- */'), b = src.indexOf('/* ---- end of Onboarding logic ---- */');
  assert.ok(a >= 0 && b > a, 'onboardingstatus.jsx has its logic block');
  const ctx = {}; vm.runInNewContext(src.slice(a, b) + '\nthis.hiresInOnboarding = hiresInOnboarding;', ctx);
  return ctx.hiresInOnboarding;
}
const emp = (id, extra = {}) => ({ id, name: 'Person ' + id, jobTitle: 'Dental Assistant', loc: 'Manorville', status: 'Active', workEmail: id + '@puredental.com', ...extra });

test('the Onboarding page lists only people hired through a signed offer', () => {
  const list = onboardingLogic()([
    emp('a', { hiredFromApplicantId: 'app-1', startDate: '2026-12-01', createdAt: '2026-11-10T15:00:00.000Z' }),
    emp('b', { startDate: '2026-12-01' }),   // added by hand, never an applicant
  ], '2026-11-18');
  assert.deepEqual(list.map(h => h.id), ['a']);
  assert.equal(list[0].hiredOn, '2026-11-10'); assert.equal(list[0].started, false);
  assert.equal(list[0].name, 'Person a'); assert.equal(list[0].loc, 'Manorville'); assert.equal(list[0].workEmail, 'a@puredental.com');
});
test('a hire stays on the page until 30 days after their start date, and a person who left is not on it', () => {
  const hires = onboardingLogic()([
    emp('soon', { hiredFromApplicantId: 'x1', startDate: '2026-11-25' }),
    emp('new', { hiredFromApplicantId: 'x2', startDate: '2026-10-19' }),     // 30 days ago: still listed
    emp('settled', { hiredFromApplicantId: 'x3', startDate: '2026-10-18' }), // 31 days ago
    emp('gone', { hiredFromApplicantId: 'x4', startDate: '2026-12-01', status: 'Terminated' }),
    emp('nodate', { hiredFromApplicantId: 'x5', startDate: '' }),
  ], '2026-11-18');
  assert.deepEqual(hires.map(h => h.id), ['new', 'soon', 'nodate'], 'earliest start first; a hire with no start date last');
  assert.equal(hires[0].started, true); assert.equal(hires[1].started, false); assert.equal(hires[2].started, false);
});
test('a rehire shows the day they were rehired', () => {
  const [h] = onboardingLogic()([emp('r', { hiredFromApplicantId: 'x', startDate: '2026-12-01', createdAt: '2019-03-04T00:00:00.000Z', rehiredAt: '2026-11-12T09:00:00.000Z' })], '2026-11-18');
  assert.equal(h.hiredOn, '2026-11-12');
});

test('the mock-up onboarding screens are gone', () => {
  for (const f of ['hub.jsx', 'steps.jsx', 'intake.jsx', 'paperwork.jsx', 'credentials.jsx', 'provisioning.jsx', 'automation.jsx', 'agent.jsx'])
    assert.equal(fs.existsSync(path.join(ROOT, f)), false, f + ' is deleted');
  const gone = ['Hub', 'WelcomeStep', 'PoliciesStep', 'TrainingStep', 'TeamStep', 'AgendaStep', 'BenefitsStep', 'ProfileStep', 'Paperwork', 'SignaturePad',
    'CredentialsStep', 'AccountsStep', 'AddHire', 'Automations', 'AutomationDetail', 'AgentConsole', 'CallTranscript', 'GoogleChatFeed', 'Prehire',
    'ROLE_ONBOARDING', 'APP_CATALOG', 'PAPERWORK_DOCS', 'ROLE_ACCOUNT_RULES', 'ROLE_PROFILES', 'newHireProfile', 'loadAutomations', 'persistAutomations',
    'createHire', 'hireRecord', 'provisionApi', 'resumeParse', 'AGENT_CHANNELS'];
  for (const f of screenFiles()) {
    const src = read(f);
    for (const name of gone) assert.doesNotMatch(src, new RegExp('\\b' + name + '\\b'), `${f} still names ${name}`);
  }
  const loaded = read('index.html');
  for (const f of ['riley.jsx', 'onboardingstatus.jsx']) assert.match(loaded, new RegExp("'" + f.replace('.', '\\.') + "'"), f + ' is loaded');
});
test('no screen says an agent emails, texts, calls or creates accounts for a new hire', () => {
  // reportbuilder.jsx's hours notice names a sender of its own; it is settled with the reports work
  for (const f of screenFiles().filter(f => f !== 'reportbuilder.jsx')) assert.doesNotMatch(read(f), /Send to HR|Sent to HR|onboarding agent|Agent Automations|My onboarding|Continue onboarding/i, f);
});
test('the module switches are the ones that change something', () => {
  const { FEATURE_DEFAULTS } = require('../../access-rules.js');
  for (const k of ['automations', 'provisionApi', 'resumeParse']) assert.equal(k in FEATURE_DEFAULTS, false, k);
  assert.equal(FEATURE_DEFAULTS.ask, true);
});

/* A screen name that no file defines draws nothing and blanks the page, and no build step
   reports it. Every <Name used in a screen file is defined in that file or shared by one. */
test('every screen part a file uses is defined somewhere', () => {
  const files = fs.readdirSync(ROOT).filter(f => f.endsWith('.jsx'));
  const shared = new Set(['React', 'ReactDOM']);
  const src = {};
  for (const f of files) {
    src[f] = read(f);
    for (const m of src[f].matchAll(/Object\.assign\(window,\s*\{([\s\S]*?)\}\)/g)) m[1].split(',').forEach(n => { const k = n.split(':')[0].trim(); if (k) shared.add(k); });
    for (const m of src[f].matchAll(/\bwindow\.([A-Z][A-Za-z0-9_]*)\s*=/g)) shared.add(m[1]);
    // each file runs as a plain script, so what it declares at the top level is shared too
    for (const m of src[f].matchAll(/^(?:function|const|let|var|class)\s+([A-Z][A-Za-z0-9_]*)/gm)) shared.add(m[1]);
  }
  const missing = [];
  for (const f of files) {
    const local = new Set([...src[f].matchAll(/\b(?:function|const|let|var|class)\s+([A-Z][A-Za-z0-9_]*)/g)].map(m => m[1]));
    for (const m of src[f].matchAll(/<([A-Z][A-Za-z0-9_]*)[\s/>]/g)) {
      const name = m[1];
      if (!local.has(name) && !shared.has(name)) missing.push(`${f}: <${name}>`);
    }
  }
  assert.deepEqual([...new Set(missing)], []);
});
