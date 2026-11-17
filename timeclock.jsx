/* timeclock.jsx — the time clock: clock in at an office, breaks, clock out, your own
   timesheet by week, and your team's timesheets to approve. Everything is kept on the
   server (/api/timeclock); every time comes from the server's clock. */

function fmtClock(ms) { const d = new Date(ms); let h = d.getHours(), m = d.getMinutes(); const ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12; return `${h}:${String(m).padStart(2, '0')} ${ap}`; }
function fmtDur(ms) { const t = Math.max(0, Math.floor(ms / 1000)); const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60; return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`; }
const hoursOf = (p) => PD_HOURS.hoursOf(p);
function dayLabel(iso) { return new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }); }

function StatusPill({ s }) {
  const map = { pending: ['badge-warn', 'clock', 'Pending'], approved: ['badge-ok', 'check', 'Approved'] };
  const [cls, ic, label] = map[s] || map.pending;
  return <span className={`badge ${cls}`}><Icon name={ic} /> {label}</span>;
}

/* ---------- Clock tab ---------- */
function ClockPanel({ me, offices, mine, act, busy }) {
  const myActive = mine.open;
  const shift = mine.todayShift;
  const [loc, setLoc] = useState(() => (shift && offices.includes(shift.office)) ? shift.office : (offices.includes(me.loc) ? me.loc : offices[0]));
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const offSchedLoc = !!shift && loc !== shift.office;
  const clockIn = () => act({ action: 'in', location: loc }, `Clocked in at ${loc}`);
  const toggleBreak = () => act({ action: 'break' });
  const clockOut = () => act({ action: 'out' }, 'Clocked out.');
  const breakMsOf = (o) => (o.breakMs || 0) + (o.onBreak ? now - o.breakStart : 0);

  const elapsed = myActive ? now - myActive.in : 0;
  const breakNow = myActive ? breakMsOf(myActive) : 0;
  const lateBy = myActive && myActive.schedStartMin != null ? (() => { const d = new Date(myActive.in); return d.getHours() * 60 + d.getMinutes() - myActive.schedStartMin; })() : null;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 'var(--gap)', alignItems: 'start' }}>
      <div className="card" style={{ padding: 'clamp(22px,4vw,34px)', textAlign: 'center' }}>
        <div className="mono" style={{ fontSize: 13, color: 'var(--ink-3)', marginBottom: 4 }}>{new Date(now).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</div>
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 'clamp(36px,7vw,52px)', letterSpacing: '-0.02em', lineHeight: 1 }}>{fmtClock(now)}</div>

        {!myActive ? (
          <>
            {shift && <div style={{ margin: '18px 0 4px', display: 'inline-flex', alignItems: 'center', gap: 8, padding: '7px 14px', borderRadius: 'var(--r-pill)', background: 'var(--accent-softer)', color: 'var(--accent-strong)', fontWeight: 600, fontSize: 12.5 }}>
              <Icon name="calendar" style={{ width: 14, height: 14 }} /> Scheduled today · {shiftRange(shift)} · {shift.office}
            </div>}
            <div style={{ margin: '8px 0 12px', textAlign: 'left' }}>
              <div style={{ fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--ink-3)', marginBottom: 6 }}>Location</div>
              <select value={loc} onChange={e => setLoc(e.target.value)} style={{ width: '100%', padding: '12px 14px', borderRadius: 'var(--r-md)', border: '1.5px solid var(--line)', fontSize: 15, fontWeight: 600, background: 'var(--surface)', color: 'var(--ink)', appearance: 'auto' }}>
                {offices.map(o => <option key={o}>{o}</option>)}
              </select>
              {offSchedLoc && <div style={{ fontSize: 11.5, color: 'oklch(0.55 0.13 60)', marginTop: 6, display: 'flex', alignItems: 'center', gap: 5 }}><Icon name="bell" style={{ width: 13, height: 13 }} /> Off your scheduled location ({shift.office})</div>}
            </div>
            <button className="btn btn-primary btn-lg" style={{ width: '100%', justifyContent: 'center', padding: 16, fontSize: 16 }} disabled={busy} onClick={clockIn}><Icon name="clock" /> Clock in</button>
          </>
        ) : (
          <>
            <div style={{ margin: '20px 0 8px', display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 14px', borderRadius: 'var(--r-pill)', background: 'var(--ok-soft)', color: 'oklch(0.42 0.12 155)', fontWeight: 600, fontSize: 13 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--ok)' }} /> On the clock · {myActive.location}
            </div>
            {lateBy != null && (() => { const v = lateBy; const tone = Math.abs(v) <= 5 ? ['var(--ok-soft)', 'oklch(0.42 0.12 155)', 'On schedule'] : v > 0 ? ['var(--warn-soft)', 'oklch(0.5 0.13 60)', `${v}m late`] : ['var(--accent-softer)', 'var(--accent-strong)', `${-v}m early`]; return <div style={{ display: 'inline-flex', marginLeft: 8, alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 'var(--r-pill)', background: tone[0], color: tone[1], fontWeight: 600, fontSize: 12.5 }}><Icon name="calendar" style={{ width: 13, height: 13 }} /> {tone[2]} vs schedule</div>; })()}
            <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: 'clamp(30px,6vw,44px)', margin: '6px 0' }}>{fmtDur(elapsed - breakNow)}</div>
            {myActive.onBreak && <div className="badge badge-warn" style={{ marginBottom: 10 }}><Icon name="clock" /> On break · {fmtDur(breakNow)}</div>}
            <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
              <button className="btn btn-ghost" style={{ flex: 1, justifyContent: 'center' }} disabled={busy} onClick={toggleBreak}><Icon name="clock" /> {myActive.onBreak ? 'End break' : 'Start break'}</button>
              <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }} disabled={busy} onClick={clockOut}><Icon name="check" /> Clock out</button>
            </div>
          </>
        )}
      </div>

      <div className="card" style={{ padding: 'var(--pad)' }}>
        <h3 style={{ fontSize: 15, marginBottom: 4 }}>Today</h3>
        <p style={{ fontSize: 12.5, color: 'var(--ink-3)', marginBottom: 14 }}>Your punches for {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}.</p>
        {(() => {
          const today = new Date().toDateString();
          const todays = mine.punches.filter(p => new Date(p.in).toDateString() === today);
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
function TimesheetTable({ punches, onApprove, canApprove, threshold = 40, weekStart = 1 }) {
  const thisWeek = PD_HOURS.weekKeyFor(Date.now(), weekStart);
  const weeks = PD_HOURS.weeklyTotals(punches, { threshold, weekStart });
  const cur = weeks.find(w => w.weekKey === thisWeek) || { hours: 0, regular: 0, overtime: 0 };
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
            {punches.length === 0 && <div style={{ padding: 32, textAlign: 'center', color: 'var(--ink-3)' }}>No punches in the last six weeks.</div>}
            {punches.slice().sort((a, b) => b.in - a.in).map((p, i) => (
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
        {[['This week', cur.hours], ['Regular', cur.regular], ['Overtime', cur.overtime]].map(([k, v]) => (
          <div key={k}><div style={{ fontSize: 11, color: 'var(--ink-3)', fontWeight: 700, textTransform: 'uppercase' }}>{k}</div><div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 24, color: k === 'Overtime' && v > 0 ? 'oklch(0.5 0.13 60)' : 'var(--ink)' }}>{v.toFixed(2)}</div></div>
        ))}
        <div><div style={{ fontSize: 11, color: 'var(--ink-3)', fontWeight: 700, textTransform: 'uppercase' }}>Late arrivals</div><div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 24, color: late.count > 0 ? 'oklch(0.5 0.13 60)' : 'var(--ink)' }}>{late.count}{late.count > 0 && <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-3)', marginLeft: 6 }}>· {late.totalMin}m</span>}</div></div>
      </div>
      {weeks.filter(w => w.weekKey !== thisWeek).length > 0 && (
        <div style={{ marginTop: 12, fontSize: 12.5, color: 'var(--ink-2)', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          {weeks.filter(w => w.weekKey !== thisWeek).map(w => <span key={w.weekKey}>Week of {dayLabel(w.weekKey + 'T12:00:00')}: <b className="mono">{w.hours.toFixed(2)}h</b>{w.overtime > 0 ? <> · <b className="mono" style={{ color: 'oklch(0.5 0.13 60)' }}>{w.overtime.toFixed(2)}h overtime</b></> : null}</span>)}
        </div>
      )}
    </div>
  );
}

/* ---------- main ---------- */
function TimeClock({ me, access, offices, teamList, flash }) {
  const isLeader = access.caps.viewAll || access.caps.viewTeam;
  const TABS = ['Clock', 'My timesheet', ...(isLeader ? ['Team timesheets'] : [])];
  const [tab, setTab] = useState('Clock');
  const [mine, setMine] = useState(null);
  const [team, setTeam] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const load = () => pdApi('/api/timeclock').then(d => { setMine(d); setErr(''); }).catch(e => setErr('Couldn’t load your punches: ' + e.message));
  const loadTeam = () => isLeader && pdApi('/api/timeclock', { query: { team: 1 } }).then(d => setTeam(d.punches || [])).catch(e => setErr('Couldn’t load your team’s punches: ' + e.message));
  useEffect(() => { load(); loadTeam(); }, []);
  /* one action on the server, then the page shows what the server holds */
  const act = (body, okText) => {
    setBusy(true); setErr('');
    return pdApi('/api/timeclock', { method: 'POST', body })
      .then(() => { if (okText) flash(okText); return Promise.all([load(), body.action === 'approve' ? loadTeam() : null]); })
      .catch(e => setErr(e.message))
      .finally(() => setBusy(false));
  };
  const approve = (empId, id) => act({ action: 'approve', empId, id });
  const teamWithData = (teamList || []).map(e => ({ ...e, _p: team.filter(p => p.empId === e.id && p.status !== 'open') }));

  return (
    <div className="fade-in">
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: 'clamp(22px,3vw,28px)' }}>Time clock</h1>
      </div>

      <div style={{ display: 'flex', gap: 4, marginBottom: 'var(--gap)', borderBottom: '1px solid var(--line)', flexWrap: 'wrap' }}>
        {TABS.map(tb => (
          <button key={tb} onClick={() => setTab(tb)} style={{ border: 'none', background: 'none', padding: '10px 16px', fontSize: 14, fontWeight: 600, cursor: 'pointer', color: tab === tb ? 'var(--accent-strong)' : 'var(--ink-3)', borderBottom: `2px solid ${tab === tb ? 'var(--accent)' : 'transparent'}`, marginBottom: -1 }}>{tb}</button>
        ))}
      </div>

      {err && <div style={{ fontSize: 13, color: 'var(--danger)', marginBottom: 12 }}>{err}</div>}
      {!mine ? (!err && <div style={{ padding: 32, textAlign: 'center', color: 'var(--ink-3)' }}>Loading…</div>) : <>
        {tab === 'Clock' && <ClockPanel me={me} offices={offices} mine={mine} act={act} busy={busy} />}
        {tab === 'My timesheet' && <TimesheetTable punches={mine.punches} canApprove={false} threshold={mine.overtimeThreshold} weekStart={mine.weekStart} />}
        {tab === 'Team timesheets' && <TeamTimesheets team={teamWithData} onApprove={approve} weekStart={mine.weekStart} authorLabel={`${me.name} · ${access.label}`} flash={flash} />}
      </>}
    </div>
  );
}

function TeamTimesheets({ team, onApprove, weekStart, authorLabel, flash }) {
  const [open, setOpen] = useState(null);
  const [coached, setCoached] = useState({});
  const threshold = (typeof COACHING_LATE_THRESHOLD === 'number') ? COACHING_LATE_THRESHOLD : 3;
  const logCoaching = (emp, late) => {
    if (typeof addRelationEvent !== 'function') return;
    addRelationEvent(emp.id, {
      id: 'e' + Date.now(), type: 'coaching', date: new Date().toISOString().slice(0, 10),
      title: 'Coaching — repeated late arrivals',
      notes: `The time clock shows ${late.count} late clock-ins in the last six weeks, ${late.totalMin} minutes in all.`,
      author: authorLabel || 'Manager', ack: 'awaiting',
    });
    setCoached(c => ({ ...c, [emp.id]: true }));
    flash && flash(`Coaching note logged to ${emp.name}'s record`);
  };
  return (
    <div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {team.map(e => {
          const total = (PD_HOURS.weeklyTotals(e._p, { weekStart }).find(w => w.weekKey === PD_HOURS.weekKeyFor(Date.now(), weekStart)) || { hours: 0 }).hours;
          const pending = e._p.filter(p => p.status === 'pending').length;
          const late = (typeof tardiness === 'function') ? tardiness(e._p) : { count: 0, totalMin: 0 };
          const isOpen = open === e.id;
          return (
            <div key={e.id} className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <button onClick={() => setOpen(isOpen ? null : e.id)} style={{ width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 14, padding: '12px var(--pad)', border: 'none', background: 'var(--surface)', cursor: 'pointer' }}>
                <PhotoAvatar emp={e} size={38} />
                <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontWeight: 600, fontSize: 14.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.name}</div><div style={{ fontSize: 12.5, color: 'var(--ink-3)' }}>{e.jobTitle} · {e.loc}</div></div>
                <span className="mono" style={{ fontWeight: 600, fontSize: 14, flex: 'none' }}>{total.toFixed(1)}h this week</span>
                {late.count > 0 && <span className={`badge ${late.count >= threshold ? 'badge-warn' : 'badge-todo'}`} style={{ flex: 'none' }}><Icon name="clock" /> {late.count} late{late.count >= threshold ? ` · ${late.totalMin}m` : ''}</span>}
                {pending > 0 ? <span className="badge badge-warn" style={{ flex: 'none' }}><Icon name="clock" /> {pending} pending</span> : <span className="badge badge-ok" style={{ flex: 'none' }}><Icon name="check" /> Clear</span>}
                <Icon name="chevron" style={{ width: 16, height: 16, color: 'var(--ink-3)', flex: 'none', transform: isOpen ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }} />
              </button>
              {isOpen && <div className="fade-in" style={{ padding: 'var(--pad)', borderTop: '1px solid var(--line)', background: 'var(--surface-2)' }}>
                {late.count >= threshold && (
                  <div className="card" style={{ padding: '12px 14px', marginBottom: 'var(--gap)', borderColor: 'oklch(0.8 0.1 60)', background: 'var(--warn-soft)', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                    <Icon name="bell" style={{ width: 18, height: 18, color: 'oklch(0.5 0.13 60)', flex: 'none' }} />
                    <div style={{ flex: 1, minWidth: 180 }}>
                      <div style={{ fontWeight: 700, fontSize: 13.5 }}>{late.count} late arrivals in six weeks · {late.totalMin} min total</div>
                    </div>
                    {coached[e.id]
                      ? <span className="badge badge-ok" style={{ flex: 'none' }}><Icon name="check" /> Coaching note logged</span>
                      : <button className="btn btn-primary" style={{ flex: 'none' }} onClick={() => logCoaching(e, late)}><Icon name="book" /> Log coaching note</button>}
                  </div>
                )}
                <TimesheetTable punches={e._p} canApprove onApprove={(pid) => onApprove(e.id, pid)} weekStart={weekStart} />
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
