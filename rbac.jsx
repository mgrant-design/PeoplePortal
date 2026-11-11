/* rbac.jsx — identity, role-based access control, and data scoping.
   Reads window.HRDATA. Derived structures are REBUILDABLE: call window.PD_REBUILD_HRDATA()
   after the roster is (re)loaded post-login, and all in-place structures refresh. */

const COMPANY_DOMAINS = window.PD_ACCESS_RULES.COMPANY_DOMAINS;

/* ---- "See Everyone" ----
   An admin-granted, per-person visibility override. It widens WHO a person can see; it
   never widens what they may do — editing, terminating and relations notes stay on the
   reporting-chain test. Granted globally (pages = []) or limited to the pages below.
   Only pages whose contents are scoped by the visible-people list belong here: the
   Directory is company-wide for everyone and needs no entry, and pages that never read
   the people list (Riley, Ask HR, Scrubs, onboarding automations, Feedback) have nothing
   to widen. */
const SEE_ALL_PAGES = [
  { id: 'scheduler', label: 'Scheduling' },
  { id: 'timeclock', label: 'Time clock' },
  { id: 'reviews', label: 'Performance reviews' },
  { id: 'offboarding', label: 'Offboarding' },
  { id: 'reports', label: 'Reports' },
  { id: 'library', label: 'Learning Library' },
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'onboardingstatus', label: 'Onboarding status' },
  { id: 'notifications', label: 'Notifications' },
  { id: 'emprecord', label: 'Employee records' },
];

/* ---- normalize ---- */
const normLoc = window.PD_ACCESS_RULES.normLoc;

/* Mutable, stable references — repopulated in place by buildFromHRDATA() so any
   module that imported these keeps seeing live data after a post-login reload. */
let HR = window.HRDATA || { employees: [], offices: [], departments: [], titles: [], managers: [], users: [], offboarding: [] };
const EMPLOYEES = [];
/* Company-wide people list for the Directory. The roster response carries a `directory`
   array of every active employee with work-contact fields only; anyone the caller can
   fully see is overlaid from EMPLOYEES so their own team still shows mobile numbers. */
const DIRECTORY = [];
const byEmail = {};
const usersByEmail = {};
let managerEmails = new Set();

function buildFromHRDATA() {
  HR = window.HRDATA || { employees: [], offices: [], departments: [], titles: [], managers: [], users: [], offboarding: [] };
  /* week-start comes down with the roster so it is set before any view computes a week key */
  if (typeof setWeekStart === 'function' && HR.weekStart != null) setWeekStart(HR.weekStart);

  // EMPLOYEES: clear and repopulate in place (keep same array reference)
  EMPLOYEES.length = 0;
  (HR.employees || []).forEach(e => {
    EMPLOYEES.push({
      ...e,
      loc: normLoc(e.location),
      name: `${e.first} ${e.last}`.trim(),
      emailLower: (e.workEmail || '').toLowerCase(),
    });
  });

  DIRECTORY.length = 0;
  {
    const seen = {};
    EMPLOYEES.forEach(e => { seen[e.id] = true; DIRECTORY.push(e); });
    (HR.directory || []).forEach(d => {
      if (seen[d.id]) return;
      DIRECTORY.push({ ...d, loc: normLoc(d.location), name: `${d.first} ${d.last}`.trim(), emailLower: (d.workEmail || '').toLowerCase() });
    });
  }

  for (const k in byEmail) delete byEmail[k];
  EMPLOYEES.forEach(e => { if (e.emailLower) byEmail[e.emailLower] = e; });

  for (const k in usersByEmail) delete usersByEmail[k];
  (HR.users || []).forEach(u => { usersByEmail[(u.email || '').toLowerCase()] = u; });

  managerEmails = new Set((HR.managers || []).map(m => (m.email || '').toLowerCase()));

  // keep window.HR pointing at current HR for modules that read window.HR
  window.HR = HR;
}

buildFromHRDATA(); // initial build from whatever HRDATA exists at load (may be empty pre-login)

function deptLeaders() { return EMPLOYEES.filter(e => e.isManager || managerEmails.has(e.emailLower)); }

/* ---- access derivation: the rules live in access-rules.js ---- */
function deriveAccess(me) {
  const perms = usersByEmail[me.emailLower] || {};
  const hasReports = EMPLOYEES.some(e => e.managerEmail && e.managerEmail.toLowerCase() === me.emailLower);
  // the admin Switch view preview (app.jsx) sets __PD_DEV_VIEW while it renders
  const viewAs = (typeof window !== 'undefined' && window.__PD_DEV_VIEW) || null;
  return window.PD_ACCESS_RULES.deriveAccessCore({ me, perms, hasReports, isListedManager: managerEmails.has(me.emailLower), viewAs });
}

/* employees visible to `me` given access */
function scopedEmployees(me, access) {
  if (access.caps.viewAll) return EMPLOYEES;
  if (access.caps.viewTeam) return window.PD_ACCESS_RULES.reportingTree(me, EMPLOYEES);
  return EMPLOYEES.filter(e => e.id === me.id);
}

/* Does `access` see the whole company on this page? viewAll always does. */
function seesAll(access, pageId) { return window.PD_ACCESS_RULES.seesAllOn(access, pageId); }

/* The people list a given page should render for `me`. */
function pageEmployees(me, access, pageId) {
  return seesAll(access, pageId) ? EMPLOYEES : scopedEmployees(me, access);
}

function isCompanyEmail(email) { return window.PD_ACCESS_RULES.domainAllowed(email); }
function findByEmail(email) { return byEmail[(email || '').toLowerCase()] || null; }

/* session — stores the signed-in employee id; resolved against live EMPLOYEES */
function loadSession() { try { const id = localStorage.getItem('pd_session'); return id ? EMPLOYEES.find(e => e.id === id) : null; } catch (e) { return null; } }
function saveSession(emp) { try { emp ? localStorage.setItem('pd_session', emp.id) : localStorage.removeItem('pd_session'); } catch (e) {} }

Object.assign(window, {
  HR, EMPLOYEES, DIRECTORY, SEE_ALL_PAGES, COMPANY_DOMAINS, deriveAccess, scopedEmployees,
  seesAll, pageEmployees,
  isCompanyEmail, findByEmail, loadSession, saveSession, normLoc, deptLeaders,
  PD_REBUILD_HRDATA: buildFromHRDATA,
});
