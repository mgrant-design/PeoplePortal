/* notifications.jsx — manager notifications: open shifts by location + time-off
   requests (approve / deny / route). Employees submit requests. Persists to localStorage. */

function loadTimeoff() {
  try { const s = localStorage.getItem('pd_timeoff'); if (s) return JSON.parse(s); } catch (e) {}
  return [];   // no demo time-off — fills with real requests once staff submit them
}
function saveTimeoff(t) { try { localStorage.setItem('pd_timeoff', JSON.stringify(t)); } catch (e) {} }
function approvedTimeoff() { return loadTimeoff().filter(r => r.status === 'approved'); }
const TO_STATUS = { hr_review: ['badge-prog', 'With HR · balance check'], mgr_review: ['badge-warn', 'With manager'], approved: ['badge-ok', 'Approved'], denied: ['badge-todo', 'Denied'], insufficient: ['badge-todo', 'Not enough balance'] };

const OPEN_SHIFTS = {
  Manorville: [{ day: 'Wed Jun 24', role: 'RDH', time: '8:00–4:00' }, { day: 'Fri Jun 26', role: 'Front Desk', time: '7:00–3:00' }],
  Hauppauge: [{ day: 'Thu Jun 25', role: 'Dental Assistant', time: '9:00–5:00' }],
  'Wading River': [{ day: 'Mon Jun 22', role: 'RDH', time: '8:00–4:00' }],
  'Garden City': [{ day: 'Tue Jun 23', role: 'Front Desk', time: '8:00–2:00' }],
};

function scopeLocs(me, access) {
  if (access.caps.viewAll) return Object.keys(OPEN_SHIFTS);
  return [me.loc].filter(l => OPEN_SHIFTS[l]);
}
function scopedRequests(all, me, access) {
  if (access.caps.viewAll) return all;
  if (access.caps.viewTeam) return all.filter(r => r.loc === me.loc);
  return all.filter(r => r.empId === me.id);
}
function notifCount(me, access) {
  const all = loadTimeoff();
  const scoped = scopedRequests(all, me, access);
  const isMgr = access.caps.viewAll || access.caps.viewTeam;
  let actionable = 0;
  if (access.flags.isHR || access.caps.viewAll) actionable += scoped.filter(r => r.status === 'hr_review').length;
  if (isMgr) actionable += scoped.filter(r => r.status === 'mgr_review').length;
  const shifts = isMgr ? scopeLocs(me, access).reduce((a, l) => a + OPEN_SHIFTS[l].length, 0) : 0;
  return actionable + shifts;
}

function TimeOffForm({ me, onSubmit, onCancel }) {
  const [f, setF] = useState({ type: 'Vacation', hours: 8, start: '', reason: '' });
  const inp = { width: '100%', padding: '9px 11px', borderRadius: 'var(--r-md)', border: '1.5px solid var(--line)', fontSize: 13.5, background: 'var(--surface)', color: 'var(--ink)', outline: 'none', fontFamily: 'var(--font-body)' };
  const paid = f.type !== 'Unpaid';
  return (
    <div className="card" style={{ padding: 14, marginBottom: 12, borderColor: 'var(--accent)', background: 'var(--accent-softer)' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 9, marginBottom: 9 }}>
        <label><div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', color: 'var(--ink-3)', marginBottom: 5 }}>Type</div>
          <select value={f.type} onChange={e => setF({ ...f, type: e.target.value })} style={{ ...inp, appearance: 'auto' }}>{['Vacation', 'Sick', 'Unpaid', 'Bereavement'].map(t => <option key={t}>{t}</option>)}</select></label>
        <label><div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', color: 'var(--ink-3)', marginBottom: 5 }}>Hours</div>
          <select value={f.hours} onChange={e => setF({ ...f, hours: +e.target.value })} style={{ ...inp, appearance: 'auto' }}>{[4, 8, 12, 16, 24, 32, 40].map(h => <option key={h} value={h}>{h} hrs{h === 4 ? ' (half day)' : h === 8 ? ' (full day)' : ''}</option>)}</select></label>
      </div>
      <label style={{ display: 'block', marginBottom: 9 }}><div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', color: 'var(--ink-3)', marginBottom: 5 }}>Date(s)</div>
        <input value={f.start} onChange={e => setF({ ...f, start: e.target.value })} placeholder="e.g. Jul 8 or Jul 8–11" style={inp} /></label>
      <textarea value={f.reason} onChange={e => setF({ ...f, reason: e.target.value })} rows={2} placeholder="Reason (optional)" style={{ ...inp, resize: 'vertical' }} />
      <div style={{ fontSize: 11.5, color: 'var(--ink-2)', marginTop: 9, display: 'flex', gap: 7, alignItems: 'flex-start' }}>
        <Icon name="link" style={{ width: 13, height: 13, color: 'var(--accent)', flex: 'none', marginTop: 1 }} />
        {paid ? 'Goes to HR & Payroll to confirm your balance, then to your manager to approve.' : 'Unpaid time goes straight to your manager to approve.'}
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
        <button className="btn btn-quiet" style={{ padding: '6px 12px', fontSize: 13 }} onClick={onCancel}>Cancel</button>
        <button className="btn btn-primary" style={{ padding: '6px 14px', fontSize: 13 }} disabled={!f.start.trim()} onClick={() => onSubmit({ id: 'to' + Date.now(), empId: me.id, name: me.name, loc: me.loc, type: f.type, paid, hours: f.hours, avail: paid ? 40 : 0, start: f.start, end: '', reason: f.reason, status: paid ? 'hr_review' : 'mgr_review' })}><Icon name="check" /> Submit</button>
      </div>
    </div>
  );
}

function NotificationsPanel({ me, access, onClose, flash }) {
  const [reqs, setReqs] = useState(loadTimeoff);
  const [adding, setAdding] = useState(false);
  const isMgr = access.caps.viewAll || access.caps.viewTeam;
  const isHR = access.flags.isHR || access.caps.viewAll;
  const locs = scopeLocs(me, access);
  const myScope = scopedRequests(reqs, me, access);
  const actionable = myScope.filter(r => (isHR && r.status === 'hr_review') || (isMgr && r.status === 'mgr_review'));

  useEffect(() => { const h = (e) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h); }, []);
  const setStatus = (id, status, extra) => { const next = reqs.map(r => r.id === id ? { ...r, status, ...(extra || {}) } : r); setReqs(next); saveTimeoff(next); };
  const hrConfirm = (r) => { setStatus(r.id, 'mgr_review', { hrConfirmed: true }); flash && flash(`Balance confirmed — sent to ${r.name.split(' ')[0]}’s manager.`); };
  const hrInsufficient = (r) => { setStatus(r.id, 'insufficient'); flash && flash('Marked insufficient — employee notified.'); };
  const mgrApprove = (r) => { setStatus(r.id, 'approved'); flash && flash('Time off approved — added to the schedule.'); };
  const deny = (r) => { setStatus(r.id, 'denied'); flash && flash('Request denied.'); };
  const submit = (r) => { const next = [r, ...reqs]; setReqs(next); saveTimeoff(next); setAdding(false); flash && flash(r.paid ? 'Submitted — sent to HR for a balance check.' : 'Submitted — sent to your manager.'); };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 85, background: 'oklch(0.3 0.03 250 / 0.4)', display: 'flex', justifyContent: 'flex-end' }}>
      <div onClick={e => e.stopPropagation()} className="fade-in" style={{ width: 'min(440px, 94vw)', height: '100%', background: 'var(--surface)', boxShadow: 'var(--shadow-lg)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 20px', borderBottom: '1px solid var(--line)' }}>
          <Icon name="bell" style={{ width: 19, height: 19, color: 'var(--accent)' }} />
          <h2 style={{ fontSize: 18, flex: 1 }}>Notifications</h2>
          <button className="btn btn-quiet" style={{ padding: 8 }} onClick={onClose}><Icon name="x" /></button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
          {/* open shifts — managers/HR */}
          {isMgr && (
            <div style={{ marginBottom: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <Icon name="calendar" style={{ width: 16, height: 16, color: 'var(--accent)' }} />
                <h3 style={{ fontSize: 14 }}>Open shifts {access.caps.viewAll ? '· all locations' : '· ' + me.loc}</h3>
              </div>
              {locs.length === 0 ? <p style={{ fontSize: 13, color: 'var(--ink-3)' }}>No open shifts.</p> : locs.map(loc => (
                <div key={loc} style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}><Icon name="pin" style={{ width: 12, height: 12 }} /> {loc} · {OPEN_SHIFTS[loc].length}</div>
                  {OPEN_SHIFTS[loc].map((s, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 'var(--r-md)', border: '1px solid var(--line)', background: 'var(--warn-soft)', marginBottom: 6 }}>
                      <div style={{ flex: 1 }}><div style={{ fontWeight: 600, fontSize: 13.5 }}>{s.role}</div><div className="mono" style={{ fontSize: 11.5, color: 'var(--ink-2)' }}>{s.day} · {s.time}</div></div>
                      <button className="btn btn-ghost" style={{ padding: '5px 11px', fontSize: 12.5 }} onClick={() => flash && flash('Open shift posted to team')}>Notify team</button>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}

          {/* time-off requests */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <Icon name="clock" style={{ width: 16, height: 16, color: 'var(--accent)' }} />
              <h3 style={{ fontSize: 14, flex: 1 }}>{isMgr ? 'Time-off requests' : 'My time off'}</h3>
              {!isMgr && <button className="btn btn-ghost" style={{ padding: '5px 11px', fontSize: 12.5 }} onClick={() => setAdding(a => !a)}><Icon name="plus" /> Request</button>}
            </div>
            {!isMgr && adding && <TimeOffForm me={me} onSubmit={submit} onCancel={() => setAdding(false)} />}
            {isMgr && actionable.length > 0 && <div style={{ fontSize: 12, color: 'oklch(0.5 0.13 60)', fontWeight: 600, marginBottom: 8 }}>{actionable.length} awaiting your {isHR ? 'review' : 'approval'}</div>}
            {myScope.length === 0 && <p style={{ fontSize: 13, color: 'var(--ink-3)' }}>No requests.</p>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {myScope.map(r => {
                const st = TO_STATUS[r.status] || ['badge-todo', r.status];
                const lowBal = r.paid && (r.avail || 0) < r.hours;
                return (
                <div key={r.id} className="card" style={{ padding: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    {isMgr && <PhotoAvatar emp={{ id: r.empId, name: r.name }} size={32} />}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 13.5 }}>{isMgr ? r.name : r.type}{isMgr ? '' : (r.paid ? '' : ' · Unpaid')}</div>
                      <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>{isMgr ? `${r.type} · ` : ''}{r.hours} hrs · {r.start}{r.end ? '–' + r.end : ''}{isMgr ? ' · ' + r.loc : ''}</div>
                    </div>
                    <span className={`badge ${st[0]}`}>{st[1]}</span>
                  </div>
                  {r.reason && <p style={{ fontSize: 12.5, color: 'var(--ink-2)', marginTop: 7 }}>{r.reason}</p>}

                  {/* HR balance-check step (paid only) */}
                  {isHR && r.status === 'hr_review' && (
                    <div style={{ marginTop: 10 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, padding: '7px 10px', borderRadius: 'var(--r-sm)', background: lowBal ? 'var(--warn-soft)' : 'var(--surface-2)', marginBottom: 8 }}>
                        <Icon name="clock" style={{ width: 13, height: 13, color: lowBal ? 'oklch(0.5 0.13 60)' : 'var(--accent)' }} />
                        <span><b>{r.avail || 0} hrs</b> available · requesting <b>{r.hours} hrs</b>{lowBal ? ' — not enough' : ''}</span>
                      </div>
                      <div style={{ display: 'flex', gap: 7 }}>
                        <button className="btn btn-primary" style={{ padding: '6px 12px', fontSize: 12.5, flex: 1, justifyContent: 'center' }} disabled={lowBal} onClick={() => hrConfirm(r)}><Icon name="check" /> Confirm balance → manager</button>
                        <button className="btn btn-quiet" style={{ padding: '6px 10px', fontSize: 12.5 }} onClick={() => hrInsufficient(r)}>Insufficient</button>
                      </div>
                    </div>
                  )}

                  {/* Manager approval step */}
                  {isMgr && r.status === 'mgr_review' && (
                    <div style={{ marginTop: 10 }}>
                      {r.paid && r.hrConfirmed && <div style={{ fontSize: 11.5, color: 'oklch(0.42 0.12 155)', marginBottom: 7, display: 'flex', alignItems: 'center', gap: 6 }}><Icon name="check" style={{ width: 13, height: 13 }} /> HR confirmed {r.hours} hrs available</div>}
                      {!r.paid && <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginBottom: 7 }}>Unpaid — no balance needed</div>}
                      <div style={{ display: 'flex', gap: 7 }}>
                        <button className="btn btn-primary" style={{ padding: '6px 12px', fontSize: 12.5, flex: 1, justifyContent: 'center' }} onClick={() => mgrApprove(r)}><Icon name="check" /> Approve</button>
                        <button className="btn btn-quiet" style={{ padding: '6px 10px', fontSize: 12.5 }} onClick={() => deny(r)}>Deny</button>
                      </div>
                    </div>
                  )}
                </div>
              ); })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { NotificationsPanel, notifCount, approvedTimeoff });
