/* steps.jsx — guided step screens (everything except paperwork + scheduler) */

/* ---------- Welcome ---------- */
function WelcomeStep({ me, onBack, onComplete }) {
  const nh = newHireProfile(me);
  return (
    <StepShell icon="sparkle" eyebrow="Get started" title={`Welcome to Pure Dental, ${nh.first}`}
      subtitle="We’re genuinely glad you’re here. Here’s what to expect as you get started."
      onBack={onBack}>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.4fr) minmax(0,1fr)', gap: 20, alignItems: 'start' }}>
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {/* image placeholder */}
          <div style={{ aspectRatio: '16/9', background: 'repeating-linear-gradient(135deg, var(--surface-2), var(--surface-2) 12px, var(--accent-softer) 12px, var(--accent-softer) 24px)', display: 'grid', placeItems: 'center', borderBottom: '1px solid var(--line)' }}>
            <div className="mono" style={{ fontSize: 12, color: 'var(--ink-3)', background: 'var(--surface)', padding: '6px 12px', borderRadius: 99, border: '1px solid var(--line)' }}>welcome video / team photo</div>
          </div>
          <div style={{ padding: 'var(--pad)' }}>
            <h3 style={{ fontSize: 18 }}>You’re joining {nh.location || 'Pure Dental'}</h3>
            <p style={{ color: 'var(--ink-2)', fontSize: 14.5, lineHeight: 1.6, marginTop: 10 }}>
              We’re excited to have you on the team{nh.role ? ` as a ${nh.role}` : ''}. Over the next few steps you’ll complete your paperwork, set up your accounts, and get everything you need for a great first day.
            </p>
            {nh.manager ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 16 }}>
                <Avatar name={nh.manager} size={40} />
                <div><div style={{ fontWeight: 600, fontSize: 14 }}>{nh.manager}</div><div style={{ fontSize: 12.5, color: 'var(--ink-3)' }}>Your manager</div></div>
              </div>
            ) : null}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[['pin', 'Where to go', nh.location ? `Your home office: ${nh.location}. Your manager will share parking and entrance details.` : 'Your manager will confirm your office location and directions.'],
            ['clock', 'When to arrive', nh.startDate ? `Your start date is ${nh.startDate}. Your manager will confirm your first-day start time.` : 'Your manager will confirm your start date and first-day time.'],
            ['tooth', 'What to wear', 'Clinical team wears solid-color scrubs (we’ll order your Pure Dental set). Front office is business casual.'],
            ['phone', 'Who to ask for', nh.manager ? `${nh.manager} is your manager and day-one point of contact.` : 'Your manager will be your day-one point of contact.']].map(([ic, t, d]) => (
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
function TeamStep({ me, onBack, onComplete }) {
  const all = (typeof EMPLOYEES !== 'undefined' ? EMPLOYEES : []);
  const myLoc = (me && (me.loc || me.location)) || '';
  const meId = me && me.id;
  const mgrEmail = ((me && me.managerEmail) || '').toLowerCase();
  const manager = all.find(e => mgrEmail && (e.workEmail || '').toLowerCase() === mgrEmail);
  const mates = all.filter(e => e.status === 'Active' && e.id !== meId && (!manager || e.id !== manager.id) && (e.loc || e.location) === myLoc).slice(0, 9);
  const list = [];
  if (manager) list.push({ name: manager.name, role: manager.jobTitle, email: manager.workEmail, tag: 'manager' });
  mates.forEach(e => list.push({ name: e.name, role: e.jobTitle, email: e.workEmail, tag: 'pod' }));
  return (
    <StepShell icon="users" eyebrow="Connect" title="Meet your team"
      subtitle={myLoc ? `The people you’ll work with at ${myLoc}. Reach out and say hi.` : 'Your team at Pure Dental.'}
      onBack={onBack}>
      {list.length === 0 ? (
        <div className="card" style={{ padding: 'clamp(28px,5vw,48px)', textAlign: 'center', color: 'var(--ink-2)' }}>
          <Icon name="users" style={{ width: 30, height: 30, color: 'var(--ink-3)', margin: '0 auto 10px', display: 'block' }} />
          <p style={{ fontSize: 14 }}>Your team roster will appear here once your office and manager are assigned.</p>
        </div>
      ) : (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 'var(--gap)' }}>
        {list.map(p => {
          const [label, cls] = TEAM_TAG[p.tag];
          return (
            <div key={p.email || p.name} className="card" style={{ padding: 'var(--pad)', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
                <Avatar name={p.name} size={46} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 15 }}>{p.name}</div>
                  <div style={{ fontSize: 12.5, color: 'var(--ink-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.role}</div>
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className={`badge ${cls}`}>{label}</span>
                {p.email ? <a href={`mailto:${p.email}`} className="btn btn-quiet" style={{ padding: '6px 12px', fontSize: 13, textDecoration: 'none' }}><Icon name="mail" style={{ width: 15, height: 15 }} /> Say hi</a> : null}
              </div>
            </div>
          );
        })}
      </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 22 }}>
        <button className="btn btn-primary btn-lg" onClick={onComplete}><Icon name="check" /> Met the team</button>
      </div>
    </StepShell>
  );
}

/* ---------- First-week agenda ---------- */
function AgendaStep({ me, onBack, onComplete, onOpenScheduler }) {
  return (
    <StepShell icon="calendar" eyebrow="Connect" title="Schedule & first week"
      subtitle="Your shifts and first-week plan will appear here once your manager builds them in the scheduler."
      onBack={onBack}
      aside={<button className="btn btn-ghost" onClick={onOpenScheduler}><Icon name="grid" /> Open scheduler</button>}>
      <div className="card" style={{ padding: 'clamp(28px,5vw,48px)', textAlign: 'center', color: 'var(--ink-2)' }}>
        <Icon name="calendar" style={{ width: 30, height: 30, color: 'var(--ink-3)', margin: '0 auto 10px', display: 'block' }} />
        <p style={{ fontSize: 14, maxWidth: 440, margin: '0 auto', lineHeight: 1.5 }}>No first-week agenda yet. Once your manager publishes your schedule, your shifts and day-by-day plan will show up here.</p>
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
