/* offboarding.jsx — offboarding notices: imported records plus notices sent through the
   approval process, scoped to the person's reporting tree; and the form that starts one. */

/* who a person may start a notice for: anyone (company-wide view) or their own team, never themselves */
function offboardablePeople(me, access) {
  const pool = access.caps.viewAll ? EMPLOYEES : window.PD_ACCESS_RULES.reportingTree(me, EMPLOYEES);
  return pool.filter(e => e.id !== me.id && window.PD_ACCESS_RULES.isActive(e)).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
}

/* start an offboarding notice; it goes to the offboarding approvers on the Organization page */
function OffboardingDialog({ me, access, person, onClose, onSent }) {
  const people = useMemo(() => offboardablePeople(me, access), [me.id, access]);
  const [f, setF] = useState({ empId: person ? person.id : '', termStatus: 'Resigned', effective: '', notes: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const inp = { width: '100%', padding: '9px 11px', borderRadius: 'var(--r-md)', border: '1.5px solid var(--line)', fontSize: 13.5, background: 'var(--surface)', color: 'var(--ink)', outline: 'none', fontFamily: 'var(--font-body)' };
  const lab = { fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', color: 'var(--ink-3)', marginBottom: 5 };
  const chosen = person || people.find(e => e.id === f.empId);
  const send = () => {
    setBusy(true); setErr('');
    submitApproval('offboarding', { empId: f.empId, termStatus: f.termStatus, effective: f.effective, notes: f.notes.trim() })
      .then(() => onSent(`Offboarding notice for ${chosen ? chosen.name : 'this person'} sent for approval.`))
      .catch(e => { setBusy(false); setErr((e && e.message) || 'Couldn’t send the notice.'); });
  };
  return ReactDOM.createPortal((
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 90, background: 'oklch(0.3 0.03 250 / 0.4)', display: 'grid', placeItems: 'start center', overflowY: 'auto', padding: 20 }}>
      <div className="card fade-in" onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 520, padding: 'clamp(20px,4vw,28px)', boxShadow: 'var(--shadow-lg)' }}>
        <h2 style={{ fontSize: 18 }}>New offboarding notice</h2>
        <p style={{ color: 'var(--ink-2)', fontSize: 13.5, marginTop: 6 }}>It goes to the offboarding approvers. Any one of them approves or denies it.</p>
        <div style={{ display: 'grid', gap: 12, marginTop: 14 }}>
          <label><div style={lab}>Person leaving</div>
            {person ? <div style={{ fontWeight: 600, fontSize: 14 }}>{person.name}{person.jobTitle ? ' · ' + person.jobTitle : ''}</div>
              : <select value={f.empId} onChange={e => setF({ ...f, empId: e.target.value })} style={{ ...inp, appearance: 'auto' }}>
                  <option value="">Choose a person…</option>
                  {people.map(e => <option key={e.id} value={e.id}>{e.name}{e.jobTitle ? ` — ${e.jobTitle}` : ''}{e.loc ? ` · ${e.loc}` : ''}</option>)}
                </select>}
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <label><div style={lab}>Type</div>
              <select value={f.termStatus} onChange={e => setF({ ...f, termStatus: e.target.value })} style={{ ...inp, appearance: 'auto' }}><option>Resigned</option><option>Terminated</option></select></label>
            <label><div style={lab}>Last day</div><input type="date" value={f.effective} onChange={e => setF({ ...f, effective: e.target.value })} style={inp} /></label>
          </div>
          <label><div style={lab}>Notes</div><textarea value={f.notes} onChange={e => setF({ ...f, notes: e.target.value })} rows={3} placeholder="Optional" style={{ ...inp, resize: 'vertical' }} /></label>
        </div>
        {err && <div style={{ marginTop: 10, fontSize: 13, fontWeight: 600, color: 'var(--danger)' }}>{err}</div>}
        <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
          <button className="btn btn-quiet" style={{ flex: 1, justifyContent: 'center' }} onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }} disabled={busy || !f.empId || !f.effective} onClick={send}><Icon name="check" /> {busy ? 'Sending…' : 'Send for approval'}</button>
        </div>
      </div>
    </div>
  ), document.body);
}

const APPROVAL_BADGE = { pending: ['badge-warn', 'Waiting on approval'], approved: ['badge-ok', 'Approved'], denied: ['badge-todo', 'Denied'] };

function Offboarding({ me, access, viewOnly, onOpenEmp }) {
  const officeName = useMemo(() => { const m = {}; (window.HR.offices || []).forEach(o => m[o.id] = o.name); return m; }, []);
  const empById = useMemo(() => { const m = {}; EMPLOYEES.forEach(e => m[e.id] = e); return m; }, []);
  const [open, setOpen] = useState(null);
  const [statusF, setStatusF] = useState('All');
  const [starting, setStarting] = useState(false);
  const [sentNote, setSentNote] = useState('');
  // notices sent through the approval process, reloaded when any approval changes
  const [notices, setNotices] = useState([]);
  const loadNotices = () => pdApi('/api/approvals', { query: { kind: 'offboarding' } }).then(d => setNotices(d.offboarding || [])).catch(() => setNotices([]));
  useEffect(() => {
    loadNotices();
    window.addEventListener('pd-approvals-changed', loadNotices);
    return () => window.removeEventListener('pd-approvals-changed', loadNotices);
  }, []);

  const seeEveryone = (typeof seesAll === 'function') ? seesAll(access, 'offboarding') : access.caps.viewAll;
  // imported records have no id; key them by their place in the imported list
  let reqs = (window.HR.offboarding || []).map((o, i) => ({ ...o, _key: 'imp' + i })).filter(o => o.first || o.last);
  if (!seeEveryone) reqs = window.PD_ACCESS_RULES.offboardingInTree(reqs, me, EMPLOYEES);
  reqs = [...notices.slice().sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')), ...reqs.slice().reverse()];
  const statuses = ['All', 'Terminated', 'Resigned'];
  const shown = statusF === 'All' ? reqs : reqs.filter(o => (o.termStatus || o.status || '').toLowerCase().includes(statusF.toLowerCase()));

  const tone = (s) => /terminat/i.test(s) ? ['badge-warn', 'lock'] : /resign/i.test(s) ? ['badge-todo', 'arrowRight'] : ['badge-prog', 'clock'];

  return (
    <div className="fade-in">
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 18 }}>
        <div>
          <h1 style={{ fontSize: 'clamp(22px,3vw,28px)' }}>Offboarding</h1>
          <p style={{ color: 'var(--ink-2)', fontSize: 14.5, marginTop: 6 }}>{seeEveryone ? 'All termination & resignation requests' : 'Requests for your team'} · {reqs.length} on file</p>
        </div>
        {access.caps.offboard && !viewOnly && <button className="btn btn-primary" onClick={() => setStarting(true)}><Icon name="plus" /> New notice</button>}
        {viewOnly && <span className="badge badge-todo" style={{ padding: '8px 14px' }}><Icon name="lock" /> View only</span>}
      </div>

      {starting && <OffboardingDialog me={me} access={access} onClose={() => setStarting(false)} onSent={(m) => { setStarting(false); setSentNote(m); loadNotices(); }} />}
      {sentNote && <div className="card" style={{ padding: '11px 15px', marginBottom: 14, background: 'var(--ok-soft)', fontSize: 13.5, display: 'flex', alignItems: 'center', gap: 8 }}><Icon name="check" style={{ width: 15, height: 15 }} /> {sentNote}</div>}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {statuses.map(s => (
          <button key={s} onClick={() => setStatusF(s)} style={{ border: '1px solid', borderColor: statusF === s ? 'var(--accent)' : 'var(--line)', background: statusF === s ? 'var(--accent-soft)' : 'var(--surface)', color: statusF === s ? 'var(--accent-strong)' : 'var(--ink-2)', borderRadius: 'var(--r-pill)', padding: '6px 14px', fontSize: 13, fontWeight: 600 }}>{s}</button>
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {shown.length === 0 && <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--ink-3)' }}>No requests.</div>}
        {shown.map((o, i) => {
          const [stone, sicon] = tone(o.termStatus || o.status);
          const rowKey = o.id || o._key;
          const isOpen = open === rowKey;
          const checklist = [['Resignation letter', o.resignationLetter], ['Exit interview', o.exitInterview]];
          return (
            <div key={rowKey} className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <button onClick={() => setOpen(isOpen ? null : rowKey)} style={{ width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 14, padding: '14px var(--pad)', border: 'none', background: 'var(--surface)', cursor: 'pointer' }}>
                <PhotoAvatar emp={empById[o.empId] || { id: o.empId, name: `${o.first} ${o.last}` }} size={38} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14.5 }}>{o.first} {o.last}</div>
                  <div style={{ fontSize: 12.5, color: 'var(--ink-3)' }}>{o.jobTitle} · {officeName[o.location] || o.location || '—'}</div>
                </div>
                <span className="mono" style={{ fontSize: 12, color: 'var(--ink-3)', flex: 'none' }}>Eff. {o.effective}</span>
                {o.approval && <span className={`badge ${(APPROVAL_BADGE[o.approval] || ['badge-todo'])[0]}`} style={{ flex: 'none' }}>{(APPROVAL_BADGE[o.approval] || [, o.approval])[1]}</span>}
                <span className={`badge ${stone}`} style={{ flex: 'none' }}><Icon name={sicon} /> {(o.termStatus || o.status || '').replace(/ \/.*/, '')}</span>
                <Icon name="chevron" style={{ width: 16, height: 16, color: 'var(--ink-3)', flex: 'none', transform: isOpen ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }} />
              </button>
              {isOpen && (
                <div className="fade-in" style={{ padding: 'var(--pad)', borderTop: '1px solid var(--line)', background: 'var(--surface-2)' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 14, marginBottom: 14 }}>
                    {[['Department', o.department], ['Manager', o.manager], ['Requested by', o.requestedBy], ['Effective', o.effective], ['Provider', o.provider == null || o.provider === '' ? '—' : /true|yes/i.test(o.provider) ? 'Yes' : 'No']].map(([k, v]) => (
                      <div key={k}><div style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--ink-3)', fontWeight: 700 }}>{k}</div><div style={{ fontSize: 13.5, fontWeight: 600, marginTop: 2 }}>{v || '—'}</div></div>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: o.notes ? 12 : 0 }}>
                    {checklist.map(([k, v]) => (
                      <span key={k} className={`badge ${v ? 'badge-ok' : 'badge-todo'}`}><Icon name={v ? 'check' : 'clock'} /> {k}{v ? ` · ${v}` : ' pending'}</span>
                    ))}
                  </div>
                  {o.notes && <p style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.5, background: 'var(--surface)', padding: '12px 14px', borderRadius: 'var(--r-md)', border: '1px solid var(--line)' }}>{o.notes}</p>}
                  {empById[o.empId] && <div style={{ marginTop: 14 }}><button className="btn btn-ghost" onClick={() => onOpenEmp(empById[o.empId])}><Icon name="users" /> Open employee record</button></div>}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

Object.assign(window, { Offboarding, OffboardingDialog, offboardablePeople });
