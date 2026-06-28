/* automation.jsx — Add New Hire + the automated onboarding AGENT.
   After a hire is added, the agent reaches out, gathers info, verifies
   credentials, and provisions role-based accounts — shown as a live pipeline. */

function roleKeyFor({ provider, providerType, department, jobTitle }) {
  if (provider) return /dent|dds|dmd|doctor/i.test((providerType || '') + (jobTitle || '')) ? 'dentist' : 'hygienist';
  if (/insur|billing/i.test((department || '') + (jobTitle || ''))) return 'insurance';
  return 'frontdesk';
}
function genWorkEmail(name) {
  const p = name.trim().toLowerCase().split(/\s+/);
  if (p.length < 2) return (p[0] || 'newhire') + '@puredental.com';
  return `${p[0]}.${p[p.length - 1]}@puredental.com`.replace(/[^a-z.@]/g, '');
}

/* ---------- Add New Hire ---------- */
const fld = { width: '100%', padding: '10px 12px', borderRadius: 'var(--r-md)', fontSize: 14, fontFamily: 'var(--font-body)', border: '1.5px solid var(--line)', background: 'var(--surface)', color: 'var(--ink)', outline: 'none' };
function F({ label, req, children, hint }) {
  return <label style={{ display: 'block' }}><div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--ink-3)', marginBottom: 6 }}>{label}{req && <span style={{ color: 'var(--accent)' }}> *</span>}</div>{children}{hint && <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 5 }}>{hint}</div>}</label>;
}

function AddHire({ offices, onCreate, onBack, apiMode = true }) {
  const [f, setF] = useState({ name: '', personalEmail: '', mobile: '', jobTitle: '', department: 'Front Desk', office: offices[0] || 'Manorville', startDate: '2026-07-06', provider: false, providerType: 'Hygienist', manager: '' });
  const set = (k, v) => setF(s => ({ ...s, [k]: v }));
  const ready = f.name.trim() && f.personalEmail.trim() && f.mobile.trim() && f.jobTitle.trim();
  const rk = roleKeyFor(f);

  return (
    <StepShell icon="plus" eyebrow="People · Onboarding" title="Add a new hire" onBack={onBack}
      subtitle="Enter the essentials and the onboarding agent takes it from there — reaching out, collecting details, verifying credentials, and creating accounts."
      aside={<button className="btn btn-ghost" disabled title="Available once Paychex API is connected"><Icon name="link" /> Import from Paychex</button>}>
      <div style={{ maxWidth: 720 }}>
        <div className="card" style={{ padding: 'var(--pad)', marginBottom: 'var(--gap)' }}>
          <h3 style={{ fontSize: 15.5, marginBottom: 16 }}>Who are we onboarding?</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <F label="Full name" req><input value={f.name} onChange={e => set('name', e.target.value)} placeholder="First and last name" style={fld} /></F>
            <F label="Job title" req><input value={f.jobTitle} onChange={e => set('jobTitle', e.target.value)} placeholder="e.g. Dental Hygienist" style={fld} /></F>
            <F label="Personal email" req hint="The agent reaches out here first"><input value={f.personalEmail} onChange={e => set('personalEmail', e.target.value)} placeholder="jordan@gmail.com" style={fld} /></F>
            <F label="Mobile" req hint="For the welcome text + reminders"><input value={f.mobile} onChange={e => set('mobile', e.target.value)} placeholder="(631) 555-0199" style={fld} /></F>
            <F label="Department"><select value={f.department} onChange={e => set('department', e.target.value)} style={{ ...fld, appearance: 'auto' }}>{['Front Desk', 'Clinical Team', 'Insurance', 'Operations', 'Management'].map(d => <option key={d}>{d}</option>)}</select></F>
            <F label="Office"><select value={f.office} onChange={e => set('office', e.target.value)} style={{ ...fld, appearance: 'auto' }}>{offices.map(o => <option key={o}>{o}</option>)}</select></F>
            <F label="Start date"><input type="date" value={f.startDate} onChange={e => set('startDate', e.target.value)} style={fld} /></F>
            <F label="Reports to"><input value={f.manager} onChange={e => set('manager', e.target.value)} placeholder="Manager name" style={fld} /></F>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 16, cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>
            <input type="checkbox" checked={f.provider} onChange={e => set('provider', e.target.checked)} style={{ width: 17, height: 17, accentColor: 'var(--accent)' }} /> This is a clinical provider (needs NPI / license{f.provider ? ' / DEA' : ''})
          </label>
          {f.provider && (
            <div style={{ marginTop: 12, maxWidth: 280 }}>
              <F label="Provider type"><select value={f.providerType} onChange={e => set('providerType', e.target.value)} style={{ ...fld, appearance: 'auto' }}>{['Hygienist', 'Dentist', 'Specialist'].map(d => <option key={d}>{d}</option>)}</select></F>
            </div>
          )}
        </div>

        {/* what the agent will do */}
        <div className="card" style={{ padding: 'var(--pad)', marginBottom: 'var(--gap)', background: 'var(--accent-softer)', borderStyle: 'dashed' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 10 }}><Icon name="sparkle" style={{ width: 17, height: 17, color: 'var(--accent-strong)' }} /><span style={{ fontWeight: 700, fontSize: 14 }}>The onboarding agent will…</span></div>
          <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.7 }}>
            <li>Email + text <b>{f.name || 'the new hire'}</b> a secure onboarding link</li>
            <li>Collect details, paperwork{f.provider ? ', and credentials (NPI / license' + (rk === 'dentist' ? ' / DEA' : '') + ')' : ''}</li>
            {f.provider && <li>{apiMode ? 'Verify credentials against the registries automatically' : 'Collect credentials for IT/HR to verify'}</li>}
            <li>{apiMode ? 'Provision accounts' : 'Queue accounts for IT/HR to create'} for a <b>{ROLE_ACCOUNT_RULES[rk].label}</b>: Google Workspace, Denticon{rk === 'frontdesk' || rk === 'insurance' ? ', NexHealth' : ''}{rk === 'dentist' ? ', DoseSpot' : ''}</li>
          </ul>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button className="btn btn-ghost" onClick={onBack}>Cancel</button>
          <button className="btn btn-primary btn-lg" disabled={!ready} onClick={() => onCreate({ ...f, rk })}><Icon name="sparkle" /> Add & start onboarding</button>
        </div>
      </div>
    </StepShell>
  );
}

/* ---------- pipeline definition ---------- */
function buildSteps(a, apiMode = true) {
  const rules = ROLE_ACCOUNT_RULES[a.rk];
  const steps = [
    { key: 'outreach', icon: 'mail', label: 'Reached out to new hire', detail: `Emailed ${a.personalEmail} and texted ${a.mobile} a secure onboarding link.` },
    { key: 'intake', icon: 'doc', label: 'Collected details & paperwork', detail: 'New hire submitted personal info, emergency contact, resume, and signed W-4, I-9 & direct deposit.' },
  ];
  if (a.provider) steps.push({ key: 'credentials', icon: 'star', label: apiMode ? 'Verified credentials' : 'Collected credentials for verification', detail: apiMode ? `Checked NPI and ${a.office} state license${a.rk === 'dentist' ? ' and DEA registration' : ''} against the registries — all active.` : `Recorded NPI and ${a.office} state license${a.rk === 'dentist' ? ' and DEA' : ''} — flagged for IT/HR to verify against the registries.` });
  steps.push({ key: 'google', icon: 'mail', label: (apiMode ? 'Created ' : 'Queued for IT/HR — ') + 'Google Workspace', detail: `${a.workEmail} · OU ${rules.google.ou} · groups ${rules.google.groups.join(', ')} · ${rules.google.license}.` });
  steps.push({ key: 'denticon', icon: 'tooth', label: (apiMode ? 'Created ' : 'Queued for IT/HR — ') + 'Denticon account', detail: `Security template “${rules.denticon.template}”${rules.denticon.provider ? ' + provider profile linked to NPI' : ''} · modules: ${rules.denticon.modules.join(', ')}.` });
  if (rules.nexhealth) steps.push({ key: 'nexhealth', icon: 'calendar', label: (apiMode ? 'Created ' : 'Queued for IT/HR — ') + 'NexHealth account', detail: `Role “${rules.nexhealth.role}” · ${rules.nexhealth.features.join(', ')}.` });
  if (rules.dosespot) steps.push({ key: 'dosespot', icon: 'shield', label: (apiMode ? 'Created ' : 'Queued for IT/HR — ') + 'DoseSpot (EPCS)', detail: `${rules.dosespot.account} · schedules ${rules.dosespot.schedules} · SSO via Google.` });
  steps.push({ key: 'call', icon: 'phone', label: 'Welcome call — answered questions & booked working interview', detail: `“Riley” called ${a.mobile}: answered first-day, parking & pay questions, routed ${a.provider ? 'clinical/coverage' : 'payroll'} items to the right person, and booked the working interview.` });
  steps.push({ key: 'notify', icon: 'bell', label: apiMode ? 'Delivered credentials & notified team' : 'Recorded credentials & notified team', detail: apiMode ? `Credentials vault shared with ${a.name}; recap posted to the onboarding team in Google Chat. Employee record created.` : `Credentials recorded by IT/HR and shared with ${a.name}; recap posted to the onboarding team in Google Chat. Employee record created.` });
  return steps;
}

function AgentAvatar({ size = 34 }) {
  return <div style={{ width: size, height: size, borderRadius: '50%', flex: 'none', display: 'grid', placeItems: 'center', background: 'linear-gradient(150deg, var(--accent), var(--accent-strong))', color: '#fff' }}><Icon name="sparkle" style={{ width: size * 0.5, height: size * 0.5 }} /></div>;
}

/* ---------- Automation detail (the live agent run) ---------- */
function AutomationDetail({ auto, onBack, onAdvance, apiMode = true }) {
  const steps = useMemo(() => buildSteps(auto, apiMode), [auto, apiMode]);
  const stage = auto.stage || 0;
  const done = stage >= steps.length;

  useEffect(() => {
    if (stage < steps.length) { const t = setTimeout(() => onAdvance(auto.id), 1500); return () => clearTimeout(t); }
  }, [stage, steps.length, auto.id]);

  const pct = Math.round(Math.min(stage, steps.length) / steps.length * 100);
  const [tab, setTab] = useState('Pipeline');
  const callIdx = steps.findIndex(s => s.key === 'call');
  const callReached = stage > callIdx;
  const TABS = ['Pipeline', 'Conversations', 'Team chat'];

  return (
    <div className="fade-in">
      <button className="btn btn-quiet" onClick={onBack} style={{ marginBottom: 14, marginLeft: -10 }}><Icon name="arrowLeft" /> All automations</button>

      <div className="card" style={{ padding: 'clamp(18px,3vw,26px)', marginBottom: 'var(--gap)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <PhotoAvatar emp={{ id: auto.id, name: auto.name }} size={56} />
          <div style={{ flex: 1, minWidth: 180 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, rowGap: 6, flexWrap: 'wrap' }}>
              <h1 style={{ fontSize: 'clamp(20px,2.6vw,26px)', whiteSpace: 'nowrap' }}>{auto.name}</h1>
              {done ? <span className="badge badge-ok"><Icon name="check" /> Onboarded</span> : <span className="badge badge-prog"><span className="spin" style={{ width: 11, height: 11, border: '2px solid currentColor', borderTopColor: 'transparent', borderRadius: '50%', display: 'block' }} /> Agent working</span>}
            </div>
            <p style={{ color: 'var(--ink-2)', fontSize: 14, marginTop: 4 }}>{auto.jobTitle} · {auto.office} · starts {auto.startDate}</p>
          </div>
          <ProgressRing value={pct} size={62} stroke={6}><span style={{ fontSize: 14 }}>{pct}%</span></ProgressRing>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 4, marginBottom: 'var(--gap)', borderBottom: '1px solid var(--line)', flexWrap: 'wrap' }}>
        {TABS.map(tb => (
          <button key={tb} onClick={() => setTab(tb)} style={{ border: 'none', background: 'none', padding: '10px 16px', fontSize: 14, fontWeight: 600, cursor: 'pointer',
            color: tab === tb ? 'var(--accent-strong)' : 'var(--ink-3)', borderBottom: `2px solid ${tab === tb ? 'var(--accent)' : 'transparent'}`, marginBottom: -1, display: 'inline-flex', alignItems: 'center', gap: 7 }}>
            {tb === 'Conversations' && <Icon name="phone" style={{ width: 15, height: 15 }} />}{tb === 'Team chat' && <Icon name="users" style={{ width: 15, height: 15 }} />}{tb}
          </button>
        ))}
      </div>

      {tab === 'Conversations' && (callReached
        ? <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--gap)' }}>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <span className="badge badge-ok"><Icon name="mail" /> Email sent</span>
              <span className="badge badge-ok"><Icon name="phone" /> SMS delivered</span>
              <span className="badge badge-ok"><Icon name="phone" /> Call completed</span>
            </div>
            <CallTranscript auto={auto} />
          </div>
        : <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--ink-3)' }}><Icon name="phone" style={{ width: 26, height: 26, margin: '0 auto 10px', display: 'block' }} />The welcome call runs once the agent reaches that step. Email + SMS go out first.</div>)}

      {tab === 'Team chat' && <GoogleChatFeed auto={auto} />}

      {tab === 'Pipeline' && (
      <div className="card" style={{ padding: 'var(--pad)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18, paddingBottom: 14, borderBottom: '1px solid var(--line-soft)' }}>
          <AgentAvatar size={36} />
          <div style={{ minWidth: 0 }}><div style={{ fontWeight: 700, fontSize: 14.5, whiteSpace: 'nowrap' }}>Onboarding Agent</div><div style={{ fontSize: 12.5, color: 'var(--ink-3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Automating {auto.name.split(' ')[0]}’s setup</div></div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {steps.map((s, i) => {
            const st = i < stage ? 'done' : i === stage ? 'active' : 'wait';
            return (
              <div key={s.key} style={{ display: 'flex', gap: 13, opacity: st === 'wait' ? 0.5 : 1, transition: 'opacity .3s' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 'none' }}>
                  <div style={{ width: 32, height: 32, borderRadius: '50%', display: 'grid', placeItems: 'center', flex: 'none',
                    background: st === 'done' ? 'var(--ok)' : st === 'active' ? 'var(--accent)' : 'var(--surface-2)', color: st === 'wait' ? 'var(--ink-3)' : '#fff', border: st === 'wait' ? '1px solid var(--line)' : 'none' }}>
                    {st === 'done' ? <Icon name="check" style={{ width: 16, height: 16 }} /> : st === 'active' ? <span className="spin" style={{ width: 14, height: 14, border: '2px solid #fff', borderTopColor: 'transparent', borderRadius: '50%', display: 'block' }} /> : <Icon name={s.icon} style={{ width: 15, height: 15 }} />}
                  </div>
                  {i < steps.length - 1 && <div style={{ flex: 1, width: 2, background: i < stage ? 'var(--ok)' : 'var(--line)', minHeight: 18, marginTop: 2 }} />}
                </div>
                <div style={{ paddingBottom: 20, flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 14.5, color: st === 'wait' ? 'var(--ink-3)' : 'var(--ink)' }}>{s.label}</div>
                  {st !== 'wait' && <p style={{ fontSize: 13, color: 'var(--ink-2)', marginTop: 3, lineHeight: 1.5 }}>{s.detail}</p>}
                  {st === 'active' && <span className="mono" style={{ fontSize: 11, color: 'var(--accent-strong)' }}>working…</span>}
                </div>
              </div>
            );
          })}
        </div>
        {done && (
          <div className="fade-in" style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 6, padding: '14px 16px', borderRadius: 'var(--r-md)', background: 'var(--ok-soft)' }}>
            <Icon name="check" style={{ width: 20, height: 20, color: 'var(--ok)', flex: 'none' }} />
            <div style={{ flex: 1, fontSize: 13.5, color: 'oklch(0.4 0.12 155)' }}><b>{auto.name}</b> is fully onboarded — accounts created, credentials delivered, and added to the directory.</div>
          </div>
        )}
      </div>
      )}
    </div>
  );
}

/* ---------- Automations list ---------- */
function Automations({ automations, onOpen, onAdd, onConsole }) {
  return (
    <div className="fade-in">
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 18 }}>
        <div>
          <h1 style={{ fontSize: 'clamp(22px,3vw,28px)' }}>Onboarding automations</h1>
          <p style={{ color: 'var(--ink-2)', fontSize: 14.5, marginTop: 6 }}>The agent handles outreach, data collection, credential checks, and account creation for every new hire.</p>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button className="btn btn-ghost" onClick={onConsole}><Icon name="sparkle" /> Agent console</button>
          <button className="btn btn-primary btn-lg" onClick={onAdd}><Icon name="plus" /> Add new hire</button>
        </div>
      </div>

      {automations.length === 0 ? (
        <div className="card" style={{ padding: 'clamp(28px,5vw,48px)', textAlign: 'center' }}>
          <AgentAvatar size={52} />
          <h3 style={{ fontSize: 18, marginTop: 14 }}>No active automations</h3>
          <p style={{ color: 'var(--ink-2)', fontSize: 14, marginTop: 6, maxWidth: 420, marginInline: 'auto', lineHeight: 1.5 }}>Add a new hire and the onboarding agent will reach out and get them set up automatically.</p>
          <button className="btn btn-primary" style={{ marginTop: 18 }} onClick={onAdd}><Icon name="plus" /> Add your first new hire</button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {automations.map(a => {
            const steps = buildSteps(a); const done = (a.stage || 0) >= steps.length; const pct = Math.round(Math.min(a.stage || 0, steps.length) / steps.length * 100);
            return (
              <button key={a.id} className="card" onClick={() => onOpen(a.id)} style={{ textAlign: 'left', padding: 'var(--pad)', display: 'flex', alignItems: 'center', gap: 16, cursor: 'pointer', border: '1px solid var(--line)' }}
                onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--accent)'} onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--line)'}>
                <PhotoAvatar emp={{ id: a.id, name: a.name }} size={44} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ fontWeight: 600, fontSize: 15 }}>{a.name}</span>{a.provider && <Icon name="star" style={{ width: 13, height: 13, color: 'var(--accent)' }} />}</div>
                  <div style={{ fontSize: 12.5, color: 'var(--ink-3)' }}>{a.jobTitle} · {a.office}</div>
                </div>
                <div style={{ flex: 'none', width: 160 }}>
                  <div style={{ height: 6, borderRadius: 99, background: 'var(--surface-2)', overflow: 'hidden' }}><div style={{ height: '100%', width: pct + '%', background: done ? 'var(--ok)' : 'var(--accent)', borderRadius: 99, transition: 'width .5s' }} /></div>
                  <div className="mono" style={{ fontSize: 10.5, color: 'var(--ink-3)', marginTop: 4 }}>{done ? 'Complete' : `${pct}% · agent working`}</div>
                </div>
                {done ? <span className="badge badge-ok"><Icon name="check" /> Done</span> : <span className="badge badge-prog">Active</span>}
                <Icon name="chevron" style={{ width: 16, height: 16, color: 'var(--ink-3)', flex: 'none' }} />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

Object.assign(window, { AddHire, Automations, AutomationDetail, roleKeyFor, genWorkEmail });
