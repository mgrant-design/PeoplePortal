/* directory.jsx — People directory. Contact + role for everyone; full records gated to managers+. */

function Pill({ active, onClick, children }) {
  return (
    <button onClick={onClick} style={{ border: '1px solid', borderColor: active ? 'var(--accent)' : 'var(--line)', background: active ? 'var(--accent-soft)' : 'var(--surface)',
      color: active ? 'var(--accent-strong)' : 'var(--ink-2)', borderRadius: 'var(--r-pill)', padding: '6px 13px', fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap' }}>{children}</button>
  );
}

function ContactCard({ emp, onClose, canRecord, onRecord }) {
  const DRow = ({ k, v, href }) => {
    if (!v) return null;
    const inner = <><span style={{ fontSize: 12.5, color: 'var(--ink-3)' }}>{k}</span><span style={{ fontSize: 13.5, fontWeight: 600, textAlign: 'right', wordBreak: 'break-word' }}>{v}</span></>;
    return href
      ? <a href={href} style={{ display: 'flex', justifyContent: 'space-between', gap: 16, padding: '9px 0', borderBottom: '1px solid var(--line-soft)', textDecoration: 'none', color: 'var(--accent-strong)' }}>{inner}</a>
      : <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, padding: '9px 0', borderBottom: '1px solid var(--line-soft)' }}>{inner}</div>;
  };
  return ReactDOM.createPortal((
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'oklch(0.3 0.03 250 / 0.4)', display: 'grid', placeItems: 'start center', overflowY: 'auto', padding: 20 }}>
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
          {canRecord && <DRow k="Personal email" v={emp.personalEmail} href={emp.personalEmail ? `mailto:${emp.personalEmail}` : null} />}
        </div>

        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--ink-3)', marginBottom: 2 }}>Employment</div>
          <DRow k="Location" v={emp.loc} />
          <DRow k="Department" v={emp.department} />
          <DRow k="Manager" v={emp.manager} />
          <DRow k="Start date" v={emp.startDate} />
          {canRecord && <DRow k="Date of birth" v={PD_ACCESS_RULES.birthdayLabel(emp.birthdate)} />}
        </div>

        <p style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 14, display: 'flex', gap: 6, alignItems: 'center' }}><Icon name="lock" style={{ width: 13, height: 13, flex: 'none' }} /> {canRecord ? 'Personal details visible to HR & managers.' : 'Work contact only — personal details are private.'}</p>
        {canRecord && <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', marginTop: 12 }} onClick={() => { onClose(); onRecord(emp); }}><Icon name="doc" /> View record</button>}
      </div>
    </div>
  ), document.body);
}

/* ---- Directory logic with no screen parts ---- */
/* who can be ticked for deactivating: anyone still on staff, other than yourself */
function canDeactivate(emp, me) { return !!emp && emp.status !== 'Terminated' && emp.id !== (me && me.id); }
/* Sets each person to Terminated through the roster save, one after another, with the one
   signature and reason. A refused save is reported and the rest still go. */
async function deactivatePeople(list, { signature, reason }, save) {
  const done = [], failed = [];
  for (const emp of list) {
    try { const saved = await save({ action: 'update', id: emp.id, patch: { status: 'Terminated' }, signature, reason }); done.push({ ...emp, ...saved, status: 'Terminated' }); }
    catch (e) { failed.push({ id: emp.id, name: emp.name, message: (e && e.message) || 'Not saved' }); }
  }
  return { done, failed };
}
/* ---- end of Directory logic ---- */

/* the confirmation for deactivating the ticked people: their names, one signature, one reason */
function DeactivateModal({ chosen, me, onDone, onClose }) {
  const [signature, setSignature] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState([]);
  const myName = (me && `${me.first || ''} ${me.last || ''}`.trim()) || '';
  // the same comparison the single-person signature uses (editrecord.jsx), so accents and spacing don't matter
  const fold = (x) => (typeof foldNameClient === 'function' ? foldNameClient(x) : String(x || '').toLowerCase().replace(/[^a-z0-9]/g, ''));
  const signOk = !!signature.trim() && (!myName || fold(signature) === fold(myName));
  const inp = { width: '100%', padding: '10px 12px', borderRadius: 'var(--r-md)', fontSize: 14, border: '1.5px solid var(--line)', background: 'var(--surface)', color: 'var(--ink)', outline: 'none' };
  const go = async () => {
    if (!signOk || busy) return;
    setBusy(true);
    const out = await deactivatePeople(chosen, { signature: signature.trim(), reason: reason.trim() }, saveEmpRecord);
    out.done.forEach(e => { if (typeof applyEmpToRoster === 'function') applyEmpToRoster(e); });
    onDone(out);
    setBusy(false);
    if (out.failed.length) setFailed(out.failed); else onClose();
  };
  return ReactDOM.createPortal((
    <div onClick={busy ? undefined : onClose} style={{ position: 'fixed', inset: 0, zIndex: 90, background: 'oklch(0.3 0.03 250 / 0.45)', display: 'grid', placeItems: 'start center', overflowY: 'auto', padding: 20 }}>
      <div className="card fade-in" onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 520, padding: 'clamp(20px,4vw,28px)', boxShadow: 'var(--shadow-lg)' }}>
        {failed.length > 0 ? (
          <>
            <h2 style={{ fontSize: 18, marginBottom: 12 }}>{failed.length} not deactivated</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
              {failed.map(f => <div key={f.id} style={{ fontSize: 13.5 }}><b>{f.name}</b> <span style={{ color: 'var(--danger)' }}>{f.message}</span></div>)}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}><button className="btn btn-primary" onClick={onClose}>Close</button></div>
          </>
        ) : (
          <>
            <h2 style={{ fontSize: 18, marginBottom: 12 }}>Deactivate {chosen.length} {chosen.length === 1 ? 'person' : 'people'}?</h2>
            <div style={{ maxHeight: 220, overflowY: 'auto', border: '1px solid var(--line)', borderRadius: 'var(--r-md)', marginBottom: 14 }}>
              {chosen.map((e, i) => (
                <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderTop: i ? '1px solid var(--line-soft)' : 'none' }}>
                  <PhotoAvatar emp={e} size={28} />
                  <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontWeight: 600, fontSize: 13.5 }}>{e.name}</div><div style={{ fontSize: 12, color: 'var(--ink-3)' }}>{[e.jobTitle, e.loc].filter(Boolean).join(' · ')}</div></div>
                </div>
              ))}
            </div>
            <label style={{ display: 'block', marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--ink-3)', marginBottom: 5 }}>Sign your name{myName ? ` — type “${myName}”` : ''}</div>
              <input autoFocus value={signature} onChange={e => setSignature(e.target.value)} placeholder={myName || 'Your full name'} style={{ ...inp, fontFamily: 'var(--font-display)', fontSize: 16 }} />
            </label>
            <label style={{ display: 'block', marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--ink-3)', marginBottom: 5 }}>Reason</div>
              <textarea value={reason} onChange={e => setReason(e.target.value.slice(0, 1000))} rows="2" style={{ ...inp, resize: 'vertical', fontFamily: 'inherit' }} />
            </label>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button className="btn btn-ghost" disabled={busy} onClick={onClose}>Cancel</button>
              <button className="btn btn-primary" disabled={!signOk || busy} style={signOk && !busy ? { background: 'oklch(0.55 0.17 25)', borderColor: 'transparent' } : undefined} onClick={go}>
                {busy ? 'Deactivating…' : 'Deactivate'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  ), document.body);
}

function Directory({ employees, access, me, onRecord, canRecord, canSeeInactive, title }) {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('Active');
  const [office, setOffice] = useState('All');
  const [dept, setDept] = useState('All');
  const [card, setCard] = useState(null);
  const [adding, setAdding] = useState(false);
  /* Someone added here is pushed into EMPLOYEES immediately, but `employees` arrives as a
     prop from a parent that won't have re-rendered yet — so hold them locally too and let
     the duplicate filter drop them once the parent catches up. */
  const [justAdded, setJustAdded] = useState([]);
  /* deactivating several people: tick them, then confirm once */
  const canBulk = !!(access && access.caps && access.caps.terminate);
  const [picking, setPicking] = useState(false);
  const [picked, setPicked] = useState({});        // id → true
  const [confirming, setConfirming] = useState(false);
  const [left, setLeft] = useState({});            // id → true, deactivated here just now
  const showStatusFilter = !!canSeeInactive;
  const fl = (access && access.flags) || {};
  const canAdd = !!(fl.isAdmin || fl.isHR || fl.isExec || fl.isManager);   // same as the server's canWrite

  const people = useMemo(
    () => [...employees, ...justAdded.filter(x => !employees.some(e => e.id === x.id))].map(e => (left[e.id] ? { ...e, status: 'Terminated' } : e)),
    [employees, justAdded, left]);

  const offices = useMemo(() => ['All', ...Array.from(new Set(people.map(e => e.loc))).sort()], [people]);
  const depts = useMemo(() => ['All', ...Array.from(new Set(people.map(e => e.department).filter(Boolean))).sort()], [people]);

  const filtered = people.filter(e => {
    const st = showStatusFilter ? status : 'Active';
    if (st !== 'All' && e.status !== st) return false;
    if (office !== 'All' && e.loc !== office) return false;
    if (dept !== 'All' && e.department !== dept) return false;
    if (q) { const s = q.toLowerCase(); if (!(`${e.name} ${e.jobTitle} ${e.department} ${e.workEmail}`.toLowerCase().includes(s))) return false; }
    return true;
  }).sort((a, b) => a.last.localeCompare(b.last));

  const activeCount = people.filter(e => e.status === 'Active').length;
  const provCount = people.filter(e => e.provider && e.status === 'Active').length;
  const chosen = people.filter(e => picked[e.id] && canDeactivate(e, me));
  const handleOpen = (e) => {
    if (!picking) return setCard(e);
    if (canDeactivate(e, me)) setPicked(p => ({ ...p, [e.id]: !p[e.id] }));
  };
  const stopPicking = () => { setPicking(false); setPicked({}); };

  return (
    <div className="fade-in">
      {card && <ContactCard emp={card} onClose={() => setCard(null)} canRecord={canRecord && canRecord(card)} onRecord={onRecord} />}
      {confirming && <DeactivateModal chosen={chosen} me={me} onClose={() => setConfirming(false)}
        onDone={(out) => { setLeft(l => { const n = { ...l }; out.done.forEach(e => { n[e.id] = true; }); return n; }); setPicked({}); if (!out.failed.length) setPicking(false); }} />}
      {adding && <AddEmployeeModal offices={offices.filter(o => o !== 'All')} onCreated={p => setJustAdded(l => [...l, p])} onClose={() => setAdding(false)} />}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 18 }}>
        <div>
          <h1 style={{ fontSize: 'clamp(22px,3vw,28px)' }}>{title || 'People'}</h1>
          <p style={{ color: 'var(--ink-2)', fontSize: 14.5, marginTop: 6 }}>Company directory · {activeCount} active · {provCount} providers</p>
        </div>
        {canAdd && (
          <button className="btn btn-primary" onClick={() => setAdding(true)}>
            <Icon name="plus" /> Add person
          </button>
        )}
        {canBulk && !picking && <button className="btn btn-ghost" onClick={() => setPicking(true)}>Deactivate</button>}
        {canBulk && picking && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="mono" style={{ fontSize: 12.5, color: 'var(--ink-3)' }}>{chosen.length} selected</span>
            <button className="btn btn-primary" disabled={!chosen.length} onClick={() => setConfirming(true)}>Deactivate</button>
            <button className="btn btn-ghost" onClick={stopPicking}>Cancel</button>
          </div>
        )}
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
              {picking && <input type="checkbox" readOnly tabIndex={-1} aria-hidden="true" checked={!!picked[e.id] && canDeactivate(e, me)} style={{ width: 17, height: 17, flex: 'none', accentColor: 'var(--accent)', pointerEvents: 'none', opacity: canDeactivate(e, me) ? 1 : 0.3 }} />}
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

Object.assign(window, { Directory, ContactCard, canDeactivate, deactivatePeople });
