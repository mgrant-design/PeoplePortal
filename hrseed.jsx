/* hrseed.jsx — shared stores for Employee Relations, Performance Reviews, and
   Paychex-style worked time with late detection.
   Demo seed data REMOVED — stores now start empty and fill with real activity.
   Loads after data.jsx + rbac.jsx. All modules (employee.jsx, reviews.jsx,
   timeclock.jsx) read/write through here. */

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

/* paychexSeed kept as a NO-OP so any caller still works, but generates no fake punches.
   Real time-clock punches come from actual clock-ins. */
function paychexSeed(empId, loc) { return []; }

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

/* ===================== Onboarding automations store ===================== */
const AUTO_KEY = 'pd_automations';
function loadAutomations() {
  try {
    const raw = localStorage.getItem(AUTO_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return [];   // no fake new-hires — empty until a real hire enters onboarding
}
function persistAutomations(list) { try { localStorage.setItem(AUTO_KEY, JSON.stringify(list)); } catch (e) {} }

/* Empty seed exports retained so any module importing them doesn't break. */
const RELATIONS_SEED = {};
const REVIEWS_SEED = {};
const SEED_AUTOMATIONS = [];

Object.assign(window, {
  LATE_GRACE_MIN, SCHED_START_MIN, COACHING_LATE_THRESHOLD,
  punchLateMin, isLatePunch, tardiness, paychexSeed,
  loadRelations, persistRelations, getRelations, addRelationEvent,
  RELATIONS_SEED, REVIEWS_SEED, SEED_AUTOMATIONS, loadAutomations, persistAutomations,
});
