/* Owner's click-through feedback, 11 November 2026. */
const test = require('node:test'); const assert = require('node:assert');
const fs = require('fs'); const path = require('path');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', '..', f), 'utf8');

test('the time-off form belongs to the Schedule page; Notifications has no way to request time off', () => {
  const bell = read('notifications.jsx');
  assert.doesNotMatch(bell, /TimeOffForm|weekdaysBetween|TIMEOFF_TYPES/);
  assert.doesNotMatch(bell, />Time off<\/h3>/);
  assert.match(read('scheduleread.jsx'), /function TimeOffForm\(/);
});
test('the time-off form does not explain itself, and shows a refusal inside the form', () => {
  const src = read('scheduleread.jsx');
  const form = src.slice(src.indexOf('function TimeOffForm('), src.indexOf('function TimeOffDialog('));
  assert.doesNotMatch(form, /Goes to your manager|final approver|approves it as paid/);
  assert.match(form, /setErr\(/); assert.match(form, /\{err && </);
});
test('the first column of the Applicants board is headed Applicants', () => {
  const src = read('applicants.jsx');
  assert.match(src, /id: 'applied',\s+label: 'New Applicant', header: 'Applicants'/);
  assert.match(src, /\{s\.header \|\| s\.label\}/);
});
test('the Schedules popup is headed with the person whose settings it changes, and scrolls only when it must', () => {
  const src = read('hradmin.jsx');
  const modal = src.slice(src.indexOf('function SchedulesModal('), src.indexOf('), document.body);', src.indexOf('function SchedulesModal(')));
  assert.match(modal, /<h2[^>]*>\{name\}<\/h2>/);
  assert.doesNotMatch(modal, /The locations and teams \{name\} can schedule/);
  assert.doesNotMatch(src, /maxHeight: '90vh'/, 'a popup is as tall as its content; the page behind it scrolls only when the popup is taller than the window');
});
test('the empty Notifications view keeps its face and "send a message", with no time-off link', () => {
  const bell = read('notifications.jsx');
  assert.doesNotMatch(bell, /request time off/i);
  assert.match(bell, /send a message/); assert.match(bell, /ZEN_LINES/);
});
test('the colour used for problems and for time-off stripes is defined, in light and in dark', () => {
  const css = read('styles.css');
  assert.equal((css.match(/--danger:\s*oklch/g) || []).length >= 1, true);
  assert.equal((css.match(/--danger-soft:\s*oklch/g) || []).length >= 2, true);
});
test('screens say what happened, not how the portal works', () => {
  const gone = [
    ['schedule-import.jsx', /A week that is new arrives unpublished/],
    ['offboarding.jsx', /It goes to the offboarding approvers/],
    ['schedgrid.jsx', /Nobody sees them until you publish/],
    ['scheduleread.jsx', /teammates can claim the shift once they approve it|the schedule changes only when they approve/],
    ['scheduler.jsx', /the schedule updates when they approve/],
  ];
  for (const [f, re] of gone) assert.doesNotMatch(read(f), re, f);
  assert.match(read('scheduleread.jsx'), /flash\('Offer sent to your manager\.'\)/);
  assert.match(read('scheduleread.jsx'), /flash\('Claim sent to your manager\.'\)/);
});
test('style changes reach a browser that has the site open: the stylesheet is checked for a newer copy each time', () => {
  const cfg = JSON.parse(read('staticwebapp.config.json'));
  assert.ok(cfg.routes.some(r => r.route === '/*.css' && /no-cache/.test(r.headers['Cache-Control'])));
});
test('an applicant with no offer drafted yet opens: the pay check runs without an offer', () => {
  const src = read('applicants.jsx');
  const panel = src.slice(src.indexOf('function OfferLetter('), src.indexOf('if (!o) {', src.indexOf('function OfferLetter(')));
  const line = (panel.match(/const noPay = [^\n]+/) || [])[0];
  assert.ok(line, 'the pay check is worked out before the panel draws');
  const noPay = new Function('canPay', 'o', line + '\nreturn noPay;');
  for (const canPay of [true, false]) assert.equal(noPay(canPay, undefined), true);
  assert.equal(noPay(true, { pay: '$20' }), false);
  assert.equal(noPay(false, { payOnFile: true }), false);
});
test('the applicant popup draws for a record with no name or no signing date', () => {
  const src = read('applicants.jsx');
  assert.doesNotMatch(src, /\ba\.name\.split\(|\br\.name\.split\(/, 'a first name is taken through atsFirst, which accepts a missing name');
  assert.doesNotMatch(src, /new Date\(o\.(signedAt|declinedAt)\)\.toISOString\(\)/, 'a date is shown through atsDay, which accepts a missing time');
  const fns = src.slice(src.indexOf('function atsFirst('), src.indexOf('/* average of interviewer ratings'));
  const ctx = {}; require('vm').runInNewContext(fns + '\nthis.atsFirst = atsFirst; this.atsDay = atsDay;', ctx);
  assert.equal(ctx.atsFirst(undefined), 'the candidate'); assert.equal(ctx.atsFirst('Mindy Rogers'), 'Mindy');
  assert.equal(ctx.atsDay(undefined), ''); assert.equal(ctx.atsDay(Date.UTC(2026, 6, 22, 15)), '2026-07-22');
});

test('the applicant popup shows the offer letter from the Offer step on, and interview feedback only before it', () => {
  const src = read('applicants.jsx');
  assert.match(src, /const showOffer = !rejected && idx >= ATS_IDX\.offer;/);
  assert.match(src, /const showFeedback = idx < ATS_IDX\.offer;/);
  assert.match(src, /\{showFeedback && <div>/);
  const order = ['applied', 'screening', 'interview', 'working', 'offer', 'hired'];
  const ids = [...src.slice(src.indexOf('const ATS_STAGES = ['), src.indexOf('const ATS_IDX')).matchAll(/id: '([a-z]+)'/g)].map(m => m[1]);
  assert.deepEqual(ids, order);
});
test('whoever drafts the offer can type the pay; the amount on file is not shown to someone without pay rights', () => {
  const src = read('applicants.jsx');
  const panel = src.slice(src.indexOf('function OfferLetter('), src.indexOf('function ApplicantDetail('));
  assert.doesNotMatch(panel, /Compensation is entered and visible only to HR/);
  assert.doesNotMatch(panel, /\{canPay \? \(\s*<div style=\{\{ display: 'grid', gridTemplateColumns: '150px 1fr'/);
  assert.match(panel, /placeholder=\{!o\.pay && o\.payOnFile \? 'On file' :/);
  assert.match(panel, /\{canPay && o\.pay && <>/, 'the read-only summary shows pay only to someone with pay rights');
});

test('a button is labelled with its action, and a page does not describe itself', () => {
  const all = fs.readdirSync(path.join(__dirname, '..', '..')).filter(f => f.endsWith('.jsx')).map(f => [f, read(f)]);
  const labels = /Deactivate people|Sign and (deactivate|terminate|suspend|reactivate)|Submit a new hire|Open in Applicants|Ask Riley settings|Back to (checklist|people|library|reviews)|Add someone manually|Draft offer letter|Record signature received|Save (changes|details|links|regular hours)|View full record|Open employee record|Take the interactive tour|Edit \/ revise offer|Submit to \{offerApprover\(\)\.name\} for approval/;
  const prose = /subtitle="|is coming soon|Your onboarding assistant|Build reports by dragging|Turn modules on or off to phase|These questions appear on every|The hours someone normally works|Loads a roster CSV export|Common for clinical roles|We pull first & last name/;
  // the guided tour and the help panel are the two places whose job is to explain a page
  const explains = ['walkthrough.jsx', 'help.jsx'];
  for (const [f, src] of all) { assert.doesNotMatch(src, labels, f); if (!explains.includes(f)) assert.doesNotMatch(src, prose, f); }
});
