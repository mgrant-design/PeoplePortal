/* data.jsx — onboarding portal config + templates (NO placeholder people).
   The onboarding screens read the REAL signed-in employee via newHireProfile(me). */

/* Build the onboarding view-model from the real signed-in employee record.
   Tolerates missing fields (real roster rows can have blank manager/startDate). */
function newHireProfile(me) {
  me = me || {};
  const name = (me.name || `${me.first || ''} ${me.last || ''}`.trim()) || 'New hire';
  return {
    name,
    first: me.first || name.split(' ')[0] || 'there',
    role: me.jobTitle || '',
    location: me.loc || me.location || '',
    startDate: me.startDate || '',
    manager: me.manager || '',
    managerEmail: me.managerEmail || '',
    email: me.workEmail || '',
    username: me.windowsLogin || '',
  };
}
window.newHireProfile = newHireProfile;

/* ---- Role model: drives credentials gating + which apps get provisioned ---- */
const ROLE_PROFILES = {
  hygienist: { id: 'hygienist', label: 'Registered Dental Hygienist', short: 'RDH', clinical: true, provider: true, dea: false, taxonomy: 'Dental Hygienist · 124Q00000X', apps: ['google', 'denticon', 'denticon_provider'] },
  dentist:   { id: 'dentist', label: 'Dentist', short: 'DDS', clinical: true, provider: true, dea: true, taxonomy: 'General Dentist · 1223G0001X', apps: ['google', 'denticon', 'denticon_provider', 'dosespot'] },
  frontdesk: { id: 'frontdesk', label: 'Front Desk Coordinator', short: 'Front Desk', clinical: false, provider: false, apps: ['google', 'nexhealth'] },
  insurance: { id: 'insurance', label: 'Insurance & Billing Specialist', short: 'Insurance', clinical: false, provider: false, apps: ['google', 'nexhealth'] },
};

/* ---- App catalog: each provisions via its API; ready state reveals credentials ---- */
const APP_CATALOG = {
  google:            { id: 'google', name: 'Google Workspace', detail: 'Email, Calendar & Drive', icon: 'mail', api: 'Google Admin SDK', provider: false, emailLogin: true, url: 'mail.google.com', reset: true },
  denticon:          { id: 'denticon', name: 'Denticon', detail: 'Practice management & charting', icon: 'tooth', api: 'Denticon Partner API', provider: false, emailLogin: false, url: 'a.denticon.com', reset: true },
  denticon_provider: { id: 'denticon_provider', name: 'Denticon — Provider profile', detail: 'Provider record, production & e-claims', icon: 'star', api: 'Denticon Partner API', provider: true, emailLogin: false, url: 'a.denticon.com', reset: false },
  nexhealth:         { id: 'nexhealth', name: 'NexHealth', detail: 'Patient messaging & online booking', icon: 'calendar', api: 'NexHealth API', provider: false, emailLogin: false, url: 'app.nexhealth.com', reset: true },
  dosespot:          { id: 'dosespot', name: 'DoseSpot', detail: 'e-Prescribing (EPCS) for controlled meds', icon: 'shield', api: 'DoseSpot SSO API', provider: true, emailLogin: false, url: 'my.dosespot.com', reset: false },
};

/* ---- Role-based account provisioning rules (define settings per role) ---- */
const ROLE_ACCOUNT_RULES = {
  hygienist: {
    label: 'Registered Dental Hygienist',
    google: { ou: '/Clinical/Hygiene', groups: ['clinical@', 'hygiene@'], license: 'Business Starter' },
    denticon: { template: 'Clinical — Hygienist', provider: true, modules: ['Charting', 'Perio', 'Imaging'] },
    nexhealth: null,
    dosespot: null,
  },
  dentist: {
    label: 'Dentist',
    google: { ou: '/Clinical/Providers', groups: ['clinical@', 'providers@'], license: 'Business Standard' },
    denticon: { template: 'Provider — Doctor', provider: true, modules: ['Charting', 'Treatment Plans', 'E-Claims', 'Imaging'] },
    nexhealth: null,
    dosespot: { account: 'Clinician (EPCS)', schedules: 'II–V' },
  },
  frontdesk: {
    label: 'Front Desk Coordinator',
    google: { ou: '/FrontOffice', groups: ['frontdesk@'], license: 'Business Starter' },
    denticon: { template: 'Front Office', provider: false, modules: ['Scheduling', 'Ledger'] },
    nexhealth: { role: 'Front Desk', features: ['Online booking', 'Patient messaging', 'Recalls'] },
    dosespot: null,
  },
  insurance: {
    label: 'Insurance & Billing Specialist',
    google: { ou: '/Billing', groups: ['billing@', 'insurance@'], license: 'Business Starter' },
    denticon: { template: 'Billing & Insurance', provider: false, modules: ['Claims', 'Ledger', 'Reports'] },
    nexhealth: { role: 'Billing', features: ['Eligibility', 'Patient messaging'] },
    dosespot: null,
  },
};

/* ---- Skills taxonomy — used to smart-fill shifts ---- */
const SKILLS = ['Hygiene', 'Perio', 'Pediatric', 'Sedation', 'Surgery assist', 'Imaging/X-ray', 'Invisalign', 'Front desk', 'Insurance/Billing', 'Spanish', 'Endo', 'Implants'];

/* ---- Onboarding agent: channels ----
   Riley's knowledge base, routing, and persona now live in riley-data.jsx (one
   amendable source feeding both the AI and the offline fallback). */
const AGENT_CHANNELS = [
  { id: 'email', name: 'Email', icon: 'mail', detail: 'Welcome notes, links & document delivery', on: true },
  { id: 'sms', name: 'SMS / Text', icon: 'phone', detail: 'Reminders & quick confirmations', on: true },
  { id: 'voice', name: 'Voice calls', icon: 'phone', detail: 'Friendly agent answers questions & books interviews', on: true },
  { id: 'gchat', name: 'Google Chat', icon: 'users', detail: 'Shares updates with the onboarding team', on: true },
];

/* Task hub config. status: done | progress | todo | locked | action */
const TASKS = [
  { id: 'welcome',  icon: 'sparkle',  title: 'Welcome to Pure Dental', blurb: 'Your first day, what to expect, and who you’ll meet.', est: '4 min', status: 'done', group: 'Get started' },
  { id: 'profile',  icon: 'doc',      title: 'Your details',           blurb: 'Resume, key dates, and secure personal info.', est: '5 min', status: 'action', group: 'Get started', count: 'Required' },
  { id: 'paperwork',icon: 'pen',      title: 'New-hire paperwork',     blurb: 'W-4, I-9, and direct deposit — sign electronically.', est: '12 min', status: 'action', group: 'Get started', count: '3 to sign' },
  { id: 'credentials', icon: 'star',  title: 'License & credentials',  blurb: 'NPI, state license, and DEA — verified automatically.', est: '8 min', status: 'action', group: 'Get started', count: 'Provider', providerOnly: true },
  { id: 'policies', icon: 'shield',   title: 'Policies & compliance',  blurb: 'HIPAA, OSHA, and code of conduct acknowledgements.', est: '15 min', status: 'progress', group: 'Compliance', count: '1 of 4' },
  { id: 'accounts', icon: 'key',      title: 'Accounts & access',      blurb: 'We auto-create your apps, logins, and email by role.', est: '6 min', status: 'todo', group: 'Get set up' },
  { id: 'training', icon: 'book',     title: 'Learning modules',       blurb: 'Role-specific courses via the Employee Learning Platform.', est: '2.5 hrs', status: 'todo', group: 'Learn', count: '0 of 6' },
  { id: 'team',     icon: 'users',    title: 'Meet your team',         blurb: 'Your pod, the org chart, and key contacts.', est: '5 min', status: 'todo', group: 'Connect' },
  { id: 'schedule', icon: 'calendar', title: 'Schedule & first week',  blurb: 'Your shifts and a day-by-day first-week agenda.', est: '4 min', status: 'todo', group: 'Connect' },
  { id: 'benefits', icon: 'heart',    title: 'Benefits enrollment',    blurb: 'Medical, dental, 401(k), and PTO — choose your plans.', est: '20 min', status: 'locked', group: 'Decide', lockNote: 'Unlocks after paperwork' },
];

/* ---- Role-specific onboarding: each role gets an accurate task list ---- */
function _roleTasks(roleKey, opts) {
  const T = {
    welcome:  { id: 'welcome', icon: 'sparkle', title: 'Welcome to Pure Dental', blurb: 'Your first day, what to expect, and who you’ll meet.', est: '4 min', status: 'done', group: 'Get started' },
    profile:  { id: 'profile', icon: 'doc', title: 'Your details', blurb: 'Resume, key dates, and secure personal info.', est: '5 min', status: 'action', group: 'Get started', count: 'Required' },
    paperwork:{ id: 'paperwork', icon: 'pen', title: 'New-hire paperwork', blurb: 'W-4, I-9, and direct deposit — sign electronically.', est: '12 min', status: 'action', group: 'Get started', count: '3 to sign' },
    credentials: { id: 'credentials', icon: 'star', title: 'License & credentials', blurb: 'NPI, state license' + (opts.dea ? ', and DEA' : '') + ' — verified automatically.', est: '8 min', status: 'action', group: 'Get started', count: 'Provider' },
    policies: { id: 'policies', icon: 'shield', title: 'Policies & compliance', blurb: 'HIPAA, OSHA, and code of conduct acknowledgements.', est: '15 min', status: 'progress', group: 'Compliance', count: '1 of 4' },
    osha:     { id: 'policies', icon: 'shield', title: 'Policies & compliance', blurb: 'HIPAA and code of conduct acknowledgements.', est: '8 min', status: 'progress', group: 'Compliance', count: '1 of 3' },
    accounts: { id: 'accounts', icon: 'key', title: 'Accounts & access', blurb: 'We auto-create your apps, logins, and email by role.', est: '6 min', status: 'todo', group: 'Get set up' },
    team:     { id: 'team', icon: 'users', title: 'Meet your team', blurb: 'Your pod, the org chart, and key contacts.', est: '5 min', status: 'todo', group: 'Connect' },
    schedule: { id: 'schedule', icon: 'calendar', title: 'Schedule & first week', blurb: 'Your shifts and a day-by-day first-week agenda.', est: '4 min', status: 'todo', group: 'Connect' },
    benefits: { id: 'benefits', icon: 'heart', title: 'Benefits enrollment', blurb: 'Medical, dental, 401(k), and PTO — choose your plans.', est: '20 min', status: 'locked', group: 'Decide', lockNote: 'Unlocks after paperwork' },
    training: { id: 'training', icon: 'book', title: opts.training.title, blurb: opts.training.blurb, est: opts.training.est, status: 'todo', group: 'Learn', count: opts.training.count },
  };
  const list = [T.welcome, T.profile, T.paperwork];
  if (opts.provider) list.push(T.credentials);
  list.push(T.policies, T.accounts, T.training);
  (opts.extra || []).forEach(x => list.push(x));
  list.push(T.team, T.schedule, T.benefits);
  return list;
}

const ROLE_ONBOARDING = {
  hygienist: _roleTasks('hygienist', { provider: true, dea: false, training: { title: 'Clinical learning path', blurb: 'Infection control, perio, radiography & Open Dental charting.', est: '2.5 hrs', count: '0 of 6' } }),
  dentist: _roleTasks('dentist', { provider: true, dea: true, training: { title: 'Provider learning path', blurb: 'Clinical protocols, treatment planning, e-prescribing & charting.', est: '3 hrs', count: '0 of 7' },
    extra: [{ id: 'dosespot_setup', icon: 'shield', title: 'e-Prescribing (DoseSpot) setup', blurb: 'Identity proofing & EPCS two-factor enrollment.', est: '15 min', status: 'todo', group: 'Get set up', count: 'EPCS' }] }),
  frontdesk: _roleTasks('frontdesk', { provider: false, training: { title: 'Front desk training', blurb: 'Phones, scheduling, check-in & NexHealth booking.', est: '90 min', count: '0 of 5' },
    extra: [{ id: 'phones', icon: 'phone', title: 'Phones & scheduling SOPs', blurb: 'Call handling, scheduling rules, and recalls.', est: '30 min', status: 'todo', group: 'Get set up' }] }),
  insurance: _roleTasks('insurance', { provider: false, training: { title: 'Billing & insurance training', blurb: 'Eligibility, claims, and the Denticon ledger.', est: '2 hrs', count: '0 of 5' } }),
};

/* ---- Performance reviews: default question template (HR/exec editable) ---- */
const REVIEW_SCALE = [
  { v: 1, label: 'Needs improvement' }, { v: 2, label: 'Developing' }, { v: 3, label: 'Meets expectations' }, { v: 4, label: 'Exceeds' }, { v: 5, label: 'Outstanding' },
];
const REVIEW_QUESTIONS = [
  { id: 'q1', category: 'Role excellence', text: 'Demonstrates competency and quality in their role.' },
  { id: 'q2', category: 'Patient experience', text: 'Delivers a caring, professional patient experience.' },
  { id: 'q3', category: 'Teamwork', text: 'Communicates and collaborates well with the team.' },
  { id: 'q4', category: 'Reliability', text: 'Punctual, dependable, and accountable for their work.' },
  { id: 'q5', category: 'Growth', text: 'Seeks feedback and pursues professional development.' },
];

const PAPERWORK_DOCS = [
  { id: 'w4',  name: 'Form W-4 — Employee Withholding', agency: 'IRS', pages: 4, status: 'unsigned', desc: 'Tells us how much federal income tax to withhold from your pay.' },
  { id: 'i9',  name: 'Form I-9 — Employment Eligibility', agency: 'USCIS', pages: 2, status: 'unsigned', desc: 'Verifies your identity and authorization to work in the U.S.' },
  { id: 'dd',  name: 'Direct Deposit Authorization', agency: 'Payroll', pages: 1, status: 'unsigned', desc: 'Routes your paycheck straight to your bank account.' },
];

const POLICIES = [
  { id: 'hipaa', name: 'HIPAA Privacy & Security', tag: 'Required', mins: 6, done: true,  desc: 'How we protect patient health information.' },
  { id: 'osha',  name: 'OSHA Bloodborne Pathogens', tag: 'Required', mins: 5, done: false, desc: 'Safe handling of sharps, exposure controls, and PPE.' },
  { id: 'conduct', name: 'Code of Conduct', tag: 'Required', mins: 3, done: false, desc: 'Professional standards and workplace expectations.' },
  { id: 'social', name: 'Social Media & Confidentiality', tag: 'Policy', mins: 2, done: false, desc: 'What you can and can’t share publicly.' },
];

const TRAINING = [
  { id: 't1', name: 'Welcome & company values', mins: 20, done: false, cat: 'Foundations' },
  { id: 't2', name: 'Infection control & sterilization', mins: 45, done: false, cat: 'Clinical' },
  { id: 't3', name: 'Open Dental: charting basics', mins: 35, done: false, cat: 'Software' },
  { id: 't4', name: 'Patient communication standards', mins: 25, done: false, cat: 'Clinical' },
  { id: 't5', name: 'Radiography safety refresher', mins: 30, done: false, cat: 'Clinical' },
  { id: 't6', name: 'Emergency procedures', mins: 15, done: false, cat: 'Foundations' },
];

const BENEFITS = [
  { id: 'medical', name: 'Medical', icon: 'heart', options: [
    { name: 'PPO Plus', cost: '$142/mo', note: 'Lowest deductible · nationwide network' },
    { name: 'HSA Saver', cost: '$68/mo', note: 'High-deductible · employer HSA match' },
    { name: 'Waive', cost: '$0', note: 'I have coverage elsewhere' },
  ]},
  { id: 'dental', name: 'Dental', icon: 'tooth', options: [
    { name: 'Pure Dental Premier', cost: '$0/mo', note: 'Free care at any Pure location' },
    { name: 'Standard PPO', cost: '$14/mo', note: 'Any provider' },
  ]},
  { id: 'retire', name: '401(k)', icon: 'bolt', options: [
    { name: '6% + full match', cost: 'Recommended', note: 'We match 100% up to 6%' },
    { name: 'Custom %', cost: 'You choose', note: 'Set your own contribution' },
    { name: 'Enroll later', cost: '—', note: 'You can change anytime' },
  ]},
];

/* ---- Scheduling module seed data ---- */
const SCHED_ROLES = ['Dentist', 'RDH', 'DA', 'Front Desk'];
/* Coverage requirements per office (role -> count). Empty by default — managers
   configure per office; no requirement means no gap is flagged. */
const COVERAGE_REQS = {};
const WEEKEND_REQS = {};
const SHIFT_TEMPLATES = [
  { id: 's-open', label: 'Opening', start: '7:00', end: '3:00', hue: 195 },
  { id: 's-mid',  label: 'Mid', start: '9:00', end: '5:00', hue: 220 },
  { id: 's-close',label: 'Closing', start: '11:00', end: '7:00', hue: 280 },
  { id: 's-half', label: 'Half day', start: '8:00', end: '12:00', hue: 150 },
];
/* Current week, Mon–Sat (labels like "Mon 22") — generated, not hardcoded. */
const WEEK_DAYS = (() => {
  const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const now = new Date();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  const out = [];
  for (let i = 0; i < 6; i++) { const d = new Date(monday); d.setDate(monday.getDate() + i); out.push(`${names[d.getDay()]} ${d.getDate()}`); }
  return out;
})();

/* This week's stable key — the Monday's date (YYYY-MM-DD). Shared by the scheduler
   builder and My schedule so both read & write the same week. */
const WEEK_KEY = (() => {
  const now = new Date();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  const z = n => String(n).padStart(2, '0');
  return `${monday.getFullYear()}-${z(monday.getMonth() + 1)}-${z(monday.getDate())}`;
})();

/* ---- schedule persistence API (talks to the /api/schedule Function) ----
   Sends the Google token the same way /api/roster does. Outside production (sandbox)
   there is no /api, so these reject and callers fall back to an empty state. */
async function fetchSchedules({ office, weekKey } = {}) {
  const token = (typeof window !== 'undefined' && window.PD_GOOGLE_TOKEN) || '';
  const qs = new URLSearchParams();
  if (office) qs.set('office', office);
  if (weekKey) qs.set('weekKey', weekKey);
  const res = await fetch('/api/schedule' + (qs.toString() ? '?' + qs.toString() : ''), { headers: { 'X-Google-Token': token } });
  if (!res.ok) throw new Error('schedule read failed (' + res.status + ')');
  const data = await res.json();
  return data.schedules || [];
}
async function publishSchedule(body) {
  const token = (typeof window !== 'undefined' && window.PD_GOOGLE_TOKEN) || '';
  const res = await fetch('/api/schedule', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Google-Token': token },
    body: JSON.stringify(body),
  });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || ('publish failed (' + res.status + ')')); }
  return res.json();
}

/* ---- coverage requirements API (talks to the /api/coverage Function) ----
   Per-office weekday/weekend role→count targets. Outside production (sandbox)
   there is no /api, so these reject and callers fall back to empty config. */
async function fetchCoverage(office) {
  const token = (typeof window !== 'undefined' && window.PD_GOOGLE_TOKEN) || '';
  const qs = office ? '?office=' + encodeURIComponent(office) : '';
  const res = await fetch('/api/coverage' + qs, { headers: { 'X-Google-Token': token } });
  if (!res.ok) throw new Error('coverage read failed (' + res.status + ')');
  const data = await res.json();
  return data.coverage || [];
}
async function saveCoverage(body) {
  const token = (typeof window !== 'undefined' && window.PD_GOOGLE_TOKEN) || '';
  const res = await fetch('/api/coverage', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Google-Token': token },
    body: JSON.stringify(body),
  });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || ('save failed (' + res.status + ')')); }
  return res.json();
}

/* ---- time-off persistence API (talks to the /api/timeoff Function) ---- */
async function fetchTimeoff() {
  const token = (typeof window !== 'undefined' && window.PD_GOOGLE_TOKEN) || '';
  const res = await fetch('/api/timeoff', { headers: { 'X-Google-Token': token } });
  if (!res.ok) throw new Error('timeoff read failed (' + res.status + ')');
  const data = await res.json();
  return data.requests || [];
}
async function timeoffAction(body) {
  const token = (typeof window !== 'undefined' && window.PD_GOOGLE_TOKEN) || '';
  const res = await fetch('/api/timeoff', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Google-Token': token },
    body: JSON.stringify(body),
  });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || ('action failed (' + res.status + ')')); }
  return res.json();
}

/* ---- access control (talks to the /api/accesscontrol Function) ----
   Per-person permission overrides live in their own Cosmos container, one doc per
   person keyed by email. GET lists them; POST upserts one person's flags. */
async function fetchAccessControl() {
  const token = (typeof window !== 'undefined' && window.PD_GOOGLE_TOKEN) || '';
  const res = await fetch('/api/accesscontrol', { headers: { 'X-Google-Token': token } });
  if (!res.ok) throw new Error('access-control read failed (' + res.status + ')');
  const data = await res.json();
  return data.overrides || [];
}
async function saveAccessOverride(body) {
  const token = (typeof window !== 'undefined' && window.PD_GOOGLE_TOKEN) || '';
  const res = await fetch('/api/accesscontrol', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Google-Token': token },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || ('save failed (' + res.status + ')'));
  return data;
}

/* ---- direct notices (person → person) + live push (talks to /api/notify + /api/negotiate) ---- */
async function fetchNotices() {
  const token = (typeof window !== 'undefined' && window.PD_GOOGLE_TOKEN) || '';
  const res = await fetch('/api/notify', { headers: { 'X-Google-Token': token } });
  if (!res.ok) throw new Error('notices read failed (' + res.status + ')');
  const data = await res.json();
  return data.notices || [];
}
async function sendNotice(body) {
  const token = (typeof window !== 'undefined' && window.PD_GOOGLE_TOKEN) || '';
  const res = await fetch('/api/notify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Google-Token': token },
    body: JSON.stringify(body),
  });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || ('send failed (' + res.status + ')')); }
  return res.json();
}
/* Persist that I've read one of my notices (recipient-only, server-checked). */
async function markNoticeRead(id) {
  const token = (typeof window !== 'undefined' && window.PD_GOOGLE_TOKEN) || '';
  const res = await fetch('/api/notify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Google-Token': token },
    body: JSON.stringify({ action: 'read', id }),
  });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || ('read update failed (' + res.status + ')')); }
  return res.json();
}
/* Open the live SignalR connection so notices pushed to me arrive instantly. Returns the
   connection (call .stop() to close) or null when unavailable — no client library, not
   signed in, or no /api (sandbox). Safe to call always: on null the 5-min poll still covers
   everything, just not instantly. */
async function connectNotifications(email, onNotice) {
  if (typeof window === 'undefined' || !window.signalR || !email) return null;
  const token = window.PD_GOOGLE_TOKEN || '';
  if (!token) return null;
  try {
    const res = await fetch('/api/negotiate?userId=' + encodeURIComponent(email), { headers: { 'X-Google-Token': token } });
    if (!res.ok) return null;
    const info = await res.json();
    const conn = new window.signalR.HubConnectionBuilder()
      .withUrl(info.url, { accessTokenFactory: () => info.accessToken })
      .withAutomaticReconnect()
      .build();
    conn.on('notify', (notice) => { try { onNotice && onNotice(notice); } catch (e) {} });
    await conn.start();
    return conn;
  } catch (e) { return null; }
}

Object.assign(window, {
  newHireProfile, ROLE_PROFILES, APP_CATALOG, ROLE_ACCOUNT_RULES, ROLE_ONBOARDING, SKILLS, AGENT_CHANNELS, REVIEW_SCALE, REVIEW_QUESTIONS, TASKS, PAPERWORK_DOCS, POLICIES, TRAINING, BENEFITS,
  SCHED_ROLES, COVERAGE_REQS, WEEKEND_REQS, SHIFT_TEMPLATES, WEEK_DAYS, WEEK_KEY, fetchSchedules, publishSchedule, fetchTimeoff, timeoffAction,
  fetchCoverage, saveCoverage,
  fetchNotices, sendNotice, markNoticeRead, connectNotifications, fetchAccessControl, saveAccessOverride,
});
