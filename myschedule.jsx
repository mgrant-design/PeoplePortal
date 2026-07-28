/* myschedule.jsx — employee schedule (full rewrite per SCHEDULER.md).
   Any week (past/future), own shifts across offices. From here an employee can:
   offer a shift they can't work to the swap board (§2.6), claim a teammate's
   offered shift (conflict-checked at claim time, warn-not-block), and submit
   blackout dates that route HR → Manager (§2.5). The server scopes reads: with
   no edit/view grant this endpoint only returns own + open + offered shifts. */

function MySchedule({ me }) {
  const [weekKey, setWeekKey] = useState(() => thisWeekKey());
  const [docs, setDocs] = useState([]);
  const [requests, setRequests] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [boOpen, setBoOpen] = useState(false);
  const [confirmClaim, setConfirmClaim] = useState(null); // shift pending claim confirm
  const [toast, setToast] = useState(null);
  const flash = m => { setToast(m); setTimeout(() => setToast(null), 3200); };

  const days = useMemo(() => weekDaysFor(weekKey), [weekKey]);
  const load = () => {
    setLoaded(false);
    Promise.all([
      fetchSchedules({ weekKey }).catch(() => []),
      fetchSchedRequests().catch(() => []),
    ]).then(([scheds, reqs]) => {
      setDocs(scheds.filter(d => Array.isArray(d.shifts)));
      setRequests(reqs); setLoaded(true);
    });
  };
  useEffect(load, [weekKey, me.id]);

  const shifts = useMemo(() => docs.flatMap(d => (d.shifts || []).map(s => ({ ...s, _office: d.office, _published: !!d.published }))), [docs]);
  const mine = shifts.filter(s => s.empId === me.id);
  const board = shifts.filter(s => (s.offered || s.open) && s.empId !== me.id); // teammates' offered + manager-flagged open shifts
  const total = Math.round(mine.reduce((a, s) => a + shiftHrs(s), 0) * 10) / 10;
  const todayISO = isoDate(new Date());
  const next = [...mine].sort((a, b) => a.date.localeCompare(b.date)).find(s => s.date >= todayISO);
  const myBlackouts = requests.filter(r => r.type === 'blackout' && r.empId === me.id);
  const mySwaps = requests.filter(r => r.type === 'swap' && (r.toEmpId === me.id || r.fromEmpId === me.id));
  const pendingClaimIds = new Set(requests.filter(r => r.type === 'swap' && r.status === 'pending').map(r => r.shiftId));

  const offer = async (s) => {
    try { await schedAction({ action: 'offer', office: s._office, weekKey, shiftId: s.id }); flash('Shift offered — teammates can now claim it; your manager approves the hand-off.'); load(); }
    catch (e) { flash(e.message); }
  };
  const retract = async (s) => {
    try { await schedAction({ action: 'retract', office: s._office, weekKey, shiftId: s.id }); flash('Offer withdrawn — the shift is yours again.'); load(); }
    catch (e) { flash(e.message); }
  };
  const claim = async (s) => {
    setConfirmClaim(null);
    try { await schedAction({ action: 'claim', office: s._office, weekKey, shiftId: s.id }); flash('Claim sent to the manager — the schedule changes only when they approve.'); load(); }
    catch (e) { flash(e.message); }
  };
  /* conflict check at claim time (§2.6 step 3): warn, never block */
  const startClaim = (s) => {
    const c = shiftConflicts({ shifts: mine, blackouts: myBlackouts.filter(b => b.status === 'approved'), empId: me.id, date: s.date, start: s.start, end: s.end });
    if (c.shifts.length || c.blackout) setConfirmClaim({ shift: s, conflict: c });
    else claim(s);
  };

  const dayCard = (d) => {
    const list = mine.filter(s => s.date === d.date).sort((a, b) => timeMins(a.start) - timeMins(b.start));
    const isToday = d.date === todayISO;
    return (
      <div key={d.date} className="card" style={{ padding: 'var(--pad)', textAlign: 'center', opacity: list.length ? 1 : 0.72, borderColor: isToday ? 'var(--accent)' : undefined }}>
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 15 }}>{d.dname}</div>
        <div className="mono" style={{ fontSize: 11, color: 'var(--ink-3)', marginBottom: 10 }}>{d.month} {d.dnum}{isToday ? ' · today' : ''}</div>
        {list.length === 0 ? <div style={{ padding: '12px 0', color: 'var(--ink-3)', fontSize: 13, fontWeight: 600 }}>Off</div> :
          list.map(s => (
            <div key={s.id} style={{ borderRadius: 'var(--r-md)', padding: '10px 10px', marginBottom: 6, textAlign: 'left', background: s.offered ? 'oklch(0.95 0.06 320)' : 'var(--accent-softer)', borderLeft: `3px solid ${s.offered ? 'oklch(0.6 0.16 320)' : 'var(--accent)'}` }}>
              <div className="mono" style={{ fontWeight: 700, fontSize: 13 }}>{shiftRange(s)}</div>
              <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 2 }}>{shiftHrs(s)}h · {s._office}</div>
              {s._published && !s.offered && !s.open && <button onClick={() => offer(s)} className="btn btn-ghost" style={{ marginTop: 7, padding: '3px 9px', fontSize: 11, width: '100%', justifyContent: 'center' }}>Can’t work — offer it</button>}
              {s.open && <span style={{ display: 'block', marginTop: 6, fontSize: 10.5, fontWeight: 700, color: 'oklch(0.45 0.12 65)' }}>Marked open — yours until a claim is approved</span>}
              {s.offered && (
                <div style={{ marginTop: 6 }}>
                  <span style={{ fontSize: 10.5, fontWeight: 700, color: 'oklch(0.45 0.15 320)' }}>Offered for swap</span>
                  {!pendingClaimIds.has(s.id) && <button onClick={() => retract(s)} className="btn btn-quiet" style={{ marginTop: 4, padding: '3px 9px', fontSize: 11, width: '100%', justifyContent: 'center' }}>Withdraw offer</button>}
                  {pendingClaimIds.has(s.id) && <span style={{ display: 'block', fontSize: 10.5, color: 'var(--ink-3)', marginTop: 3 }}>claim awaiting manager</span>}
                </div>
              )}
            </div>
          ))}
      </div>
    );
  };

  return (
    <div className="fade-in">
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 18 }}>
        <div>
          <h1 style={{ fontSize: 'clamp(22px,3vw,28px)' }}>My schedule</h1>
          <p style={{ color: 'var(--ink-2)', fontSize: 14.5, marginTop: 6 }}>Week of {weekLabel(weekKey)}{mine.length ? <> · <b>{total}h</b> scheduled</> : ''}</p>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <button className="btn btn-quiet" onClick={() => setWeekKey(k => addWeeks(k, -1))} style={{ padding: '6px 9px' }}><Icon name="chevron" style={{ width: 14, height: 14, transform: 'rotate(180deg)' }} /></button>
          <button className="btn btn-quiet" onClick={() => setWeekKey(thisWeekKey())} style={{ fontWeight: 700, fontSize: 13 }}>{weekKey === thisWeekKey() ? 'This week' : weekLabel(weekKey)}</button>
          <button className="btn btn-quiet" onClick={() => setWeekKey(k => addWeeks(k, 1))} style={{ padding: '6px 9px' }}><Icon name="chevron" style={{ width: 14, height: 14 }} /></button>
          <button className="btn btn-ghost" onClick={() => setBoOpen(true)}><Icon name="calendar" /> Blackout dates</button>
        </div>
      </div>

      {loaded && next && (
        <div className="card" style={{ padding: 'var(--pad)', marginBottom: 'var(--gap)', display: 'flex', alignItems: 'center', gap: 16, borderColor: 'var(--accent)', background: 'var(--accent-softer)' }}>
          <div style={{ width: 46, height: 46, borderRadius: 'var(--r-md)', flex: 'none', display: 'grid', placeItems: 'center', background: 'var(--accent)', color: '#fff' }}><Icon name="calendar" style={{ width: 24, height: 24 }} /></div>
          <div style={{ flex: 1 }}>
            <div className="eyebrow" style={{ marginBottom: 2 }}>Next shift</div>
            <div style={{ fontWeight: 700, fontSize: 16 }}>{next.date} · {shiftRange(next)}</div>
            <div style={{ fontSize: 13, color: 'var(--ink-2)' }}>{shiftHrs(next)}h · {next._office}</div>
          </div>
        </div>
      )}

      {!loaded ? (
        <div className="card" style={{ padding: 'clamp(28px,5vw,48px)', textAlign: 'center', color: 'var(--ink-3)' }}>Loading your schedule…</div>
      ) : mine.length === 0 ? (
        <div className="card" style={{ padding: 'clamp(30px,6vw,52px)', textAlign: 'center', color: 'var(--ink-2)' }}>
          <Icon name="calendar" style={{ width: 30, height: 30, color: 'var(--ink-3)', margin: '0 auto 12px', display: 'block' }} />
          <h3 style={{ fontSize: 17, marginBottom: 8 }}>No shifts this week</h3>
          <p style={{ fontSize: 14, maxWidth: 420, margin: '0 auto', lineHeight: 1.55 }}>When your manager publishes {weekKey === thisWeekKey() ? 'this' : 'that'} week's schedule, your shifts show up here. Use the arrows to check other weeks.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 'var(--gap)' }}>
          {days.map(dayCard)}
        </div>
      )}

      {/* swap board: teammates' offered shifts + open shifts (§2.6) */}
      {loaded && board.length > 0 && (
        <div className="card" style={{ marginTop: 'var(--gap)', padding: 'var(--pad)' }}>
          <div style={{ fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.05em', color: 'oklch(0.45 0.15 320)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}><Icon name="refresh" style={{ width: 14, height: 14 }} /> Up for grabs this week</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {board.sort((a, b) => a.date.localeCompare(b.date)).map(s => {
              const owner = (typeof EMPLOYEES !== 'undefined' ? EMPLOYEES : []).find(e => e.id === s.empId);
              const claimed = pendingClaimIds.has(s.id);
              return (
                <div key={s.id + s._office} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', fontSize: 13, padding: '8px 10px', borderRadius: 'var(--r-md)', background: s.open ? 'var(--warn-soft)' : 'oklch(0.96 0.04 320)' }}>
                  <span className="mono" style={{ fontWeight: 700 }}>{s.date}</span>
                  <span className="mono">{shiftRange(s)}</span>
                  <span style={{ color: 'var(--ink-2)', flex: 1 }}>{s.open ? `${owner ? owner.name + "'s shift, " : ''}marked open` : `${owner ? owner.name : 'A teammate'} can’t work it`} · {s._office}</span>
                  {claimed ? <span className="badge badge-warn" style={{ fontSize: 10.5 }}>claim pending approval</span> :
                    <button className="btn btn-primary" style={{ padding: '4px 13px', fontSize: 12 }} onClick={() => startClaim(s)}>Claim</button>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* my blackout & swap requests, with where they sit in the approval chain */}
      {loaded && (myBlackouts.length > 0 || mySwaps.length > 0) && (
        <div className="card" style={{ marginTop: 'var(--gap)', padding: 'var(--pad)' }}>
          <div style={{ fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--ink-3)', marginBottom: 10 }}>My requests</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
            {myBlackouts.map(b => (
              <div key={b.id} style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ flex: 1 }}>Blackout · {b.dates.join(', ')}{b.reason ? ` — ${b.reason}` : ''}</span>
                <span className={'badge ' + (b.status === 'approved' ? 'badge-ok' : b.status === 'denied' ? 'badge-warn' : 'badge-prog')} style={{ fontSize: 10.5 }}>
                  {b.status === 'hr_review' ? 'awaiting HR (PTO check)' : b.status === 'mgr_review' ? 'HR confirmed — awaiting manager' : b.status}
                </span>
              </div>
            ))}
            {mySwaps.map(r => (
              <div key={r.id} style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ flex: 1 }}>{r.toEmpId === me.id ? `Claim on ${r.fromName}'s` : `${r.toName} claimed your`} {r.date} {fmt12(r.start)}–{fmt12(r.end)} shift</span>
                <span className={'badge ' + (r.status === 'approved' ? 'badge-ok' : r.status === 'rejected' ? 'badge-warn' : 'badge-prog')} style={{ fontSize: 10.5 }}>{r.status === 'pending' ? 'awaiting manager' : r.status}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {boOpen && <BlackoutModal onClose={() => setBoOpen(false)} onSubmit={async (dates, reason) => {
        setBoOpen(false);
        try { await schedAction({ action: 'blackout_submit', dates, reason }); flash('Blackout request sent — HR confirms PTO first, then your manager approves.'); load(); }
        catch (e) { flash(e.message); }
      }} />}

      {confirmClaim && (
        <>
          <div onClick={() => setConfirmClaim(null)} style={{ position: 'fixed', inset: 0, background: 'oklch(0.2 0.02 230 / 0.4)', zIndex: 80 }} />
          <div className="card fade-in" style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', zIndex: 81, width: 'min(400px, 92vw)', padding: 20, boxShadow: 'var(--shadow-lg)' }}>
            <h3 style={{ fontSize: 16, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 7 }}><Icon name="bell" style={{ width: 16, height: 16, color: 'var(--warn)' }} /> Heads up — conflict</h3>
            <div style={{ fontSize: 13.5, lineHeight: 1.55, color: 'var(--ink-2)' }}>
              {confirmClaim.conflict.shifts.map(c => <p key={c.id} style={{ margin: '0 0 6px' }}>You already work {shiftRange(c)} on {c.date}.</p>)}
              {confirmClaim.conflict.blackout && <p style={{ margin: '0 0 6px' }}>You have an approved blackout on {confirmClaim.shift.date}.</p>}
              <p style={{ margin: 0 }}>You can still claim it — your manager decides.</p>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
              <button onClick={() => setConfirmClaim(null)} className="btn btn-ghost">Never mind</button>
              <button onClick={() => claim(confirmClaim.shift)} className="btn btn-primary">Claim anyway</button>
            </div>
          </div>
        </>
      )}

      {toast && (
        <div className="fade-in" style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 90, background: 'var(--ink)', color: 'var(--surface)', padding: '11px 20px', borderRadius: 'var(--r-pill)', fontSize: 13.5, fontWeight: 600, boxShadow: 'var(--shadow-lg)', display: 'flex', alignItems: 'center', gap: 9 }}>
          <Icon name="check" style={{ width: 16, height: 16, color: 'oklch(0.8 0.13 155)' }} /> {toast}
        </div>
      )}
    </div>
  );
}

/* blackout-date submission (§2.5): pick dates, optional reason; HR → Manager */
function BlackoutModal({ onClose, onSubmit }) {
  const [dates, setDates] = useState([]);
  const [pick, setPick] = useState('');
  const [reason, setReason] = useState('');
  const add = () => { if (pick && !dates.includes(pick)) setDates(d => [...d, pick].sort()); setPick(''); };
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'oklch(0.2 0.02 230 / 0.4)', zIndex: 80 }} />
      <div className="card fade-in" style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', zIndex: 81, width: 'min(420px, 92vw)', padding: 20, boxShadow: 'var(--shadow-lg)' }}>
        <h3 style={{ fontSize: 16, marginBottom: 4 }}>Blackout dates</h3>
        <p style={{ fontSize: 12.5, color: 'var(--ink-3)', marginBottom: 12, lineHeight: 1.5 }}>Days you can’t work. HR confirms you have the PTO to cover them, then your manager approves — only then do they take effect on the schedule.</p>
        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          <input type="date" value={pick} onChange={e => setPick(e.target.value)} style={{ flex: 1, padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 'var(--r-sm)', fontSize: 13.5, background: 'var(--surface)' }} />
          <button className="btn btn-ghost" disabled={!pick} onClick={add}><Icon name="plus" /> Add</button>
        </div>
        {dates.length > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
            {dates.map(d => (
              <span key={d} className="badge badge-prog" style={{ cursor: 'pointer' }} title="Remove" onClick={() => setDates(x => x.filter(y => y !== d))}>{d} ✕</span>
            ))}
          </div>
        )}
        <textarea value={reason} onChange={e => setReason(e.target.value)} placeholder="Reason (optional)" rows="2" style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 'var(--r-sm)', fontSize: 13.5, background: 'var(--surface)', resize: 'vertical', fontFamily: 'inherit' }}></textarea>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
          <button onClick={onClose} className="btn btn-ghost">Cancel</button>
          <button disabled={!dates.length} onClick={() => onSubmit(dates, reason)} className="btn btn-primary"><Icon name="check" /> Submit</button>
        </div>
      </div>
    </>
  );
}

Object.assign(window, { MySchedule });
