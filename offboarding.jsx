/* offboarding.jsx — offboarding/termination requests (real data), scoped + actionable. */

function Offboarding({ me, access, viewOnly, onOpenEmp }) {
  const officeName = useMemo(() => { const m = {}; (window.HR.offices || []).forEach(o => m[o.id] = o.name); return m; }, []);
  const empById = useMemo(() => { const m = {}; EMPLOYEES.forEach(e => m[e.id] = e); return m; }, []);
  const [open, setOpen] = useState(null);
  const [statusF, setStatusF] = useState('All');

  let reqs = (window.HR.offboarding || []).filter(o => o.first || o.last);
  if (!access.caps.viewAll) {
    const myName = me.name.toLowerCase();
    reqs = reqs.filter(o => (o.manager || '').toLowerCase().includes(me.last.toLowerCase()) || (o.requestedBy || '').toLowerCase().includes(me.last.toLowerCase()));
  }
  reqs = reqs.slice().reverse();
  const statuses = ['All', 'Terminated', 'Resigned'];
  const shown = statusF === 'All' ? reqs : reqs.filter(o => (o.termStatus || o.status || '').toLowerCase().includes(statusF.toLowerCase()));

  const tone = (s) => /terminat/i.test(s) ? ['badge-warn', 'lock'] : /resign/i.test(s) ? ['badge-todo', 'arrowRight'] : ['badge-prog', 'clock'];

  return (
    <div className="fade-in">
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 18 }}>
        <div>
          <h1 style={{ fontSize: 'clamp(22px,3vw,28px)' }}>Offboarding</h1>
          <p style={{ color: 'var(--ink-2)', fontSize: 14.5, marginTop: 6 }}>{access.caps.viewAll ? 'All termination & resignation requests' : 'Requests for your team'} · {reqs.length} on file</p>
        </div>
        {access.caps.offboard && !viewOnly && <button className="btn btn-primary"><Icon name="plus" /> New request</button>}
        {viewOnly && <span className="badge badge-todo" style={{ padding: '8px 14px' }}><Icon name="lock" /> View only</span>}
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {statuses.map(s => (
          <button key={s} onClick={() => setStatusF(s)} style={{ border: '1px solid', borderColor: statusF === s ? 'var(--accent)' : 'var(--line)', background: statusF === s ? 'var(--accent-soft)' : 'var(--surface)', color: statusF === s ? 'var(--accent-strong)' : 'var(--ink-2)', borderRadius: 'var(--r-pill)', padding: '6px 14px', fontSize: 13, fontWeight: 600 }}>{s}</button>
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {shown.length === 0 && <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--ink-3)' }}>No requests.</div>}
        {shown.map((o, i) => {
          const [stone, sicon] = tone(o.termStatus || o.status);
          const isOpen = open === i;
          const checklist = [['Resignation letter', o.resignationLetter], ['Exit interview', o.exitInterview]];
          return (
            <div key={i} className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <button onClick={() => setOpen(isOpen ? null : i)} style={{ width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 14, padding: '14px var(--pad)', border: 'none', background: 'var(--surface)', cursor: 'pointer' }}>
                <PhotoAvatar emp={empById[o.empId] || { id: o.empId, name: `${o.first} ${o.last}` }} size={38} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14.5 }}>{o.first} {o.last}</div>
                  <div style={{ fontSize: 12.5, color: 'var(--ink-3)' }}>{o.jobTitle} · {officeName[o.location] || o.location || '—'}</div>
                </div>
                <span className="mono" style={{ fontSize: 12, color: 'var(--ink-3)', flex: 'none' }}>Eff. {o.effective}</span>
                <span className={`badge ${stone}`} style={{ flex: 'none' }}><Icon name={sicon} /> {(o.termStatus || o.status || '').replace(/ \/.*/, '')}</span>
                <Icon name="chevron" style={{ width: 16, height: 16, color: 'var(--ink-3)', flex: 'none', transform: isOpen ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }} />
              </button>
              {isOpen && (
                <div className="fade-in" style={{ padding: 'var(--pad)', borderTop: '1px solid var(--line)', background: 'var(--surface-2)' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 14, marginBottom: 14 }}>
                    {[['Department', o.department], ['Manager', o.manager], ['Requested by', o.requestedBy], ['Effective', o.effective], ['Provider', /true|yes/i.test(o.provider) ? 'Yes' : 'No']].map(([k, v]) => (
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

Object.assign(window, { Offboarding });
