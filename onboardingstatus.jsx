/* onboardingstatus.jsx — management view of new hires in onboarding (scoped),
   plus the manager → HR Prehire submission that kicks off the process. */

const OB_STAGES = ['Prehire submitted', 'Added to Paychex', 'Paperwork', 'Credentials', 'Accounts', 'Training', 'Ready'];
/* A couple of just-submitted hires (manager → HR) that the agent hasn't picked
   up yet — the live, in-progress runs come from seeded automations. */
const OB_SEED = [
  { id: 'ob1', name: 'Tara Quinn', jobTitle: 'Front Desk Coordinator', loc: 'Manorville', type: 'PT', start: 'Jun 30', stage: 1, provider: false },
  { id: 'ob2', name: 'Luis Ortega', jobTitle: 'Insurance Specialist', loc: 'Islandia', type: 'FT', start: 'Jul 14', stage: 0, provider: false },
];

function obPct(stage) { return Math.round(stage / (OB_STAGES.length - 1) * 100); }

function OnboardingStatus({ me, access, automations, onPrehire, onOpenAuto }) {
  const all = useMemo(() => {
    const live = (automations || []).map(a => ({ id: a.id, name: a.name, jobTitle: a.jobTitle, loc: normLoc(a.office || ''), type: a.type || 'FT', start: a.startDate || '—', stage: Math.min(OB_STAGES.length - 1, (a.stage != null ? Math.ceil(a.stage / 2) : 1)), provider: a.provider, _auto: true }));
    return [...live, ...OB_SEED];
  }, [automations]);
  const list = access.caps.viewAll ? all : all.filter(h => h.loc === me.loc);
  const canPrehire = access.caps.viewTeam && !access.caps.viewAll || access.caps.hire;

  return (
    <div className="fade-in">
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 18 }}>
        <div>
          <h1 style={{ fontSize: 'clamp(22px,3vw,28px)' }}>Onboarding status</h1>
          <p style={{ color: 'var(--ink-2)', fontSize: 14.5, marginTop: 6 }}>{access.caps.viewAll ? 'All new hires in progress' : `New hires at ${me.loc}`} · {list.length} active</p>
        </div>
        {canPrehire && <button className="btn btn-primary" onClick={onPrehire}><Icon name="plus" /> Submit a new hire</button>}
      </div>

      {list.length === 0 ? (
        <div className="card" style={{ padding: 'clamp(28px,5vw,44px)', textAlign: 'center' }}>
          <div style={{ width: 48, height: 48, borderRadius: 13, margin: '0 auto 12px', background: 'var(--accent-soft)', color: 'var(--accent-strong)', display: 'grid', placeItems: 'center' }}><Icon name="sparkle" style={{ width: 24, height: 24 }} /></div>
          <h3 style={{ fontSize: 17 }}>No one in onboarding right now</h3>
          <p style={{ color: 'var(--ink-2)', fontSize: 14, marginTop: 6 }}>{canPrehire ? 'Submit a new hire to start the process.' : 'New hires will appear here once submitted.'}</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {list.map(h => {
            const pct = obPct(h.stage); const done = h.stage >= OB_STAGES.length - 1;
            return (
              <div key={h.id} className="card" style={{ padding: 'var(--pad)', display: 'flex', alignItems: 'center', gap: 16, cursor: h._auto ? 'pointer' : 'default' }} onClick={() => h._auto && onOpenAuto && onOpenAuto(h.id)}>
                <PhotoAvatar emp={{ id: h.id, name: h.name }} size={42} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 600, fontSize: 15 }}>{h.name}</span>
                    {h.provider && <Icon name="star" style={{ width: 13, height: 13, color: 'var(--accent)' }} />}
                    <span className="badge badge-todo" style={{ fontSize: 10.5 }}>{h.type}</span>
                  </div>
                  <div style={{ fontSize: 12.5, color: 'var(--ink-3)' }}>{h.jobTitle} · {h.loc} · starts {h.start}</div>
                </div>
                <div style={{ flex: 'none', width: 'min(280px, 38vw)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}><span style={{ fontSize: 11.5, fontWeight: 600, color: done ? 'var(--ok)' : 'var(--accent-strong)' }}>{done ? 'Ready for day one' : OB_STAGES[h.stage]}</span><span className="mono" style={{ fontSize: 11, color: 'var(--ink-3)' }}>{pct}%</span></div>
                  <div style={{ height: 7, borderRadius: 99, background: 'var(--surface-2)', overflow: 'hidden' }}><div style={{ height: '100%', width: pct + '%', background: done ? 'var(--ok)' : 'var(--accent)', borderRadius: 99, transition: 'width .5s' }} /></div>
                </div>
                <span className={`badge ${done ? 'badge-ok' : 'badge-prog'}`} style={{ flex: 'none' }}>{done ? <><Icon name="check" /> Ready</> : 'In progress'}</span>
              </div>
            );
          })}
        </div>
      )}
      <p style={{ fontSize: 12.5, color: 'var(--ink-3)', marginTop: 14, display: 'flex', gap: 7, alignItems: 'center' }}>
        <Icon name="bolt" style={{ width: 14, height: 14 }} /> Submitting a new hire sends their details to HR, who add them to Paychex and the onboarding agent takes it from there.
      </p>
    </div>
  );
}

/* ---------- Prehire submission (manager → HR) ---------- */
const _pf = { width: '100%', padding: '10px 12px', borderRadius: 'var(--r-md)', fontSize: 14, fontFamily: 'var(--font-body)', border: '1.5px solid var(--line)', background: 'var(--surface)', color: 'var(--ink)', outline: 'none' };
function PF({ label, req, children, hint }) {
  return <label style={{ display: 'block' }}><div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--ink-3)', marginBottom: 6 }}>{label}{req && <span style={{ color: 'var(--accent)' }}> *</span>}</div>{children}{hint && <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 5 }}>{hint}</div>}</label>;
}

function Prehire({ me, access, offices, onSubmit, onBack }) {
  const [f, setF] = useState({ name: '', jobTitle: '', type: 'FT', payType: 'Hourly', wage: '', office: me.loc || (offices[0] || ''), phone: '', email: '', startDate: '' });
  const set = (k, v) => setF(s => ({ ...s, [k]: v }));
  const [sent, setSent] = useState(false);
  const ready = f.name.trim() && f.jobTitle.trim() && f.email.trim() && f.phone.trim() && f.startDate;
  const canSeeWage = access.caps.payroll || access.flags.isExec; // leadership/HR/accounting/admin

  if (sent) {
    return (
      <div className="fade-in" style={{ maxWidth: 560, margin: '8px auto' }}>
        <div className="card" style={{ padding: 'clamp(26px,5vw,40px)', textAlign: 'center' }}>
          <div style={{ width: 64, height: 64, margin: '0 auto', borderRadius: '50%', background: 'var(--ok-soft)', color: 'var(--ok)', display: 'grid', placeItems: 'center' }}><Icon name="check" style={{ width: 34, height: 34 }} /></div>
          <h2 style={{ fontSize: 23, marginTop: 14 }}>Sent to HR</h2>
          <p style={{ color: 'var(--ink-2)', fontSize: 14.5, marginTop: 8, lineHeight: 1.5 }}><b>{f.name}</b>’s details were submitted to HR & Payroll. They’ll add {f.name.split(' ')[0]} to Paychex and the onboarding agent will begin reaching out.</p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 22 }}>
            <button className="btn btn-ghost" onClick={() => { setSent(false); setF({ name: '', jobTitle: '', type: 'FT', payType: 'Hourly', wage: '', office: me.loc || offices[0], phone: '', email: '', startDate: '' }); }}>Submit another</button>
            <button className="btn btn-primary" onClick={onBack}><Icon name="arrowRight" /> View onboarding status</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fade-in">
      <button className="btn btn-quiet" onClick={onBack} style={{ marginBottom: 14, marginLeft: -10 }}><Icon name="arrowLeft" /> Back</button>
      <div style={{ marginBottom: 18 }}>
        <h1 style={{ fontSize: 'clamp(22px,3vw,28px)' }}>Submit a new hire</h1>
        <p style={{ color: 'var(--ink-2)', fontSize: 14.5, marginTop: 6 }}>Send a new hire’s details to HR to kick off Paychex setup and onboarding.</p>
      </div>
      <div style={{ maxWidth: 680 }}>
        <div className="card" style={{ padding: 'var(--pad)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <PF label="Full name" req><input value={f.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Jordan Avery" style={_pf} /></PF>
            <PF label="Position" req><input value={f.jobTitle} onChange={e => set('jobTitle', e.target.value)} placeholder="e.g. Dental Hygienist" style={_pf} /></PF>
            <PF label="Employment type" req><select value={f.type} onChange={e => set('type', e.target.value)} style={{ ..._pf, appearance: 'auto' }}><option value="FT">Full-time</option><option value="PT">Part-time</option></select></PF>
            <PF label="Home office" req><select value={f.office} onChange={e => set('office', e.target.value)} style={{ ..._pf, appearance: 'auto' }}>{offices.map(o => <option key={o}>{o}</option>)}</select></PF>
            <PF label="Phone" req><input value={f.phone} onChange={e => set('phone', e.target.value)} placeholder="(631) 555-0123" style={_pf} /></PF>
            <PF label="Personal email" req hint="The agent reaches out here first"><input value={f.email} onChange={e => set('email', e.target.value)} placeholder="name@email.com" style={_pf} /></PF>
            <PF label="Start date" req><input type="date" value={f.startDate} onChange={e => set('startDate', e.target.value)} style={_pf} /></PF>
            <div></div>
          </div>

          {/* Compensation — entered here, but only visible to leadership/HR elsewhere */}
          <div style={{ marginTop: 16, padding: 'var(--pad)', borderRadius: 'var(--r-md)', background: 'var(--surface-2)', border: '1px solid var(--line)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <Icon name="lock" style={{ width: 15, height: 15, color: 'var(--accent)' }} />
              <span style={{ fontSize: 12.5, fontWeight: 700 }}>Compensation</span>
              <span className="badge badge-todo" style={{ fontSize: 10.5 }}>Visible to Leadership & HR only</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 14 }}>
              <PF label="Pay type"><select value={f.payType} onChange={e => set('payType', e.target.value)} style={{ ..._pf, appearance: 'auto' }}><option>Hourly</option><option>Salary</option></select></PF>
              <PF label={f.payType === 'Salary' ? 'Annual salary' : 'Hourly rate'}>
                <input value={f.wage} onChange={e => set('wage', e.target.value)} placeholder={f.payType === 'Salary' ? '$95,000' : '$38.00 / hr'} style={_pf} />
              </PF>
            </div>
            {!canSeeWage && <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 8, display: 'flex', gap: 6, alignItems: 'center' }}><Icon name="shield" style={{ width: 13, height: 13 }} /> You’re entering this for HR — it won’t be shown back to you or other managers.</div>}
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18 }}>
          <button className="btn btn-ghost" onClick={onBack}>Cancel</button>
          <button className="btn btn-primary btn-lg" disabled={!ready} onClick={() => { onSubmit && onSubmit(f); setSent(true); }}><Icon name="mail" /> Send to HR</button>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { OnboardingStatus, Prehire });
