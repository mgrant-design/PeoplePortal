/* rbac.jsx — identity, role-based access control, and data scoping.
   Reads window.HRDATA. Derived structures are REBUILDABLE: call window.PD_REBUILD_HRDATA()
   after the roster is (re)loaded post-login, and all in-place structures refresh. */

const COMPANY_DOMAINS = ['puredental.com', 'foureversmile.com', 'puredentallab.com'];

/* ---- normalize ---- */
function normLoc(l) {
  const s = (l || '').toLowerCase();
  if (!s) return 'Unassigned';
  if (s.includes('remote')) return 'Remote';
  if (s.includes('hauppauge')) return 'Hauppauge';
  if (s.includes('garden')) return 'Garden City';
  if (s.includes('manorville')) return 'Manorville';
  if (s.includes('wading')) return 'Wading River';
  if (s.includes('islandia')) return 'Islandia';
  if (s.includes('jersey')) return 'New Jersey';
  if (s.includes('buffalo')) return 'Buffalo';
  return l;
}

/* Mutable, stable references — repopulated in place by buildFromHRDATA() so any
   module that imported these keeps seeing live data after a post-login reload. */
let HR = window.HRDATA || { employees: [], offices: [], departments: [], titles: [], managers: [], users: [], offboarding: [] };
const EMPLOYEES = [];
const byEmail = {};
const usersByEmail = {};
let managerEmails = new Set();

function buildFromHRDATA() {
  HR = window.HRDATA || { employees: [], offices: [], departments: [], titles: [], managers: [], users: [], offboarding: [] };

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

/* ---- access derivation ---- */
function deriveAccess(me) {
  const perms = usersByEmail[me.emailLower] || {};
  const dept = (me.department || '').toLowerCase();
  const title = (me.jobTitle || '').toLowerCase();

  let isExec = /\b(ceo|chief|coo|cfo|president|owner|principal)\b/.test(title) || ['leadership', 'management team', 'management', 'pure management'].includes(dept);
  let isHR = /human resources|payroll/.test(dept) || /\b(human resources|payroll|people ops)\b/.test(title);
  let isAccounting = /accounting/.test(dept) || /\b(controller|accountant|bookkeeper)\b/.test(title);
  const isDirector = /\bdirector\b/.test(title);
  const hasReports = EMPLOYEES.some(e => e.managerEmail && e.managerEmail.toLowerCase() === me.emailLower);
  let isSupervisor = (!!perms.supervisor || /\b(supervisor|team lead|lead)\b/.test(title)) && !/\b(manager|director)\b/.test(title) && !hasReports;
  let isManager = (!!perms.manager || me.isManager || managerEmails.has(me.emailLower) || hasReports
    || /\b(manager|director)\b/.test(title)) && !isSupervisor;
  let isAdmin = !!perms.admin;

  // DEV-ONLY: dev-bypass.js may set window.__PD_DEV_VIEW to preview the UI at a chosen
  // access level. Inert in production — nothing sets that global there.
  if (typeof window !== 'undefined' && window.__PD_DEV_VIEW) {
    const v = window.__PD_DEV_VIEW;
    isExec = v === 'leadership'; isHR = v === 'hr'; isAccounting = v === 'accounting';
    isSupervisor = v === 'supervisor'; isManager = v === 'manager'; isAdmin = v === 'admin';
  }

  const level = isAdmin ? 'admin' : isHR ? 'hr' : isExec ? 'leadership' : isAccounting ? 'accounting' : isManager ? 'manager' : isSupervisor ? 'supervisor' : 'employee';
  const LABELS = { admin: 'Administrator', hr: 'HR & Payroll', leadership: 'Leadership', accounting: 'Accounting', manager: 'Manager', supervisor: 'Supervisor', employee: 'Employee' };

  const viewAll = isAdmin || isHR || isExec;
  const viewTeam = isManager || isSupervisor;
  const caps = {
    viewAll, viewTeam,
    seeInactive: viewAll,
    schedule: isAdmin || isHR || isExec || isManager || isSupervisor,
    onboardStatus: viewAll || isManager || isSupervisor,
    offboard: isAdmin || isHR || (isManager && !isExec),
    offboardView: isAdmin || isHR || isManager || isExec,
    approveOffboard: isAdmin || isHR,
    print: !!perms.canPrint || isAdmin || isHR,
    suspend: !!perms.canSuspend || isAdmin || isHR,
    terminate: !!perms.canTerminate || isAdmin || isHR,
    del: !!perms.canDelete || isAdmin,
    manageUsers: isAdmin,
    hire: isAdmin || isHR || (isManager && !isExec),
    prehireOnly: isManager && !isExec,
    offices: isAdmin || isHR,
    payroll: isAdmin || isHR || isAccounting,
    reports: isAdmin || isHR || isExec || isManager || isSupervisor || isAccounting,
    relations: isAdmin || isHR || isManager,
    askHR: isAdmin || isHR || isExec || isManager || isSupervisor,
    recruiting: isAdmin || isHR || isExec || isManager,
  };
  return { level, label: LABELS[level], flags: { isExec, isHR, isAccounting, isManager, isSupervisor, isAdmin, isDirector }, caps, perms };
}

/* employees visible to `me` given access */
function scopedEmployees(me, access) {
  if (access.caps.viewAll) return EMPLOYEES;
  if (access.caps.viewTeam) {
    const set = new Set([me.id]);
    let changed = true;
    const myEmails = new Set([me.emailLower]);
    while (changed) {
      changed = false;
      EMPLOYEES.forEach(e => {
        if (!set.has(e.id) && e.managerEmail && myEmails.has(e.managerEmail.toLowerCase())) {
          set.add(e.id); myEmails.add(e.emailLower); changed = true;
        }
      });
    }
    return EMPLOYEES.filter(e => set.has(e.id));
  }
  return EMPLOYEES.filter(e => e.id === me.id);
}

/* photo persistence */
function getPhoto(empId) { try { return localStorage.getItem('pd_photo_' + empId) || null; } catch (e) { return null; } }
function setPhoto(empId, dataUrl) { try { dataUrl ? localStorage.setItem('pd_photo_' + empId, dataUrl) : localStorage.removeItem('pd_photo_' + empId); } catch (e) {} }

function isCompanyEmail(email) {
  const d = (email || '').toLowerCase().split('@')[1] || '';
  return COMPANY_DOMAINS.includes(d);
}
function findByEmail(email) { return byEmail[(email || '').toLowerCase()] || null; }

/* session — stores the signed-in employee id; resolved against live EMPLOYEES */
function loadSession() { try { const id = localStorage.getItem('pd_session'); return id ? EMPLOYEES.find(e => e.id === id) : null; } catch (e) { return null; } }
function saveSession(emp) { try { emp ? localStorage.setItem('pd_session', emp.id) : localStorage.removeItem('pd_session'); } catch (e) {} }

Object.assign(window, {
  HR, EMPLOYEES, COMPANY_DOMAINS, deriveAccess, scopedEmployees, getPhoto, setPhoto,
  isCompanyEmail, findByEmail, loadSession, saveSession, normLoc, deptLeaders,
  PD_REBUILD_HRDATA: buildFromHRDATA,
});
