/* timeclock.jsx — Deputy-style time clock. Employees clock in/out by location
   (aligned to Paychex company settings), with live timer, breaks, timesheets,
   manager/HR approval, and export to Paychex. Persists to localStorage. */

function loadPunches() { try { return JSON.parse(localStorage.getItem('pd_punches')) || {}; } catch (e) { return {}; } }
function persistPunches(p) { try { localStorage.setItem('pd_punches', JSON.stringify(p)); } catch (e) {} }
function loadActive() { try { return JSON.parse(localStorage.getItem('pd_active_punch')) || {}; } catch (e) { return {}; } }
function persistActive(a) { try { localStorage.setItem('pd_active_punch', JSON.stringify(a)); } catch (e) {} }

const PP_LABEL = 'Jun 22 – Jul 5, 2026';
function fmtClock(ms) { const d = new Date(ms); let h = d.getHours(), m = d.getMinutes(); const ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12; return `${h}:${String(m).padStart(2, '0')} ${ap}`; }
function fmtDur(ms) { const t = Math.max(0, Math.floor(ms / 1000)); const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60; return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`; }
function hoursOf(p) { const gross = (p.out - p.in) / 3600000; return Math.max(0, gross - (p.breakMins || 0) / 60); }
function dayLabel(iso) { return new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }); }

/* seed a couple of prior shifts for the demo timesheet */
function seedFor(empId, loc) {
  const mk = (daysAgo, inH, outH, br) => { const d = new Date(); d.setDate(d.getDate() - daysAgo); d.setHours(inH, 0, 0, 0); const o = new Date(d); o.setHours(outH, 0, 0, 0); return { id: 'p' + empId + daysAgo, date: d.toISOString(), location: loc, in: d.getTime(), out: o.getTime(), breakMins: br, status: 'approved' }; };
  return [mk(3, 8, 16, 30), mk(2, 8, 17, 45), mk(1, 9, 15, 30)];
}
/* Prefer the Paychex-style generator (with late detection) when available. */
function genShifts(id, loc) { return (typeof paychexSeed === 'function') ? paychexSeed(id, loc) : seedFor(id, loc); }

function StatusPill({ s }) {
  const map = { pending: ['badge-warn', 'clock', 'Pending'], approved: ['badge-ok', 'check', 'Approved'], exported: ['badge-prog', 'link', 'Exported'] };
  const [cls, ic, label] = map[s] || map.pending;
  return <span className={`badge ${cls}`}><Icon name={ic} /> {label}</span>;
}

/* ---------- Clock tab ---------- */
function ClockPanel({ me, offices, punches, setPunches, active, setActive, flash }) {
  const myActive = active[me.id];
  const sched = useMemo(() => { const s = new Date(); s.setHours(8, 0, 0, 0); const e = new Date(); e.setHours(16, 0, 0, 0); return { start: s.getTime(), end: e.getTime(), location: (me.loc && offices.includes(me.loc)) ? me.loc : offices[0], label: '8:00 AM – 4:00 PM' }; }, [me, offices]);
  const [loc, setLoc] = useState(myActive ? myActive.location : sched.location);
  const [now, setNow] = useState(Date.now());
  useEffect(() => { if (!myActive) return; const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, [myActive]);
  const offSchedLoc = loc !== sched.location;

  const clockIn = () => { const v = Math.round((Date.now() - sched.start) / 60000); const a = { ...active, [me.id]: { in: Date.now(), location: loc, onBreak: false, breakAccum: 0, breakStart: 0, schedVar: v, schedLoc: sched.location } }; setActive(a); persistActive(a); flash(`Clocked in at ${loc}`); };
  const toggleBreak = () => {
    const cur = active[me.id]; if (!cur) return; let next;
    if (cur.onBreak) { const add = Date.now() - cur.breakStart; next = { ...cur, onBreak: false, breakAccum: (cur.breakAccum || 0) + add, breakStart: 0 }; }
    else next = { ...cur, onBreak: true, breakStart: Date.now() };
    const a = { ...active, [me.id]: next }; setActive(a); persistActive(a);
  };
  const clockOut = () => {
    const cur = active[me.id]; if (!cur) return;
    const breakMs = (cur.breakAccum || 0) + (cur.onBreak ? Date.now() - cur.breakStart : 0);
    const entry = { id: 'p' + Date.now(), date: new Date(cur.in).toISOString(), location: cur.location, in: cur.in, out: Date.now(), breakMins: Math.round(breakMs / 60000), status: 'pending', schedVar: cur.schedVar, offLoc: cur.location !== cur.schedLoc };
    const list = [...(punches[me.id] || []), entry];
    const np = { ...punches, [me.id]: list }; setPunches(np); persistPunches(np);
    const a = { ...active }; delete a[me.id]; setActive(a); persistActive(a);
    flash('Clocked out — timesheet entry created.');
  };

  const elapsed = myActive ? now - myActive.in : 0;
  const breakNow = myActive ? (myActive.breakAccum || 0) + (myActive.onBreak ? now - myActive.breakStart : 0) : 0;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 'var(--gap)', alignItems: 'start' }}>
      <div className="card" style={{ padding: 'clamp(22px,4vw,34px)', textAlign: 'center' }}>
        <div className="mono" style={{ fontSize: 13, color: 'var(--ink-3)', marginBottom: 4 }}>{new Date(now).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</div>
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 'clamp(36px,7vw,52px)', letterSpacing: '-0.02em', lineHeight: 1 }}>{fmtClock(now)}</div>

        {!myActive ? (
          <>
            <div style={{ margin: '18px 0 4px', display: 'inline-flex', alignItems: 'center', gap: 8, padding: '7px 14px', borderRadius: 'var(--r-pill)', background: 'var(--accent-softer)', color: 'var(--accent-strong)', fontWeight: 600, fontSize: 12.5 }}>
              <Icon name="calendar" style={{ width: 14, height: 14 }} /> Scheduled today · {sched.label} · {sched.location}
            </div>
            <div style={{ margin: '8px 0 12px', textAlign: 'left' }}>
              <div style={{ fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--ink-3)', marginBottom: 6 }}>Location</div>
              <select value={loc} onChange={e => setLoc(e.target.value)} style={{ width: '100%', padding: '12px 14px', borderRadius: 'var(--r-md)', border: '1.5px solid var(--line)', fontSize: 15, fontWeight: 600, background: 'var(--surface)', color: 'var(--ink)', appearance: 'auto' }}>
                {offices.map(o => <option key={o}>{o}</option>)}
              </select>
              {offSchedLoc && <div style={{ fontSize: 11.5, color: 'oklch(0.55 0.13 60)', marginTop: 6, display: 'flex', alignItems: 'center', gap: 5 }}><Icon name="bell" style={{ width: 13, height: 13 }} /> Off your scheduled location ({sched.location})</div>}
            </div>
            <button className="btn btn-primary btn-lg" style={{ width: '100%', justifyContent: 'center', padding: 16, fontSize: 16 }} onClick={clockIn}><Icon name="clock" /> Clock in</button>
          </>
        ) : (
          <>
            <div style={{ margin: '20px 0 8px', display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 14px', borderRadius: 'var(--r-pill)', background: 'var(--ok-soft)', color: 'oklch(0.42 0.12 155)', fontWeight: 600, fontSize: 13 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--ok)' }} /> On the clock · {myActive.location}
            </div>
            {(() => { const v = myActive.schedVar || 0; const tone = Math.abs(v) <= 5 ? ['var(--ok-soft)', 'oklch(0.42 0.12 155)', 'On schedule'] : v > 0 ? ['var(--warn-soft)', 'oklch(0.5 0.13 60)', `${v}m late`] : ['var(--accent-softer)', 'var(--accent-strong)', `${-v}m early`]; return <div style={{ display: 'inline-flex', marginLeft: 8, alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 'var(--r-pill)', background: tone[0], color: tone[1], fontWeight: 600, fontSize: 12.5 }}><Icon name="calendar" style={{ width: 13, height: 13 }} /> {tone[2]} vs schedule</div>; })()}
            <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: 'clamp(30px,6vw,44px)', margin: '6px 0' }}>{fmtDur(elapsed - breakNow)}</div>
            {myActive.onBreak && <div className="badge badge-warn" style={{ marginBottom: 10 }}><Icon name="clock" /> On break · {fmtDur(breakNow)}</div>}
            <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
              <button className="btn btn-ghost" style={{ flex: 1, justifyContent: 'center' }} onClick={toggleBreak}><Icon name="clock" /> {myActive.onBreak ? 'End break' : 'Start break'}</button>
              <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }} onClick={clockOut}><Icon name="check" /> Clock out</button>
            </div>
          </>
        )}
        <div style={{ marginTop: 16, fontSize: 11.5, color: 'var(--ink-3)', display: 'flex', gap: 7, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="pin" style={{ width: 13, height: 13, color: 'var(--accent)' }} /> Location verified · pay rules from Paychex
        </div>
      </div>

      <div className="card" style={{ padding: 'var(--pad)' }}>
        <h3 style={{ fontSize: 15, marginBottom: 4 }}>Today</h3>
        <p style={{ fontSize: 12.5, color: 'var(--ink-3)', marginBottom: 14 }}>Your punches for {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}.</p>
        {(() => {
          const today = new Date().toDateString();
          const todays = (punches[me.id] || []).filter(p => new Date(p.in).toDateString() === today);
          if (!todays.length && !myActive) return <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--ink-3)', fontSize: 13.5 }}>No punches yet today.</div>;
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {todays.map(p => (
                <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 'var(--r-md)', background: 'var(--surface-2)' }}>
                  <Icon name="clock" style={{ width: 16, height: 16, color: 'var(--accent)', flex: 'none' }} />
                  <div style={{ flex: 1 }}><div style={{ fontWeight: 600, fontSize: 13.5 }}>{fmtClock(p.in)} – {fmtClock(p.out)}</div><div style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>{p.location} · {p.breakMins}m break</div></div>
                  <span className="mono" style={{ fontWeight: 600, fontSize: 13 }}>{hoursOf(p).toFixed(2)}h</span>
                </div>
              ))}
              {myActive && <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 'var(--r-md)', background: 'var(--accent-softer)' }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--ok)', flex: 'none' }} />
                <div style={{ flex: 1 }}><div style={{ fontWeight: 600, fontSize: 13.5 }}>{fmtClock(myActive.in)} – now</div><div style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>{myActive.location} · in progress</div></div>
              </div>}
            </div>
          );
        })()}
      </div>
    </div>
  );
}

/* ---------- Timesheet table (one employee) ---------- */
function TimesheetTable({ punches, onApprove, canApprove }) {
  const total = punches.reduce((a, p) => a + hoursOf(p), 0);
  const ot = Math.max(0, total - 80);
  const late = (typeof tardiness === 'function') ? tardiness(punches) : { count: 0, totalMin: 0 };
  const isLate = (p) => (typeof isLatePunch === 'function') && isLatePunch(p);
  const lateMin = (p) => (typeof punchLateMin === 'function') ? punchLateMin(p) : 0;
  return (
    <div>
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <div style={{ minWidth: 560 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr 0.8fr 0.7fr 0.9fr', padding: '10px 16px', background: 'var(--surface-2)', borderBottom: '1px solid var(--line)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--ink-3)' }}>
              <div>Day</div><div>In / Out</div><div>Break</div><div>Hours</div><div>Status</div>
            </div>
            {punches.length === 0 && <div style={{ padding: 32, textAlign: 'center', color: 'var(--ink-3)' }}>No entries this pay period.</div>}
            {punches.slice().sort((a, b) => a.in - b.in).map((p, i) => (
              <div key={p.id} style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr 0.8fr 0.7fr 0.9fr', padding: '11px 16px', borderTop: i ? '1px solid var(--line-soft)' : 'none', alignItems: 'center', fontSize: 13.5 }}>
                <div style={{ fontWeight: 600 }}>{dayLabel(p.in)}{isLate(p) && <span className="badge badge-warn" style={{ marginTop: 5, display: 'inline-flex' }}><Icon name="clock" /> {lateMin(p)}m late</span>}</div>
                <div className="mono" style={{ fontSize: 12.5 }}>{fmtClock(p.in)}–{fmtClock(p.out)}</div>
                <div className="mono" style={{ fontSize: 12.5, color: 'var(--ink-3)' }}>{p.breakMins}m</div>
                <div className="mono" style={{ fontWeight: 600 }}>{hoursOf(p).toFixed(2)}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <StatusPill s={p.status} />
                  {canApprove && p.status === 'pending' && <button className="btn btn-quiet" style={{ padding: '3px 8px', fontSize: 12 }} onClick={() => onApprove(p.id)}>Approve</button>}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 24, marginTop: 14, flexWrap: 'wrap' }}>
        <div><div style={{ fontSize: 11, color: 'var(--ink-3)', fontWeight: 700, textTransform: 'uppercase' }}>Total hours</div><div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 24 }}>{total.toFixed(2)}</div></div>
        <div><div style={{ fontSize: 11, color: 'var(--ink-3)', fontWeight: 700, textTransform: 'uppercase' }}>Regular</div><div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 24 }}>{Math.min(total, 80).toFixed(2)}</div></div>
        <div><div style={{ fontSize: 11, color: 'var(--ink-3)', fontWeight: 700, textTransform: 'uppercase' }}>Overtime</div><div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 24, color: ot > 0 ? 'oklch(0.5 0.13 60)' : 'var(--ink)' }}>{ot.toFixed(2)}</div></div>
        <div><div style={{ fontSize: 11, color: 'var(--ink-3)', fontWeight: 700, textTransform: 'uppercase' }}>Late arrivals</div><div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 24, color: late.count > 0 ? 'oklch(0.5 0.13 60)' : 'var(--ink)' }}>{late.count}{late.count > 0 && <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-3)', marginLeft: 6 }}>· {late.totalMin}m</span>}</div></div>
      </div>
    </div>
  );
}

/* ---------- main ---------- */
function TimeClock({ me, access, offices, teamList, flash, paychexOn }) {
  const [punches, setPunches] = useState(loadPunches);
  const [active, setActive] = useState(loadActive);
  const isLeader = access.caps.viewAll || access.caps.viewTeam;
  const TABS = ['Clock', 'My timesheet', ...(isLeader ? ['Team timesheets'] : [])];
  const [tab, setTab] = useState('Clock');

  // ensure my own timesheet has seed data once
  useEffect(() => {
    if (!loadPunches()[me.id]) { const np = { ...loadPunches(), [me.id]: genShifts(me.id, me.loc) }; persistPunches(np); setPunches(np); }
  }, []);

  const approve = (empId, pid) => { const np = { ...punches, [empId]: (punches[empId] || []).map(p => p.id === pid ? { ...p, status: 'approved' } : p) }; setPunches(np); persistPunches(np); };
  const exportPaychex = (empId) => { const np = { ...punches, [empId]: (punches[empId] || []).map(p => ({ ...p, status: 'exported' })) }; setPunches(np); persistPunches(np); flash('Timesheet exported to Paychex.'); };

  const teamWithData = (teamList || []).map(e => { if (!punches[e.id]) return { ...e, _p: genShifts(e.id, e.loc) }; return { ...e, _p: punches[e.id] }; });

  return (
    <div className="fade-in">
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: 'clamp(22px,3vw,28px)' }}>Time clock</h1>
          <p style={{ color: 'var(--ink-2)', fontSize: 14.5, marginTop: 6 }}>Pay period {PP_LABEL} · {paychexOn ? 'synced with Paychex pay rules' : 'Paychex sync enables in a later phase'}</p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 4, marginBottom: 'var(--gap)', borderBottom: '1px solid var(--line)', flexWrap: 'wrap' }}>
        {TABS.map(tb => (
          <button key={tb} onClick={() => setTab(tb)} style={{ border: 'none', background: 'none', padding: '10px 16px', fontSize: 14, fontWeight: 600, cursor: 'pointer', color: tab === tb ? 'var(--accent-strong)' : 'var(--ink-3)', borderBottom: `2px solid ${tab === tb ? 'var(--accent)' : 'transparent'}`, marginBottom: -1 }}>{tb}</button>
        ))}
      </div>

      {tab === 'Clock' && <ClockPanel me={me} offices={offices} punches={punches} setPunches={setPunches} active={active} setActive={setActive} flash={flash} />}

      {tab === 'My timesheet' && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
            <span style={{ fontSize: 13.5, color: 'var(--ink-2)' }}>Your hours this pay period.</span>
          </div>
          <TimesheetTable punches={punches[me.id] || []} canApprove={false} />
        </div>
      )}

      {tab === 'Team timesheets' && (
        <TeamTimesheets team={teamWithData} onApprove={approve} onExport={exportPaychex} paychexOn={paychexOn} authorLabel={`${me.name} · ${access.label}`} flash={flash} />
      )}
    </div>
  );
}

function TeamTimesheets({ team, onApprove, onExport, paychexOn, authorLabel, flash }) {
  const [open, setOpen] = useState(null);
  const [coached, setCoached] = useState({});
  const threshold = (typeof COACHING_LATE_THRESHOLD === 'number') ? COACHING_LATE_THRESHOLD : 3;
  const logCoaching = (emp, late) => {
    if (typeof addRelationEvent !== 'function') return;
    addRelationEvent(emp.id, {
      id: 'e' + Date.now(), type: 'coaching', date: new Date().toISOString().slice(0, 10),
      title: 'Coaching — repeated late arrivals',
      notes: `Time clock flagged ${late.count} late clock-ins (${late.totalMin} min total) this pay period. Discussed punctuality expectations and a plan to arrive before the first patient.`,
      author: authorLabel || 'Manager', ack: 'awaiting',
    });
    setCoached(c => ({ ...c, [emp.id]: true }));
    flash && flash(`Coaching note logged to ${emp.name}'s record`);
  };
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        {paychexOn
          ? <button className="btn btn-primary" onClick={() => team.forEach(e => onExport(e.id))}><Icon name="link" /> Export all to Paychex</button>
          : <span className="badge badge-todo" style={{ padding: '8px 14px' }}><Icon name="lock" /> Paychex export enables in a later phase</span>}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {team.map(e => {
          const total = e._p.reduce((a, p) => a + hoursOf(p), 0);
          const pending = e._p.filter(p => p.status === 'pending').length;
          const late = (typeof tardiness === 'function') ? tardiness(e._p) : { count: 0, totalMin: 0 };
          const isOpen = open === e.id;
          return (
            <div key={e.id} className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <button onClick={() => setOpen(isOpen ? null : e.id)} style={{ width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 14, padding: '12px var(--pad)', border: 'none', background: 'var(--surface)', cursor: 'pointer' }}>
                <PhotoAvatar emp={e} size={38} />
                <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontWeight: 600, fontSize: 14.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.name}</div><div style={{ fontSize: 12.5, color: 'var(--ink-3)' }}>{e.jobTitle} · {e.loc}</div></div>
                <span className="mono" style={{ fontWeight: 600, fontSize: 14, flex: 'none' }}>{total.toFixed(1)}h</span>
                {late.count > 0 && <span className={`badge ${late.count >= threshold ? 'badge-warn' : 'badge-todo'}`} style={{ flex: 'none' }}><Icon name="clock" /> {late.count} late{late.count >= threshold ? ` · ${late.totalMin}m` : ''}</span>}
                {pending > 0 ? <span className="badge badge-warn" style={{ flex: 'none' }}><Icon name="clock" /> {pending} pending</span> : <span className="badge badge-ok" style={{ flex: 'none' }}><Icon name="check" /> Clear</span>}
                <Icon name="chevron" style={{ width: 16, height: 16, color: 'var(--ink-3)', flex: 'none', transform: isOpen ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }} />
              </button>
              {isOpen && <div className="fade-in" style={{ padding: 'var(--pad)', borderTop: '1px solid var(--line)', background: 'var(--surface-2)' }}>
                {late.count >= threshold && (
                  <div className="card" style={{ padding: '12px 14px', marginBottom: 'var(--gap)', borderColor: 'oklch(0.8 0.1 60)', background: 'var(--warn-soft)', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                    <Icon name="bell" style={{ width: 18, height: 18, color: 'oklch(0.5 0.13 60)', flex: 'none' }} />
                    <div style={{ flex: 1, minWidth: 180 }}>
                      <div style={{ fontWeight: 700, fontSize: 13.5 }}>{late.count} late arrivals this pay period · {late.totalMin} min total</div>
                      <div style={{ fontSize: 12.5, color: 'var(--ink-2)', marginTop: 2 }}>Pattern crosses the coaching threshold. Consider a documented conversation.</div>
                    </div>
                    {coached[e.id]
                      ? <span className="badge badge-ok" style={{ flex: 'none' }}><Icon name="check" /> Coaching note logged</span>
                      : <button className="btn btn-primary" style={{ flex: 'none' }} onClick={() => logCoaching(e, late)}><Icon name="book" /> Log coaching note</button>}
                  </div>
                )}
                <TimesheetTable punches={e._p} canApprove onApprove={(pid) => onApprove(e.id, pid)} />
                {paychexOn && <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}><button className="btn btn-ghost" onClick={() => onExport(e.id)}><Icon name="link" /> Export to Paychex</button></div>}
              </div>}
            </div>
          );
        })}
        {team.length === 0 && <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--ink-3)' }}>No team members.</div>}
      </div>
    </div>
  );
}

Object.assign(window, { TimeClock });
