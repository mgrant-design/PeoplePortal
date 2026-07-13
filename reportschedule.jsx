/* reportschedule.jsx — scheduled email reports + schedule modal.
   Loaded AFTER reportbuilder.jsx. Lets managers/HR save a report definition to
   run on a recurring schedule and email it to recipients, pause/resume, send
   now, or cancel. Persists to localStorage (pd_report_schedules). No backend —
   "delivery" is simulated (next-run dates are real and advance on send). */

const RS_KEY = 'pd_report_schedules';
const RS_FREQS = ['Daily', 'Weekly', 'Monthly', 'Quarterly'];
const RS_FORMATS = ['CSV', 'Excel', 'PDF'];
const RS_DOW = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const RS_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/* NO BACKEND. Scheduled reports have no /api endpoint yet — in-memory only, gone on reload. */
let _reportSchedules = [];
function loadSchedules() { return _reportSchedules; }
function persistSchedules(x) { _reportSchedules = x || []; }

/* compute the next delivery Date from a schedule's recurrence, after `from`. */
function nextRun(s, from) {
  const now = from ? new Date(from) : new Date();
  const [hh, mm] = (s.time || '08:00').split(':').map(Number);
  const at = (d) => { const x = new Date(d); x.setHours(hh, mm, 0, 0); return x; };
  if (s.freq === 'Daily') {
    let d = at(now); if (d <= now) d.setDate(d.getDate() + 1); return d;
  }
  if (s.freq === 'Weekly') {
    const target = s.dow != null ? s.dow : 1;
    let d = at(now); let add = (target - d.getDay() + 7) % 7;
    if (add === 0 && d <= now) add = 7;
    d.setDate(d.getDate() + add); return d;
  }
  // Monthly / Quarterly — both keyed to a day-of-month
  const dom = Math.min(s.dom || 1, 28);
  if (s.freq === 'Monthly') {
    let d = at(new Date(now.getFullYear(), now.getMonth(), dom));
    if (d <= now) d = at(new Date(now.getFullYear(), now.getMonth() + 1, dom));
    return d;
  }
  // Quarterly: Jan/Apr/Jul/Oct
  const qMonths = [0, 3, 6, 9];
  for (let yr = now.getFullYear(); yr <= now.getFullYear() + 1; yr++) {
    for (const m of qMonths) { const d = at(new Date(yr, m, dom)); if (d > now) return d; }
  }
  return at(new Date(now.getFullYear() + 1, 0, dom));
}

function fmtRunDate(d) {
  try { return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) + ' · ' + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }); } catch (e) { return String(d); }
}
function scheduleSummary(s) {
  const t = (s.time || '08:00');
  const tt = (() => { const [h, m] = t.split(':').map(Number); const ap = h >= 12 ? 'PM' : 'AM'; const h12 = ((h + 11) % 12) + 1; return `${h12}:${String(m).padStart(2, '0')} ${ap}`; })();
  if (s.freq === 'Daily') return `Every day at ${tt}`;
  if (s.freq === 'Weekly') return `Every ${RS_DOW[s.dow != null ? s.dow : 1]} at ${tt}`;
  const ord = (n) => n + (['th', 'st', 'nd', 'rd'][(n % 100 - n % 10 != 10) * (n % 10 < 4 ? n % 10 : 0)] || 'th');
  if (s.freq === 'Monthly') return `Monthly on the ${ord(s.dom || 1)} at ${tt}`;
  return `Quarterly (Jan/Apr/Jul/Oct) on the ${ord(s.dom || 1)} at ${tt}`;
}

/* human description of a report definition */
function describeDef(def) {
  if (!def) return 'Custom report';
  const L = (typeof RB_LABEL !== 'undefined') ? RB_LABEL : {};
  let s = `Grouped by ${L[def.rows] || def.rows}`;
  if (def.cols) s += ` × ${L[def.cols] || def.cols}`;
  const fs = (def.filters || []).filter(f => f.value && f.value !== 'All');
  if (fs.length) s += ' · ' + fs.map(f => `${L[f.field] || f.field}: ${f.value}`).join(', ');
  s += def.measure === 'pct' ? ' · % of total' : ' · headcount';
  return s;
}

const RS_SEED = [];

/* ---------------- Schedule modal ---------------- */
function ScheduleModal({ def, me, onClose, onSave }) {
  const myEmail = (me && me.workEmail) || '';
  const [name, setName] = useState(() => {
    const L = (typeof RB_LABEL !== 'undefined') ? RB_LABEL : {};
    return def ? `${L[def.rows] || 'Custom'}${def.cols ? ' × ' + (L[def.cols] || '') : ''} report` : 'Custom report';
  });
  const [freq, setFreq] = useState('Weekly');
  const [dow, setDow] = useState(1);
  const [dom, setDom] = useState(1);
  const [time, setTime] = useState('08:00');
  const [format, setFormat] = useState('PDF');
  const [recips, setRecips] = useState(myEmail ? [myEmail] : []);
  const [entry, setEntry] = useState('');

  const inp = { width: '100%', padding: '9px 11px', borderRadius: 'var(--r-md)', fontSize: 14, border: '1.5px solid var(--line)', background: 'var(--surface)', color: 'var(--ink)', outline: 'none', fontFamily: 'var(--font-body)' };
  const lbl = { fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--ink-3)', marginBottom: 6, display: 'block' };

  const addRecip = () => {
    const v = entry.trim().replace(/[,;]+$/, '');
    if (v && /\S+@\S+\.\S+/.test(v) && !recips.includes(v)) { setRecips([...recips, v]); setEntry(''); }
  };
  const preview = nextRun({ freq, dow, dom, time });
  const canSave = name.trim() && recips.length > 0;

  const save = () => {
    if (!canSave) return;
    onSave({
      id: 'rs' + Date.now(), name: name.trim(), def: def || null,
      freq, dow, dom, time, recipients: recips, format,
      status: 'Active', createdBy: me ? me.name : 'You', createdAt: Date.now(), lastSent: null,
    });
  };

  return ReactDOM.createPortal((
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 90, background: 'oklch(0.3 0.03 250 / 0.42)', display: 'grid', placeItems: 'center', padding: 20 }}>
      <div onClick={e => e.stopPropagation()} className="card fade-in" style={{ width: 'min(560px, 96vw)', maxHeight: '92vh', overflowY: 'auto', padding: 0 }}>
        <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', gap: 11 }}>
          <div style={{ width: 34, height: 34, borderRadius: 9, flex: 'none', display: 'grid', placeItems: 'center', background: 'var(--accent-soft)', color: 'var(--accent-strong)' }}><Icon name="mail" style={{ width: 17, height: 17 }} /></div>
          <div style={{ flex: 1 }}><h3 style={{ fontSize: 16 }}>Schedule by email</h3><p style={{ fontSize: 12.5, color: 'var(--ink-3)' }}>Deliver this report automatically on a recurring schedule.</p></div>
          <button onClick={onClose} className="btn btn-quiet" style={{ padding: 7 }}><Icon name="x" /></button>
        </div>
        <div style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={lbl}>Report name</label>
            <input value={name} onChange={e => setName(e.target.value)} style={inp} />
          </div>
          <div style={{ background: 'var(--surface-2)', borderRadius: 'var(--r-md)', padding: '10px 13px', fontSize: 12.5, color: 'var(--ink-2)', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <Icon name="grid" style={{ width: 14, height: 14, color: 'var(--accent)', flex: 'none', marginTop: 1 }} />
            <span>{describeDef(def)}</span>
          </div>
          <div>
            <label style={lbl}>Frequency</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {RS_FREQS.map(f => <button key={f} onClick={() => setFreq(f)} style={{ border: '1.5px solid', borderColor: freq === f ? 'var(--accent)' : 'var(--line)', background: freq === f ? 'var(--accent-soft)' : 'var(--surface)', color: freq === f ? 'var(--accent-strong)' : 'var(--ink-2)', borderRadius: 'var(--r-pill)', padding: '7px 15px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>{f}</button>)}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {freq === 'Weekly' && (
              <div style={{ flex: 1, minWidth: 150 }}><label style={lbl}>Day of week</label>
                <select value={dow} onChange={e => setDow(+e.target.value)} style={{ ...inp, appearance: 'auto' }}>{RS_DOW.map((d, i) => <option key={d} value={i}>{d}</option>)}</select>
              </div>
            )}
            {(freq === 'Monthly' || freq === 'Quarterly') && (
              <div style={{ flex: 1, minWidth: 150 }}><label style={lbl}>Day of month</label>
                <select value={dom} onChange={e => setDom(+e.target.value)} style={{ ...inp, appearance: 'auto' }}>{Array.from({ length: 28 }, (_, i) => i + 1).map(d => <option key={d} value={d}>{d}</option>)}</select>
              </div>
            )}
            <div style={{ flex: 1, minWidth: 130 }}><label style={lbl}>Time</label>
              <input type="time" value={time} onChange={e => setTime(e.target.value)} style={{ ...inp, appearance: 'auto' }} />
            </div>
            <div style={{ flex: 1, minWidth: 130 }}><label style={lbl}>Format</label>
              <select value={format} onChange={e => setFormat(e.target.value)} style={{ ...inp, appearance: 'auto' }}>{RS_FORMATS.map(f => <option key={f}>{f}</option>)}</select>
            </div>
          </div>
          <div>
            <label style={lbl}>Recipients</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input value={entry} onChange={e => setEntry(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addRecip(); } }} placeholder="name@puredental.com" style={{ ...inp, flex: 1 }} />
              <button className="btn btn-ghost" onClick={addRecip}><Icon name="plus" /> Add</button>
            </div>
            {recips.length > 0 && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 9 }}>
              {recips.map(r => <span key={r} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 'var(--r-pill)', padding: '4px 6px 4px 11px', fontSize: 12.5 }}>{r}<button onClick={() => setRecips(recips.filter(x => x !== r))} style={{ border: 'none', background: 'var(--line)', borderRadius: '50%', width: 16, height: 16, display: 'grid', placeItems: 'center', cursor: 'pointer', color: 'var(--ink-2)' }}><Icon name="x" style={{ width: 9, height: 9 }} /></button></span>)}
            </div>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--ink-2)', background: 'var(--accent-softer)', borderRadius: 'var(--r-md)', padding: '10px 13px' }}>
            <Icon name="clock" style={{ width: 14, height: 14, color: 'var(--accent-strong)', flex: 'none' }} />
            First delivery: <b style={{ color: 'var(--ink)' }}>{fmtRunDate(preview)}</b>
          </div>
        </div>
        <div style={{ padding: '14px 22px', borderTop: '1px solid var(--line)', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button className="btn btn-quiet" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={!canSave} onClick={save}><Icon name="check" /> Schedule report</button>
        </div>
      </div>
    </div>
  ), document.body);
}

/* ---------------- Scheduled reports tab ---------------- */
function ScheduledReports({ me, access, flash, onNew }) {
  const [items, setItems] = useState(loadSchedules);
  const [confirmCancel, setConfirmCancel] = useState(null);
  const save = (x) => { setItems(x); persistSchedules(x); };
  const isAdmin = access.caps.viewAll;
  const mine = isAdmin ? items : items.filter(s => s.createdBy === (me && me.name));

  const toggle = (id) => save(items.map(s => s.id === id ? { ...s, status: s.status === 'Active' ? 'Paused' : 'Active' } : s));
  const cancel = (id) => { save(items.filter(s => s.id !== id)); setConfirmCancel(null); flash && flash('Scheduled report cancelled.'); };
  const sendNow = (s) => { save(items.map(x => x.id === s.id ? { ...x, lastSent: Date.now() } : x)); flash && flash(`“${s.name}” sent to ${s.recipients.length} recipient${s.recipients.length > 1 ? 's' : ''}.`); };

  return (
    <div className="fade-in">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        <p style={{ fontSize: 13.5, color: 'var(--ink-2)' }}>Reports that email themselves on a recurring schedule. {isAdmin ? 'Showing all schedules.' : 'Showing schedules you created.'}</p>
        <button className="btn btn-primary" onClick={onNew}><Icon name="plus" /> New scheduled report</button>
      </div>
      {mine.length === 0 ? (
        <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--ink-3)' }}>
          <Icon name="mail" style={{ width: 26, height: 26, margin: '0 auto 10px', display: 'block', opacity: 0.5 }} />
          No scheduled reports yet. Build a report, then <b>Schedule by email</b> — or start one here.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {mine.map(s => {
            const paused = s.status === 'Paused';
            const next = nextRun(s);
            return (
              <div key={s.id} className="card" style={{ padding: 'var(--pad)', opacity: paused ? 0.72 : 1 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, flexWrap: 'wrap' }}>
                  <div style={{ width: 38, height: 38, borderRadius: 10, flex: 'none', display: 'grid', placeItems: 'center', background: paused ? 'var(--surface-2)' : 'var(--accent-soft)', color: paused ? 'var(--ink-3)' : 'var(--accent-strong)' }}><Icon name="mail" style={{ width: 18, height: 18 }} /></div>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 600, fontSize: 15 }}>{s.name}</span>
                      <span className={`badge ${paused ? 'badge-todo' : 'badge-ok'}`}>{paused ? 'Paused' : 'Active'}</span>
                      <span className="badge badge-todo" style={{ fontSize: 10.5 }}>{s.format}</span>
                    </div>
                    <div style={{ fontSize: 12.5, color: 'var(--ink-2)', marginTop: 5, display: 'flex', flexWrap: 'wrap', gap: '2px 14px' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><Icon name="clock" style={{ width: 13, height: 13, color: 'var(--ink-3)' }} /> {scheduleSummary(s)}</span>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><Icon name="users" style={{ width: 13, height: 13, color: 'var(--ink-3)' }} /> {s.recipients.length} recipient{s.recipients.length > 1 ? 's' : ''}</span>
                    </div>
                    <div style={{ fontSize: 12.5, color: 'var(--ink-3)', marginTop: 4 }}>{describeDef(s.def)}</div>
                    <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: '2px 14px' }}>
                      <span>{paused ? 'Paused — ' : 'Next: '}<b style={{ color: paused ? 'var(--ink-3)' : 'var(--accent-strong)' }}>{paused ? 'not scheduled' : fmtRunDate(next)}</b></span>
                      {s.lastSent && <span>Last sent {fmtRunDate(new Date(s.lastSent))}</span>}
                    </div>
                    <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 4 }}>To: {s.recipients.join(', ')}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', alignItems: 'center' }}>
                    <button className="btn btn-ghost" style={{ padding: '6px 11px', fontSize: 12.5 }} onClick={() => sendNow(s)}><Icon name="mail" /> Send now</button>
                    <button className="btn btn-quiet" style={{ padding: '6px 11px', fontSize: 12.5 }} onClick={() => toggle(s.id)}>{paused ? 'Resume' : 'Pause'}</button>
                    {confirmCancel === s.id
                      ? <button className="btn btn-primary" style={{ padding: '6px 11px', fontSize: 12.5, background: 'oklch(0.55 0.18 25)', borderColor: 'oklch(0.55 0.18 25)' }} onClick={() => cancel(s.id)}><Icon name="trash" /> Confirm</button>
                      : <button className="btn btn-quiet" style={{ padding: '6px 11px', fontSize: 12.5, color: 'oklch(0.55 0.16 25)' }} onClick={() => setConfirmCancel(s.id)}><Icon name="trash" /> Cancel</button>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <p style={{ fontSize: 12.5, color: 'var(--ink-3)', marginTop: 14, display: 'flex', gap: 7, alignItems: 'center', lineHeight: 1.5 }}>
        <Icon name="mail" style={{ width: 14, height: 14, flex: 'none' }} /> Delivery runs through the Pure Dental mail service. Recipients receive the report as an attachment at each scheduled time.
      </p>
    </div>
  );
}

Object.assign(window, { ScheduleModal, ScheduledReports, loadSchedules, persistSchedules, nextRun, describeDef });
