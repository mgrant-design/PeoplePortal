/* help.jsx — dismissible navigation video + contextual help, available on every page. */

const HELP_PAGES = [
  { id: 'dashboard', label: 'Dashboard', icon: 'grid', desc: 'Your role-aware home. Employees see quick actions; managers & leadership see team stats, headcount by office, and shortcuts.' },
  { id: 'people', label: 'Directory', icon: 'users', desc: 'Find any colleague’s photo, role, office and work contact. Managers & HR can open a full record (Overview, Employee relations, Performance, Documents, Offboarding).' },
  { id: 'ask', label: 'Ask Riley', icon: 'sparkle', desc: 'The onboarding assistant. Ask about first day, pay, benefits, logins or time off — it answers instantly and routes anything else to the right person.' },
  { id: 'askhr', label: 'Ask HR', icon: 'shield', desc: 'Management only. Your on-call HR advisor (Harper) for employee relations, discipline, leaves, and wage & hour — plus guides & templates, webinars, and NY/NJ compliance alerts.' },
  { id: 'timeclock', label: 'Time clock', icon: 'clock', desc: 'Clock in/out by location, take breaks, and view your timesheet. Clock-ins are matched to your scheduled shift. Managers approve & export to Paychex.' },
  { id: 'reviews', label: 'Reviews', icon: 'star', desc: 'Performance reviews. HR/exec set the questions; you complete a self-review; your manager reviews you and shares the results.' },
  { id: 'onboarding', label: 'My onboarding', icon: 'bolt', desc: 'Your role-specific setup checklist — paperwork, credentials (providers), policies, accounts, learning, team and benefits.' },
  { id: 'automations', label: 'Automations', icon: 'plus', desc: 'HR/Admin: add a new hire and the agent reaches out, gathers details, verifies credentials, and provisions accounts. Edit the agent in the Agent console.' },
  { id: 'scheduler', label: 'Scheduling', icon: 'calendar', desc: 'Build the week with drag-and-drop, Smart fill by skills, copy a prior week, open shifts to claim, and publish. View by team & location.' },
  { id: 'offboarding', label: 'Offboarding', icon: 'bell', desc: 'Termination & resignation requests with checklist (resignation letter, exit interview) and links to the employee record.' },
  { id: 'offices', label: 'Offices', icon: 'building', desc: 'View all locations with live headcounts; add or edit an office.' },
  { id: 'reports', label: 'Reports', icon: 'list', desc: 'Drag-and-drop report builder, headcount charts, and Time & overtime (scheduled vs worked, OT flags, approvals).' },
  { id: 'admin', label: 'Admin', icon: 'key', desc: 'Manage who can print, suspend, terminate, delete, and administer the portal.' },
  { id: 'me', label: 'My profile', icon: 'users', desc: 'Upload your photo and review your details. Your personal info is private to HR.' },
];
const VIEW_TO_HELP = { emprecord: 'people', addhire: 'automations', autodetail: 'automations', agentconsole: 'automations', hub: 'onboarding', welcome: 'onboarding', profilestep: 'onboarding', paperwork: 'onboarding', credentials: 'onboarding', policies: 'onboarding', accounts: 'onboarding', training: 'onboarding', team: 'onboarding', schedule: 'onboarding', benefits: 'onboarding' };

function HelpPanel({ view, onClose, onStartTour }) {
  const [q, setQ] = useState('');
  const curId = VIEW_TO_HELP[view] || view;
  const cur = HELP_PAGES.find(p => p.id === curId);
  const filtered = HELP_PAGES.filter(p => !q || (p.label + ' ' + p.desc).toLowerCase().includes(q.toLowerCase()));

  useEffect(() => { const h = (e) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h); }, []);

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 85, background: 'oklch(0.3 0.03 250 / 0.4)', display: 'flex', justifyContent: 'flex-end' }}>
      <div onClick={e => e.stopPropagation()} className="fade-in" style={{ width: 'min(440px, 94vw)', height: '100%', background: 'var(--surface)', boxShadow: 'var(--shadow-lg)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 20px', borderBottom: '1px solid var(--line)' }}>
          <Icon name="help" style={{ width: 20, height: 20, color: 'var(--accent)' }} />
          <h2 style={{ fontSize: 18, flex: 1 }}>Help & navigation</h2>
          <button className="btn btn-quiet" style={{ padding: 8 }} onClick={onClose}><Icon name="x" /></button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
          {/* AI walkthrough video */}
          <div style={{ marginBottom: 14 }}><AIWalkthrough /></div>
          {onStartTour && <button className="btn btn-ghost" style={{ width: '100%', justifyContent: 'center', marginBottom: 18 }} onClick={onStartTour}><Icon name="bolt" /> Take the interactive tour</button>}

          {/* current page */}
          {cur && (
            <div className="card" style={{ padding: 16, marginBottom: 18, background: 'var(--accent-softer)', border: '1px solid var(--accent-soft)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 6 }}>
                <div style={{ width: 30, height: 30, borderRadius: 8, background: 'var(--accent-soft)', color: 'var(--accent-strong)', display: 'grid', placeItems: 'center' }}><Icon name={cur.icon} style={{ width: 16, height: 16 }} /></div>
                <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--accent-strong)' }}>You’re here · {cur.label}</span>
              </div>
              <p style={{ fontSize: 13.5, color: 'var(--ink-2)', lineHeight: 1.5 }}>{cur.desc}</p>
            </div>
          )}

          {/* all pages */}
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--ink-3)', marginBottom: 10 }}>All pages & functions</div>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search help…" style={{ width: '100%', padding: '9px 12px', borderRadius: 'var(--r-md)', border: '1.5px solid var(--line)', fontSize: 13.5, background: 'var(--surface)', color: 'var(--ink)', outline: 'none', marginBottom: 12 }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {filtered.map(p => (
              <div key={p.id} style={{ display: 'flex', gap: 11, padding: '11px 12px', borderRadius: 'var(--r-md)', border: '1px solid var(--line)', background: p.id === curId ? 'var(--surface-2)' : 'var(--surface)' }}>
                <div style={{ width: 30, height: 30, borderRadius: 8, flex: 'none', display: 'grid', placeItems: 'center', background: 'var(--accent-soft)', color: 'var(--accent-strong)' }}><Icon name={p.icon} style={{ width: 16, height: 16 }} /></div>
                <div><div style={{ fontWeight: 600, fontSize: 13.5 }}>{p.label}</div><p style={{ fontSize: 12.5, color: 'var(--ink-3)', marginTop: 2, lineHeight: 1.45 }}>{p.desc}</p></div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ padding: '12px 20px', borderTop: '1px solid var(--line)', display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--ink-3)' }}>
          <Icon name="sparkle" style={{ width: 14, height: 14, color: 'var(--accent)' }} /> Need a person? Ask Riley or contact HR anytime.
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { HelpPanel });
