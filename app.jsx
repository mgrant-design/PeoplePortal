/* app.jsx — secure, role-based People Portal shell. Login-gated; nav + views adapt to access. */

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "style": "clinical",
  "accentHue": 220,
  "density": "regular",
  "hubLayout": "grid",
  "lang": "en",
  "rileyVoice": true
}/*EDITMODE-END*/;

function Logo() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d={ICON.tooth} fill="currentColor" stroke="none" />
    </svg>
  );
}

/* derive the onboarding role profile from a real employee */
function onboardRole(me) {
  if (me.provider) return /dent|dds|dmd/i.test((me.providerType || '') + (me.jobTitle || '')) ? ROLE_PROFILES.dentist : ROLE_PROFILES.hygienist;
  if (/insur|billing/i.test((me.department || '') + (me.jobTitle || ''))) return ROLE_PROFILES.insurance;
  return ROLE_PROFILES.frontdesk;
}

const FLAG_DEFS = [
  { id: 'scheduler', label: 'Scheduling', group: 'Modules' },
  { id: 'timeclock', label: 'Time clock', group: 'Modules' },
  { id: 'reviews', label: 'Performance reviews', group: 'Modules' },
  { id: 'automations', label: 'Onboarding automations & agent', group: 'Modules' },
  { id: 'offboarding', label: 'Offboarding', group: 'Modules' },
  { id: 'offices', label: 'Offices', group: 'Modules' },
  { id: 'reports', label: 'Reports', group: 'Modules' },
  { id: 'ask', label: 'Ask Riley assistant', group: 'Modules' },
  { id: 'askhr', label: 'Ask HR advisor (management)', group: 'Modules' },
  { id: 'library', label: 'Learning Library', group: 'Modules' },
  { id: 'scrubs', label: 'Scrubs ordering', group: 'Modules' },
  { id: 'applicants', label: 'Applicant tracking (hiring) — management', group: 'Modules' },
  { id: 'paychex', label: 'Paychex integration — payroll sync, export & pay rules', group: 'Integrations', note: 'Phase 2 · enable when Paychex API is live' },
  { id: 'provisionApi', label: 'Auto-provision accounts via API — Google, Denticon, NexHealth, DoseSpot', group: 'Integrations', note: 'Off = IT/HR creates accounts manually and records logins. Turn on once the provisioning APIs are connected.' },
  { id: 'resumeParse', label: 'Résumé parsing & import — auto-extract applicant details from uploaded résumés', group: 'Integrations', note: 'Off = enter applicants manually (résumés still attach). Turn on once the parsing service is connected.' },
  { id: 'gdrive', label: 'Google Drive — browse & attach documents from My Drive and Shared Drives', group: 'Integrations', note: 'Off = attach by local upload only. Turn on once Google Drive is connected to search Drive & Shared Drives for offer letters, job descriptions and forms.' },
];
const FLAG_DEFAULTS = { scheduler: true, timeclock: true, reviews: true, automations: true, offboarding: true, offices: true, reports: true, ask: true, askhr: true, library: true, scrubs: true, applicants: true, paychex: true, provisionApi: false, resumeParse: false, gdrive: false };
const VIEW_FLAG = { ask: 'ask', askhr: 'askhr', library: 'library', scrubs: 'scrubs', timeclock: 'timeclock', reviews: 'reviews', automations: 'automations', addhire: 'automations', autodetail: 'automations', agentconsole: 'automations', scheduler: 'scheduler', offboarding: 'offboarding', offices: 'offices', reports: 'reports', applicants: 'applicants' };

function ComingSoon({ label }) {
  return (
    <div className="fade-in" style={{ display: 'grid', placeItems: 'center', minHeight: '50vh' }}>
      <div className="card" style={{ padding: 'clamp(28px,5vw,48px)', textAlign: 'center', maxWidth: 440 }}>
        <div style={{ width: 52, height: 52, borderRadius: 14, margin: '0 auto 14px', background: 'var(--accent-soft)', color: 'var(--accent-strong)', display: 'grid', placeItems: 'center' }}><Icon name="lock" style={{ width: 26, height: 26 }} /></div>
        <h2 style={{ fontSize: 20 }}>{label} is coming soon</h2>
        <p style={{ color: 'var(--ink-2)', fontSize: 14, marginTop: 8, lineHeight: 1.5 }}>This feature is part of a later rollout phase and is currently turned off. An administrator can enable it in <b>Admin → Feature rollout</b>.</p>
      </div>
    </div>
  );
}

const NAV = [
  { id: 'dashboard', label: 'Dashboard', show: () => true },
  { id: 'applicants', label: 'Applicants', show: a => a.caps.recruiting, flag: 'applicants' },
  { id: 'onboarding', label: 'My onboarding', show: () => true },
  { id: 'people', label: 'Directory', show: () => true },
  { id: 'scheduler', label: 'Scheduling', show: a => a.caps.schedule, flag: 'scheduler' },
  { id: 'myschedule', label: 'My schedule', show: a => !a.caps.schedule, flag: 'scheduler' },
  { id: 'timeclock', label: 'Time clock', show: () => true, flag: 'timeclock' },
  { id: 'library', label: 'Learning', show: () => true, flag: 'library' },
  { id: 'scrubs', label: 'Scrubs', show: () => true, flag: 'scrubs' },
  { id: 'reviews', label: 'Reviews', show: () => true, flag: 'reviews' },
  { id: 'reports', label: 'Reports', show: a => a.caps.reports, flag: 'reports' },
  { id: 'automations', label: 'Automations', show: a => a.caps.hire, flag: 'automations' },
  { id: 'offboarding', label: 'Offboarding', show: a => a.caps.offboardView, flag: 'offboarding' },
  { id: 'offices', label: 'Offices', show: a => a.caps.offices, flag: 'offices' },
  { id: 'organization', label: 'Organization', show: a => a.caps.manageUsers },
  { id: 'admin', label: 'Admin', show: a => a.caps.manageUsers },
  { id: 'feedback', label: 'Roadmap', show: () => true },
  { id: 'ask', label: 'Ask Riley', show: () => true, flag: 'ask' },
  { id: 'askhr', label: 'Ask HR', show: a => a.caps.askHR, flag: 'askhr' },
];

/* Flat "all pages" nav (the default). Everyday pages render as a single horizontally
   scrollable bar; the management-only pages collapse into an "Admin" dropdown that only
   appears for management-level access (supervisor and up). Built from the same NAV ids. */
const FLAT_MAIN_IDS = ['dashboard', 'onboarding', 'people', 'myschedule', 'timeclock', 'library', 'scrubs', 'reviews', 'feedback'];
const FLAT_ADMIN_IDS = ['applicants', 'scheduler', 'reports', 'automations', 'offboarding', 'offices', 'organization', 'admin'];

/* Grouped/compressed top nav. Direct items render as a single button; grouped items
   render as a dropdown of their visible children. Built from the same ids/flags as NAV. */
const NAV_GROUPS = [
  { id: 'dashboard', label: 'Home', view: 'dashboard', show: () => true },
  { id: 'g_people', label: 'People', children: [
    { id: 'people', label: 'Directory', show: () => true },
    { id: 'applicants', label: 'Applicants', show: a => a.caps.recruiting, flag: 'applicants' },
  ] },
  { id: 'g_mywork', label: 'My Work', children: [
    { id: 'myschedule', label: 'My schedule', show: () => true, flag: 'scheduler' },
    { id: 'timeclock', label: 'Time clock', show: () => true, flag: 'timeclock' },
    { id: 'library', label: 'Learning', show: () => true, flag: 'library' },
    { id: 'scrubs', label: 'Scrubs', show: () => true, flag: 'scrubs' },
  ] },
  { id: 'g_manage', label: 'Manage', children: [
    { id: 'onboarding', label: 'My onboarding', show: () => true },
    { id: 'reviews', label: 'Reviews', show: () => true, flag: 'reviews' },
    { id: 'scheduler', label: 'Scheduling', show: a => a.caps.schedule, flag: 'scheduler' },
    { id: 'automations', label: 'Automations', show: a => a.caps.hire, flag: 'automations' },
    { id: 'offboarding', label: 'Offboarding', show: a => a.caps.offboardView, flag: 'offboarding' },
    { id: 'reports', label: 'Reports', show: a => a.caps.reports, flag: 'reports' },
    { id: 'feedback', label: 'Roadmap', show: () => true },
  ] },
  { id: 'g_settings', label: 'Settings', children: [
    { id: 'offices', label: 'Offices', show: a => a.caps.offices, flag: 'offices' },
    { id: 'organization', label: 'Organization', show: a => a.caps.manageUsers },
    { id: 'admin', label: 'Admin', show: a => a.caps.manageUsers },
  ] },
];
/* Assistants live in a floating launcher, not the nav bar. */
const ASSISTANTS = [
  { id: 'ask', label: 'Ask Riley', show: () => true, flag: 'ask' },
  { id: 'askhr', label: 'Ask HR', show: a => a.caps.askHR, flag: 'askhr' },
];
function CaretIcon() {
  return <svg className="caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>;
}
function ChatIcon() {
  return <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" /></svg>;
}

const ONBOARD_VIEWS = ['onboarding', 'hub', 'welcome', 'profilestep', 'paperwork', 'credentials', 'policies', 'accounts', 'training', 'team', 'schedule', 'benefits'];

/* Admin-only view switcher — preview the portal at a different access level without
   logging out. Mirrors the login-screen dev picker; sets the same override the app
   reads in <App>. Opened by long-pressing the user chip. */
const VIEW_LEVELS = [
  ['', 'My access', 'Your real permissions'],
  ['admin', 'Admin', 'Full access — everything'],
  ['hr', 'HR & Payroll', 'Company-wide people + payroll'],
  ['leadership', 'Leadership', 'Company-wide view'],
  ['accounting', 'Accounting', 'Payroll + reports'],
  ['manager', 'Manager', 'Own team / direct reports'],
  ['supervisor', 'Supervisor', 'Own team, lighter'],
  ['employee', 'Employee', 'Just their own stuff'],
];

function ViewSwitcher({ current, onPick, onClose }) {
  useEffect(() => { const h = (e) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h); }, []);
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 90 }}>
      <div onClick={e => e.stopPropagation()} className="fade-in cust-menu"
        style={{ position: 'fixed', top: 64, right: 'clamp(12px, 2vw, 22px)', width: 'min(300px, 92vw)', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 16, boxShadow: '0 12px 30px rgba(0,0,0,0.16), 0 30px 70px rgba(0,0,0,0.2)', padding: 16, maxHeight: 'calc(100vh - 80px)', overflowY: 'auto', scrollbarWidth: 'none' }}>
        <div style={{ position: 'relative', marginBottom: 6 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 19, lineHeight: 1.25, textAlign: 'center', padding: '0 22px' }}>Switch view</div>
          <button onClick={onClose} style={{ position: 'absolute', top: -3, right: -3, border: 'none', background: 'none', cursor: 'pointer', color: 'var(--ink-3)', padding: 4 }}><Icon name="x" style={{ width: 16, height: 16 }} /></button>
        </div>
        <div style={{ fontSize: 11.5, lineHeight: 1.45, color: 'var(--ink-3)', textAlign: 'center', padding: '0 4px 12px' }}>Preview the portal at another access level. Your real access is unchanged.</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {VIEW_LEVELS.map(([val, label, desc]) => {
            const on = current === val;
            return (
              <button key={val || 'real'} onClick={() => onPick(val)}
                style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', cursor: 'pointer', borderRadius: 'var(--r-md)', padding: '9px 11px', fontFamily: 'var(--font-body)',
                  border: on ? '1.5px solid var(--accent)' : '1px solid var(--line)', background: on ? 'var(--accent-softer)' : 'var(--surface)' }}>
                <span style={{ flex: 1 }}>
                  <span style={{ display: 'block', fontWeight: 600, fontSize: 13.5, color: 'var(--ink)' }}>{label}</span>
                  <span style={{ display: 'block', fontSize: 11.5, color: 'var(--ink-3)', marginTop: 1 }}>{desc}</span>
                </span>
                {on && <Icon name="check" style={{ width: 16, height: 16, color: 'var(--accent-strong)' }} />}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Portal({ me, access, realAccess, viewOverride, setViewOverride, onLogout, t, setTweak }) {
  const [view, setView] = useState('dashboard');
  const [selectedEmp, setSelectedEmp] = useState(null);
  const [tasks, setTasks] = useState(() => (ROLE_ONBOARDING[onboardRole(me).id] || TASKS).map(x => ({ ...x })));
  const [accountsReady, setAccountsReady] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileGroup, setMobileGroup] = useState(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const openHelp = () => setHelpOpen(true);
  const closeHelp = () => { setHelpOpen(false); try { localStorage.setItem('pd_help_seen', '1'); } catch (e) {} };
  const [flags, setFlags] = useState(() => { try { return { ...FLAG_DEFAULTS, ...(JSON.parse(localStorage.getItem('pd_flags')) || {}) }; } catch (e) { return { ...FLAG_DEFAULTS }; } });
  const setFlag = (id, val) => { const n = { ...flags, [id]: val }; setFlags(n); try { localStorage.setItem('pd_flags', JSON.stringify(n)); } catch (e) {} };
  const flagOn = (id) => flags[id] !== false;
  const [tourOpen, setTourOpen] = useState(() => { try { return !localStorage.getItem('pd_tour_done'); } catch (e) { return false; } });
  const endTour = () => { setTourOpen(false); try { localStorage.setItem('pd_tour_done', '1'); } catch (e) {} };
  const startTour = () => { setHelpOpen(false); setTourOpen(true); };
  const [celebs, setCelebs] = useState([]);
  useEffect(() => {
    try {
      const key = 'pd_celeb_' + me.id + '_' + new Date().toDateString();
      if (sessionStorage.getItem(key)) return;
      const c = (typeof getCelebrations === 'function') ? getCelebrations(me) : [];
      if (c.length) { setCelebs(c); sessionStorage.setItem(key, '1'); }
    } catch (e) {}
  }, [me]);
  const [notifOpen, setNotifOpen] = useState(false);
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const [viewSwitchOpen, setViewSwitchOpen] = useState(false);
  // Tier 3 modules stream in after the dashboard. Until they're ready, any view other
  // than the dashboard shows a brief spinner (see the <main> guard below).
  const [modulesAllReady, setModulesAllReady] = useState(() => !!window.__PD_ALL_DONE);
  useEffect(() => {
    if (modulesAllReady) return;
    let live = true;
    (window.__PD_MODULES_ALL_READY || Promise.resolve()).then(() => { if (live) { window.__PD_ALL_DONE = true; setModulesAllReady(true); } });
    return () => { live = false; };
  }, []);
  // Only a real admin may preview other access levels (independent of any active preview,
  // so you can always switch back). Long-press the user chip to open the switcher.
  const canSwitchView = !!(realAccess && realAccess.caps && realAccess.caps.manageUsers);
  const applyViewOverride = (val) => {
    setViewOverride(val ? val : null);
    setViewSwitchOpen(false);
    setView('dashboard');
    window.scrollTo({ top: 0 });
  };
  const chipHold = useRef({ t: null, fired: false, x: 0, y: 0 });
  const chipDown = (e) => {
    if (!canSwitchView) return;
    const h = chipHold.current; h.fired = false; h.x = e.clientX; h.y = e.clientY;
    if (h.t) clearTimeout(h.t);
    h.t = setTimeout(() => { h.t = null; h.fired = true; setViewSwitchOpen(true); }, 550);
  };
  const chipMove = (e) => { const h = chipHold.current; if (h.t && (Math.abs(e.clientX - h.x) > 8 || Math.abs(e.clientY - h.y) > 8)) { clearTimeout(h.t); h.t = null; } };
  const chipUp = () => { const h = chipHold.current; if (h.t) { clearTimeout(h.t); h.t = null; } };
  const chipClick = () => { if (chipHold.current.fired) { chipHold.current.fired = false; return; } go('me'); };
  const [navMode, setNavMode] = useState(() => { try { return (loadAppearance(me.id).navMode) || 'all'; } catch (e) { return 'all'; } });
  const [notifReqs, setNotifReqs] = useState([]);
  const refreshNotifs = () => { if (typeof fetchTimeoff === 'function') fetchTimeoff().then(setNotifReqs).catch(() => {}); };
  useEffect(() => { refreshNotifs(); }, [me.id]);
  // Mute is session-only — reset to unmuted on each login (Portal mounts post-auth).
  useEffect(() => { if (window.PDSound) window.PDSound.resetMute(); }, []);
  useEffect(() => { if (typeof hydrateAppearance === 'function') hydrateAppearance(me.id); else if (typeof applyAppearance === 'function') applyAppearance(loadAppearance(me.id)); }, [me.id]);
  const notifN = (typeof notifCount === 'function') ? notifCount(notifReqs, me, access) : 0;
  const [automations, setAutomations] = useState(() => (typeof loadAutomations === 'function' ? loadAutomations() : []));
  const [currentAuto, setCurrentAuto] = useState(null);
  const officeNames = useMemo(() => (window.HR.offices || []).map(o => o.name), []);
  const [knowledge, setKnowledge] = useState(() => { try { return JSON.parse(localStorage.getItem('pd_knowledge')) || AGENT_KNOWLEDGE; } catch (e) { return AGENT_KNOWLEDGE; } });
  const [routing, setRouting] = useState(() => { try { return JSON.parse(localStorage.getItem('pd_routing')) || AGENT_ROUTING; } catch (e) { return AGENT_ROUTING; } });
  const saveKnowledge = (k) => { setKnowledge(k); try { localStorage.setItem('pd_knowledge', JSON.stringify(k)); } catch (e) {} };
  const saveRouting = (r) => { setRouting(r); try { localStorage.setItem('pd_routing', JSON.stringify(r)); } catch (e) {} };
  const [reviewQ, setReviewQ] = useState(() => { try { return JSON.parse(localStorage.getItem('pd_review_questions')) || REVIEW_QUESTIONS; } catch (e) { return REVIEW_QUESTIONS; } });
  const saveReviewQ = (q) => { setReviewQ(q); try { localStorage.setItem('pd_review_questions', JSON.stringify(q)); } catch (e) {} };
  const reviewList = access.caps.viewAll ? EMPLOYEES.filter(e => e.status === 'Active') : access.caps.viewTeam ? scopedEmployees(me, access).filter(e => e.id !== me.id && e.status === 'Active') : [me];
  const [toast, setToast] = useState(null);
  const flash = (m) => { setToast(m); setTimeout(() => setToast(null), 2600); };
  const tcOffices = useMemo(() => Array.from(new Set([me.loc, ...(window.HR.offices || []).map(o => normLoc(o.name))].filter(Boolean))), [me]);
  const tcTeam = access.caps.viewAll ? EMPLOYEES.filter(e => e.status === 'Active').slice(0, 12) : scopedEmployees(me, access).filter(e => e.id !== me.id && e.status === 'Active');

  const scopedIds = useMemo(() => new Set(scopedEmployees(me, access).map(e => e.id)), [me, access]);
  const canRecord = (emp) => access.caps.viewAll || (access.caps.viewTeam && scopedIds.has(emp.id));

  const obRole = useMemo(() => onboardRole(me), [me]);
  const visibleTasks = tasks.filter(x => !x.providerOnly || obRole.clinical);
  const credentialsDone = (tasks.find(x => x.id === 'credentials') || {}).status === 'done';
  const scoped = useMemo(() => scopedEmployees(me, access), [me, access]);

  const go = (v) => { setView(v); setMenuOpen(false); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const openEmp = (e) => { setSelectedEmp(e); setView('emprecord'); window.scrollTo({ top: 0 }); };

  const completeTask = (id) => {
    setTasks(ts => ts.map(x => {
      if (x.id === id) return { ...x, status: 'done', count: undefined };
      if (id === 'paperwork' && x.id === 'benefits' && x.status === 'locked') return { ...x, status: 'todo', lockNote: undefined };
      return x;
    }));
    go('onboarding');
  };

  const createHire = (f) => {
    const id = 'auto' + Date.now();
    const auto = { id, ...f, workEmail: genWorkEmail(f.name), stage: 0, createdAt: Date.now() };
    setAutomations(a => [auto, ...a]);
    setCurrentAuto(id);
    go('autodetail');
  };
  const advanceAuto = (id) => setAutomations(list => list.map(a => a.id === id ? { ...a, stage: (a.stage || 0) + 1 } : a));
  useEffect(() => { if (typeof persistAutomations === 'function') persistAutomations(automations); }, [automations]);

  // hire an applicant from the ATS → straight into onboarding (no re-entry)
  const hireApplicant = (a) => {
    const rk = (typeof atsRoleKey === 'function') ? atsRoleKey({ provider: a.provider, role: a.role, dept: a.dept }) : 'frontdesk';
    const start = new Date(Date.now() + 14 * 864e5).toISOString().slice(0, 10);
    createHire({
      name: a.name, jobTitle: a.role, personalEmail: a.email, mobile: a.phone || '',
      department: a.dept || 'Front Desk', office: a.office, startDate: start,
      provider: !!a.provider, providerType: rk === 'dentist' ? 'Dentist' : 'Hygienist',
      manager: '', rk,
    });
  };

  // dashboard tile navigation mapper
  const dashNav = (id) => {
    if (id === 'myschedule') return go('myschedule');
    if (id === 'profile') return go('me');
    if (id === 'myschedule_legacy') return go('onboarding');
    if (id === 'resources') return go('ask');
    return go(id);
  };

  const stepProps = { me, onBack: () => go('onboarding'), onComplete: () => completeTask(view) };
  const [navMenu, setNavMenu] = useState(null);
  const [asstOpen, setAsstOpen] = useState(false);
  // Nav dropdowns open on hover (desktop) and stay clickable for touch. A short
  // close delay bridges the small gap between the button and its menu so moving
  // the pointer across it doesn't dismiss the menu.
  const navTimer = useRef(null);
  const navflatRef = useRef(null);
  const openNav = (id) => { if (navTimer.current) { clearTimeout(navTimer.current); navTimer.current = null; } setNavMenu(id); };
  const closeNavSoon = () => { if (navTimer.current) clearTimeout(navTimer.current); navTimer.current = setTimeout(() => setNavMenu(null), 160); };
  // Close an open nav dropdown on any click outside a .navgroup (no overlay element,
  // so the menu's own buttons stay clickable).
  useEffect(() => {
    if (!navMenu) return;
    const onDoc = (e) => { if (!e.target.closest || !e.target.closest('.navgroup')) setNavMenu(null); };
    document.addEventListener('click', onDoc);
    return () => document.removeEventListener('click', onDoc);
  }, [navMenu]);
  // Same outside-click close for the topbar assistants dropdown.
  useEffect(() => {
    if (!asstOpen) return;
    const onDoc = (e) => { if (!e.target.closest || !e.target.closest('.asst-topbar')) setAsstOpen(false); };
    document.addEventListener('click', onDoc);
    return () => document.removeEventListener('click', onDoc);
  }, [asstOpen]);
  // Flat "all pages" bar: make it actually scroll. Vertical wheel → horizontal scroll,
  // autoscroll when the pointer nears either edge, and edge fades that show when there's
  // more off-screen. Re-runs when the nav content (mode/access/flags) changes.
  useEffect(() => {
    if (navMode !== 'all') return;
    const el = navflatRef.current;
    if (!el) return;
    const overflowing = () => el.scrollWidth > el.clientWidth + 1;
    const updateFades = () => {
      const ov = overflowing();
      el.classList.toggle('has-more-left', ov && el.scrollLeft > 2);
      el.classList.toggle('has-more-right', ov && el.scrollLeft < el.scrollWidth - el.clientWidth - 2);
    };
    const onWheel = (e) => {
      if (!overflowing()) return;
      const d = Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
      if (!d) return;
      el.scrollLeft += d;
      e.preventDefault();
      updateFades();
    };
    let speed = 0, raf = null;
    const tick = () => { if (!speed) { raf = null; return; } el.scrollLeft += speed; updateFades(); raf = requestAnimationFrame(tick); };
    const onMove = (e) => {
      if (!overflowing()) { speed = 0; return; }
      const r = el.getBoundingClientRect();
      const edge = 80;
      if (e.clientX < r.left + edge) speed = -Math.ceil((r.left + edge - e.clientX) / edge * 16);
      else if (e.clientX > r.right - edge) speed = Math.ceil((e.clientX - (r.right - edge)) / edge * 16);
      else speed = 0;
      if (speed && !raf) raf = requestAnimationFrame(tick);
    };
    const onLeave = () => { speed = 0; if (raf) { cancelAnimationFrame(raf); raf = null; } };
    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('mousemove', onMove);
    el.addEventListener('mouseleave', onLeave);
    el.addEventListener('scroll', updateFades, { passive: true });
    window.addEventListener('resize', updateFades);
    updateFades();
    return () => {
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('mousemove', onMove);
      el.removeEventListener('mouseleave', onLeave);
      el.removeEventListener('scroll', updateFades);
      window.removeEventListener('resize', updateFades);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [navMode, access, flags, view]);
  const tourSteps = (typeof TOUR_STEPS_ALL !== 'undefined' ? TOUR_STEPS_ALL : []).filter(s => { if (['dashboard', 'me'].includes(s.view)) return true; const n = NAV.find(x => x.id === s.view); return n && n.show(access) && (!n.flag || flagOn(n.flag)); });

  const renderView = () => {
    if (VIEW_FLAG[view] && !flagOn(VIEW_FLAG[view])) return <ComingSoon label={(NAV.find(n => n.id === VIEW_FLAG[view]) || {}).label || 'This feature'} />;
    switch (view) {
      case 'dashboard': return <Dashboard me={me} access={access} employees={scoped} onNav={dashNav} onOpenEmp={openEmp} />;
      case 'people': return <Directory employees={EMPLOYEES} access={access} onRecord={openEmp} canRecord={canRecord} canSeeInactive={access.caps.seeInactive} title="Directory" />;
      case 'emprecord': return <EmployeeRecord emp={selectedEmp || me} access={access} me={me} canRelations={access.caps.viewAll || (access.caps.viewTeam && scopedIds.has((selectedEmp || me).id))} onBack={() => go('people')} />;
      case 'me': return <Profile emp={me} access={access} onNav={dashNav} />;
      case 'ask': return <AskAgent me={me} knowledge={knowledge} routing={routing} />;
      case 'askhr': return <AskHR me={me} flash={flash} />;
      case 'library': return <LearningLibrary me={me} access={access} flash={flash} />;
      case 'scrubs': return <Scrubs me={me} access={access} flash={flash} />;
      case 'feedback': return <Feedback me={me} access={access} flash={flash} />;
      case 'reviews': return <Reviews me={me} access={access} questions={reviewQ} onQuestions={saveReviewQ} list={reviewList} />;
      case 'timeclock': return <TimeClock me={me} access={access} offices={tcOffices} teamList={tcTeam} flash={flash} paychexOn={flagOn('paychex')} />;
      case 'offboarding': return <Offboarding me={me} access={access} viewOnly={!access.caps.offboard && access.caps.offboardView} onOpenEmp={openEmp} />;
      case 'offices': return <Offices access={access} />;
      case 'organization': return <OrgEditor access={access} />;
      case 'automations': return <Automations automations={automations} onAdd={() => go('addhire')} onConsole={() => go('agentconsole')} onOpen={(id) => { setCurrentAuto(id); go('autodetail'); }} />;
      case 'applicants': return <Applicants me={me} access={access} parseOn={flagOn('resumeParse')} paychexOn={flagOn('paychex')} driveOn={flagOn('gdrive')} onHire={hireApplicant} flash={flash} />;
      case 'agentconsole': return <AgentConsole onBack={() => go('automations')} knowledge={knowledge} routing={routing} onKnowledge={saveKnowledge} onRouting={saveRouting} />;
      case 'addhire': return <AddHire offices={officeNames} onCreate={createHire} onBack={() => go('automations')} apiMode={flagOn('provisionApi')} />;
      case 'autodetail': { const a = automations.find(x => x.id === currentAuto); return a ? <AutomationDetail auto={a} onBack={() => go('automations')} onAdvance={advanceAuto} apiMode={flagOn('provisionApi')} /> : <Automations automations={automations} onAdd={() => go('addhire')} onConsole={() => go('agentconsole')} onOpen={(id) => { setCurrentAuto(id); go('autodetail'); }} />; }
      case 'reports': return <Reports access={access} scope={access.caps.viewAll ? EMPLOYEES : scoped} paychexOn={flagOn('paychex')} me={me} flash={flash} />;
      case 'onboardingstatus': return <OnboardingStatus me={me} access={access} automations={automations} onPrehire={() => go('prehire')} onOpenAuto={(id) => { setCurrentAuto(id); go('autodetail'); }} />;
      case 'prehire': return <Prehire me={me} access={access} offices={officeNames} onSubmit={createHire} onBack={() => go('onboardingstatus')} />;
      case 'admin': return <AdminUsers me={me} flags={flags} flagDefs={FLAG_DEFS} onFlag={setFlag} />;
      case 'scheduler': return <Scheduler onBack={() => go('dashboard')} />;
      case 'myschedule': return <MySchedule me={me} />;
      // ---- onboarding sub-flow ----
      case 'onboarding':
        if (access.caps.onboardStatus) return <OnboardingStatus me={me} access={access} automations={automations} onPrehire={() => go('prehire')} onOpenAuto={(id) => { setCurrentAuto(id); go('autodetail'); }} />;
        return <Hub tasks={visibleTasks} onOpen={hubGo} layout={t.hubLayout} roleLabel={me.jobTitle} emp={me} notice={accountsReady ? { onView: () => go('accounts') } : null} />;
      case 'hub': return <Hub tasks={visibleTasks} onOpen={hubGo} layout={t.hubLayout} roleLabel={me.jobTitle} emp={me} notice={accountsReady ? { onView: () => go('accounts') } : null} />;
      case 'welcome': return <WelcomeStep {...stepProps} />;
      case 'profilestep': return <ProfileStep {...stepProps} />;
      case 'paperwork': return <Paperwork me={me} onBack={stepProps.onBack} onComplete={() => completeTask('paperwork')} />;
      case 'credentials': return <CredentialsStep {...stepProps} role={obRole} />;
      case 'policies': return <PoliciesStep {...stepProps} />;
      case 'accounts': return <AccountsStep me={me} onBack={stepProps.onBack} onComplete={() => completeTask('accounts')} role={obRole} credentialsDone={credentialsDone} onReady={() => setAccountsReady(true)} onGoCredentials={() => go('credentials')} apiMode={flagOn('provisionApi')} />;
      case 'training': return <TrainingStep {...stepProps} />;
      case 'team': return <TeamStep {...stepProps} />;
      case 'schedule': return <AgendaStep {...stepProps} onOpenScheduler={() => go('scheduler')} />;
      case 'benefits': return <BenefitsStep {...stepProps} />;
      default: return <Dashboard me={me} access={access} employees={scoped} onNav={dashNav} onOpenEmp={openEmp} />;
    }
  };

  // map hub's task ids to onboarding sub-views (TASKS uses id 'profile' for intake step)
  const hubGo = (id) => go(id === 'profile' ? 'profilestep' : id);

  const navLabel = (n) => (n.id === 'onboarding' && access.caps.onboardStatus) ? 'Onboarding status' : n.label;
  const navActive = (id) => {
    if (id === 'onboarding') return ONBOARD_VIEWS.includes(view) || view === 'profilestep' || view === 'onboardingstatus' || view === 'prehire';
    if (id === 'people') return view === 'people' || view === 'emprecord';
    if (id === 'automations') return ['automations', 'addhire', 'autodetail', 'agentconsole'].includes(view);
    return view === id;
  };
  // Which grouped category contains the current view — used to auto-open it in the mobile
  // accordion so the menu opens already showing where you are.
  const activeNavGroup = () => {
    const g = NAV_GROUPS.find(g => g.children && g.children.some(c => navActive(c.id)));
    return g ? g.id : null;
  };
  useEffect(() => { if (menuOpen) setMobileGroup(activeNavGroup()); }, [menuOpen]);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="mark" onDoubleClick={() => setAppearanceOpen(true)}><Logo /></span>
          <span>Pure Dental<small>People Portal</small></span>
        </div>
        {navMode === 'all' ? (() => {
          const byId = (id) => NAV.find(n => n.id === id);
          const visible = (n) => n && n.show(access) && (!n.flag || flagOn(n.flag));
          const mainItems = FLAT_MAIN_IDS.map(byId).filter(visible);
          const adminItems = FLAT_ADMIN_IDS.map(byId).filter(visible);
          const showAdmin = (access.caps.viewTeam || access.caps.viewAll) && adminItems.length > 0;
          const adminOpen = navMenu === 'admin';
          const adminActive = adminItems.some(c => navActive(c.id));
          return (
            <>
              <nav className="navflat" ref={navflatRef}>
                {mainItems.map(n => (
                  <div className="navgroup" key={n.id}>
                    <button className={navActive(n.id) ? 'active' : ''} onClick={() => { setNavMenu(null); go(n.id); }}>{navLabel(n)}</button>
                  </div>
                ))}
              </nav>
              {showAdmin && (
                <div className="navgroup navflat-admin" onMouseEnter={() => openNav('admin')} onMouseLeave={closeNavSoon}>
                  <button className={adminActive ? 'active' : ''} aria-expanded={adminOpen} onClick={() => setNavMenu(adminOpen ? null : 'admin')}>Admin<CaretIcon /></button>
                  {adminOpen && <div className="navgroup-menu navgroup-menu-right fade-in">
                    {adminItems.map(c => <button key={c.id} className={navActive(c.id) ? 'active' : ''} onClick={() => { setNavMenu(null); go(c.id); }}>{navLabel(c)}</button>)}
                  </div>}
                </div>
              )}
              <div className="spacer" />
            </>
          );
        })() : (
          <>
            <nav className="navgroups">
              {NAV_GROUPS.map(g => {
                if (!g.children) {
                  if (!g.show(access) || (g.flag && !flagOn(g.flag))) return null;
                  return <div className="navgroup" key={g.id}>
                    <button className={navActive(g.id) ? 'active' : ''} onClick={() => { setNavMenu(null); go(g.view || g.id); }}>{g.label}</button>
                  </div>;
                }
                const kids = g.children.filter(c => c.show(access) && (!c.flag || flagOn(c.flag)));
                if (!kids.length) return null;
                const groupActive = kids.some(c => navActive(c.id));
                const open = navMenu === g.id;
                return <div className="navgroup" key={g.id} onMouseEnter={() => openNav(g.id)} onMouseLeave={closeNavSoon}>
                  <button className={groupActive ? 'active' : ''} aria-expanded={open} onClick={() => setNavMenu(open ? null : g.id)}>{g.label}<CaretIcon /></button>
                  {open && <div className="navgroup-menu fade-in">
                    {kids.map(c => <button key={c.id} className={navActive(c.id) ? 'active' : ''} onClick={() => { setNavMenu(null); go(c.id); }}>{navLabel(c)}</button>)}
                  </div>}
                </div>;
              })}
            </nav>
            <div className="spacer" />
          </>
        )}
        <button className="btn btn-quiet mobile-menu-btn" style={{ padding: 9, display: 'none' }} onClick={() => setMenuOpen(m => !m)} title="Menu"><Icon name="list" /></button>
        {(() => {
          const akids = ASSISTANTS.filter(c => c.show(access) && (!c.flag || flagOn(c.flag)));
          if (!akids.length) return null;
          return (
            <div className="asst-topbar">
              <button className="btn btn-quiet" style={{ padding: 9 }} title="Assistants" onClick={() => { if (akids.length === 1) go(akids[0].id); else setAsstOpen(o => !o); }}><ChatIcon /></button>
              {asstOpen && akids.length > 1 && (
                <div className="asst-topbar-menu fade-in">
                  {akids.map(c => <button key={c.id} onClick={() => { setAsstOpen(false); go(c.id); }}><Icon name="sparkle" style={{ width: 16, height: 16 }} /> {c.label}</button>)}
                </div>
              )}
            </div>
          );
        })()}
        <button className="btn btn-quiet" style={{ padding: 9, position: 'relative' }} onClick={() => setNotifOpen(true)} title="Notifications">
          <Icon name="bell" />
          {notifN > 0 && <span style={{ position: 'absolute', top: 5, right: 6, minWidth: 15, height: 15, padding: '0 3px', borderRadius: 99, background: 'var(--warn)', color: '#3a2a00', fontSize: 9.5, fontWeight: 800, display: 'grid', placeItems: 'center', border: '1.5px solid var(--surface)' }}>{notifN}</span>}
        </button>
        <button className="userchip" onClick={chipClick}
          onPointerDown={chipDown} onPointerMove={chipMove} onPointerUp={chipUp} onPointerLeave={chipUp}
          onContextMenu={canSwitchView ? (e) => e.preventDefault() : undefined}
          style={{ border: '1px solid var(--line)', cursor: 'pointer', position: 'relative', WebkitUserSelect: 'none', userSelect: 'none', touchAction: 'manipulation' }}
          title={canSwitchView ? 'My profile · hold to switch view' : 'My profile'}>
          <div className="meta"><b>{me.name}</b><span>{access.label}</span></div>
          <PhotoAvatar emp={me} size={34} />
          {canSwitchView && viewOverride && <span title="Previewing another view" style={{ position: 'absolute', top: -4, right: -4, width: 12, height: 12, borderRadius: 99, background: 'var(--accent)', border: '2px solid var(--surface)' }} />}
        </button>
        <button className="btn btn-quiet" style={{ padding: 9 }} onClick={onLogout} title="Sign out"><Icon name="arrowRight" /></button>
      </header>

      {menuOpen && (
        <div className="mobile-nav fade-in">
          {navMode === 'all' ? (() => {
            const byId = (id) => NAV.find(n => n.id === id);
            const visible = (n) => n && n.show(access) && (!n.flag || flagOn(n.flag));
            const mainItems = FLAT_MAIN_IDS.map(byId).filter(visible);
            const adminItems = FLAT_ADMIN_IDS.map(byId).filter(visible);
            const showAdmin = (access.caps.viewTeam || access.caps.viewAll) && adminItems.length > 0;
            const adminOpen = mobileGroup === 'admin';
            const adminActive = adminItems.some(c => navActive(c.id));
            return (
              <>
                {mainItems.map(n => (
                  <button key={n.id} className={'mnav-top' + (navActive(n.id) ? ' active' : '')} onClick={() => go(n.id)}>{navLabel(n)}</button>
                ))}
                {showAdmin && (
                  <div className="mnav-acc">
                    <button className={'mnav-top' + (adminActive ? ' active' : '')} aria-expanded={adminOpen} onClick={() => setMobileGroup(adminOpen ? null : 'admin')}>
                      <span>Admin</span>
                      <Icon name="chevron" className="mnav-chev" style={{ transform: adminOpen ? 'rotate(90deg)' : 'none' }} />
                    </button>
                    {adminOpen && (
                      <div className="mnav-children">
                        {adminItems.map(c => <button key={c.id} className={navActive(c.id) ? 'active' : ''} onClick={() => go(c.id)}>{navLabel(c)}</button>)}
                      </div>
                    )}
                  </div>
                )}
              </>
            );
          })() : NAV_GROUPS.map(g => {
            if (!g.children) {
              if (!g.show(access) || (g.flag && !flagOn(g.flag))) return null;
              return <button key={g.id} className={'mnav-top' + (navActive(g.id) ? ' active' : '')} onClick={() => go(g.view || g.id)}>{g.label}</button>;
            }
            const kids = g.children.filter(c => c.show(access) && (!c.flag || flagOn(c.flag)));
            if (!kids.length) return null;
            const open = mobileGroup === g.id;
            const groupActive = kids.some(c => navActive(c.id));
            return (
              <div key={g.id} className="mnav-acc">
                <button className={'mnav-top' + (groupActive ? ' active' : '')} aria-expanded={open} onClick={() => setMobileGroup(open ? null : g.id)}>
                  <span>{g.label}</span>
                  <Icon name="chevron" className="mnav-chev" style={{ transform: open ? 'rotate(90deg)' : 'none' }} />
                </button>
                {open && (
                  <div className="mnav-children">
                    {kids.map(c => <button key={c.id} className={navActive(c.id) ? 'active' : ''} onClick={() => go(c.id)}>{navLabel(c)}</button>)}
                  </div>
                )}
              </div>
            );
          })}
          {(() => {
            const kids = ASSISTANTS.filter(c => c.show(access) && (!c.flag || flagOn(c.flag)));
            if (!kids.length) return null;
            const open = mobileGroup === 'assistants';
            const groupActive = kids.some(c => navActive(c.id));
            return (
              <div className="mnav-acc">
                <button className={'mnav-top' + (groupActive ? ' active' : '')} aria-expanded={open} onClick={() => setMobileGroup(open ? null : 'assistants')}>
                  <span>Assistants</span>
                  <Icon name="chevron" className="mnav-chev" style={{ transform: open ? 'rotate(90deg)' : 'none' }} />
                </button>
                {open && (
                  <div className="mnav-children">
                    {kids.map(c => <button key={c.id} className={navActive(c.id) ? 'active' : ''} onClick={() => go(c.id)}>{c.label}</button>)}
                  </div>
                )}
              </div>
            );
          })()}
          {(() => {
            const open = mobileGroup === 'account';
            return (
              <div className="mnav-acc">
                <button className="mnav-top" aria-expanded={open} onClick={() => setMobileGroup(open ? null : 'account')}>
                  <span>Account</span>
                  <Icon name="chevron" className="mnav-chev" style={{ transform: open ? 'rotate(90deg)' : 'none' }} />
                </button>
                {open && (
                  <div className="mnav-children">
                    <button onClick={() => { setMenuOpen(false); openHelp(); }}>Help &amp; navigation</button>
                    <button onClick={onLogout}>Sign out</button>
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      )}

      {helpOpen && <HelpPanel view={view} onClose={closeHelp} onStartTour={startTour} />}
      {notifOpen && <NotificationsPanel me={me} access={access} flash={flash} onClose={() => { setNotifOpen(false); refreshNotifs(); }} />}
      {appearanceOpen && <AppearanceMenu me={me} onClose={() => setAppearanceOpen(false)} onNav={setNavMode} />}
      {viewSwitchOpen && canSwitchView && <ViewSwitcher current={viewOverride || ''} onPick={applyViewOverride} onClose={() => setViewSwitchOpen(false)} />}
      {tourOpen && tourSteps.length > 0 && <GuidedTour steps={tourSteps} onNavigate={go} onClose={endTour} />}
      {celebs.length > 0 && <CelebrationOverlay emp={me} celebrations={celebs} onClose={() => setCelebs([])} />}
      <main className="main">{(modulesAllReady || view === 'dashboard') ? renderView() : (
        <div className="fade-in" style={{ display: 'grid', placeItems: 'center', minHeight: '50vh' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, color: 'var(--ink-3)' }}>
            <span className="spin" style={{ width: 26, height: 26, border: '3px solid var(--line)', borderTopColor: 'var(--accent)', borderRadius: '50%' }} />
            <div style={{ fontSize: 13.5, fontWeight: 600 }}>Loading…</div>
          </div>
        </div>
      )}</main>

      {/* Floating bubble is Help (the assistants launcher moved into the topbar). Always available. */}
      <div className="assistant-fab">
        <button className="assistant-fab-btn" title="Help & navigation" onClick={openHelp}><Icon name="help" style={{ width: 20, height: 20 }} /></button>
      </div>

      {toast && (
        <div className="fade-in" style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 60, background: 'var(--ink)', color: 'var(--surface)', padding: '11px 20px', borderRadius: 'var(--r-pill)', fontSize: 13.5, fontWeight: 600, boxShadow: 'var(--shadow-lg)', display: 'flex', alignItems: 'center', gap: 9 }}>
          <Icon name="check" style={{ width: 16, height: 16, color: 'oklch(0.8 0.13 155)' }} /> {toast}
        </div>
      )}

      <TweaksPanel>
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 16, letterSpacing: '-0.01em', padding: '2px 2px 4px' }}>Preferences</div>
        <TweakSection label="Language" />
        <TweakRadio label="Language" value={t.lang || 'en'} options={(typeof getLanguages === 'function' ? getLanguages() : [{code:'en',name:'English'}]).map(l => l.name)}
          onChange={name => { const L = getLanguages().find(x => x.name === name); if (L) { setTweak('lang', L.code); setLang(L.code); } }} />
        <TweakButton label="Add a language" onClick={() => {
          const name = prompt('Language name (e.g. Français):'); if (!name) return;
          const code = (prompt('2-letter code (e.g. fr):') || '').trim().toLowerCase(); if (!code) return;
          addLanguage(code, name.trim(), {}); setTweak('lang', code); setLang(code);
        }} />
        <TweakSection label="Riley’s voice" />
        <TweakRadio label="Narration" value={t.rileyVoice === false ? 'Off' : 'On'} options={['On', 'Off']} onChange={v => setTweak('rileyVoice', v === 'On')} />
        <TweakSection label="Visual style" />
        <TweakRadio label="Theme" value={t.style} options={['clinical', 'warm', 'modern']} onChange={v => setTweak('style', v)} />
        <TweakColor label="Accent" value={`oklch(0.56 0.12 ${t.accentHue})`}
          options={[195, 220, 250, 280, 160].map(h => `oklch(0.56 0.12 ${h})`)}
          onChange={v => { const m = v.match(/ (\d+(?:\.\d+)?)\)/); if (m) setTweak('accentHue', parseFloat(m[1])); }} />
        <TweakSection label="Layout" />
        <TweakRadio label="Density" value={t.density} options={['compact', 'regular', 'comfy']} onChange={v => setTweak('density', v)} />
        <TweakRadio label="Checklist" value={t.hubLayout} options={['grid', 'list']} onChange={v => setTweak('hubLayout', v)} />
      </TweaksPanel>
    </div>
  );
}

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [me, setMe] = useState(null);          // set only AFTER the scoped roster is loaded
  const [loadingRoster, setLoadingRoster] = useState(false);
  const [rosterError, setRosterError] = useState('');
  // Admin-only "preview as" override. null = the signed-in user's real access. Seeded from
  // any login-screen dev pick so that choice carries in and stays switchable in-app.
  const [viewOverride, setViewOverride] = useState(() => { try { return window.__PD_DEV_VIEW || null; } catch (e) { return null; } });

  useEffect(() => {
    const r = document.documentElement;
    r.setAttribute('data-style', t.style);
    r.setAttribute('data-density', t.density);
    r.style.setProperty('--accent-hue', t.accentHue);
  }, [t.style, t.density, t.accentHue]);

  useEffect(() => { if (typeof setLang === 'function') setLang(t.lang || 'en'); }, [t.lang]);
  useEffect(() => { window.__rileyVoice = t.rileyVoice !== false; window.__lang = t.lang || 'en'; }, [t.rileyVoice, t.lang]);

  // After Google sign-in: fetch the SCOPED roster from the server using the token,
  // populate window.HRDATA, rebuild rbac's derived data, then enter the app.
  const enterWithToken = async () => {
    setRosterError('');
    setLoadingRoster(true);
    try {
      const token = window.PD_GOOGLE_TOKEN || '';
      // Send the token in a CUSTOM header. Azure Static Web Apps overwrites the standard
      // "Authorization" header with its own Easy Auth token, so the server reads X-Google-Token.
      const res = await fetch('/api/roster', { headers: { 'X-Google-Token': token } });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || ('Roster request failed (' + res.status + ')'));
      }
      const data = await res.json();
      window.HRDATA = data;
      if (typeof window.PD_REBUILD_HRDATA === 'function') window.PD_REBUILD_HRDATA();
      // identify the signed-in employee from the (now loaded) roster
      const email = (window.__PD_SIGNIN_EMAIL || '').toLowerCase();
      const meEmp = (typeof findByEmail === 'function') ? findByEmail(email) : null;
      if (!meEmp) throw new Error('No roster account found for ' + email);
      // Gate: don't enter the authenticated app until the deferred view modules are ready.
      // The login spinner stays up (loadingRoster is still true) during this wait.
      if (window.__PD_MODULES_READY) await window.__PD_MODULES_READY;
      saveSession(meEmp);
      setMe(meEmp);
    } catch (e) {
      setRosterError(e.message || 'Could not load your roster.');
    } finally {
      setLoadingRoster(false);
    }
  };

  // Called by Login on a successful Google sign-in (email already domain-checked there).
  const onSignedIn = (email) => {
    window.__PD_SIGNIN_EMAIL = (email || '').toLowerCase();
    enterWithToken();
  };

  const logout = () => { saveSession(null); setMe(null); window.PD_GOOGLE_TOKEN = ''; window.__PD_SIGNIN_EMAIL = ''; };
  const previewAs = async (emp) => { if (window.__PD_MODULES_READY) await window.__PD_MODULES_READY; saveSession(emp); setMe(emp); window.scrollTo({ top: 0 }); };

  // DEV bridge — inert in production. A dev-only module (dev-bypass.js), when present,
  // registers itself here so it can enter the app WITHOUT Google sign-in (sandbox screen
  // work, since /api/roster + authorized Google origins don't exist outside prod).
  // No-op unless that module is loaded — production ships with no dev script and this
  // useEffect does nothing.
  useEffect(() => {
    if (typeof window.__PD_DEV_REGISTER !== 'function') return;
    const enter = async (opts = {}) => {
      try {
        const have = window.HRDATA && Array.isArray(window.HRDATA.employees) && window.HRDATA.employees.length;
        if (!have) {
          // No hrdata.json: the dev seed (single identity + real places) is provided
          // inline by dev-bypass.js. In production this whole bridge never runs.
          window.HRDATA = window.__PD_DEV_SEED || { employees: [], offices: [], departments: [], titles: [], managers: [], users: [], offboarding: [] };
          if (typeof window.PD_REBUILD_HRDATA === 'function') window.PD_REBUILD_HRDATA();
        }
        const demo = opts.emp || (typeof findByEmail === 'function' && findByEmail('mgrant@puredental.com')) || (window.EMPLOYEES || [])[0];
        if (demo) { if (window.__PD_MODULES_READY) await window.__PD_MODULES_READY; saveSession(demo); setMe(demo); return true; }
      } catch (e) { /* fall back to the login screen */ }
      return false;
    };
    window.__PD_DEV_REGISTER({ enter });
  }, []);

  if (!me) {
    return <Login onSignedIn={onSignedIn} loading={loadingRoster} error={rosterError} />;
  }
  // Real access (no override) gates who may use the view switcher. Then apply the
  // override (if any) to derive the access the app actually renders with.
  window.__PD_DEV_VIEW = '';
  const realAccess = deriveAccess(me);
  window.__PD_DEV_VIEW = viewOverride || '';
  const access = deriveAccess(me);
  return <Portal key={me.id} me={me} access={access} realAccess={realAccess} viewOverride={viewOverride} setViewOverride={setViewOverride} onLogout={logout} t={t} setTweak={setTweak} />;
}

// Tiered boot (see index.html + deferred-loader.js):
//   Tier 2 (__PD_MODULES_READY):     dashboard + appearance — entry gates on this.
//   Tier 3 (__PD_MODULES_ALL_READY): the rest — streams in behind the dashboard; views
//                                    that need it show a brief spinner until it resolves.
const __pdLoad = (typeof window.__PD_LOAD_DEFERRED === 'function') ? window.__PD_LOAD_DEFERRED : (() => Promise.resolve());
window.__PD_MODULES_READY = __pdLoad(window.__PD_DEFERRED_PRIMARY || []);
window.__PD_MODULES_ALL_READY = window.__PD_MODULES_READY.then(() => __pdLoad(window.__PD_DEFERRED_REST || []));
ReactDOM.createRoot(document.getElementById('root')).render(<App />);
