/* hrseed.jsx — shared stores for Employee Relations, Performance Reviews, and
   Paychex-style worked time with late detection.
   Demo seed data REMOVED — stores now start empty and fill with real activity.
   Loads after data.jsx + rbac.jsx. All modules (employee.jsx, reviews.jsx,
   timeclock.jsx) read/write through here. */

/* ============================ tardiness rules ============================ */
const LATE_GRACE_MIN = 5;                 // late = clock-in > scheduled start + grace
const COACHING_LATE_THRESHOLD = 3;        // # lates in a pay period that suggests coaching

/* late is measured against the person's published shift that day; with no shift there is nothing to be late for */
function punchInMinuteOfDay(p) { const d = new Date(p.in); return d.getHours() * 60 + d.getMinutes(); }
function punchLateMin(p) { return (!p || p.schedStartMin == null) ? 0 : Math.max(0, punchInMinuteOfDay(p) - p.schedStartMin - LATE_GRACE_MIN); }
function isLatePunch(p) { return punchLateMin(p) > 0; }
function tardiness(punches) {
  const list = (punches || []).filter(isLatePunch);
  return { count: list.length, totalMin: list.reduce((a, p) => a + punchLateMin(p), 0) };
}

/* paychexSeed kept as a NO-OP so any caller still works, but generates no fake punches.
   Real time-clock punches come from actual clock-ins. */
function paychexSeed(empId, loc) { return []; }

/* ===================== Employee relations store ===================== */
/* NO BACKEND. Employee-relations events have no /api endpoint yet — in-memory only,
   gone on reload. No localStorage. */
let _relations = {};
function loadRelations() { return _relations; }
function persistRelations(r) { _relations = r || {}; }
function getRelations(empId) { return (loadRelations()[empId] || []).slice().sort((a, b) => b.date.localeCompare(a.date)); }
function addRelationEvent(empId, ev) {
  const all = loadRelations();
  const item = { id: ev.id || ('e' + Date.now()), ...ev };
  all[empId] = [item, ...(all[empId] || [])];
  persistRelations(all);
  return item;
}

/* ===================== Onboarding automations store ===================== */
const AUTO_KEY = 'pd_automations';
/* NO BACKEND. Onboarding automations have no /api endpoint yet — in-memory only,
   gone on reload. No localStorage, no fake new-hires. */
let _automations = [];
function loadAutomations() { return _automations; }
function persistAutomations(list) { _automations = list || []; }

/* Empty seed exports retained so any module importing them doesn't break. */
const RELATIONS_SEED = {};
const REVIEWS_SEED = {};
const SEED_AUTOMATIONS = [];

Object.assign(window, {
  LATE_GRACE_MIN, COACHING_LATE_THRESHOLD,
  punchLateMin, isLatePunch, tardiness, paychexSeed,
  loadRelations, persistRelations, getRelations, addRelationEvent,
  RELATIONS_SEED, REVIEWS_SEED, SEED_AUTOMATIONS, loadAutomations, persistAutomations,
});
