/* rbac.jsx — identity, role-based access control, and data scoping.
   Reads window.HRDATA (from hrdata.js). Exposes helpers to the app. */

const HR = window.HRDATA || { employees: [], offices: [], departments: [], managers: [], users: [], offboarding: [] };
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
const EMPLOYEES = HR.employees.map(e => ({
  ...e,
  loc: normLoc(e.location),
  name: `${e.first} ${e.last}`.trim(),
  emailLower: (e.workEmail || '').toLowerCase(),
}));
const byEmail = {}; EMPLOYEES.forEach(e => { if (e.emailLower) byEmail[e.emailLower] = e; });

/* Demo seed: guarantee a couple of "today" events so the dashboard birthday &
   new-starter panels always populate during live demos. Remove in production. */
(function seedToday() {
  try {
    const n = new Date();
    const md = `${n.getMonth() + 1}/${n.getDate()}`, yr = n.getFullYear();
    const act = EMPLOYEES.filter(e => e.status === 'Active');
    if (!act.length) return;
    [act[2], act[Math.floor(act.length / 2)]].forEach((e, i) => { if (e) e.birthdate = `${md}/${1985 + i * 4}`; });
    const s = act[5] || act[0]; if (s) s.startDate = `${md}/${yr}`;                 // starts today
    const anniv = act[8] || act[1]; if (anniv) anniv.startDate = `${md}/${yr - 3}`;  // 3-yr anniversary today
    const admin = byEmail['mgrant@puredental.com']; if (admin) admin.startDate = `${md}/${yr - 2}`; // Admin login celebration
  } catch (e) {}
})();
const usersByEmail = {}; HR.users.forEach(u => { usersByEmail[(u.email || '').toLowerCase()] = u; });
const managerEmails = new Set(HR.managers.map(m => (m.email || '').toLowerCase()));

function deptLeaders() { return EMPLOYEES.filter(e => e.isManager || managerEmails.has(e.emailLower)); }

/* ---- access derivation ---- */
function deriveAccess(me) {
  const perms = usersByEmail[me.emailLower] || {};
  const dept = (me.department || '').toLowerCase();
  const title = (me.jobTitle || '').toLowerCase();

  const isExec = /\b(ceo|chief|coo|cfo|president|owner|principal)\b/.test(title) || ['leadership', 'management team', 'management', 'pure management'].includes(dept);
  const isHR = /human resources|payroll/.test(dept) || /\b(human resources|payroll|people ops)\b/.test(title);
  const isAccounting = /accounting/.test(dept) || /\b(controller|accountant|bookkeeper)\b/.test(title);
  const isDirector = /\bdirector\b/.test(title);
  const hasReports = EMPLOYEES.some(e => e.managerEmail && e.managerEmail.toLowerCase() === me.emailLower);
  // supervisor = team lead WITHOUT full manager/director authority
  const isSupervisor = (!!perms.supervisor || /\b(supervisor|team lead|lead)\b/.test(title)) && !/\b(manager|director)\b/.test(title) && !hasReports;
  const isManager = (!!perms.manager || me.isManager || managerEmails.has(me.emailLower) || hasReports
    || /\b(manager|director)\b/.test(title)) && !isSupervisor;
  // Admin is the platform/IT-ops admin only — explicit grant, NOT HR or leadership.
  const isAdmin = !!perms.admin;

  const level = isAdmin ? 'admin' : isHR ? 'hr' : isExec ? 'leadership' : isAccounting ? 'accounting' : isManager ? 'manager' : isSupervisor ? 'supervisor' : 'employee';
  const LABELS = { admin: 'Administrator', hr: 'HR & Payroll', leadership: 'Leadership', accounting: 'Accounting', manager: 'Manager', supervisor: 'Supervisor', employee: 'Employee' };

  const viewAll = isAdmin || isHR || isExec;          // all employees
  const viewTeam = isManager || isSupervisor;          // their team only
  const caps = {
    viewAll,
    viewTeam,
    seeInactive: viewAll,                              // directory: see terminated/suspended
    schedule: isAdmin || isHR || isExec || isManager || isSupervisor,
    onboardStatus: viewAll || isManager || isSupervisor, // sees onboarding-status board instead of own onboarding
    offboard: isAdmin || isHR || (isManager && !isExec),            // full offboarding (initiate/manage)
    offboardView: isAdmin || isHR || isManager || isExec, // leadership = view only
    approveOffboard: isAdmin || isHR,
    print: !!perms.canPrint || isAdmin || isHR,
    suspend: !!perms.canSuspend || isAdmin || isHR,
    terminate: !!perms.canTerminate || isAdmin || isHR,
    del: !!perms.canDelete || isAdmin,
    manageUsers: isAdmin,                              // Admin menu — admin only
    hire: isAdmin || isHR || (isManager && !isExec),  // Automations: NOT leadership, NOT supervisor
    prehireOnly: isManager && !isExec,                 // managers submit prehire to HR (no full provisioning)
    offices: isAdmin || isHR,                          // Offices: admin + HR only
    payroll: isAdmin || isHR || isAccounting,
    reports: isAdmin || isHR || isExec || isManager || isSupervisor || isAccounting,
    relations: isAdmin || isHR || isManager,
    askHR: isAdmin || isHR || isExec || isManager || isSupervisor,  // Ask HR advisor — management only
    recruiting: isAdmin || isHR || isExec || isManager,   // Applicant tracking — manager or higher (not supervisor)
  };
  return { level, label: LABELS[level], flags: { isExec, isHR, isAccounting, isManager, isSupervisor, isAdmin, isDirector }, caps, perms };
}

/* employees visible to `me` given access */
function scopedEmployees(me, access) {
  if (access.caps.viewAll) return EMPLOYEES;
  if (access.caps.viewTeam) {
    // direct + indirect reports (by manager email chain) + self
    const set = new Set([me.id]);
    let changed = true;
    const emailById = {}; EMPLOYEES.forEach(e => emailById[e.id] = e.emailLower);
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

/* photo persistence (uploaded by user, base64 in localStorage) */
function getPhoto(empId) { try { return localStorage.getItem('pd_photo_' + empId) || null; } catch (e) { return null; } }
function setPhoto(empId, dataUrl) { try { dataUrl ? localStorage.setItem('pd_photo_' + empId, dataUrl) : localStorage.removeItem('pd_photo_' + empId); } catch (e) {} }

function isCompanyEmail(email) {
  const d = (email || '').toLowerCase().split('@')[1] || '';
  return COMPANY_DOMAINS.includes(d);
}
function findByEmail(email) { return byEmail[(email || '').toLowerCase()] || null; }

/* session */
function loadSession() { try { const id = localStorage.getItem('pd_session'); return id ? EMPLOYEES.find(e => e.id === id) : null; } catch (e) { return null; } }
function saveSession(emp) { try { emp ? localStorage.setItem('pd_session', emp.id) : localStorage.removeItem('pd_session'); } catch (e) {} }

/* quick demo accounts spanning roles. Prefer the known real-roster logins; if they're
   not in the loaded roster (e.g. the synthetic placeholder), derive one Active account
   per role from whatever roster IS loaded, so dev sign-in always works. */
let DEMO_ACCOUNTS = [
  'mgrant@puredental.com',          // admin (IT / systems ops)
  'avibert@puredental.com',         // HR & Payroll director
  'kvibert@puredental.com',         // CEO / leadership
  'ddibella@puredental.com',        // clinical manager
  'tryan@puredental.com',           // accounting controller
  'along@puredental.com',           // employee (dental assistant)
].map(e => findByEmail(e)).filter(Boolean);

if (DEMO_ACCOUNTS.length < 3) {
  const active = EMPLOYEES.filter(e => e.status === 'Active');
  const byLabel = {};
  active.forEach(e => { const l = deriveAccess(e).label; if (!byLabel[l]) byLabel[l] = e; });
  const order = ['Admin', 'Leadership', 'HR', 'Manager', 'Supervisor', 'Accounting', 'Employee'];
  const ordered = order.map(l => byLabel[l]).filter(Boolean);
  const extras = Object.values(byLabel).filter(e => ordered.indexOf(e) < 0);
  DEMO_ACCOUNTS = ordered.concat(extras).slice(0, 6);
  if (!DEMO_ACCOUNTS.length) DEMO_ACCOUNTS = active.slice(0, 6);
}

Object.assign(window, {
  HR, EMPLOYEES, COMPANY_DOMAINS, deriveAccess, scopedEmployees, getPhoto, setPhoto,
  isCompanyEmail, findByEmail, loadSession, saveSession, DEMO_ACCOUNTS, normLoc, deptLeaders,
});
