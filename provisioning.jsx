/* provisioning.jsx — "Accounts & access": role-based account creation, credential
   handoff, and resource tour. Replaces the simple AccountsStep. */

function CopyBtn({ text }) {
  const [done, setDone] = useState(false);
  return (
    <button onClick={() => { try { navigator.clipboard && navigator.clipboard.writeText(text); } catch (e) {} setDone(true); setTimeout(() => setDone(false), 1400); }}
      title="Copy" style={{ border: 'none', background: 'none', color: done ? 'var(--ok)' : 'var(--ink-3)', cursor: 'pointer', padding: 5, display: 'grid', placeItems: 'center', flex: 'none' }}>
      <Icon name={done ? 'check' : 'doc'} style={{ width: 15, height: 15 }} />
    </button>
  );
}

function CredField({ label, value, secret }) {
  const [show, setShow] = useState(!secret);
  return (
    <div>
      <div style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--ink-3)', fontWeight: 700, marginBottom: 4 }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 'var(--r-sm)', padding: '7px 8px 7px 11px' }}>
        <span className="mono" style={{ fontSize: 12.5, fontWeight: 600, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{show ? value : '•'.repeat(Math.min(12, value.length))}</span>
        {secret && <button onClick={() => setShow(s => !s)} style={{ border: 'none', background: 'none', color: 'var(--ink-3)', fontSize: 11.5, fontWeight: 700, cursor: 'pointer', padding: '0 4px' }}>{show ? 'Hide' : 'Show'}</button>}
        <CopyBtn text={value} />
      </div>
    </div>
  );
}

function AccountRow({ app, state, locked, onGoCredentials, apiMode = true }) {
  return (
    <div className="card" style={{ padding: '14px var(--pad)', display: 'flex', alignItems: 'center', gap: 14, opacity: locked ? 0.7 : 1,
      borderColor: state === 'ready' ? 'var(--ok)' : 'var(--line)' }}>
      <div style={{ width: 42, height: 42, borderRadius: 'var(--r-md)', flex: 'none', display: 'grid', placeItems: 'center',
        background: state === 'ready' ? 'var(--ok-soft)' : 'var(--accent-soft)', color: state === 'ready' ? 'var(--ok)' : 'var(--accent-strong)' }}>
        <Icon name={state === 'ready' ? 'check' : app.icon} style={{ width: 22, height: 22 }} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 600, fontSize: 15 }}>{app.name}</span>
          {app.provider && <span className="badge badge-prog" style={{ fontSize: 10.5 }}>Provider</span>}
        </div>
        <div style={{ fontSize: 13, color: 'var(--ink-3)', marginTop: 2 }}>{app.detail}</div>
      </div>
      <div style={{ flex: 'none', textAlign: 'right' }}>
        {locked ? (
          <button onClick={onGoCredentials} className="badge badge-lock" style={{ border: 'none', cursor: 'pointer' }}><Icon name="lock" /> Needs credentials</button>
        ) : state === 'ready' ? <span className="badge badge-ok"><Icon name="check" /> Created</span>
        : state === 'creating' ? <span className="badge badge-prog"><span className="spin" style={{ width: 12, height: 12, border: '2px solid currentColor', borderTopColor: 'transparent', borderRadius: '50%', display: 'block' }} /> Creating…</span>
        : <span className="badge badge-todo">Queued</span>}
        <div className="mono" style={{ fontSize: 10.5, color: 'var(--ink-3)', marginTop: 5 }}>{apiMode ? 'via ' + app.api : 'by IT / HR'}</div>
      </div>
    </div>
  );
}

const TOUR_CHAPTERS = [
  ['Intranet home', '0:00'], ['Where to find resources', '1:12'], ['Requesting time off', '2:40'], ['Clinical protocols & SOPs', '3:55'], ['Getting IT help', '5:10'],
];
const RESOURCES = [
  { icon: 'book', name: 'Employee handbook', detail: 'Policies, PTO, dress code' },
  { icon: 'heart', name: 'Benefits portal', detail: 'Paychex Flex · enroll & manage' },
  { icon: 'tooth', name: 'Clinical SOPs', detail: 'Protocols & checklists' },
  { icon: 'phone', name: 'IT help desk', detail: 'help@puredental.com · ext. 100' },
];

function AccountsStep({ role, credentialsDone, onBack, onComplete, onReady, onGoCredentials, apiMode = true }) {
  const apps = useMemo(() => (role.apps || []).map(id => APP_CATALOG[id]), [role]);
  const isLocked = (app) => app.provider && role.clinical && !credentialsDone;
  const provisionable = apps.filter(a => !isLocked(a));

  const [phase, setPhase] = useState('pre'); // pre | provisioning | ready
  const [states, setStates] = useState({});  // appId -> queued|creating|ready

  const startProvision = () => {
    setPhase('provisioning');
    const init = {}; provisionable.forEach(a => init[a.id] = 'queued'); setStates(init);
    provisionable.forEach((a, i) => {
      setTimeout(() => setStates(s => ({ ...s, [a.id]: 'creating' })), 500 + i * 900);
      setTimeout(() => setStates(s => ({ ...s, [a.id]: 'ready' })), 500 + i * 900 + 850);
    });
    setTimeout(() => { setPhase('ready'); onReady && onReady(); }, 500 + provisionable.length * 900 + 950);
  };

  const lockedCount = apps.length - provisionable.length;

  /* ---------- READY: credentials vault + tour ---------- */
  if (phase === 'ready') {
    return (
      <StepShell icon="key" eyebrow="Accounts & access" title="Your accounts are ready"
        subtitle={apiMode
          ? "Every system below was created automatically and linked to your profile. Here are your logins — you’ll be asked to set a new password on first sign-in."
          : "IT/HR set up every system below and recorded your logins here. You’ll be asked to set a new password on first sign-in."}
        onBack={onBack}
        aside={<div className="badge badge-ok" style={{ padding: '8px 14px' }}><Icon name="check" /> {provisionable.length} created</div>}>

        <div className="fade-in" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', borderRadius: 'var(--r-md)', background: 'var(--ok-soft)', marginBottom: 'var(--gap)' }}>
          <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--ok)', color: '#fff', display: 'grid', placeItems: 'center', flex: 'none' }}><Icon name="bell" style={{ width: 18, height: 18 }} /></div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 14.5, color: 'oklch(0.4 0.12 155)' }}>Credentials delivered</div>
            <div style={{ fontSize: 13, color: 'oklch(0.42 0.1 155)' }}>A secure copy was also emailed to {NEW_HIRE.email}.</div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 'var(--gap)' }}>
          {provisionable.map(app => (
            <div key={app.id} className="card" style={{ padding: 'var(--pad)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 14 }}>
                <div style={{ width: 36, height: 36, borderRadius: 'var(--r-md)', flex: 'none', display: 'grid', placeItems: 'center', background: 'var(--accent-soft)', color: 'var(--accent-strong)' }}><Icon name={app.icon} style={{ width: 19, height: 19 }} /></div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14.5 }}>{app.name}</div>
                  <div className="mono" style={{ fontSize: 11, color: 'var(--accent-strong)' }}>{app.url} ↗</div>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <CredField label={app.user.includes('@') ? 'Email' : 'Username'} value={app.user} />
                <CredField label={app.reset ? 'Temporary password' : 'Access'} value={app.pass} secret={app.reset} />
              </div>
              {app.reset
                ? <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 10, display: 'flex', alignItems: 'center', gap: 6 }}><Icon name="refresh" style={{ width: 13, height: 13 }} /> Reset required on first sign-in</div>
                : <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 10, display: 'flex', alignItems: 'center', gap: 6 }}><Icon name="link" style={{ width: 13, height: 13 }} /> Single sign-on — no password needed</div>}
            </div>
          ))}
        </div>

        {lockedCount > 0 && (
          <div className="card" style={{ marginTop: 'var(--gap)', padding: 'var(--pad)', display: 'flex', alignItems: 'center', gap: 14, borderStyle: 'dashed', background: 'var(--surface-2)' }}>
            <Icon name="lock" style={{ width: 22, height: 22, color: 'var(--ink-3)', flex: 'none' }} />
            <div style={{ flex: 1 }}><div style={{ fontWeight: 600, fontSize: 14 }}>{lockedCount} provider account{lockedCount > 1 ? 's' : ''} still pending</div><p style={{ fontSize: 13, color: 'var(--ink-3)', marginTop: 2 }}>They’ll be created the moment your license & credentials are verified.</p></div>
            <button className="btn btn-ghost" onClick={onGoCredentials}>Finish credentials <Icon name="arrowRight" /></button>
          </div>
        )}

        {/* Video tour + resources */}
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.5fr) minmax(0,1fr)', gap: 'var(--gap)', marginTop: 'calc(var(--gap) + 8px)', alignItems: 'start' }}>
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ position: 'relative', aspectRatio: '16/9', background: 'linear-gradient(150deg, var(--accent-strong), oklch(0.5 0.1 250))', display: 'grid', placeItems: 'center' }}>
              <div style={{ position: 'absolute', inset: 0, background: 'repeating-linear-gradient(135deg, transparent, transparent 16px, oklch(1 0 0 / 0.05) 16px, oklch(1 0 0 / 0.05) 32px)' }} />
              <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'oklch(1 0 0 / 0.95)', display: 'grid', placeItems: 'center', boxShadow: 'var(--shadow-lg)', zIndex: 1 }}>
                <div style={{ width: 0, height: 0, borderLeft: '20px solid var(--accent-strong)', borderTop: '12px solid transparent', borderBottom: '12px solid transparent', marginLeft: 5 }} />
              </div>
              <div style={{ position: 'absolute', left: 18, bottom: 16, color: '#fff', zIndex: 1 }}>
                <div className="eyebrow" style={{ color: 'oklch(0.9 0.05 200)' }}>Welcome tour</div>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 22, letterSpacing: '-0.02em' }}>Your intranet & resources</div>
                <div className="mono" style={{ fontSize: 12, opacity: 0.85, marginTop: 3 }}>6:24 · auto-unlocked today</div>
              </div>
            </div>
            <div style={{ padding: '12px var(--pad)', display: 'flex', flexDirection: 'column', gap: 2 }}>
              {TOUR_CHAPTERS.map(([c, t], i) => (
                <div key={c} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '8px 6px', borderTop: i ? '1px solid var(--line-soft)' : 'none' }}>
                  <span style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--accent-soft)', color: 'var(--accent-strong)', display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 700, flex: 'none' }}>{i + 1}</span>
                  <span style={{ flex: 1, fontSize: 13.5, fontWeight: 500 }}>{c}</span>
                  <span className="mono" style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>{t}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="card" style={{ padding: 'var(--pad)' }}>
            <h3 style={{ fontSize: 16, marginBottom: 4 }}>Resources</h3>
            <p style={{ fontSize: 12.5, color: 'var(--ink-3)', marginBottom: 14 }}>Everything you’ll need, in one place.</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {RESOURCES.map(r => (
                <a key={r.name} href="#" onClick={e => e.preventDefault()} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 'var(--r-md)', textDecoration: 'none', color: 'inherit', border: '1px solid var(--line)', transition: 'border-color .15s, background .15s' }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.background = 'var(--accent-softer)'; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--line)'; e.currentTarget.style.background = 'transparent'; }}>
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--accent-soft)', color: 'var(--accent-strong)', display: 'grid', placeItems: 'center', flex: 'none' }}><Icon name={r.icon} style={{ width: 17, height: 17 }} /></div>
                  <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontWeight: 600, fontSize: 13.5 }}>{r.name}</div><div style={{ fontSize: 12, color: 'var(--ink-3)' }}>{r.detail}</div></div>
                  <Icon name="arrowRight" style={{ width: 16, height: 16, color: 'var(--ink-3)' }} />
                </a>
              ))}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 24 }}>
          <button className="btn btn-primary btn-lg" onClick={onComplete}><Icon name="check" /> All set — finish</button>
        </div>
      </StepShell>
    );
  }

  /* ---------- PRE / PROVISIONING ---------- */
  return (
    <StepShell icon="key" eyebrow="Get set up" title="Accounts & access"
      subtitle={apiMode
        ? `Based on your role — ${role.label} — we’ll automatically create every system you need and hand you the logins. No tickets, no waiting on IT.`
        : `Based on your role — ${role.label} — IT/HR creates each system and records your logins here. You’ll get them the moment they’re ready.`}
      onBack={onBack}
      aside={<div className="badge badge-prog" style={{ padding: '8px 14px' }}><Icon name="link" /> {apiMode ? 'Auto-provisioned via API' : 'Set up by IT / HR'}</div>}>

      {phase === 'pre' && role.clinical && !credentialsDone && lockedCount > 0 && (
        <div className="card" style={{ padding: '14px var(--pad)', display: 'flex', alignItems: 'center', gap: 14, marginBottom: 'var(--gap)', borderColor: 'var(--warn)', background: 'var(--warn-soft)' }}>
          <Icon name="bell" style={{ width: 22, height: 22, color: 'oklch(0.55 0.13 60)', flex: 'none' }} />
          <div style={{ flex: 1 }}><div style={{ fontWeight: 700, fontSize: 14, color: 'oklch(0.45 0.12 60)' }}>Provider accounts need your credentials first</div><p style={{ fontSize: 13, color: 'oklch(0.45 0.1 60)', marginTop: 2 }}>Denticon Provider and DoseSpot create automatically once your NPI, license, and DEA are verified.</p></div>
          <button className="btn btn-ghost" onClick={onGoCredentials}>Verify now <Icon name="arrowRight" /></button>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {apps.map(app => <AccountRow key={app.id} app={app} state={states[app.id] || 'queued'} locked={phase === 'pre' && isLocked(app)} onGoCredentials={onGoCredentials} apiMode={apiMode} />)}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 22, gap: 16, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, color: 'var(--ink-3)', display: 'flex', alignItems: 'center', gap: 7 }}>
          <Icon name="bolt" style={{ width: 15, height: 15, color: 'var(--accent)' }} /> {provisionable.length} account{provisionable.length !== 1 ? 's' : ''} {apiMode ? 'ready to create' : 'to set up'}{lockedCount > 0 ? ` · ${lockedCount} waiting on credentials` : ''}.
        </span>
        <button className="btn btn-primary btn-lg" disabled={phase === 'provisioning'} onClick={startProvision}>
          {phase === 'provisioning'
            ? <><span className="spin" style={{ width: 15, height: 15, border: '2px solid #fff', borderTopColor: 'transparent', borderRadius: '50%', display: 'block' }} /> {apiMode ? 'Provisioning…' : 'Saving…'}</>
            : <><Icon name="bolt" /> {apiMode ? 'Provision my accounts' : 'Mark accounts as created'}</>}
        </button>
      </div>
    </StepShell>
  );
}

Object.assign(window, { AccountsStep });
