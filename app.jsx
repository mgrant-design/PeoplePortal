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
  { id: 'admin', label: 'Admin', show: a => a.caps.manageUsers },
  { id: 'feedback', label: 'Roadmap', show: () => true },
  { id: 'ask', label: 'Ask Riley', show: () => true, flag: 'ask' },
  { id: 'askhr', label: 'Ask HR', show: a => a.caps.askHR, flag: 'askhr' },
];

const ONBOARD_VIEWS = ['onboarding', 'hub', 'welcome', 'profilestep', 'paperwork', 'credentials', 'policies', 'accounts', 'training', 'team', 'schedule', 'benefits'];

function Portal({ me, access, onLogout, t, setTweak }) {
  const [view, setView] = useState('dashboard');
  const [selectedEmp, setSelectedEmp] = useState(null);
  const [tasks, setTasks] = useState(() => (ROLE_ONBOARDING[onboardRole(me).id] || TASKS).map(x => ({ ...x })));
  const [accountsReady, setAccountsReady] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const openHelp = () => setHelpOpen(true);
  const closeHelp = () => { setHelpOpen(false); try { localStorage.setItem('pd_help_seen', '1'); } catch (e) {} };
  const [flags, setFlags] = useState(() => { try { return { ...FLAG_DEFAULTS, ...(JSON.parse(localStorage.getItem('pd_flags')) || {}) }; } catch (e) { return { ...FLAG_DEFAULTS }; } });
  const setFlag = (id, val) => { const n = { ...flags, [id]: val }; setFlags(n); try { localStorage.setItem('pd_flags', JSON.stringify(n)); } catch (e) {} };
  const flagOn = (id) => flags[id] !== false;
  // admin-customizable nav order (drag-and-drop). Stores the full ordered id list.
  const [navOrder, setNavOrder] = useState(() => { try { const v = JSON.parse(localStorage.getItem('pd_nav_order')); return Array.isArray(v) && v.length ? v : null; } catch (e) { return null; } });
  const saveNavOrder = (ids) => { setNavOrder(ids); try { localStorage.setItem('pd_nav_order', JSON.stringify(ids)); } catch (e) {} };
  const resetNavOrder = () => { setNavOrder(null); try { localStorage.removeItem('pd_nav_order'); } catch (e) {} };
  const [dragNav, setDragNav] = useState(null);
  const [dropNav, setDropNav] = useState(null);
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
  const notifN = (typeof notifCount === 'function') ? notifCount(me, access) : 0;
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

  const stepProps = { onBack: () => go('onboarding'), onComplete: () => completeTask(view) };
  const navList = NAV.filter(n => n.show(access) && (!n.flag || flagOn(n.flag)));
  const navAllOrder = (navOrder && navOrder.length) ? navOrder : NAV.map(n => n.id);
  const orderedNav = (() => { const rank = {}; navAllOrder.forEach((id, i) => { rank[id] = i; }); return navList.slice().sort((a, b) => (rank[a.id] != null ? rank[a.id] : 999) - (rank[b.id] != null ? rank[b.id] : 999)); })();
  const canReorder = access.caps.manageUsers;
  const onNavDrop = (targetId) => {
    if (!dragNav || dragNav === targetId) { setDragNav(null); setDropNav(null); return; }
    const ids = navAllOrder.slice();
    const from = ids.indexOf(dragNav), to = ids.indexOf(targetId);
    if (from < 0 || to < 0) return;
    ids.splice(to, 0, ids.splice(from, 1)[0]);
    saveNavOrder(ids); setDragNav(null); setDropNav(null);
  };
  const navBtn = (n) => (
    <button key={n.id} className={navActive(n.id) ? 'active' : ''}
      draggable={canReorder}
      onClick={() => go(n.id === 'onboarding' ? 'onboarding' : n.id)}
      onDragStart={canReorder ? (e) => { setDragNav(n.id); e.dataTransfer.effectAllowed = 'move'; } : undefined}
      onDragOver={canReorder ? (e) => { e.preventDefault(); if (dropNav !== n.id) setDropNav(n.id); } : undefined}
      onDragLeave={canReorder ? () => setDropNav(d => d === n.id ? null : d) : undefined}
      onDrop={canReorder ? (e) => { e.preventDefault(); onNavDrop(n.id); } : undefined}
      onDragEnd={canReorder ? () => { setDragNav(null); setDropNav(null); } : undefined}
      title={canReorder ? 'Drag to reorder' : undefined}
      style={{ ...(canReorder ? { cursor: dragNav ? 'grabbing' : 'grab' } : null), ...(dragNav === n.id ? { opacity: 0.4 } : null), ...(dropNav === n.id && dragNav && dragNav !== n.id ? { boxShadow: 'inset 2px 0 0 var(--accent)' } : null) }}>
      {navLabel(n)}
    </button>
  );
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
      case 'myschedule': return <MySchedule me={me} flash={flash} />;
      // ---- onboarding sub-flow ----
      case 'onboarding':
        if (access.caps.onboardStatus) return <OnboardingStatus me={me} access={access} automations={automations} onPrehire={() => go('prehire')} onOpenAuto={(id) => { setCurrentAuto(id); go('autodetail'); }} />;
        return <Hub tasks={visibleTasks} onOpen={hubGo} layout={t.hubLayout} roleLabel={me.jobTitle} emp={me} notice={accountsReady ? { onView: () => go('accounts') } : null} />;
      case 'hub': return <Hub tasks={visibleTasks} onOpen={hubGo} layout={t.hubLayout} roleLabel={me.jobTitle} emp={me} notice={accountsReady ? { onView: () => go('accounts') } : null} />;
      case 'welcome': return <WelcomeStep {...stepProps} />;
      case 'profilestep': return <ProfileStep {...stepProps} />;
      case 'paperwork': return <Paperwork onBack={stepProps.onBack} onComplete={() => completeTask('paperwork')} />;
      case 'credentials': return <CredentialsStep {...stepProps} role={obRole} />;
      case 'policies': return <PoliciesStep {...stepProps} />;
      case 'accounts': return <AccountsStep onBack={stepProps.onBack} onComplete={() => completeTask('accounts')} role={obRole} credentialsDone={credentialsDone} onReady={() => setAccountsReady(true)} onGoCredentials={() => go('credentials')} apiMode={flagOn('provisionApi')} />;
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

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="mark"><Logo /></span>
          <span>Pure Dental<small>People Portal</small></span>
        </div>
        <nav className="topnav desktop-nav">
          {orderedNav.map(n => navBtn(n))}
          {canReorder && navOrder && <button className="btn btn-quiet" style={{ padding: '6px 9px', fontSize: 12 }} title="Reset menu order" onClick={resetNavOrder}><Icon name="refresh" style={{ width: 14, height: 14 }} /></button>}
        </nav>
        <div className="spacer" />
        <button className="btn btn-quiet mobile-menu-btn" style={{ padding: 9, display: 'none' }} onClick={() => setMenuOpen(m => !m)} title="Menu"><Icon name="list" /></button>
        <button className="btn btn-quiet" style={{ padding: 9 }} onClick={openHelp} title="Help & navigation"><Icon name="help" /></button>
        <button className="btn btn-quiet" style={{ padding: 9, position: 'relative' }} onClick={() => setNotifOpen(true)} title="Notifications">
          <Icon name="bell" />
          {notifN > 0 && <span style={{ position: 'absolute', top: 5, right: 6, minWidth: 15, height: 15, padding: '0 3px', borderRadius: 99, background: 'var(--warn)', color: '#3a2a00', fontSize: 9.5, fontWeight: 800, display: 'grid', placeItems: 'center', border: '1.5px solid var(--surface)' }}>{notifN}</span>}
        </button>
        <button className="userchip" onClick={() => go('me')} style={{ border: '1px solid var(--line)', cursor: 'pointer' }} title="My profile">
          <div className="meta"><b>{me.name}</b><span>{access.label}</span></div>
          <PhotoAvatar emp={me} size={34} />
        </button>
        <button className="btn btn-quiet" style={{ padding: 9 }} onClick={onLogout} title="Sign out"><Icon name="arrowRight" /></button>
      </header>

      {menuOpen && (
        <div className="mobile-nav fade-in">
          {orderedNav.map(n => navBtn(n))}
          <button onClick={onLogout}>Sign out</button>
          <button onClick={() => { setMenuOpen(false); openHelp(); }}>Help & navigation</button>
        </div>
      )}

      {helpOpen && <HelpPanel view={view} onClose={closeHelp} onStartTour={startTour} />}
      {notifOpen && <NotificationsPanel me={me} access={access} flash={flash} onClose={() => setNotifOpen(false)} />}
      {tourOpen && tourSteps.length > 0 && <GuidedTour steps={tourSteps} onNavigate={go} onClose={endTour} />}
      {celebs.length > 0 && <CelebrationOverlay emp={me} celebrations={celebs} onClose={() => setCelebs([])} />}
      <main className="main">{renderView()}</main>

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
  const [me, setMe] = useState(() => (typeof loadSession === 'function' ? loadSession() : null));

  useEffect(() => {
    const r = document.documentElement;
    r.setAttribute('data-style', t.style);
    r.setAttribute('data-density', t.density);
    r.style.setProperty('--accent-hue', t.accentHue);
  }, [t.style, t.density, t.accentHue]);

  useEffect(() => { if (typeof setLang === 'function') setLang(t.lang || 'en'); }, [t.lang]);
  useEffect(() => { window.__rileyVoice = t.rileyVoice !== false; window.__lang = t.lang || 'en'; }, [t.rileyVoice, t.lang]);

  const logout = () => { saveSession(null); setMe(null); };
  const previewAs = (emp) => { saveSession(emp); setMe(emp); window.scrollTo({ top: 0 }); };

  if (!me) return <Login onLogin={setMe} />;
  const access = deriveAccess(me);
  return (
    <>
      <Portal key={me.id} me={me} access={access} onLogout={logout} t={t} setTweak={setTweak} />
      <DevBar current={me} onPreview={previewAs} />
    </>
  );
}

if (!window.__PD_ROSTER_ERROR) {
  ReactDOM.createRoot(document.getElementById('root')).render(<App />);
}
