/* employee.jsx — Employee Record detail (data-driven). Used for any employee,
   gated by the viewer's access. Tabs: Overview, Employee relations, Documents, Offboarding. */

const EVENT_TYPES = {
  commendation: { label: 'Commendation', cat: 'Positive', hue: 155, icon: 'star' },
  coaching:     { label: 'Coaching note', cat: 'Disciplinary', hue: 220, icon: 'book' },
  verbal:       { label: 'Verbal warning', cat: 'Disciplinary', hue: 75, icon: 'bell' },
  written:      { label: 'Written warning', cat: 'Disciplinary', hue: 45, icon: 'doc' },
  suspension:   { label: 'Suspension', cat: 'Status change', hue: 25, icon: 'lock' },
  transfer:     { label: 'Transfer', cat: 'Status change', hue: 260, icon: 'pin' },
  termination:  { label: 'Termination', cat: 'Status change', hue: 15, icon: 'x' },
  note:         { label: 'General note', cat: 'Positive', hue: 230, icon: 'pen' },
};
const EVENT_ORDER = ['commendation', 'note', 'coaching', 'verbal', 'written', 'suspension', 'transfer', 'termination'];
function evColor(hue, l = 0.96, c = 0.05) { return `oklch(${l} ${c} ${hue})`; }

function MiniDrop({ file, onFile }) {
  const ref = useRef(null);
  return (
    <div onClick={() => ref.current && ref.current.click()} style={{ cursor: 'pointer', border: '1.5px dashed var(--line)', borderRadius: 'var(--r-md)', padding: '10px 13px', display: 'flex', alignItems: 'center', gap: 10, background: 'var(--surface)' }}>
      <input ref={ref} type="file" style={{ display: 'none' }} onChange={e => { const f = e.target.files[0]; if (f) onFile({ name: f.name }); }} />
      <Icon name={file ? 'check' : 'upload'} style={{ width: 17, height: 17, color: file ? 'var(--ok)' : 'var(--accent)' }} />
      <span style={{ fontSize: 13, color: file ? 'var(--ink)' : 'var(--ink-3)', fontWeight: file ? 600 : 400, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file ? file.name : 'Attach a document (optional)'}</span>
    </div>
  );
}

function LogEventForm({ onSave, onCancel, author }) {
  const [type, setType] = useState('commendation');
  const [date, setDate] = useState('2026-06-14');
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [doc, setDoc] = useState(null);
  const [needsAck, setNeedsAck] = useState(true);
  const meta = EVENT_TYPES[type];
  const inp = { width: '100%', padding: '10px 12px', borderRadius: 'var(--r-md)', fontSize: 14, fontFamily: 'var(--font-body)', border: '1.5px solid var(--line)', background: 'var(--surface)', color: 'var(--ink)', outline: 'none' };
  return (
    <div className="card fade-in" style={{ padding: 'var(--pad)', borderColor: 'var(--accent)', marginBottom: 'var(--gap)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--accent-soft)', color: 'var(--accent-strong)', display: 'grid', placeItems: 'center' }}><Icon name="plus" style={{ width: 18, height: 18 }} /></div>
        <h3 style={{ fontSize: 16.5 }}>Log an employee-relations event</h3>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 160px', gap: 14, marginBottom: 14 }}>
        <label><div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--ink-3)', marginBottom: 6 }}>Event type</div>
          <select value={type} onChange={e => setType(e.target.value)} style={{ ...inp, appearance: 'auto' }}>
            {EVENT_ORDER.map(k => <option key={k} value={k}>{EVENT_TYPES[k].label} · {EVENT_TYPES[k].cat}</option>)}
          </select>
        </label>
        <label><div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--ink-3)', marginBottom: 6 }}>Date</div>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} style={inp} />
        </label>
      </div>
      <label style={{ display: 'block', marginBottom: 14 }}><div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--ink-3)', marginBottom: 6 }}>Title</div>
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder={`e.g. ${meta.label} — summary`} style={inp} />
      </label>
      <label style={{ display: 'block', marginBottom: 14 }}><div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--ink-3)', marginBottom: 6 }}>Details</div>
        <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} placeholder="What happened, context, and any follow-up…" style={{ ...inp, resize: 'vertical', lineHeight: 1.5 }} />
      </label>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 14, alignItems: 'center' }}>
        <MiniDrop file={doc} onFile={setDoc} />
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, color: 'var(--ink-2)', cursor: 'pointer', whiteSpace: 'nowrap' }}>
          <input type="checkbox" checked={needsAck} onChange={e => setNeedsAck(e.target.checked)} style={{ width: 16, height: 16, accentColor: 'var(--accent)' }} /> Require e-signature
        </label>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18 }}>
        <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
        <button className="btn btn-primary" disabled={!title.trim()} onClick={() => onSave({ id: 'e' + Date.now(), type, date, title: title.trim(), notes: notes.trim(), doc, ack: needsAck ? 'awaiting' : 'n/a', author: author || 'You · Manager' })}>
          <Icon name="check" /> Save to record
        </button>
      </div>
    </div>
  );
}

function EventCard({ ev }) {
  const m = EVENT_TYPES[ev.type];
  return (
    <div style={{ display: 'flex', gap: 14 }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 'none' }}>
        <div style={{ width: 38, height: 38, borderRadius: '50%', background: evColor(m.hue), color: `oklch(0.42 0.14 ${m.hue})`, display: 'grid', placeItems: 'center', border: `1.5px solid oklch(0.7 0.1 ${m.hue})` }}><Icon name={m.icon} style={{ width: 18, height: 18 }} /></div>
        <div style={{ flex: 1, width: 2, background: 'var(--line)', marginTop: 4 }} />
      </div>
      <div className="card" style={{ padding: 'var(--pad)', flex: 1, marginBottom: 'var(--gap)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span className="badge" style={{ background: evColor(m.hue), color: `oklch(0.4 0.14 ${m.hue})` }}>{m.label}</span>
          <span style={{ fontSize: 12, color: 'var(--ink-3)' }} className="mono">{new Date(ev.date + 'T00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
          {ev.ack === 'awaiting' && <span className="badge badge-warn"><Icon name="pen" /> Awaiting signature</span>}
          {ev.ack === 'acknowledged' && <span className="badge badge-ok"><Icon name="check" /> Acknowledged</span>}
        </div>
        <h4 style={{ fontSize: 15.5, marginTop: 10 }}>{ev.title}</h4>
        {ev.notes && <p style={{ fontSize: 13.5, color: 'var(--ink-2)', marginTop: 6, lineHeight: 1.5 }}>{ev.notes}</p>}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>Logged by {ev.author}</span>
          {ev.doc && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12.5, fontWeight: 600, color: 'var(--accent-strong)', background: 'var(--accent-softer)', padding: '4px 10px', borderRadius: 'var(--r-pill)' }}><Icon name="doc" style={{ width: 13, height: 13 }} /> {ev.doc.name}</span>}
        </div>
      </div>
    </div>
  );
}

const STATUS_TONE = { Active: ['badge-ok', 'check'], Terminated: ['badge-todo', 'x'], Suspended: ['badge-warn', 'lock'], Pending: ['badge-prog', 'clock'] };
function Row({ k, v }) {
  if (!v) return null;
  return <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, padding: '9px 0', borderBottom: '1px solid var(--line-soft)' }}><span style={{ fontSize: 13, color: 'var(--ink-3)' }}>{k}</span><span style={{ fontSize: 13.5, fontWeight: 600, textAlign: 'right' }}>{v}</span></div>;
}

const REL_FILTERS = ['All', 'Positive', 'Disciplinary', 'Status change'];

function EmployeeRecord({ emp: rawEmp, access, me, canRelations, onBack }) {
  const [emp, setEmp] = useState(() => (typeof mergeEmp === 'function' ? mergeEmp(rawEmp) : rawEmp));
  useEffect(() => { setEmp(typeof mergeEmp === 'function' ? mergeEmp(rawEmp) : rawEmp); }, [rawEmp]);
  const [editing, setEditing] = useState(false);
  const canEdit = access && (access.caps.viewAll || (access.caps.viewTeam && (canRelations != null ? canRelations : access.caps.relations)));
  const showRelations = canRelations != null ? canRelations : (access && access.caps.relations);
  const canSensitive = access && access.caps.viewAll; // HR/admin/leadership see DOB etc.
  const tabs = ['Overview', ...(showRelations ? ['Employee relations'] : []), ...(showRelations ? ['Performance'] : []), 'Documents', 'Offboarding'];
  const [tab, setTab] = useState('Overview');
  const [events, setEvents] = useState(() => {
    const stored = (typeof getRelations === 'function') ? getRelations(emp.id) : [];
    if (stored.length) return stored;
    return [
      { id: 'e2', type: 'transfer', date: '2026-01-10', author: 'HR · People Ops', title: `Home location set to ${emp.loc}`, notes: 'Primary location assigned based on staffing needs.', doc: { name: 'Location_Assignment.pdf' }, ack: 'acknowledged' },
    ];
  });
  useEffect(() => {
    const stored = (typeof getRelations === 'function') ? getRelations(emp.id) : [];
    if (stored.length) setEvents(stored);
  }, [emp.id]);
  const [logging, setLogging] = useState(false);
  const [filter, setFilter] = useState('All');
  const sorted = [...events].sort((a, b) => b.date.localeCompare(a.date));
  const shown = filter === 'All' ? sorted : sorted.filter(e => EVENT_TYPES[e.type].cat === filter);
  const off = (window.HR.offboarding || []).find(o => o.empId === emp.id);
  const [stone, sicon] = STATUS_TONE[emp.status] || STATUS_TONE.Active;

  const docs = [
    ...events.filter(e => e.doc).map(e => ({ name: e.doc.name, kind: EVENT_TYPES[e.type].label, date: e.date })),
    emp.workEmail && { name: 'I-9_Signed.pdf', kind: 'Onboarding · Eligibility', date: emp.startDate || '2025-01-01' },
    emp.provider && { name: 'License_Verification.pdf', kind: 'Credentialing', date: emp.startDate || '2025-01-01' },
    off && { name: 'Offboarding_Record.pdf', kind: 'Offboarding', date: off.effective },
  ].filter(Boolean);

  return (
    <div className="fade-in">
      {editing && <EditRecordModal emp={emp} fields={ADMIN_FIELDS} title="Edit employee record" scope="admin" onSaved={setEmp} onClose={() => setEditing(false)} />}
      {onBack && <button className="btn btn-quiet" onClick={onBack} style={{ marginBottom: 14, marginLeft: -10 }}><Icon name="arrowLeft" /> Back to people</button>}
      {/* header */}
      <div className="card" style={{ padding: 'clamp(18px,3vw,26px)', marginBottom: 'var(--gap)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
          <PhotoAvatar emp={emp} size={64} style={{ background: 'linear-gradient(150deg, var(--teal), var(--accent))' }} />
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, rowGap: 6, flexWrap: 'wrap' }}>
              <h1 style={{ fontSize: 'clamp(21px,2.6vw,26px)', whiteSpace: 'nowrap' }}>{emp.name}</h1>
              <span className={`badge ${stone}`}><Icon name={sicon} /> {emp.status}</span>
              {emp.provider && <span className="badge badge-prog"><Icon name="star" /> Provider</span>}
            </div>
            <p style={{ color: 'var(--ink-2)', fontSize: 14.5, marginTop: 4 }}>{emp.jobTitle} · {emp.department} · {emp.loc}</p>
          </div>
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            {[['Employee ID', emp.id.slice(0, 8)], ['Start date', emp.startDate || '—'], ['Manager', emp.manager || '—']].map(([k, v]) => (
              <div key={k} style={{ whiteSpace: 'nowrap' }}><div style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--ink-3)', fontWeight: 700 }}>{k}</div><div style={{ fontSize: 14, fontWeight: 600, marginTop: 3 }}>{v}</div></div>
            ))}
            {canEdit && <button className="btn btn-ghost" onClick={() => setEditing(true)}><Icon name="pen" /> Edit</button>}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 4, marginBottom: 'var(--gap)', borderBottom: '1px solid var(--line)', flexWrap: 'wrap' }}>
        {tabs.map(tb => (
          <button key={tb} onClick={() => setTab(tb)} style={{ border: 'none', background: 'none', padding: '10px 16px', fontSize: 14, fontWeight: 600, cursor: 'pointer',
            color: tab === tb ? 'var(--accent-strong)' : 'var(--ink-3)', borderBottom: `2px solid ${tab === tb ? 'var(--accent)' : 'transparent'}`, marginBottom: -1 }}>{tb}</button>
        ))}
      </div>

      {tab === 'Overview' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 'var(--gap)' }}>
          <div className="card" style={{ padding: 'var(--pad)' }}>
            <h3 style={{ fontSize: 15, marginBottom: 8 }}>Employment</h3>
            <Row k="Department" v={emp.department} />
            <Row k="Job title" v={emp.jobTitle} />
            <Row k="Location" v={emp.loc} />
            <Row k="Manager" v={emp.manager} />
            <Row k="Start date" v={emp.startDate} />
            <Row k="Orientation" v={emp.orientation} />
            <Row k="Phone ext." v={emp.phoneExt} />
          </div>
          <div className="card" style={{ padding: 'var(--pad)' }}>
            <h3 style={{ fontSize: 15, marginBottom: 8 }}>Contact</h3>
            <Row k="Work email" v={emp.workEmail} />
            <Row k="Mobile" v={emp.mobile} />
            {canSensitive && <Row k="Personal email" v={emp.personalEmail} />}
            {canSensitive && <Row k="Date of birth" v={emp.birthdate} />}
            {!canSensitive && <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 10, display: 'flex', gap: 7, alignItems: 'center' }}><Icon name="lock" style={{ width: 13, height: 13 }} /> Personal details visible to HR only.</div>}
          </div>
          <div className="card" style={{ padding: 'var(--pad)' }}>
            <h3 style={{ fontSize: 15, marginBottom: 8 }}>{emp.provider ? 'Credentials' : 'Systems'}</h3>
            {emp.provider && <>
              <Row k="Provider type" v={emp.providerType} />
              <Row k="License" v={emp.license} />
              <Row k="NPI" v={emp.npi} />
              <Row k="DEA" v={emp.dea} />
            </>}
            <Row k="Account status" v={emp.accountStatus} />
            <Row k="Denticon ID" v={emp.denticonId} />
            <Row k="Windows login" v={emp.windowsLogin} />
            <Row k="Paychex ID" v={emp.paychexId} />
          </div>
        </div>
      )}

      {tab === 'Employee relations' && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 'var(--gap)', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {REL_FILTERS.map(f => (
                <button key={f} onClick={() => setFilter(f)} style={{ border: '1px solid', borderColor: filter === f ? 'var(--accent)' : 'var(--line)', background: filter === f ? 'var(--accent-soft)' : 'var(--surface)', color: filter === f ? 'var(--accent-strong)' : 'var(--ink-2)', borderRadius: 'var(--r-pill)', padding: '6px 14px', fontSize: 13, fontWeight: 600 }}>{f}</button>
              ))}
            </div>
            <button className="btn btn-primary" style={{ marginLeft: 'auto' }} onClick={() => setLogging(l => !l)}><Icon name="plus" /> Log event</button>
          </div>
          {logging && <LogEventForm author={me ? `${me.name} · ${access.label}` : 'You'} onCancel={() => setLogging(false)} onSave={ev => { if (typeof addRelationEvent === 'function') addRelationEvent(emp.id, ev); setEvents(e => [ev, ...e]); setLogging(false); }} />}
          {shown.length === 0 ? <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--ink-3)' }}>No {filter.toLowerCase()} events on file.</div> : <div>{shown.map(ev => <EventCard key={ev.id} ev={ev} />)}</div>}
        </div>
      )}

      {tab === 'Performance' && (() => {
        const recs = (typeof loadReviews === 'function') ? loadReviews() : {};
        const rec = recs[emp.id];
        const st = (typeof reviewStatus === 'function') ? reviewStatus(rec) : 'Not started';
        const avg = (side) => { if (!rec || !rec[side]) return '—'; const v = Object.values(rec[side].ratings || {}); return v.length ? (v.reduce((a, b) => a + b, 0) / v.length).toFixed(1) : '—'; };
        return (
          <div className="card" style={{ padding: 'var(--pad)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
              <span className="badge badge-prog"><Icon name="star" /> Review cycle 2026</span>
              <span className="mono" style={{ fontSize: 12.5, color: 'var(--ink-3)' }}>Status: {st}</span>
            </div>
            <div style={{ display: 'flex', gap: 28, marginBottom: 16 }}>
              <div><div style={{ fontSize: 11, color: 'var(--ink-3)', fontWeight: 700, textTransform: 'uppercase' }}>Self avg</div><div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 26 }}>{avg('self')}</div></div>
              <div><div style={{ fontSize: 11, color: 'var(--ink-3)', fontWeight: 700, textTransform: 'uppercase' }}>Manager avg</div><div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 26 }}>{avg('manager')}</div></div>
            </div>
            {rec && rec.manager && rec.manager.overall && <p style={{ fontSize: 13.5, color: 'var(--ink-2)', lineHeight: 1.5, background: 'var(--surface-2)', padding: '12px 14px', borderRadius: 'var(--r-md)' }}>{rec.manager.overall}</p>}
            <p style={{ fontSize: 12.5, color: 'var(--ink-3)', marginTop: 12, display: 'flex', gap: 7, alignItems: 'center' }}><Icon name="bolt" style={{ width: 13, height: 13 }} /> Complete or edit reviews in the Reviews tab.</p>
          </div>
        );
      })()}

      {tab === 'Documents' && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {docs.length === 0 ? <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink-3)' }}>No documents on file.</div> : docs.map((d, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px var(--pad)', borderTop: i ? '1px solid var(--line-soft)' : 'none' }}>
              <div style={{ width: 38, height: 38, borderRadius: 'var(--r-md)', flex: 'none', display: 'grid', placeItems: 'center', background: 'var(--accent-soft)', color: 'var(--accent-strong)' }}><Icon name="doc" style={{ width: 19, height: 19 }} /></div>
              <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontWeight: 600, fontSize: 14 }}>{d.name}</div><div style={{ fontSize: 12.5, color: 'var(--ink-3)', marginTop: 2 }}>{d.kind}</div></div>
              <span className="mono" style={{ fontSize: 12, color: 'var(--ink-3)' }}>{d.date}</span>
              {access.caps.print && <button className="btn btn-quiet" style={{ padding: '6px 12px', fontSize: 13 }}><Icon name="doc" style={{ width: 15, height: 15 }} /> Print</button>}
            </div>
          ))}
        </div>
      )}

      {tab === 'Offboarding' && (
        off ? (
          <div className="card" style={{ padding: 'var(--pad)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
              <span className="badge badge-warn"><Icon name="bell" /> {off.status || off.termStatus}</span>
              <span className="mono" style={{ fontSize: 12.5, color: 'var(--ink-3)' }}>Effective {off.effective}</span>
            </div>
            <Row k="Requested by" v={off.requestedBy} />
            <Row k="Manager" v={off.manager} />
            <Row k="Resignation letter" v={off.resignationLetter ? 'Received ' + off.resignationLetter : 'Not received'} />
            <Row k="Exit interview" v={off.exitInterview ? 'Completed ' + off.exitInterview : 'Not conducted'} />
            {off.notes && <p style={{ fontSize: 13, color: 'var(--ink-2)', marginTop: 12, lineHeight: 1.5, background: 'var(--surface-2)', padding: '12px 14px', borderRadius: 'var(--r-md)' }}>{off.notes}</p>}
          </div>
        ) : <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--ink-3)' }}>No offboarding record — {emp.first} is currently <b style={{ color: 'var(--ink)' }}>{emp.status}</b>.{access.caps.offboard && <div style={{ marginTop: 14 }}><button className="btn btn-ghost"><Icon name="arrowRight" /> Start offboarding request</button></div>}</div>
      )}
    </div>
  );
}

Object.assign(window, { EmployeeRecord });
