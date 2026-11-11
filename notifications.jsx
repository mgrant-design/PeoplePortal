/* notifications.jsx — the bell panel: approvals waiting on you and the requests you
   sent, notices and messages, open shifts for managers, and the time-off request form. */

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

function ZenEmpty({ isMgr, onRequest, onCompose }) {
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
      <div style={{ marginTop: 24, display: 'flex', gap: 18, justifyContent: 'center', flexWrap: 'wrap' }}>
        {onCompose && (
          <button onClick={onCompose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: softer, textDecoration: 'underline', textUnderlineOffset: 3, fontFamily: 'var(--font-body)' }}>send a message</button>
        )}
        {onRequest && (
          <button onClick={onRequest} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: softer, textDecoration: 'underline', textUnderlineOffset: 3, fontFamily: 'var(--font-body)' }}>request time off</button>
        )}
      </div>
    </div>
  );
}

/* Monday-to-Friday days from start to end, both included (YYYY-MM-DD) */
function weekdaysBetween(start, end) {
  let n = 0;
  for (let t = Date.parse(start + 'T00:00:00Z'), last = Date.parse(end + 'T00:00:00Z'); t <= last; t += 86400000) {
    const dow = new Date(t).getUTCDay();
    if (dow !== 0 && dow !== 6) n++;
  }
  return n;
}

/* a time-off request: start and end dates, hours, type and an optional reason; it goes
   to the person's manager, then to the final time-off approver */
const TIMEOFF_TYPES = ['Vacation', 'Sick', 'Unpaid', 'Bereavement'];
function TimeOffForm({ onDone, onCancel, flash }) {
  const [f, setF] = useState({ type: 'Vacation', start: '', end: '', hours: '', reason: '' });
  const [busy, setBusy] = useState(false);
  const inp = { width: '100%', padding: '9px 11px', borderRadius: 'var(--r-md)', border: '1.5px solid var(--line)', fontSize: 13.5, background: 'var(--surface)', color: 'var(--ink)', outline: 'none', fontFamily: 'var(--font-body)' };
  const lab = { fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', color: 'var(--ink-3)', marginBottom: 5 };
  const days = f.start && f.end && f.end >= f.start ? Math.round((Date.parse(f.end) - Date.parse(f.start)) / 86400000) + 1 : 0;
  // hours follow the dates (8 for each weekday) until the person types their own
  const setDates = (patch) => setF(cur => { const n = { ...cur, ...patch }; const h = n.start && n.end && n.end >= n.start ? weekdaysBetween(n.start, n.end) * 8 : 0; return cur.hoursTyped ? n : { ...n, hours: h ? String(h) : '' }; });
  const endBeforeStart = f.start && f.end && f.end < f.start;
  const ok = days > 0 && Number(f.hours) > 0 && !busy;
  const finalEmail = (window.HR && window.HR.approvers && window.HR.approvers.timeoffFinal) || '';
  const finalEmp = finalEmail && typeof findByEmail === 'function' ? findByEmail(finalEmail) : null;
  const send = () => {
    setBusy(true);
    submitApproval('timeoff', { start: f.start, end: f.end, hours: Number(f.hours), type: f.type, reason: f.reason.trim() })
      .then(() => { flash && flash('Time-off request sent to your manager.'); onDone && onDone(); })
      .catch(e => { setBusy(false); flash && flash('Couldn’t send the request (' + ((e && e.message) || 'error') + ')', false); });
  };
  return (
    <div className="card" style={{ padding: 14, marginBottom: 12, borderColor: 'var(--accent)', background: 'var(--accent-softer)' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 9, marginBottom: 9 }}>
        <label><div style={lab}>First day</div><input type="date" value={f.start} onChange={e => setDates({ start: e.target.value, end: f.end || e.target.value })} style={inp} /></label>
        <label><div style={lab}>Last day</div><input type="date" value={f.end} min={f.start || undefined} onChange={e => setDates({ end: e.target.value })} style={inp} /></label>
        <label><div style={lab}>Type</div>
          <select value={f.type} onChange={e => setF({ ...f, type: e.target.value })} style={{ ...inp, appearance: 'auto' }}>{TIMEOFF_TYPES.map(t => <option key={t}>{t}</option>)}</select></label>
        <label><div style={lab}>Hours</div><input type="number" min="1" step="0.5" value={f.hours} onChange={e => setF({ ...f, hours: e.target.value, hoursTyped: e.target.value !== '' })} style={inp} /></label>
      </div>
      {endBeforeStart && <div style={{ fontSize: 12, color: 'var(--danger)', marginBottom: 8 }}>The last day is before the first day.</div>}
      {days > 0 && !(Number(f.hours) > 0) && <div style={{ fontSize: 12, color: 'var(--danger)', marginBottom: 8 }}>Enter the hours.</div>}
      <textarea value={f.reason} onChange={e => setF({ ...f, reason: e.target.value })} rows={2} placeholder="Reason (optional)" style={{ ...inp, resize: 'vertical' }} />
      <div style={{ fontSize: 11.5, color: 'var(--ink-2)', marginTop: 9, display: 'flex', gap: 7, alignItems: 'flex-start' }}>
        <Icon name="link" style={{ width: 13, height: 13, color: 'var(--accent)', flex: 'none', marginTop: 1 }} />
        {`Goes to your manager, then to ${finalEmp ? finalEmp.name : 'the final approver'}, who approves it as paid or unpaid.`}
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
        <button className="btn btn-quiet" style={{ padding: '6px 12px', fontSize: 13 }} onClick={onCancel}>Cancel</button>
        <button className="btn btn-primary" style={{ padding: '6px 14px', fontSize: 13 }} disabled={!ok} onClick={send}><Icon name="check" /> {busy ? 'Sending…' : 'Send request'}</button>
      </div>
    </div>
  );
}

function MessageComposer({ me, access, onSend, onCancel }) {
  const people = useMemo(() => (typeof window !== 'undefined' && window.EMPLOYEES ? window.EMPLOYEES : [])
    .filter(e => e && e.status === 'Active' && e.id !== me.id && ((typeof seesAll === 'function' ? seesAll(access, 'notifications') : access.caps.viewAll) || e.loc === me.loc) && e.workEmail)
    .sort((a, b) => a.name.localeCompare(b.name)), [me, access]);
  const [to, setTo] = useState('');
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [urgent, setUrgent] = useState(false);
  const inp = { width: '100%', padding: '9px 11px', borderRadius: 'var(--r-md)', border: '1.5px solid var(--line)', fontSize: 13.5, background: 'var(--surface)', color: 'var(--ink)', outline: 'none', fontFamily: 'var(--font-body)' };
  const selected = people.find(p => p.workEmail === to);
  const q = query.trim().toLowerCase();
  const filtered = q ? people.filter(p => p.name.toLowerCase().includes(q)) : people;
  return (
    <div className="card" style={{ padding: 14, marginBottom: 12, borderColor: 'var(--accent)', background: 'var(--accent-softer)' }}>
      <label style={{ display: 'block', marginBottom: 9, position: 'relative' }}>
        <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', color: 'var(--ink-3)', marginBottom: 5 }}>To</div>
        <input
          value={selected ? selected.name + (selected.loc ? ' · ' + selected.loc : '') : query}
          onChange={e => { setTo(''); setQuery(e.target.value); setOpen(true); }}
          onFocus={() => { if (selected) { setTo(''); setQuery(''); } setOpen(true); }}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder="Type a name…" style={inp} autoComplete="off"
        />
        {open && (
          <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 5, background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--r-md)', boxShadow: 'var(--shadow-md)', maxHeight: 220, overflowY: 'auto' }}>
            {filtered.length === 0
              ? <div style={{ padding: '9px 11px', fontSize: 13, color: 'var(--ink-3)' }}>No match</div>
              : filtered.map(p => (
                <button key={p.id} type="button" onMouseDown={e => e.preventDefault()} onClick={() => { setTo(p.workEmail); setQuery(''); setOpen(false); }} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 11px', fontSize: 13.5, border: 'none', background: 'none', color: 'var(--ink)', cursor: 'pointer' }} onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-2)'} onMouseLeave={e => e.currentTarget.style.background = 'none'}>{p.name}{p.loc ? ' · ' + p.loc : ''}</button>
              ))}
          </div>
        )}
      </label>
      <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Subject" style={{ ...inp, marginBottom: 9 }} />
      <textarea value={body} onChange={e => setBody(e.target.value)} rows={3} placeholder="Message" style={{ ...inp, resize: 'vertical' }} />
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, fontSize: 13, cursor: 'pointer' }}>
        <input type="checkbox" checked={urgent} onChange={e => setUrgent(e.target.checked)} /> Mark urgent
      </label>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
        <button className="btn btn-quiet" style={{ padding: '6px 12px', fontSize: 13 }} onClick={onCancel}>Cancel</button>
        <button className="btn btn-primary" style={{ padding: '6px 14px', fontSize: 13 }} disabled={!to || (!title.trim() && !body.trim())} onClick={() => onSend({ toEmail: to, title, body, urgent })}><Icon name="check" /> Send</button>
      </div>
    </div>
  );
}

function NotificationsPanel({ me, access, onClose, flash, notices = [], onSend, onMarkRead, onDelete, onRestore, onOpenDeepLink }) {
  const [composing, setComposing] = useState(false);
  const [historyMode, setHistoryMode] = useState(false);
  const [openByOffice, setOpenByOffice] = useState({});
  const [adding, setAdding] = useState(false);
  const [sndChoice, setSndChoice] = useState(() => (window.PDSound ? window.PDSound.getChoice(me.id) : 1));
  const [sndMuted, setSndMuted] = useState(() => (window.PDSound ? window.PDSound.isMuted() : false));
  const sndNames = window.PDSound ? window.PDSound.names() : ['Sound 1', 'Sound 2'];
  const pickSnd = (n) => { if (!window.PDSound) return; window.PDSound.setMuted(false); window.PDSound.setChoice(me.id, n); setSndMuted(false); setSndChoice(n); window.PDSound.preview(n); };
  const toggleSndMute = () => { if (!window.PDSound) return; const m = !sndMuted; window.PDSound.setMuted(m); setSndMuted(m); };
  const sndCirc = (active) => ({ width: 26, height: 26, borderRadius: '50%', border: '1px solid ' + (active ? 'var(--accent)' : 'var(--line)'), background: active ? 'var(--accent)' : 'var(--surface)', color: active ? 'var(--on-accent)' : 'var(--ink-3)', fontSize: 12, fontWeight: 700, display: 'grid', placeItems: 'center', cursor: 'pointer', padding: 0, lineHeight: 1, flex: 'none' });
  const isMgr = access.caps.viewAll || access.caps.viewTeam;
  const locs = Object.keys(openByOffice);
  const live = notices.filter(n => !n.dismissed);
  const dismissed = notices.filter(n => n.dismissed);
  const catOf = (n) => n.category || 'message';
  // approvals waiting on this person, and requests they sent; reloaded when any changes
  const [appr, setAppr] = useState({ toApprove: [], mine: [] });
  const [apprLoaded, setApprLoaded] = useState(false);
  const [apprAsOf, setApprAsOf] = useState('');   // when the approvals on screen were requested
  const reloadApprovals = () => { if (typeof fetchApprovals === 'function') { const asked = new Date().toISOString(); fetchApprovals().then(a => { setAppr({ toApprove: a.toApprove || [], mine: a.mine || [] }); setApprAsOf(asked); setApprLoaded(true); }).catch(e => flash && flash('Couldn’t load approvals (' + ((e && e.message) || 'no backend') + ')')); } };
  useEffect(() => { reloadApprovals(); const h = () => reloadApprovals(); window.addEventListener('pd-approvals-changed', h); return () => window.removeEventListener('pd-approvals-changed', h); }, []);
  const decide = (record, decision, note, option) => decideApproval(record.id, decision, note, option)
    .then((res) => { reloadApprovals(); flash && flash(decision === 'deny' ? 'Request denied.' : (res && res.record && res.record.effect === 'failed') ? 'Approved, but nothing was changed — the schedule changed after the request was sent. It needs to be sent again.' : 'Approved.'); })
    .catch(e => { reloadApprovals(); flash && flash('Couldn’t save the decision (' + ((e && e.message) || 'error') + ')'); });
  const pendingIds = new Set(appr.toApprove.map(r => r.id));
  // approvals waiting here show as their rows, so their notices stay out of Needs you
  const aboutApproval = (n) => !!(n.deepLink && n.deepLink.approvalId);
  const needYou = live.filter(n => catOf(n) === 'action' && !aboutApproval(n));
  // a request notice whose approval no longer waits on this person is done: mark it read
  useEffect(() => {
    if (!apprLoaded || !onMarkRead) return;
    // only notices older than the approvals list, so one that just arrived isn't judged against a stale list
    live.filter(n => catOf(n) === 'action' && aboutApproval(n) && !n.read && (n.createdAt || '') < apprAsOf && !pendingIds.has(n.deepLink.approvalId)).forEach(n => onMarkRead(n.id));
  }, [apprLoaded, apprAsOf, appr, notices]);
  const messages = live.filter(n => catOf(n) === 'message' || catOf(n) === 'mention');
  const activity = live.filter(n => catOf(n) === 'social');
  const fullyEmpty = (isMgr ? locs.length === 0 : true) && live.length === 0 && !appr.toApprove.length && !appr.mine.length;
  // One notice card, reused across the tiers and the history view. Reactions ('social') render
  // muted and never as “unread”; history items swap dismiss (×) for a restore action.
  const NoticeCard = (n, historyItem) => {
    const social = catOf(n) === 'social';
    const unread = !n.read && !social && !historyItem;
    return (
      <div key={n.id} className="card" onClick={() => { if (!historyItem && !n.read && onMarkRead) onMarkRead(n.id); if (n.deepLink && n.deepLink.view !== 'approvals' && onOpenDeepLink) onOpenDeepLink(n.deepLink); }}
        style={{ padding: 12, cursor: n.deepLink ? 'pointer' : ((n.read || historyItem) ? 'default' : 'pointer'), borderColor: unread ? 'var(--accent)' : 'var(--line)', background: unread ? 'var(--accent-softer)' : 'var(--surface)', opacity: (social || historyItem) ? 0.92 : 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ fontWeight: 600, fontSize: 13.5, flex: 1, color: social ? 'var(--ink-2)' : 'var(--ink)' }}>{n.title || '(no subject)'}</div>
          {n.urgent && <span className="badge badge-todo">Urgent</span>}
          {unread && <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)', flex: 'none' }} />}
          {historyItem
            ? <button onClick={(e) => { e.stopPropagation(); onRestore && onRestore(n.id); }} aria-label="Restore notification" title="Restore to inbox" style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--accent-strong)', padding: 2, flex: 'none', display: 'inline-flex' }}><Icon name="refresh" style={{ width: 14, height: 14 }} /></button>
            : <button onClick={(e) => { e.stopPropagation(); onDelete && onDelete(n.id); }} aria-label="Dismiss notification" style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--ink-3)', padding: 2, flex: 'none' }}><Icon name="x" style={{ width: 14, height: 14 }} /></button>}
        </div>
        {n.body && <p style={{ fontSize: 12.5, color: 'var(--ink-2)', marginTop: 6 }}>{n.body}</p>}
        <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 7 }}>from {n.fromName || n.fromEmail}</div>
      </div>
    );
  };

  useEffect(() => { const h = (e) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h); }, []);

  // Open & offered shifts come from this week's published schedules (new shift-list shape).
  useEffect(() => {
    if (!isMgr || typeof fetchSchedules !== 'function') return;
    let cancelled = false;
    fetchSchedules({ weekKey: (typeof thisWeekKey === 'function' ? thisWeekKey() : undefined) }).then(list => {
      if (cancelled) return;
      const byOffice = {};
      list.forEach(s => {
        if (!(typeof seesAll === 'function' ? seesAll(access, 'notifications') : access.caps.viewAll) && s.office !== me.loc) return;
        (s.shifts || []).forEach(o => {
          if (!o.open && !o.offered) return;
          (byOffice[s.office] = byOffice[s.office] || []).push({ day: o.date, time: typeof shiftRange === 'function' ? shiftRange(o) : `${o.start}–${o.end}`, label: o.open ? 'Open' : 'Offered' });
        });
      });
      setOpenByOffice(byOffice);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [isMgr]);

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
            <button onClick={() => setHistoryMode(v => !v)} aria-label={historyMode ? 'Back to inbox' : 'Notification history'} title={historyMode ? 'Inbox' : 'History'} style={sndCirc(historyMode)}>
              <Icon name={historyMode ? 'bell' : 'clock'} style={{ width: 13, height: 13 }} />
            </button>
          </div>
          <button className="btn btn-quiet" style={{ padding: 8 }} onClick={onClose}><Icon name="x" /></button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 20, display: (fullyEmpty && !historyMode && !adding && !composing) ? 'flex' : 'block' }}>
          {historyMode ? (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <Icon name="clock" style={{ width: 16, height: 16, color: 'var(--accent)' }} />
                <h3 style={{ fontSize: 14, flex: 1 }}>Dismissed history</h3>
              </div>
              {dismissed.length === 0 && <p style={{ fontSize: 13, color: 'var(--ink-3)' }}>Nothing dismissed yet.</p>}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{dismissed.map(n => NoticeCard(n, true))}</div>
            </div>
          ) : (fullyEmpty && !adding && !composing) ? <ZenEmpty isMgr={isMgr} onRequest={() => setAdding(true)} onCompose={() => setComposing(true)} /> : <>
          {/* NEEDS YOU — approvals waiting on this person, then action-required notices */}
          {(appr.toApprove.length > 0 || needYou.length > 0) && (
            <div style={{ marginBottom: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <Icon name="bell" style={{ width: 16, height: 16, color: 'var(--accent)' }} />
                <h3 style={{ fontSize: 14, flex: 1 }}>Needs you</h3>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {appr.toApprove.map(r => <ApprovalRow key={r.id} record={r} onDecide={decide} />)}
                {needYou.map(n => NoticeCard(n, false))}
              </div>
            </div>
          )}
          {/* MY REQUESTS — what this person sent and where each one is */}
          {appr.mine.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <Icon name="list" style={{ width: 16, height: 16, color: 'var(--accent)' }} />
                <h3 style={{ fontSize: 14, flex: 1 }}>My requests</h3>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{appr.mine.map(r => <MyRequestRow key={r.id} record={r} />)}</div>
            </div>
          )}
          {/* MESSAGES & MENTIONS — direct messages + comment/reply mentions, with composer */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <Icon name="mail" style={{ width: 16, height: 16, color: 'var(--accent)' }} />
              <h3 style={{ fontSize: 14, flex: 1 }}>Messages &amp; mentions</h3>
              <button className="btn btn-ghost" style={{ padding: '5px 11px', fontSize: 12.5 }} onClick={() => setComposing(c => !c)}><Icon name="plus" /> New</button>
            </div>
            {composing && <MessageComposer me={me} access={access} onCancel={() => setComposing(false)} onSend={(body) => { setComposing(false); Promise.resolve(onSend && onSend(body)).then(() => flash && flash('Message sent.')).catch(err => flash && flash((err && err.message) || 'Send failed.')); }} />}
            {messages.length === 0 && !composing && <p style={{ fontSize: 13, color: 'var(--ink-3)' }}>No messages.</p>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{messages.map(n => NoticeCard(n, false))}</div>
          </div>
          {/* ACTIVITY — reactions, lowkey (no badge, no ding) */}
          {activity.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <Icon name="sparkle" style={{ width: 16, height: 16, color: 'var(--ink-3)' }} />
                <h3 style={{ fontSize: 14, flex: 1, color: 'var(--ink-2)' }}>Activity</h3>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{activity.map(n => NoticeCard(n, false))}</div>
            </div>
          )}
          {/* open shifts — managers/HR */}
          {isMgr && (
            <div style={{ marginBottom: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <Icon name="calendar" style={{ width: 16, height: 16, color: 'var(--accent)' }} />
                <h3 style={{ fontSize: 14 }}>Open shifts {(typeof seesAll === 'function' ? seesAll(access, 'notifications') : access.caps.viewAll) ? '· all locations' : '· ' + me.loc}</h3>
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

          {/* time off — the form; sent requests show under My requests */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <Icon name="clock" style={{ width: 16, height: 16, color: 'var(--accent)' }} />
              <h3 style={{ fontSize: 14, flex: 1 }}>Time off</h3>
              {!adding && <button className="btn btn-ghost" style={{ padding: '5px 11px', fontSize: 12.5 }} onClick={() => setAdding(true)}><Icon name="plus" /> Request</button>}
            </div>
            {adding ? <TimeOffForm flash={flash} onCancel={() => setAdding(false)} onDone={() => { setAdding(false); reloadApprovals(); }} />
              : <p style={{ fontSize: 13, color: 'var(--ink-3)' }}>{appr.mine.some(r => r.kind === 'timeoff') ? 'Your requests are under My requests.' : 'No time-off requests yet.'}</p>}
          </div>
          </>}
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { NotificationsPanel, TimeOffForm });
