/* orgeditor.jsx — edit shared org-config reference data: departments, titles, managers.
   All persist to Cosmos (appState/roster-support) via /api/orgconfig — the SAME
   useOrgSection hook Offices uses. Departments & titles are simple {id,name} lists;
   managers is the set of work emails that get manager-level access (this list is an
   explicit override — rbac.jsx also treats anyone with direct reports as a manager). */

const _oeFld = { width: '100%', padding: '10px 12px', borderRadius: 'var(--r-md)', fontSize: 14, border: '1.5px solid var(--line)', background: 'var(--surface)', color: 'var(--ink)', outline: 'none', fontFamily: 'var(--font-body)' };

function OeSaveStatus({ status }) {
  if (status === 'saving') return <span className="mono" style={{ fontSize: 12, color: 'var(--ink-3)' }}>Saving…</span>;
  if (status === 'saved') return <span className="mono" style={{ fontSize: 12, color: 'var(--accent-strong)' }}><Icon name="check" style={{ width: 13, height: 13 }} /> Saved</span>;
  if (status === 'conflict') return <span className="mono" style={{ fontSize: 12, color: 'var(--ink-3)' }}>Reload — changed elsewhere</span>;
  if (status === 'error') return <span className="mono" style={{ fontSize: 12, color: 'var(--ink-3)' }}>Saved locally</span>;
  return null;
}

/* simple {id,name} list editor — used for both departments and titles */
function NameListEditor({ section, singular, canEdit }) {
  const [items, save, status] = useOrgSection(section);
  const [nf, setNf] = useState('');
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState('');

  const exists = (name) => items.some(x => (x.name || '').trim().toLowerCase() === name.toLowerCase());
  const add = () => { const name = nf.trim(); if (!name || exists(name)) return; save([...items, { id: 'new' + Date.now(), name }]); setNf(''); };
  const rename = (id) => { const name = draft.trim(); if (!name) { setEditing(null); return; } save(items.map(x => x.id === id ? { ...x, name } : x)); setEditing(null); };
  const remove = (id) => save(items.filter(x => x.id !== id));

  return (
    <div>
      {canEdit && (
        <div style={{ display: 'flex', gap: 10, marginBottom: 'var(--gap)' }}>
          <input value={nf} onChange={e => setNf(e.target.value)} onKeyDown={e => e.key === 'Enter' && add()} placeholder={`Add ${singular}…`} style={{ ..._oeFld, maxWidth: 340 }} />
          <button className="btn btn-primary" disabled={!nf.trim() || exists(nf.trim())} onClick={add}><Icon name="plus" /> Add</button>
          {exists(nf.trim()) && nf.trim() && <span style={{ alignSelf: 'center', fontSize: 12, color: 'var(--ink-3)' }}>Already exists</span>}
        </div>
      )}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {items.length === 0 && <div style={{ padding: 32, textAlign: 'center', color: 'var(--ink-3)', fontSize: 13.5 }}>No {singular}s yet.</div>}
        {items.map((it, i) => (
          <div key={it.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px var(--pad)', borderTop: i ? '1px solid var(--line-soft)' : 'none' }}>
            {editing === it.id ? (
              <>
                <input autoFocus value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') rename(it.id); if (e.key === 'Escape') setEditing(null); }} style={{ ..._oeFld, flex: 1, padding: '6px 10px' }} />
                <button className="btn btn-primary" style={{ padding: '6px 12px', fontSize: 12.5 }} onClick={() => rename(it.id)}>Save</button>
                <button className="btn btn-ghost" style={{ padding: '6px 12px', fontSize: 12.5 }} onClick={() => setEditing(null)}>Cancel</button>
              </>
            ) : (
              <>
                <span style={{ flex: 1, fontSize: 14, fontWeight: 500 }}>{it.name}</span>
                {canEdit && <button className="btn btn-quiet" style={{ padding: '6px 10px', fontSize: 12.5 }} onClick={() => { setEditing(it.id); setDraft(it.name); }}><Icon name="pen" style={{ width: 14, height: 14 }} /> Rename</button>}
                {canEdit && <button className="btn btn-quiet" style={{ padding: '6px 11px', fontSize: 15, lineHeight: 1, color: 'var(--accent-strong)' }} onClick={() => remove(it.id)} title="Remove">×</button>}
              </>
            )}
          </div>
        ))}
      </div>
      <div style={{ marginTop: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>{items.length} {singular}{items.length === 1 ? '' : 's'}</span>
        <OeSaveStatus status={status} />
      </div>
    </div>
  );
}

/* manager-access editor — toggles which roster people get manager-level access */
function ManagersEditor({ canEdit }) {
  const [managers, save, status] = useOrgSection('managers');
  const [q, setQ] = useState('');
  const mgrEmails = useMemo(() => new Set(managers.map(m => (m.email || '').toLowerCase())), [managers]);
  const people = useMemo(() => EMPLOYEES.filter(e => e.status === 'Active' && e.workEmail).sort((a, b) => (a.name || '').localeCompare(b.name || '')), []);
  const list = people.filter(e => !q || (e.name || '').toLowerCase().includes(q.toLowerCase()) || (e.workEmail || '').toLowerCase().includes(q.toLowerCase()) || (e.jobTitle || '').toLowerCase().includes(q.toLowerCase()));

  const toggle = (e) => {
    if (!canEdit) return;
    const email = (e.workEmail || '').toLowerCase(); if (!email) return;
    if (mgrEmails.has(email)) save(managers.filter(m => (m.email || '').toLowerCase() !== email));
    else save([...managers, { email: e.workEmail, name: e.name }]);
  };

  return (
    <div>
      <div className="card" style={{ padding: '11px 15px', marginBottom: 'var(--gap)', background: 'var(--accent-softer)', fontSize: 12.5, color: 'var(--ink-2)' }}>
        <Icon name="shield" style={{ width: 14, height: 14, verticalAlign: '-2px', color: 'var(--accent-strong)' }} /> People toggled on here get <b>manager-level access</b> (team visibility, scheduling, approvals) even without direct reports. Anyone who already manages a reporting tree is a manager automatically.
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 'var(--gap)' }}>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search name, title, email…" style={{ ..._oeFld, maxWidth: 320, padding: '9px 12px', fontSize: 13 }} />
        <span style={{ fontSize: 12.5, color: 'var(--ink-3)' }}><b style={{ color: 'var(--ink-2)' }}>{mgrEmails.size}</b> with manager access</span>
      </div>
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {list.length === 0 && <div style={{ padding: 32, textAlign: 'center', color: 'var(--ink-3)', fontSize: 13.5 }}>No matching people.</div>}
        {list.map((e, i) => {
          const on = mgrEmails.has((e.workEmail || '').toLowerCase());
          return (
            <div key={e.id || e.workEmail} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px var(--pad)', borderTop: i ? '1px solid var(--line-soft)' : 'none' }}>
              <PhotoAvatar emp={e} size={34} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 13.5 }}>{e.name}</div>
                <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>{e.jobTitle || '—'}{e.loc ? ` · ${e.loc}` : ''}</div>
              </div>
              {on && <span className="badge badge-ok" style={{ fontSize: 10.5 }}>Manager access</span>}
              <Toggle on={on} onClick={() => toggle(e)} disabled={!canEdit} />
            </div>
          );
        })}
      </div>
      <div style={{ marginTop: 10, display: 'flex', justifyContent: 'flex-end' }}><OeSaveStatus status={status} /></div>
    </div>
  );
}

function OrgEditor({ access }) {
  const canEdit = access.caps.manageUsers || access.caps.viewAll;
  const [tab, setTab] = useState('Departments');
  const TABS = ['Departments', 'Titles', 'Managers'];

  return (
    <div className="fade-in">
      <h1 style={{ fontSize: 'clamp(22px,3vw,28px)' }}>Organization</h1>
      <p style={{ color: 'var(--ink-2)', fontSize: 14.5, margin: '6px 0 16px' }}>Departments, job titles, and manager access — shared across the portal and used to scope what each person sees.</p>

      <div style={{ display: 'flex', gap: 4, marginBottom: 'var(--gap)', borderBottom: '1px solid var(--line)' }}>
        {TABS.map(tb => (
          <button key={tb} onClick={() => setTab(tb)} style={{ border: 'none', background: 'none', padding: '10px 16px', fontSize: 14, fontWeight: 600, cursor: 'pointer', color: tab === tb ? 'var(--accent-strong)' : 'var(--ink-3)', borderBottom: `2px solid ${tab === tb ? 'var(--accent)' : 'transparent'}`, marginBottom: -1 }}>{tb}</button>
        ))}
      </div>

      {tab === 'Departments' && <NameListEditor section="departments" singular="department" canEdit={canEdit} />}
      {tab === 'Titles' && <NameListEditor section="titles" singular="title" canEdit={canEdit} />}
      {tab === 'Managers' && <ManagersEditor canEdit={canEdit} />}
    </div>
  );
}

Object.assign(window, { OrgEditor });
