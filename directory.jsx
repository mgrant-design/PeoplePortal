/* directory.jsx — People directory. Contact + role for everyone; full records gated to managers+. */

function Pill({ active, onClick, children }) {
  return (
    <button onClick={onClick} style={{ border: '1px solid', borderColor: active ? 'var(--accent)' : 'var(--line)', background: active ? 'var(--accent-soft)' : 'var(--surface)',
      color: active ? 'var(--accent-strong)' : 'var(--ink-2)', borderRadius: 'var(--r-pill)', padding: '6px 13px', fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap' }}>{children}</button>
  );
}

function ContactCard({ emp, onClose, canRecord, onRecord, sensitive }) {
  const DRow = ({ k, v, href }) => {
    if (!v) return null;
    const inner = <><span style={{ fontSize: 12.5, color: 'var(--ink-3)' }}>{k}</span><span style={{ fontSize: 13.5, fontWeight: 600, textAlign: 'right', wordBreak: 'break-word' }}>{v}</span></>;
    return href
      ? <a href={href} style={{ display: 'flex', justifyContent: 'space-between', gap: 16, padding: '9px 0', borderBottom: '1px solid var(--line-soft)', textDecoration: 'none', color: 'var(--accent-strong)' }}>{inner}</a>
      : <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, padding: '9px 0', borderBottom: '1px solid var(--line-soft)' }}>{inner}</div>;
  };
  return ReactDOM.createPortal((
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'oklch(0.3 0.03 250 / 0.4)', display: 'grid', placeItems: 'center', padding: 20 }}>
      <div className="card fade-in" onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 400, maxHeight: '90vh', overflowY: 'auto', padding: 'clamp(20px,4vw,28px)', boxShadow: 'var(--shadow-lg)' }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: -10 }}><button className="btn btn-quiet" style={{ padding: 7 }} onClick={onClose}><Icon name="x" /></button></div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 4 }}>
          <PhotoAvatar emp={emp} size={88} style={{ background: 'linear-gradient(150deg, var(--teal), var(--accent))' }} />
          <h2 style={{ fontSize: 20, marginTop: 8 }}>{emp.name}</h2>
          <p style={{ color: 'var(--ink-2)', fontSize: 14 }}>{emp.jobTitle}</p>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'center', marginTop: 4 }}>
            <span className="badge badge-todo"><Icon name="pin" /> {emp.loc}</span>
            <span className="badge badge-todo">{emp.department}</span>
            {emp.provider && <span className="badge badge-prog"><Icon name="star" /> Provider</span>}
          </div>
        </div>

        <div style={{ marginTop: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--ink-3)', marginBottom: 2 }}>Contact</div>
          <DRow k="Work email" v={emp.workEmail} href={emp.workEmail ? `mailto:${emp.workEmail}` : null} />
          {emp.phoneExt && emp.phoneExt !== 'N/A' && <DRow k="Phone ext." v={`Ext. ${emp.phoneExt}`} />}
          {canRecord && emp.mobile && <DRow k="Mobile" v={emp.mobile} href={`tel:${emp.mobile}`} />}
          {sensitive && <DRow k="Personal email" v={emp.personalEmail} href={emp.personalEmail ? `mailto:${emp.personalEmail}` : null} />}
        </div>

        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--ink-3)', marginBottom: 2 }}>Employment</div>
          <DRow k="Location" v={emp.loc} />
          <DRow k="Department" v={emp.department} />
          <DRow k="Manager" v={emp.manager} />
          <DRow k="Start date" v={emp.startDate} />
          {sensitive && <DRow k="Date of birth" v={emp.birthdate} />}
        </div>

        <p style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 14, display: 'flex', gap: 6, alignItems: 'center' }}><Icon name="lock" style={{ width: 13, height: 13, flex: 'none' }} /> {canRecord ? 'Personal details visible to HR & managers.' : 'Work contact only — personal details are private.'}</p>
        {canRecord && <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', marginTop: 12 }} onClick={() => { onClose(); onRecord(emp); }}><Icon name="doc" /> View full record</button>}
      </div>
    </div>
  ), document.body);
}

function Directory({ employees, access, onRecord, canRecord, canSeeInactive, title }) {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('Active');
  const [office, setOffice] = useState('All');
  const [dept, setDept] = useState('All');
  const [card, setCard] = useState(null);
  const showStatusFilter = !!canSeeInactive;

  const offices = useMemo(() => ['All', ...Array.from(new Set(employees.map(e => e.loc))).sort()], [employees]);
  const depts = useMemo(() => ['All', ...Array.from(new Set(employees.map(e => e.department).filter(Boolean))).sort()], [employees]);

  const filtered = employees.filter(e => {
    const st = showStatusFilter ? status : 'Active';
    if (st !== 'All' && e.status !== st) return false;
    if (office !== 'All' && e.loc !== office) return false;
    if (dept !== 'All' && e.department !== dept) return false;
    if (q) { const s = q.toLowerCase(); if (!(`${e.name} ${e.jobTitle} ${e.department} ${e.workEmail}`.toLowerCase().includes(s))) return false; }
    return true;
  }).sort((a, b) => a.last.localeCompare(b.last));

  const activeCount = employees.filter(e => e.status === 'Active').length;
  const provCount = employees.filter(e => e.provider && e.status === 'Active').length;
  const handleOpen = (e) => setCard(e);

  return (
    <div className="fade-in">
      {card && <ContactCard emp={card} onClose={() => setCard(null)} canRecord={canRecord && canRecord(card)} sensitive={access && access.caps && access.caps.viewAll} onRecord={onRecord} />}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 18 }}>
        <div>
          <h1 style={{ fontSize: 'clamp(22px,3vw,28px)' }}>{title || 'People'}</h1>
          <p style={{ color: 'var(--ink-2)', fontSize: 14.5, marginTop: 6 }}>Company directory · {activeCount} active · {provCount} providers</p>
        </div>
        <div style={{ position: 'relative', minWidth: 240 }}>
          <Icon name="users" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', width: 16, height: 16, color: 'var(--ink-3)' }} />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search name, title, email…"
            style={{ width: '100%', padding: '10px 12px 10px 36px', borderRadius: 'var(--r-pill)', fontSize: 14, border: '1.5px solid var(--line)', background: 'var(--surface)', color: 'var(--ink)', outline: 'none' }} />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16, alignItems: 'center' }}>
        {showStatusFilter && ['Active', 'All', 'Terminated', 'Suspended'].map(s => <Pill key={s} active={status === s} onClick={() => setStatus(s)}>{s}</Pill>)}
        {showStatusFilter && <div style={{ width: 1, height: 22, background: 'var(--line)', margin: '0 4px' }} />}
        <select value={office} onChange={e => setOffice(e.target.value)} className="dir-select">{offices.map(o => <option key={o}>{o === 'All' ? 'All offices' : o}</option>)}</select>
        <select value={dept} onChange={e => setDept(e.target.value)} className="dir-select">{depts.map(d => <option key={d}>{d === 'All' ? 'All departments' : d}</option>)}</select>
        <span className="mono" style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--ink-3)' }}>{filtered.length} shown</span>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {filtered.length === 0 && <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink-3)' }}>No people match your filters.</div>}
        {filtered.map((e, i) => {
          const [stone, sicon] = ({ Active: ['badge-ok', 'check'], Terminated: ['badge-todo', 'x'], Suspended: ['badge-warn', 'lock'] }[e.status]) || ['badge-todo', 'check'];
          return (
            <button key={e.id} onClick={() => handleOpen(e)} style={{ width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 14, padding: '11px var(--pad)', border: 'none', borderTop: i ? '1px solid var(--line-soft)' : 'none', background: 'var(--surface)', cursor: 'pointer', transition: 'background .12s' }}
              onMouseEnter={ev => ev.currentTarget.style.background = 'var(--surface-2)'} onMouseLeave={ev => ev.currentTarget.style.background = 'var(--surface)'}>
              <PhotoAvatar emp={e} size={40} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
                  <span style={{ fontWeight: 600, fontSize: 14.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.name}</span>
                  {e.provider && <Icon name="star" style={{ width: 13, height: 13, color: 'var(--accent)', flex: 'none' }} />}
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--ink-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.workEmail || e.jobTitle || '—'}</div>
              </div>
              <div style={{ flex: 'none', width: 130, fontSize: 13, color: 'var(--ink-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} className="dir-dept">{e.jobTitle}</div>
              <div style={{ flex: 'none', width: 110, fontSize: 13, color: 'var(--ink-2)' }} className="dir-loc">{e.loc}</div>
              {showStatusFilter && <span className={`badge ${stone}`} style={{ flex: 'none' }}><Icon name={sicon} /> {e.status}</span>}
              <Icon name="chevron" style={{ width: 16, height: 16, color: 'var(--ink-3)', flex: 'none' }} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

Object.assign(window, { Directory, ContactCard });
