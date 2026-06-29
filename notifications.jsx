/* notifications.jsx — manager notifications: open shifts by location + time-off
   requests (approve / deny / route). Employees submit requests. Persists to localStorage. */

function loadTimeoff() {
  try { const s = localStorage.getItem('pd_timeoff'); if (s) return JSON.parse(s); } catch (e) {}
  return [];   // no demo time-off — fills with real requests once staff submit them
}
function saveTimeoff(t) { try { localStorage.setItem('pd_timeoff', JSON.stringify(t)); } catch (e) {} }
function approvedTimeoff() { return loadTimeoff().filter(r => r.status === 'approved'); }
const TO_STATUS = { hr_review: ['badge-prog', 'With HR · balance check'], mgr_review: ['badge-warn', 'With manager'], approved: ['badge-ok', 'Approved'], denied: ['badge-todo', 'Denied'], insufficient: ['badge-todo', 'Not enough balance'] };

/* Empty-state: no "0 notifications" noise — just a soft, satisfied kaomoji that
   quietly exhales. Lines pick at random (never the same twice in a row) and start
   on a fresh one every time the panel reopens, so it never feels like a fixed loop.
   Color is mixed only 20% toward ink from the panel background — present but barely
   there. A breath-pause between fades keeps it calm, not blinky. */
const ZEN_LINES = [
  { face: '(っ˘ ³˘)っ ♡', msg: 'all caught up' },
  { face: '( ˶• ᵕ •˶ )', msg: 'nothing needs you right now' },
  { face: '(っ˘ω˘ς )', msg: 'quiet everywhere — phew' },
  { face: '( ˶ᵔ ᵕ ᵔ˶ )', msg: "you're all clear" },
  { face: '( ´ ˘ ` )ﾉ゛', msg: 'smooth sailing' },
  { face: '( ˶˘ ᵕ ˘˶ )', msg: 'inbox at peace' },
  { face: '( ˶ˆ ꒳ ˆ˵ )', msg: 'all tidy' },
  { face: '✧ ( ˶• ᵕ •˶ ) ✧', msg: 'sparkling clean' },
  { face: '(っ ˶• ᵕ •˶ )っ', msg: 'easy breezy' },
  { face: '( ´ - ᵕ - ` )', msg: 'taking a breather' },
  { face: '( ˶• ‿ •˶ )', msg: 'calm and clear' },
  { face: '＼( ˶• ᵕ •˶ )／', msg: 'nothing on the list' },
  { face: '＼( ˶ˆ ᵕ ˆ˶ )／', msg: 'huzzah!' },
  { face: '＼( ˶> ᵕ <˶ )／', msg: 'caught up, woo' },
  { face: '( ˶ᵔ ‿ ᵔ˶ )', msg: 'all settled' },
  { face: '·˚ ✧ ( ˶• ᵕ •˶ ) ✧ ˚·', msg: 'pristine' },
  { face: '( ˘ ω ˘ )ｽﾔ', msg: 'resting easy' },
  { face: '( ˶• ᴗ •˶ )b', msg: 'handled' },
  { face: '(づ ´ ᵕ ` )づ', msg: 'soft and silent' },
  { face: '˚ ✧ ( ˶˃ ᵕ ˂˶ ) ✧ ˚', msg: 'shiny and done' },
  { face: '( ´ ˘ ` )づ', msg: 'sending calm' },
  { face: '( ˶ˆ ‿ ˆ˶ )', msg: 'at ease' },
  { face: '( ˶ˆ ᵕ ˆ˶ )♡', msg: 'content' },
  { face: '＼( ´ ᵕ ` )／', msg: 'free as a breeze' },
  { face: '( ｡ᵕ ‿ ᵕ ｡)', msg: 'light as air' },
  { face: '✦ ( ˶• ﻌ •˶ ) ✦', msg: 'all quiet on deck' },
  { face: '( ´ ◡ ` )つ', msg: 'clear skies' },
  { face: '( ˙ ᵕ ˙ )', msg: 'nothing pending' },
  { face: '｡ ✧ ( ˶˘ ᵕ ˘˶ ) ✧ ｡', msg: 'peaceful' },
  { face: '(っ ˶ˆ ᵕ ˆ˶ )っ ♡', msg: 'phew, all done' },
];

function ZenEmpty({ isMgr, onRequest }) {
  const [i, setI] = useState(() => Math.floor(Math.random() * ZEN_LINES.length));
  const [show, setShow] = useState(true);
  useEffect(() => {
    let outT, swapT;
    const loop = () => {
      // hold the current line ~15s, fade it out, breathe, then fade in a fresh one
      outT = setTimeout(() => {
        setShow(false);
        swapT = setTimeout(() => {
          setI(v => { let n = v; while (n === v && ZEN_LINES.length > 1) n = Math.floor(Math.random() * ZEN_LINES.length); return n; });
          setShow(true);
          loop();
        }, 1500);  // 0.8s fade-out + ~0.7s calm pause before the next appears
      }, 15000);
    };
    loop();
    return () => { clearTimeout(outT); clearTimeout(swapT); };
  }, []);
  const soft = 'color-mix(in oklch, var(--surface), var(--ink) 20%)';
  const softer = 'color-mix(in oklch, var(--surface), var(--ink) 28%)';
  const cur = ZEN_LINES[i];
  return (
    <div style={{ margin: 'auto', textAlign: 'center', padding: '24px 20px', userSelect: 'none', maxWidth: 300 }}>
      <div style={{ opacity: show ? 1 : 0, transition: 'opacity .8s ease' }}>
        <div style={{ fontSize: 30, letterSpacing: '.03em', color: soft, lineHeight: 1.2, whiteSpace: 'nowrap' }}>{cur.face}</div>
        <div style={{ fontSize: 13, marginTop: 13, color: soft, fontWeight: 500, letterSpacing: '.01em' }}>{cur.msg}</div>
      </div>
      {!isMgr && (
        <button onClick={onRequest} style={{ marginTop: 24, background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: softer, textDecoration: 'underline', textUnderlineOffset: 3, fontFamily: 'var(--font-body)' }}>request time off</button>
      )}
    </div>
  );
}

function scopedRequests(all, me, access) {
  if (access.caps.viewAll) return all;
  if (access.caps.viewTeam) return all.filter(r => r.loc === me.loc);
  return all.filter(r => r.empId === me.id);
}
function notifCount(requests, me, access) {
  const scoped = scopedRequests(requests || [], me, access);
  const isMgr = access.caps.viewAll || access.caps.viewTeam;
  let actionable = 0;
  if (access.flags.isHR || access.caps.viewAll) actionable += scoped.filter(r => r.status === 'hr_review').length;
  if (isMgr) actionable += scoped.filter(r => r.status === 'mgr_review').length;
  return actionable;
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
        <button className="btn btn-primary" style={{ padding: '6px 14px', fontSize: 13 }} disabled={!f.start.trim()} onClick={() => onSubmit({ id: 'to' + Date.now(), empId: me.id, name: me.name, loc: me.loc, office: me.loc, type: f.type, paid, hours: f.hours, avail: null, start: f.start, end: '', reason: f.reason, status: paid ? 'hr_review' : 'mgr_review' })}><Icon name="check" /> Submit</button>
      </div>
    </div>
  );
}

function NotificationsPanel({ me, access, onClose, flash }) {
  const [reqs, setReqs] = useState(loadTimeoff);
  const [openByOffice, setOpenByOffice] = useState({});
  const [adding, setAdding] = useState(false);
  const [sndChoice, setSndChoice] = useState(() => (window.PDSound ? window.PDSound.getChoice(me.id) : 1));
  const [sndMuted, setSndMuted] = useState(() => (window.PDSound ? window.PDSound.isMuted() : false));
  const sndNames = window.PDSound ? window.PDSound.names() : ['Sound 1', 'Sound 2'];
  const pickSnd = (n) => { if (!window.PDSound) return; window.PDSound.setMuted(false); window.PDSound.setChoice(me.id, n); setSndMuted(false); setSndChoice(n); window.PDSound.preview(n); };
  const toggleSndMute = () => { if (!window.PDSound) return; const m = !sndMuted; window.PDSound.setMuted(m); setSndMuted(m); };
  const sndCirc = (active) => ({ width: 26, height: 26, borderRadius: '50%', border: '1px solid ' + (active ? 'var(--accent)' : 'var(--line)'), background: active ? 'var(--accent)' : 'var(--surface)', color: active ? 'var(--on-accent)' : 'var(--ink-3)', fontSize: 12, fontWeight: 700, display: 'grid', placeItems: 'center', cursor: 'pointer', padding: 0, lineHeight: 1, flex: 'none' });
  const isMgr = access.caps.viewAll || access.caps.viewTeam;
  const isHR = access.flags.isHR || access.caps.viewAll;
  const locs = Object.keys(openByOffice);
  const myScope = scopedRequests(reqs, me, access);
  const actionable = myScope.filter(r => (isHR && r.status === 'hr_review') || (isMgr && r.status === 'mgr_review'));
  const fullyEmpty = (isMgr ? locs.length === 0 : true) && myScope.length === 0;

  useEffect(() => { const h = (e) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h); }, []);

  // Load requests from Cosmos; fall back to localStorage outside production (sandbox).
  const reload = () => { if (typeof fetchTimeoff === 'function') fetchTimeoff().then(setReqs).catch(() => {}); };
  useEffect(() => { reload(); }, []);

  // Open shifts come from published schedules (the builder's open-shifts lane).
  useEffect(() => {
    if (!isMgr || typeof fetchSchedules !== 'function') return;
    let cancelled = false;
    fetchSchedules({}).then(list => {
      if (cancelled) return;
      const tpl = Object.fromEntries((typeof SHIFT_TEMPLATES !== 'undefined' ? SHIFT_TEMPLATES : []).map(t => [t.id, t]));
      const days = (typeof WEEK_DAYS !== 'undefined' ? WEEK_DAYS : []);
      const byOffice = {};
      list.forEach(s => {
        if (!access.caps.viewAll && s.office !== me.loc) return;
        Object.entries(s.open || {}).forEach(([d, arr]) => (arr || []).forEach(o => {
          const t = tpl[o.tpl];
          (byOffice[s.office] = byOffice[s.office] || []).push({ day: days[d] || ('Day ' + d), time: t ? `${t.start}–${t.end}` : '', label: t ? t.label : 'Open' });
        }));
      });
      setOpenByOffice(byOffice);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [isMgr]);

  // Each action hits the API then reloads; on failure (sandbox) it falls back to localStorage.
  const localStatus = (id, status, extra) => { const next = reqs.map(r => r.id === id ? { ...r, status, ...(extra || {}) } : r); setReqs(next); saveTimeoff(next); };
  const act = (r, action, okMsg, localName, localExtra) => {
    if (typeof timeoffAction !== 'function') { localStatus(r.id, localName, localExtra); flash && flash(okMsg); return; }
    timeoffAction({ action, id: r.id, office: r.office || r.loc })
      .then(() => { reload(); flash && flash(okMsg); })
      .catch(() => { localStatus(r.id, localName, localExtra); flash && flash(okMsg); });
  };
  const hrConfirm = (r) => act(r, 'hr_confirm', `Balance confirmed — moved to ${r.name.split(' ')[0]}’s manager.`, 'mgr_review', { hrConfirmed: true });
  const hrInsufficient = (r) => act(r, 'hr_insufficient', 'Marked as not enough balance.', 'insufficient');
  const mgrApprove = (r) => act(r, 'approve', 'Time off approved.', 'approved');
  const deny = (r) => act(r, 'deny', 'Request denied.', 'denied');
  const submit = (r) => {
    setAdding(false);
    const msg = r.paid ? 'Request submitted — pending HR balance check.' : 'Request submitted — pending manager approval.';
    if (typeof timeoffAction !== 'function') { const next = [r, ...reqs]; setReqs(next); saveTimeoff(next); flash && flash(msg); return; }
    timeoffAction({ action: 'submit', type: r.type, hours: r.hours, start: r.start, end: r.end, reason: r.reason })
      .then(() => { reload(); flash && flash(msg); })
      .catch(() => { const next = [r, ...reqs]; setReqs(next); saveTimeoff(next); flash && flash(msg); });
  };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 85, background: 'oklch(0.3 0.03 250 / 0.4)', display: 'flex', justifyContent: 'flex-end' }}>
      <div onClick={e => e.stopPropagation()} className="fade-in" style={{ width: 'min(440px, 94vw)', height: '100%', background: 'var(--surface)', boxShadow: 'var(--shadow-lg)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 20px', borderBottom: '1px solid var(--line)' }}>
          <Icon name="bell" style={{ width: 19, height: 19, color: 'var(--accent)' }} />
          <h2 style={{ fontSize: 18, flex: 1 }}>Notifications</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginRight: 4 }}>
            {[1, 2].map(n => (
              <button key={n} onClick={() => pickSnd(n)} aria-label={sndNames[n - 1] || ('Sound ' + n)} style={sndCirc(!sndMuted && sndChoice === n)}>{n}</button>
            ))}
            <button onClick={toggleSndMute} aria-label={sndMuted ? 'Unmute notifications' : 'Mute notifications'} style={sndCirc(sndMuted)}>
              <svg viewBox="0 0 20 20" style={{ width: 13, height: 13 }} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M4 8h2.5L10 5v10L6.5 12H4z" /><path d="M13.5 7.5l3.5 5M17 7.5l-3.5 5" /></svg>
            </button>
          </div>
          <button className="btn btn-quiet" style={{ padding: 8 }} onClick={onClose}><Icon name="x" /></button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 20, display: fullyEmpty && !adding ? 'flex' : 'block' }}>
          {fullyEmpty && !adding ? <ZenEmpty isMgr={isMgr} onRequest={() => setAdding(true)} /> : <>
          {/* open shifts — managers/HR */}
          {isMgr && (
            <div style={{ marginBottom: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <Icon name="calendar" style={{ width: 16, height: 16, color: 'var(--accent)' }} />
                <h3 style={{ fontSize: 14 }}>Open shifts {access.caps.viewAll ? '· all locations' : '· ' + me.loc}</h3>
              </div>
              {locs.length === 0 ? <p style={{ fontSize: 13, color: 'var(--ink-3)' }}>No open shifts.</p> : locs.map(loc => (
                <div key={loc} style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}><Icon name="pin" style={{ width: 12, height: 12 }} /> {loc} · {openByOffice[loc].length}</div>
                  {openByOffice[loc].map((s, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 'var(--r-md)', border: '1px solid var(--line)', background: 'var(--warn-soft)', marginBottom: 6 }}>
                      <div style={{ flex: 1 }}><div style={{ fontWeight: 600, fontSize: 13.5 }}>{s.label} shift</div><div className="mono" style={{ fontSize: 11.5, color: 'var(--ink-2)' }}>{s.day}{s.time ? ' · ' + s.time : ''}</div></div>
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
                const lowBal = r.paid && r.avail != null && r.avail < r.hours;
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
                        <span>{r.avail != null ? <><b>{r.avail} hrs</b> available</> : 'Balance not available yet (no payroll link)'} · requesting <b>{r.hours} hrs</b>{lowBal ? ' — not enough' : ''}</span>
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
          </>}
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { NotificationsPanel, notifCount, approvedTimeoff });
