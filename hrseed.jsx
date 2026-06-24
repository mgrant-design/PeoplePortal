/* hrseed.jsx — demo seed + shared stores for Employee Relations, Performance
   Reviews, and Paychex-style worked time with late detection.
   Loads after data.jsx + hrdata.js + rbac.jsx. Seeds localStorage once; all
   modules (employee.jsx, reviews.jsx, timeclock.jsx) read/write through here. */

/* ============================ tardiness rules ============================ */
const LATE_GRACE_MIN = 5;                 // late = clock-in > scheduled start + grace
const SCHED_START_MIN = 8 * 60;           // 8:00 AM default scheduled start
const COACHING_LATE_THRESHOLD = 3;        // # lates in a pay period that suggests coaching

function punchSchedStart(p) { return (p && p.schedStartMin != null) ? p.schedStartMin : SCHED_START_MIN; }
function punchInMinuteOfDay(p) { const d = new Date(p.in); return d.getHours() * 60 + d.getMinutes(); }
function punchLateMin(p) { return Math.max(0, punchInMinuteOfDay(p) - punchSchedStart(p) - LATE_GRACE_MIN); }
function isLatePunch(p) { return punchLateMin(p) > 0; }
function tardiness(punches) {
  const list = (punches || []).filter(isLatePunch);
  return { count: list.length, totalMin: list.reduce((a, p) => a + punchLateMin(p), 0) };
}

/* ============================ deterministic RNG ============================ */
function _hash(str) { let h = 1779033703 ^ str.length; for (let i = 0; i < str.length; i++) { h = Math.imul(h ^ str.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); } return h >>> 0; }
function _rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/* Employees made deliberate repeat-offenders so the team view + coaching prompt
   always demo well. Everyone else gets a hashed tier. */
const _FORCED_TIER = {
  '9Qc6Gv9Q': 2, // Nilsa Marte
  '7Wy9Ml3G': 2, // Maham Naeem
  '1Yc5Re6V': 2, // Nick Duran (lab)
  '3Qj5Vv5Y': 1, // Alexandra Long (employee demo) — a couple of lates, no prompt
  '5Gn9Aq5U': 1, // Alina Popescu
  '8Vr2Do9Z': 1, // Hu Jiang
};
function _tier(empId) { if (_FORCED_TIER[empId] != null) return _FORCED_TIER[empId]; return _hash(empId) % 3 === 0 ? 1 : 0; }

/* ===================== Paychex-style worked shifts ===================== */
/* Generates a realistic pay-period of shifts ending today. Late clock-ins are
   computed against the 8:00 AM schedule; recent shifts stay 'pending'. */
function paychexSeed(empId, loc) {
  const rnd = _rng(_hash(empId + '|punch'));
  const tier = _tier(empId);
  const lateProb = [0.08, 0.25, 0.55][tier];
  const out = [];
  for (let daysAgo = 13; daysAgo >= 1; daysAgo--) {
    const d = new Date(); d.setDate(d.getDate() - daysAgo); d.setHours(0, 0, 0, 0);
    const dow = d.getDay(); if (dow === 0 || dow === 6) continue;            // skip weekends
    if (rnd() < 0.12) continue;                                              // occasional day off
    const late = rnd() < lateProb;
    const lateMin = late ? 6 + Math.floor(rnd() * 24) : 0;                   // 6–29 min late
    const earlyMin = late ? 0 : Math.floor(rnd() * 9);                       // 0–8 min early/on-time
    const inMin = SCHED_START_MIN + (late ? lateMin : -earlyMin);
    const ci = new Date(d); ci.setHours(0, inMin, 0, 0);
    const workMin = 480 + Math.floor(rnd() * 90);                            // 8–9.5h
    const br = [30, 30, 45, 60][Math.floor(rnd() * 4)];
    const co = new Date(ci.getTime() + (workMin + br) * 60000);
    const status = daysAgo <= 2 ? 'pending' : (daysAgo <= 6 ? 'approved' : 'exported');
    out.push({
      id: 'p' + empId + '_' + daysAgo, date: ci.toISOString(), location: loc,
      in: ci.getTime(), out: co.getTime(), breakMins: br, status,
      schedStartMin: SCHED_START_MIN,
    });
  }
  return out;
}

/* ===================== Employee relations store ===================== */
const REL_KEY = 'pd_relations_v1';
function loadRelations() { try { return JSON.parse(localStorage.getItem(REL_KEY)) || {}; } catch (e) { return {}; } }
function persistRelations(r) { try { localStorage.setItem(REL_KEY, JSON.stringify(r)); } catch (e) {} }
function getRelations(empId) { return (loadRelations()[empId] || []).slice().sort((a, b) => b.date.localeCompare(a.date)); }
function addRelationEvent(empId, ev) {
  const all = loadRelations();
  const item = { id: ev.id || ('e' + Date.now()), ...ev };
  all[empId] = [item, ...(all[empId] || [])];
  persistRelations(all);
  return item;
}

/* Sample positive + disciplinary records spread across active staff. */
const RELATIONS_SEED = {
  '3Qj5Vv5Y': [ // Alexandra Long
    { id: 's_al1', type: 'commendation', date: '2026-05-12', author: 'Denise DiBella · Clinical Manager', title: 'Outstanding chairside support during implant week', notes: 'Kept three operatories turning over smoothly and received unprompted patient praise. A real anchor for the Hauppauge clinical pod.', ack: 'acknowledged' },
    { id: 's_al2', type: 'coaching', date: '2026-06-08', author: 'Denise DiBella · Clinical Manager', title: 'Punctuality check-in', notes: 'A few late clock-ins this period. Agreed on a 7:45 arrival target to be set up before the first patient. No further action — tracking.', ack: 'acknowledged' },
  ],
  '7Ju1Bc8X': [ // Mihaela Marinescu
    { id: 's_mm1', type: 'commendation', date: '2026-04-22', author: 'Denise DiBella · Clinical Manager', title: 'Mentored two new assistants', notes: 'Volunteered to buddy-train new hires on Denticon charting and sterilization flow. Shortened their ramp considerably.', doc: { name: 'Recognition_Note.pdf' }, ack: 'acknowledged' },
  ],
  '5Na2Zt2H': [ // Iwona Kolendo
    { id: 's_ik1', type: 'note', date: '2026-03-30', author: 'HR · People Ops', title: 'Perfect attendance — Q1', notes: 'Zero unplanned absences and no tardies in the first quarter. Noted for the quarterly recognition list.', ack: 'acknowledged' },
  ],
  '9Qc6Gv9Q': [ // Nilsa Marte (repeat offender)
    { id: 's_nm1', type: 'verbal', date: '2026-05-28', author: 'Denise DiBella · Clinical Manager', title: 'Verbal warning — repeated tardiness', notes: 'Five late arrivals over two pay periods. Reviewed the attendance policy and expectations. Improvement expected within 30 days.', doc: { name: 'Verbal_Warning_Attendance.pdf' }, ack: 'awaiting' },
    { id: 's_nm2', type: 'commendation', date: '2026-02-14', author: 'Denise DiBella · Clinical Manager', title: 'Stepped up during short-staffed week', notes: 'Covered extra operatories without complaint when two assistants were out sick.', ack: 'acknowledged' },
  ],
  '6Hx6Rx2K': [ // Judith Lindor
    { id: 's_jl1', type: 'written', date: '2026-04-09', author: 'HR · People Ops', title: 'Written warning — PPE protocol', notes: 'Second documented instance of incomplete PPE during a surgical procedure. Corrective action plan issued; follow-up review in 60 days.', doc: { name: 'Written_Warning_PPE.pdf' }, ack: 'acknowledged' },
  ],
  '4Jy3Bn5F': [ // Samantha Rogacki
    { id: 's_sr1', type: 'note', date: '2026-06-02', author: 'Denise DiBella · Clinical Manager', title: 'Patient sent a thank-you card', notes: 'A nervous patient specifically thanked Samantha for her calm, reassuring manner during a long appointment.', ack: 'acknowledged' },
  ],
  '4Dg5Vy9C': [ // Carrie Herbstman
    { id: 's_ch1', type: 'commendation', date: '2026-05-19', author: 'Denise DiBella · Clinical Manager', title: 'Spotless lab-case turnaround', notes: 'No remakes or missed cases for the quarter. Lab and front desk both flagged her accuracy.', ack: 'acknowledged' },
  ],
  '9Ib7Pd9I': [ // Katelyn Stevens — Lab Cases Coordinator
    { id: 's_ks1', type: 'commendation', date: '2026-06-11', author: 'Denise DiBella · Clinical Manager', title: 'Rebuilt the lab-case tracking board', notes: 'Designed a clearer hand-off system between clinical and lab that cut chase-up calls noticeably.', ack: 'acknowledged' },
  ],
  '1Yc5Re6V': [ // Nick Duran (lab, repeat offender)
    { id: 's_nd1', type: 'coaching', date: '2026-06-05', author: 'Min Gil · Lab Manager', title: 'Coaching — start-of-day timeliness', notes: 'Several late starts have delayed morning case prep. Agreed on an earlier arrival and a check-in next pay period.', ack: 'awaiting' },
  ],
  '8Ue7Sc4V': [ // Katlyn DeAguiar (PX)
    { id: 's_kd1', type: 'commendation', date: '2026-04-30', author: 'Nicole Weigand · Patient Experience Manager', title: 'Top patient-satisfaction scores', notes: 'Highest post-visit survey scores on the Islandia front desk for two months running.', ack: 'acknowledged' },
  ],
  '1Wu2Rv3P': [ // Cheyenne Mancuso (PX)
    { id: 's_cm1', type: 'coaching', date: '2026-05-15', author: 'Nicole Weigand · Patient Experience Manager', title: 'Coaching — phone hand-off accuracy', notes: 'A couple of mis-routed insurance calls. Walked through the transfer tree together; confidence improving.', ack: 'acknowledged' },
  ],
  '3Wz7Lo1M': [ // Evon Martinez (hygiene)
    { id: 's_em1', type: 'commendation', date: '2026-03-18', author: 'Stephanie Crane · Hygiene Manager', title: 'Perio program champion', notes: 'Drove a noticeable lift in perio re-care acceptance at Manorville through clear patient education.', ack: 'acknowledged' },
  ],
  '7Wy9Ml3G': [ // Maham Naeem (repeat offender) — leave relations light; lates drive a fresh coaching prompt in the demo
    { id: 's_mn1', type: 'note', date: '2026-02-26', author: 'Denise DiBella · Clinical Manager', title: 'Strong start to the year', notes: 'Quick to learn surgical setups; positive attitude noted by the providers.', ack: 'acknowledged' },
  ],
};

/* ===================== Performance reviews seed ===================== */
function _side(r1, r2, r3, r4, r5, comments, overall, done) {
  return { ratings: { q1: r1, q2: r2, q3: r3, q4: r4, q5: r5 }, comments: comments || {}, overall: overall || '', done: !!done };
}
const REVIEWS_SEED = {
  // fully completed & shared
  '3Qj5Vv5Y': { // Alexandra Long
    self: _side(4, 5, 4, 3, 4, { q4: 'Working on getting in earlier before first patient.' }, 'Proud of my chairside work; want to tighten up my mornings and take on more implant cases.', true),
    manager: _side(4, 5, 5, 3, 4, { q1: 'Excellent clinical instincts.', q4: 'A few late arrivals — addressed and improving.' }, 'Alexandra is one of the strongest assistants on the Hauppauge pod. Reliability is the one growth area; punctuality plan in place. On track for added implant responsibility.', true),
    shared: true,
  },
  '7Ju1Bc8X': { // Mihaela Marinescu
    self: _side(5, 4, 5, 5, 4, {}, 'Enjoy mentoring new assistants and keeping the pod organized.', true),
    manager: _side(5, 5, 5, 5, 4, { q3: 'Natural mentor.' }, 'A model team member — dependable, patient-focused, and a force-multiplier for new hires. Ready for a lead-assistant track.', true),
    shared: true,
  },
  '5Na2Zt2H': { // Iwona Kolendo
    self: _side(4, 4, 4, 5, 3, {}, 'Reliable and steady; would like more cross-training.', true),
    manager: _side(4, 5, 4, 5, 4, { q4: 'Perfect attendance.' }, 'Rock-solid reliability and a calm presence. Encouraging her to pursue expanded-function cross-training this year.', true),
    shared: true,
  },
  // mid-cycle: self done, manager pending
  '9Qc6Gv9Q': { // Nilsa Marte
    self: _side(4, 4, 4, 3, 4, { q4: 'Know I need to improve my arrival times.' }, 'Want to rebuild trust around attendance and keep growing clinically.', true),
    manager: _side(0, 0, 0, 0, 0, {}, '', false),
  },
  '4Jy3Bn5F': { // Samantha Rogacki
    self: _side(4, 5, 4, 4, 4, {}, 'Love the patient-care side of the role.', true),
    manager: _side(0, 0, 0, 0, 0, {}, '', false),
  },
  '6Hx6Rx2K': { // Judith Lindor — self started only
    self: _side(3, 4, 3, 4, 3, {}, 'Focused on tightening up protocol compliance this cycle.', true),
    manager: _side(0, 0, 0, 0, 0, {}, '', false),
  },
  // (everyone else: not started — no record)
};

/* ===================== one-time seeding ===================== */
(function seedOnce() {
  try {
    // merge per-employee so we never clobber anything the user has entered,
    // but samples still appear even if an older demo left partial data behind.
    const rel = loadRelations();
    let relChanged = false;
    Object.keys(RELATIONS_SEED).forEach(id => { if (!rel[id]) { rel[id] = RELATIONS_SEED[id]; relChanged = true; } });
    if (relChanged) persistRelations(rel);

    let reviews = {};
    try { reviews = JSON.parse(localStorage.getItem('pd_reviews')) || {}; } catch (e) { reviews = {}; }
    let revChanged = false;
    Object.keys(REVIEWS_SEED).forEach(id => { if (!reviews[id]) { reviews[id] = REVIEWS_SEED[id]; revChanged = true; } });
    if (revChanged) localStorage.setItem('pd_reviews', JSON.stringify(reviews));
  } catch (e) {}
})();

/* ===================== Onboarding automations seed ===================== */
/* A few new hires currently mid-onboarding, spread across every office and
   department, each at a different point in Riley's pipeline. Persisted to
   pd_automations so progress is stable and advancing/opening a run survives. */
const AUTO_KEY = 'pd_automations';
const _agoDays = (n) => Date.now() - n * 86400000;
const SEED_AUTOMATIONS = [
  { id: 'seed_creyes',  name: 'Camila Reyes',  personalEmail: 'camila.reyes23@gmail.com',  mobile: '(516) 555-0182', jobTitle: 'Receptionist / Treatment Coordinator', department: 'Front Desk',        office: 'Garden City',  rk: 'frontdesk', provider: false, providerType: '',          manager: 'Cristina Gicu',   type: 'FT', startDate: 'Jul 6, 2026',  stage: 8, createdAt: _agoDays(9) },
  { id: 'seed_dcarter', name: 'Devon Carter',  personalEmail: 'devoncarter@outlook.com',    mobile: '(631) 555-0144', jobTitle: 'Dental Assistant',                      department: 'Clinical Team',     office: 'Hauppauge',    rk: 'frontdesk', provider: false, providerType: '',          manager: 'Denise DiBella',  type: 'FT', startDate: 'Jul 6, 2026',  stage: 4, createdAt: _agoDays(5) },
  { id: 'seed_stran',   name: 'Sophie Tran',   personalEmail: 'sophie.tran.rdh@gmail.com',  mobile: '(631) 555-0173', jobTitle: 'Dental Hygienist',                      department: 'Hygiene',           office: 'Wading River', rk: 'hygienist', provider: true,  providerType: 'Hygienist', manager: 'Stephanie Crane', type: 'PT', startDate: 'Jul 13, 2026', stage: 5, createdAt: _agoDays(6) },
  { id: 'seed_afeldman',name: 'Aaron Feldman', personalEmail: 'a.feldman.dds@gmail.com',    mobile: '(917) 555-0121', jobTitle: 'Associate Dentist',                     department: 'Providers',         office: 'Manorville',   rk: 'dentist',   provider: true,  providerType: 'Dentist',   manager: 'Keith Vibert',    type: 'FT', startDate: 'Jul 20, 2026', stage: 3, createdAt: _agoDays(3) },
  { id: 'seed_gmarin',  name: 'Gabriela Marin',personalEmail: 'gabriela.marin@gmail.com',   mobile: '(973) 555-0190', jobTitle: 'Insurance Coordinator',                 department: 'Insurance',         office: 'New Jersey',   rk: 'insurance', provider: false, providerType: '',          manager: 'Amani Hourani',   type: 'FT', startDate: 'Jun 29, 2026', stage: 9, createdAt: _agoDays(11) },
  { id: 'seed_ncole',   name: 'Naomi Cole',    personalEmail: 'naomi.cole98@gmail.com',     mobile: '(631) 555-0166', jobTitle: 'Patient Experience Representative',      department: 'Patient Experience',office: 'Islandia',     rk: 'frontdesk', provider: false, providerType: '',          manager: 'Nicole Weigand',  type: 'FT', startDate: 'Jul 13, 2026', stage: 1, createdAt: _agoDays(2) },
].map(a => ({ ...a, workEmail: (typeof genWorkEmail === 'function') ? genWorkEmail(a.name) : a.name.toLowerCase().replace(/\s+/g, '.') + '@puredental.com' }));

function loadAutomations() {
  try {
    const raw = localStorage.getItem(AUTO_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  try { localStorage.setItem(AUTO_KEY, JSON.stringify(SEED_AUTOMATIONS)); } catch (e) {}
  return SEED_AUTOMATIONS.map(a => ({ ...a }));
}
function persistAutomations(list) { try { localStorage.setItem(AUTO_KEY, JSON.stringify(list)); } catch (e) {} }

Object.assign(window, {
  LATE_GRACE_MIN, SCHED_START_MIN, COACHING_LATE_THRESHOLD,
  punchLateMin, isLatePunch, tardiness, paychexSeed,
  loadRelations, persistRelations, getRelations, addRelationEvent,
  RELATIONS_SEED, REVIEWS_SEED, SEED_AUTOMATIONS, loadAutomations, persistAutomations,
});
