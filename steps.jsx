/* steps.jsx — guided step screens (everything except paperwork + scheduler) */

/* ---------- Welcome ---------- */
function WelcomeStep({ onBack, onComplete }) {
  return (
    <StepShell icon="sparkle" eyebrow="Get started" title={`Welcome to Pure Dental, ${NEW_HIRE.name.split(' ')[0]}`}
      subtitle="We’re genuinely glad you’re here. Here’s what your first day looks like and the people who’ll help you settle in."
      onBack={onBack}>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.4fr) minmax(0,1fr)', gap: 20, alignItems: 'start' }}>
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {/* image placeholder */}
          <div style={{ aspectRatio: '16/9', background: 'repeating-linear-gradient(135deg, var(--surface-2), var(--surface-2) 12px, var(--accent-softer) 12px, var(--accent-softer) 24px)', display: 'grid', placeItems: 'center', borderBottom: '1px solid var(--line)' }}>
            <div className="mono" style={{ fontSize: 12, color: 'var(--ink-3)', background: 'var(--surface)', padding: '6px 12px', borderRadius: 99, border: '1px solid var(--line)' }}>welcome video / team photo</div>
          </div>
          <div style={{ padding: 'var(--pad)' }}>
            <h3 style={{ fontSize: 18 }}>A note from Dr. Cho</h3>
            <p style={{ color: 'var(--ink-2)', fontSize: 14.5, lineHeight: 1.6, marginTop: 10 }}>
              “The Riverside team has been looking forward to having a hygienist with your patient-first approach. Don’t worry about knowing everything on day one — lean on your pod, ask questions, and we’ll get you up to speed. Can’t wait to work with you.”
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 16 }}>
              <Avatar name="Elena Cho" size={40} />
              <div><div style={{ fontWeight: 600, fontSize: 14 }}>Dr. Elena Cho</div><div style={{ fontSize: 12.5, color: 'var(--ink-3)' }}>Lead Dentist · Your manager</div></div>
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[['pin', 'Where to go', '4820 Riverside Ave — park in the staff lot behind the building.'],
            ['clock', 'When to arrive', 'Monday 8:45 AM. Breakfast is on us at 9:00.'],
            ['tooth', 'What to wear', 'Scrubs in any solid color. We’ll order your Pure Dental set.'],
            ['phone', 'Who to ask for', 'Marcus Webb (Office Manager) — he’s your day-one buddy.']].map(([ic, t, d]) => (
            <div key={t} className="card" style={{ padding: '16px var(--pad)', display: 'flex', gap: 14, alignItems: 'flex-start' }}>
              <div style={{ width: 36, height: 36, borderRadius: 'var(--r-md)', flex: 'none', display: 'grid', placeItems: 'center', background: 'var(--accent-soft)', color: 'var(--accent-strong)' }}><Icon name={ic} style={{ width: 19, height: 19 }} /></div>
              <div><div style={{ fontWeight: 600, fontSize: 14.5 }}>{t}</div><p style={{ color: 'var(--ink-2)', fontSize: 13, marginTop: 3, lineHeight: 1.45 }}>{d}</p></div>
            </div>
          ))}
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 22 }}>
        <button className="btn btn-primary btn-lg" onClick={onComplete}><Icon name="check" /> Got it — what’s next</button>
      </div>
    </StepShell>
  );
}

/* ---------- Policies ---------- */
function PoliciesStep({ onBack, onComplete }) {
  const [items, setItems] = useState(() => POLICIES.map(p => ({ ...p })));
  const [openId, setOpenId] = useState(null);
  const open = items.find(p => p.id === openId);
  const doneCount = items.filter(p => p.done).length;
  const ack = (id) => { setItems(it => it.map(p => p.id === id ? { ...p, done: true } : p)); setOpenId(null); };

  if (open) return (
    <StepShell icon="shield" eyebrow="Acknowledge" title={open.name} onBack={() => setOpenId(null)}
      subtitle={open.desc}>
      <div className="card" style={{ padding: 'clamp(20px,3vw,30px)', maxWidth: 760 }}>
        <div className="badge badge-prog" style={{ marginBottom: 16 }}><Icon name="clock" /> {open.mins} min read</div>
        {[100, 94, 97, 88, 99, 72, 100, 60].map((w, i) => <div key={i} style={{ height: 10, width: w + '%', background: 'var(--line-soft)', borderRadius: 4, marginBottom: 13 }} />)}
        <div style={{ marginTop: 26, padding: 'var(--pad)', borderRadius: 'var(--r-md)', background: 'var(--accent-softer)', border: '1px solid var(--accent-soft)' }}>
          <label style={{ display: 'flex', gap: 12, alignItems: 'flex-start', cursor: 'pointer' }}>
            <input type="checkbox" id={'ck-'+open.id} style={{ marginTop: 3, width: 18, height: 18, accentColor: 'var(--accent)' }}
              onChange={e => { const b = document.getElementById('ackbtn'); if (b) b.disabled = !e.target.checked; }} />
            <span style={{ fontSize: 14, color: 'var(--ink)', lineHeight: 1.5 }}>I have read and understand the <b>{open.name}</b> policy and agree to comply with it.</span>
          </label>
          <button id="ackbtn" className="btn btn-primary" disabled style={{ marginTop: 16 }} onClick={() => ack(open.id)}>
            <Icon name="check" /> Acknowledge & continue
          </button>
        </div>
      </div>
    </StepShell>
  );

  return (
    <StepShell icon="shield" eyebrow="Compliance" title="Policies & compliance"
      subtitle="Required reading for every Pure Dental team member. Read each policy and confirm your acknowledgement — these are logged for compliance."
      onBack={onBack}
      aside={<div className="badge badge-prog" style={{ padding: '8px 14px' }}>{doneCount} of {items.length}</div>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {items.map(p => (
          <div key={p.id} className="card" style={{ padding: 'var(--pad)', display: 'flex', alignItems: 'center', gap: 16, borderColor: p.done ? 'var(--ok)' : 'var(--line)' }}>
            <div style={{ width: 44, height: 44, borderRadius: 'var(--r-md)', flex: 'none', display: 'grid', placeItems: 'center', background: p.done ? 'var(--ok-soft)' : 'var(--accent-soft)', color: p.done ? 'var(--ok)' : 'var(--accent-strong)' }}>
              <Icon name={p.done ? 'check' : 'shield'} style={{ width: 22, height: 22 }} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><span style={{ fontWeight: 600, fontSize: 15.5 }}>{p.name}</span><span className={`badge ${p.tag === 'Required' ? 'badge-warn' : 'badge-todo'}`}>{p.tag}</span></div>
              <p style={{ color: 'var(--ink-3)', fontSize: 13, marginTop: 3 }}>{p.desc}</p>
            </div>
            {p.done ? <span className="badge badge-ok"><Icon name="check" /> Acknowledged</span>
              : <button className="btn btn-ghost" onClick={() => setOpenId(p.id)}>Read & sign <Icon name="arrowRight" /></button>}
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 22 }}>
        <button className="btn btn-primary btn-lg" disabled={doneCount < items.length} onClick={onComplete}><Icon name="check" /> Finish compliance</button>
      </div>
    </StepShell>
  );
}

/* ---------- Training ---------- */
function TrainingStep({ onBack, onComplete }) {
  const [mods, setMods] = useState(() => TRAINING.map(m => ({ ...m })));
  const done = mods.filter(m => m.done).length;
  const pct = Math.round(done / mods.length * 100);
  const cats = [...new Set(mods.map(m => m.cat))];
  return (
    <StepShell icon="book" eyebrow="Learn · Employee Learning Platform" title="Learning modules"
      subtitle="Your role-specific learning path, delivered through the Pure Dental ELP. Complete these in your first two weeks — progress saves automatically."
      onBack={onBack}
      aside={<ProgressRing value={pct} size={58} stroke={6}><span style={{ fontSize: 14 }}>{pct}%</span></ProgressRing>}>
      {cats.map(cat => (
        <div key={cat} style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 12.5, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--ink-3)', fontWeight: 700, margin: '4px 2px 10px' }}>{cat}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {mods.filter(m => m.cat === cat).map(m => (
              <label key={m.id} className="card" style={{ padding: '14px var(--pad)', display: 'flex', alignItems: 'center', gap: 14, cursor: 'pointer' }}>
                <input type="checkbox" checked={m.done} onChange={() => setMods(x => x.map(y => y.id === m.id ? { ...y, done: !y.done } : y))} style={{ width: 19, height: 19, accentColor: 'var(--accent)', flex: 'none' }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 14.5, textDecoration: m.done ? 'line-through' : 'none', color: m.done ? 'var(--ink-3)' : 'var(--ink)' }}>{m.name}</div>
                </div>
                <span className="mono" style={{ fontSize: 12, color: 'var(--ink-3)' }}>{m.mins} min</span>
                {m.done ? <span className="badge badge-ok"><Icon name="check" /></span> : <span className="btn btn-ghost" style={{ padding: '6px 12px', fontSize: 12.5 }}>Start</span>}
              </label>
            ))}
          </div>
        </div>
      ))}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 14 }}>
        <span style={{ fontSize: 13.5, color: 'var(--ink-2)' }}>{done} of {mods.length} modules complete · {mods.reduce((s,m)=>s+(m.done?0:m.mins),0)} min remaining</span>
        <button className="btn btn-primary btn-lg" onClick={onComplete}><Icon name="check" /> Save progress</button>
      </div>
    </StepShell>
  );
}

/* ---------- Team ---------- */
const TEAM_TAG = { manager: ['Manager', 'badge-prog'], buddy: ['Day-one buddy', 'badge-warn'], hr: ['People Ops', 'badge-todo'], pod: ['Your pod', 'badge-ok'] };
function TeamStep({ onBack, onComplete }) {
  return (
    <StepShell icon="users" eyebrow="Connect" title="Meet your team"
      subtitle="The people you’ll work with every day at Riverside. Reach out and say hi before your first shift."
      onBack={onBack}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 'var(--gap)' }}>
        {TEAM.map(p => {
          const [label, cls] = TEAM_TAG[p.tag];
          return (
            <div key={p.email} className="card" style={{ padding: 'var(--pad)', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
                <Avatar name={p.name} size={46} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 15 }}>{p.name}</div>
                  <div style={{ fontSize: 12.5, color: 'var(--ink-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.role}</div>
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className={`badge ${cls}`}>{label}</span>
                <a href={`mailto:${p.email}`} className="btn btn-quiet" style={{ padding: '6px 12px', fontSize: 13, textDecoration: 'none' }}><Icon name="mail" style={{ width: 15, height: 15 }} /> Say hi</a>
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 22 }}>
        <button className="btn btn-primary btn-lg" onClick={onComplete}><Icon name="check" /> Met the team</button>
      </div>
    </StepShell>
  );
}

/* ---------- First-week agenda ---------- */
const KIND_COLOR = { social: 75, admin: 220, setup: 280, shadow: 195, training: 150, clinical: 340 };
function AgendaStep({ onBack, onComplete, onOpenScheduler }) {
  return (
    <StepShell icon="calendar" eyebrow="Connect" title="Schedule & first week"
      subtitle="Your shifts are set and your first week is mapped out hour by hour. Your manager built this in the scheduler."
      onBack={onBack}
      aside={<button className="btn btn-ghost" onClick={onOpenScheduler}><Icon name="grid" /> Open scheduler</button>}>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${FIRST_WEEK.length}, 1fr)`, gap: 12, overflowX: 'auto' }}>
        {FIRST_WEEK.map(day => (
          <div key={day.day} className="card" style={{ padding: 14, minWidth: 150 }}>
            <div style={{ textAlign: 'center', paddingBottom: 10, borderBottom: '1px solid var(--line-soft)', marginBottom: 12 }}>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 16 }}>{day.day}</div>
              <div className="mono" style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>{day.date}</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {day.items.map((it, i) => (
                <div key={i} style={{ padding: '8px 10px', borderRadius: 'var(--r-sm)', background: `oklch(0.96 0.04 ${KIND_COLOR[it.kind]})`, borderLeft: `3px solid oklch(0.6 0.12 ${KIND_COLOR[it.kind]})` }}>
                  <div className="mono" style={{ fontSize: 10.5, color: 'var(--ink-2)', fontWeight: 600 }}>{it.t}</div>
                  <div style={{ fontSize: 12.5, marginTop: 2, lineHeight: 1.3 }}>{it.label}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 22 }}>
        <button className="btn btn-primary btn-lg" onClick={onComplete}><Icon name="check" /> Looks good</button>
      </div>
    </StepShell>
  );
}

/* ---------- Benefits ---------- */
function BenefitsStep({ onBack, onComplete }) {
  const [picks, setPicks] = useState({});
  const allPicked = BENEFITS.every(b => picks[b.id] != null);
  return (
    <StepShell icon="heart" eyebrow="Decide" title="Benefits enrollment"
      subtitle="Choose your plans. You have 30 days from your start date to enroll — you can always revisit before the deadline."
      onBack={onBack}
      aside={<div className="badge badge-prog" style={{ padding: '8px 14px' }}>{Object.keys(picks).length} of {BENEFITS.length} chosen</div>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        {BENEFITS.map(b => (
          <div key={b.id}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '0 2px 10px' }}>
              <Icon name={b.icon} style={{ width: 18, height: 18, color: 'var(--accent)' }} />
              <h3 style={{ fontSize: 17 }}>{b.name}</h3>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${b.options.length}, 1fr)`, gap: 12 }}>
              {b.options.map((o, i) => {
                const sel = picks[b.id] === i;
                return (
                  <button key={i} className="card" onClick={() => setPicks(p => ({ ...p, [b.id]: i }))}
                    style={{ padding: 'var(--pad)', textAlign: 'left', cursor: 'pointer', borderColor: sel ? 'var(--accent)' : 'var(--line)',
                      borderWidth: 2, boxShadow: sel ? '0 0 0 4px var(--accent-ring)' : 'var(--shadow-sm)', transition: 'all .15s' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontWeight: 600, fontSize: 14.5 }}>{o.name}</span>
                      <span style={{ width: 20, height: 20, borderRadius: '50%', border: `2px solid ${sel ? 'var(--accent)' : 'var(--line)'}`, background: sel ? 'var(--accent)' : 'transparent', display: 'grid', placeItems: 'center', flex: 'none' }}>
                        {sel && <Icon name="check" style={{ width: 12, height: 12, color: '#fff' }} />}
                      </span>
                    </div>
                    <div className="mono" style={{ fontSize: 13, color: 'var(--accent-strong)', fontWeight: 600, marginTop: 8 }}>{o.cost}</div>
                    <p style={{ fontSize: 12.5, color: 'var(--ink-3)', marginTop: 5, lineHeight: 1.4 }}>{o.note}</p>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 24 }}>
        <button className="btn btn-primary btn-lg" disabled={!allPicked} onClick={onComplete}><Icon name="check" /> Confirm my elections</button>
      </div>
    </StepShell>
  );
}

Object.assign(window, { WelcomeStep, PoliciesStep, TrainingStep, TeamStep, AgendaStep, BenefitsStep });
