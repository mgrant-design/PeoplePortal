/* data.jsx — seed data for the onboarding portal */

const NEW_HIRE = {
  name: 'Maya Robbins',
  role: 'Registered Dental Hygienist',
  location: 'Pure Dental — Riverside',
  startDate: 'Monday, June 22, 2026',
  manager: 'Dr. Elena Cho',
  email: 'maya.robbins@puredental.com',
  username: 'mrobbins',
};

/* ---- Role model: drives credentials gating + which apps get provisioned ---- */
const ROLE_PROFILES = {
  hygienist: { id: 'hygienist', label: 'Registered Dental Hygienist', short: 'RDH', clinical: true, provider: true, dea: false, taxonomy: 'Dental Hygienist · 124Q00000X', apps: ['google', 'denticon', 'denticon_provider'] },
  dentist:   { id: 'dentist', label: 'Dentist', short: 'DDS', clinical: true, provider: true, dea: true, taxonomy: 'General Dentist · 1223G0001X', apps: ['google', 'denticon', 'denticon_provider', 'dosespot'] },
  frontdesk: { id: 'frontdesk', label: 'Front Desk Coordinator', short: 'Front Desk', clinical: false, provider: false, apps: ['google', 'nexhealth'] },
  insurance: { id: 'insurance', label: 'Insurance & Billing Specialist', short: 'Insurance', clinical: false, provider: false, apps: ['google', 'nexhealth'] },
};

/* ---- App catalog: each provisions via its API; ready state reveals credentials ---- */
const APP_CATALOG = {
  google:            { id: 'google', name: 'Google Workspace', detail: 'Email, Calendar & Drive', icon: 'mail', api: 'Google Admin SDK', provider: false, user: 'maya.robbins@puredental.com', pass: 'Welcome#Pure26', url: 'mail.google.com', reset: true },
  denticon:          { id: 'denticon', name: 'Denticon', detail: 'Practice management & charting', icon: 'tooth', api: 'Denticon Partner API', provider: false, user: 'mrobbins', pass: 'Dnt-4xQ!92', url: 'a.denticon.com', reset: true },
  denticon_provider: { id: 'denticon_provider', name: 'Denticon — Provider profile', detail: 'Provider record, production & e-claims', icon: 'star', api: 'Denticon Partner API', provider: true, user: 'prov-mrobbins', pass: 'auto-linked to NPI', url: 'a.denticon.com', reset: false },
  nexhealth:         { id: 'nexhealth', name: 'NexHealth', detail: 'Patient messaging & online booking', icon: 'calendar', api: 'NexHealth API', provider: false, user: 'maya.robbins', pass: 'Nex-7teal!', url: 'app.nexhealth.com', reset: true },
  dosespot:          { id: 'dosespot', name: 'DoseSpot', detail: 'e-Prescribing (EPCS) for controlled meds', icon: 'shield', api: 'DoseSpot SSO API', provider: true, user: 'mrobbins-dds', pass: 'SSO via Google', url: 'my.dosespot.com', reset: false },
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

/* ---- Onboarding agent: channels, knowledge base, and routing directory ---- */
const AGENT_CHANNELS = [
  { id: 'email', name: 'Email', icon: 'mail', detail: 'Welcome notes, links & document delivery', on: true },
  { id: 'sms', name: 'SMS / Text', icon: 'phone', detail: 'Reminders & quick confirmations', on: true },
  { id: 'voice', name: 'Voice calls', icon: 'phone', detail: 'Friendly agent answers questions & books interviews', on: true },
  { id: 'gchat', name: 'Google Chat', icon: 'users', detail: 'Shares updates with the onboarding team', on: true },
];

const AGENT_KNOWLEDGE = [
  { topic: 'First day & what to bring', icon: 'sparkle', keywords: 'first day bring start arrive when time breakfast', answer: 'On day one, arrive 15 minutes early and bring a photo ID plus your direct-deposit info. Everything else is already in your portal. Breakfast is on us!' },
  { topic: 'Parking & directions', icon: 'pin', keywords: 'parking park directions where address lot drive', answer: 'Park in the staff lot behind your home office — use the rear entrance. I can text you the exact map pin if that helps.' },
  { topic: 'Dress code & scrubs', icon: 'tooth', keywords: 'dress code scrubs wear clothes uniform attire', answer: 'Clinical team wears solid-color scrubs (we order your Pure Dental set). Front office is business casual. Closed-toe shoes for everyone in clinical areas.' },
  { topic: 'Pay schedule & direct deposit', icon: 'bolt', keywords: 'pay paycheck payroll salary deposit money when paid', answer: 'Pure runs payroll biweekly. Your first deposit lands two Fridays after your start date. Set up direct deposit in your paperwork and it routes automatically.' },
  { topic: 'Benefits & enrollment windows', icon: 'heart', keywords: 'benefits insurance medical dental 401k enrollment enroll health', answer: 'You have 30 days from your start date to enroll in medical, dental, vision, and 401(k). Pure matches 100% up to 6% on the 401(k), and dental care at any Pure location is free.' },
  { topic: 'PTO & time-off requests', icon: 'calendar', keywords: 'pto time off vacation sick leave request days holiday', answer: 'PTO accrues from day one. Submit time-off requests in the portal and your manager is notified for approval. New hires start at 12 days/year plus paid holidays.' },
  { topic: 'Logins, email & systems', icon: 'key', keywords: 'login password email account access system denticon google reset', answer: 'Your accounts (Google Workspace, Denticon, and more) are auto-created and the logins are delivered to your work email. You set a new password on first sign-in. Stuck? I can route you to IT.' },
  { topic: 'Credentialing & licensing', icon: 'star', keywords: 'credential license npi dea provider malpractice scope certification', answer: 'For providers, we verify your NPI, state license, and DEA automatically and set renewal reminders. Questions on coverage or clinical scope go to your Clinical Manager.' },
];

/* who inquiries route to — real people from the org */
const AGENT_ROUTING = [
  { category: 'Payroll & pay questions', to: 'Tobin Whitaker', role: 'Director of HR & Payroll', via: 'Email + Google Chat' },
  { category: 'Benefits & enrollment', to: 'Tobin Whitaker', role: 'HR & Payroll', via: 'Email' },
  { category: 'Clinical / malpractice / scope', to: 'Zane Marsh', role: 'Clinical Manager', via: 'Google Chat' },
  { category: 'Credentialing & licensing', to: 'Xenia Jennings', role: 'People Ops · Admin', via: 'Google Chat' },
  { category: 'IT, logins & access', to: 'IT Help Desk', role: 'help@puredental.com · ext. 100', via: 'Email' },
  { category: 'Scheduling & first week', to: 'Office Manager', role: 'Home location', via: 'SMS + Email' },
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

const ACCOUNTS = [
  { id: 'email', name: 'Pure Dental email', detail: 'maya.robbins@puredental.com', status: 'ready', icon: 'mail' },
  { id: 'pms',   name: 'Practice management (Open Dental)', detail: 'Clinical + charting access', status: 'ready', icon: 'tooth' },
  { id: 'badge', name: 'Building access badge', detail: 'Riverside — pick up at front desk', status: 'pending', icon: 'key' },
  { id: 'phone', name: 'Phone & voicemail extension', detail: 'Ext. 219', status: 'provisioning', icon: 'phone' },
  { id: 'lms',   name: 'Learning portal (Paychex Learning)', detail: 'SSO enabled', status: 'ready', icon: 'book' },
];

const TRAINING = [
  { id: 't1', name: 'Welcome & company values', mins: 20, done: false, cat: 'Foundations' },
  { id: 't2', name: 'Infection control & sterilization', mins: 45, done: false, cat: 'Clinical' },
  { id: 't3', name: 'Open Dental: charting basics', mins: 35, done: false, cat: 'Software' },
  { id: 't4', name: 'Patient communication standards', mins: 25, done: false, cat: 'Clinical' },
  { id: 't5', name: 'Radiography safety refresher', mins: 30, done: false, cat: 'Clinical' },
  { id: 't6', name: 'Emergency procedures', mins: 15, done: false, cat: 'Foundations' },
];

const TEAM = [
  { name: 'Dr. Elena Cho', role: 'Lead Dentist · Your manager', tag: 'manager', email: 'elena.cho@puredental.com' },
  { name: 'Marcus Webb', role: 'Office Manager', tag: 'buddy', email: 'marcus.webb@puredental.com' },
  { name: 'Priya Nair', role: 'Registered Dental Hygienist', tag: 'pod', email: 'priya.nair@puredental.com' },
  { name: 'Devon Liu', role: 'Dental Assistant', tag: 'pod', email: 'devon.liu@puredental.com' },
  { name: 'Sofia Reyes', role: 'Front Desk Coordinator', tag: 'pod', email: 'sofia.reyes@puredental.com' },
  { name: 'Tom Becker', role: 'Regional HR · People Ops', tag: 'hr', email: 'tom.becker@puredental.com' },
];

const FIRST_WEEK = [
  { day: 'Mon', date: 'Jun 22', items: [
    { t: '9:00', label: 'Welcome breakfast with the team', kind: 'social' },
    { t: '10:00', label: 'Office tour + badge pickup', kind: 'admin' },
    { t: '11:30', label: 'Systems setup with Marcus', kind: 'setup' },
    { t: '1:30', label: 'Shadow Priya — patient flow', kind: 'shadow' },
  ]},
  { day: 'Tue', date: 'Jun 23', items: [
    { t: '8:30', label: 'Infection control training', kind: 'training' },
    { t: '11:00', label: 'Charting practice in Open Dental', kind: 'training' },
    { t: '2:00', label: 'First supervised patient', kind: 'clinical' },
  ]},
  { day: 'Wed', date: 'Jun 24', items: [
    { t: '9:00', label: 'Shadow Dr. Cho — hygiene exams', kind: 'shadow' },
    { t: '1:00', label: 'Benefits Q&A with Tom (HR)', kind: 'admin' },
  ]},
  { day: 'Thu', date: 'Jun 25', items: [
    { t: '8:30', label: 'Solo patients (Dr. Cho on call)', kind: 'clinical' },
    { t: '12:00', label: 'Lunch with your pod', kind: 'social' },
  ]},
  { day: 'Fri', date: 'Jun 26', items: [
    { t: '9:00', label: 'Full hygiene schedule', kind: 'clinical' },
    { t: '4:00', label: 'Week-one check-in with manager', kind: 'admin' },
  ]},
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
const SCHED_LOCATIONS = ['Riverside', 'Downtown', 'Northgate'];
const SCHED_ROLES = ['Dentist', 'RDH', 'DA', 'Front Desk'];
/* role-based coverage requirements (weekdays) per location */
const COVERAGE_REQS = {
  Riverside: { Dentist: 1, RDH: 2, DA: 1, 'Front Desk': 1 },
  Downtown:  { Dentist: 1, RDH: 1, DA: 1 },
  Northgate: { RDH: 1, 'Front Desk': 1 },
};
/* lighter Saturday requirements */
const WEEKEND_REQS = {
  Riverside: { RDH: 1, 'Front Desk': 1 },
  Downtown:  { RDH: 1 },
  Northgate: {},
};
const SCHED_TEAMS = {
  Riverside: [
    { id: 'u1', name: 'Maya Robbins', role: 'RDH', color: 195, skills: ['Hygiene', 'Perio', 'Imaging/X-ray', 'Spanish'] },
    { id: 'u2', name: 'Priya Nair', role: 'RDH', color: 220, skills: ['Hygiene', 'Pediatric', 'Imaging/X-ray'] },
    { id: 'u3', name: 'Devon Liu', role: 'DA', color: 150, skills: ['Surgery assist', 'Imaging/X-ray', 'Sedation'] },
    { id: 'u4', name: 'Sofia Reyes', role: 'Front Desk', color: 75, skills: ['Front desk', 'Insurance/Billing', 'Spanish'] },
    { id: 'u5', name: 'Dr. Elena Cho', role: 'Dentist', color: 280, skills: ['Surgery assist', 'Implants', 'Endo', 'Invisalign'] },
  ],
  Downtown: [
    { id: 'u6', name: 'Jordan Pike', role: 'RDH', color: 195, skills: ['Hygiene', 'Perio'] },
    { id: 'u7', name: 'Amara Diaz', role: 'DA', color: 150, skills: ['Imaging/X-ray', 'Surgery assist'] },
    { id: 'u8', name: 'Dr. Ray Okafor', role: 'Dentist', color: 280, skills: ['Endo', 'Implants', 'Sedation'] },
  ],
  Northgate: [
    { id: 'u9', name: 'Lena Frost', role: 'Front Desk', color: 75, skills: ['Front desk', 'Insurance/Billing'] },
    { id: 'u10', name: 'Beau Tran', role: 'RDH', color: 195, skills: ['Hygiene', 'Pediatric', 'Invisalign'] },
  ],
};
const SHIFT_TEMPLATES = [
  { id: 's-open', label: 'Opening', start: '7:00', end: '3:00', hue: 195 },
  { id: 's-mid',  label: 'Mid', start: '9:00', end: '5:00', hue: 220 },
  { id: 's-close',label: 'Closing', start: '11:00', end: '7:00', hue: 280 },
  { id: 's-half', label: 'Half day', start: '8:00', end: '12:00', hue: 150 },
];
const WEEK_DAYS = ['Mon 22', 'Tue 23', 'Wed 24', 'Thu 25', 'Fri 26', 'Sat 27'];

/* pre-seeded shifts: key `${userId}|${dayIdx}` -> shift template id */
const SEED_SHIFTS = {
  'u1|0': 's-mid', 'u1|1': 's-open', 'u1|3': 's-mid', 'u1|4': 's-mid',
  'u2|0': 's-open', 'u2|1': 's-mid', 'u2|2': 's-open', 'u2|4': 's-close',
  'u3|0': 's-mid', 'u3|2': 's-mid', 'u3|3': 's-close',
  'u4|0': 's-open', 'u4|1': 's-open', 'u4|2': 's-open', 'u4|3': 's-open', 'u4|4': 's-open',
  'u5|1': 's-mid', 'u5|3': 's-mid', 'u5|4': 's-half',
};

Object.assign(window, {
  NEW_HIRE, ROLE_PROFILES, APP_CATALOG, ROLE_ACCOUNT_RULES, ROLE_ONBOARDING, SKILLS, AGENT_CHANNELS, AGENT_KNOWLEDGE, AGENT_ROUTING, REVIEW_SCALE, REVIEW_QUESTIONS, TASKS, PAPERWORK_DOCS, POLICIES, ACCOUNTS, TRAINING, TEAM, FIRST_WEEK, BENEFITS,
  SCHED_LOCATIONS, SCHED_ROLES, COVERAGE_REQS, WEEKEND_REQS, SCHED_TEAMS, SHIFT_TEMPLATES, WEEK_DAYS, SEED_SHIFTS,
});
