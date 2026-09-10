/* hradmin.jsx — Reports (headcount analytics) + Admin (user permissions). */

function BarList({ data, max }) {
  const m = max || Math.max(...data.map(d => d[1]), 1);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
      {data.map(([k, n]) => (
        <div key={k}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 4 }}><span style={{ fontWeight: 600 }}>{k}</span><span className="mono" style={{ color: 'var(--ink-3)' }}>{n}</span></div>
          <div style={{ height: 7, borderRadius: 99, background: 'var(--surface-2)', overflow: 'hidden' }}><div style={{ height: '100%', width: `${n / m * 100}%`, background: 'var(--accent)', borderRadius: 99 }} /></div>
        </div>
      ))}
    </div>
  );
}

const GROUP_FIELDS = [['department', 'Department'], ['loc', 'Office'], ['status', 'Status'], ['jobTitle', 'Job title'], ['provider', 'Provider']];

function Reports({ access }) {
  const emps = EMPLOYEES;
  const [groupBy, setGroupBy] = useState('department');
  const [statusF, setStatusF] = useState('Active');
  const [provOnly, setProvOnly] = useState(false);

  const rows = useMemo(() => {
    let list = emps;
    if (statusF !== 'All') list = list.filter(e => e.status === statusF);
    if (provOnly) list = list.filter(e => e.provider);
    const m = {};
    list.forEach(e => {
      let k = e[groupBy];
      if (groupBy === 'provider') k = e.provider ? 'Provider' : 'Non-provider';
      k = k || '—';
      m[k] = (m[k] || 0) + 1;
    });
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [emps, groupBy, statusF, provOnly]);

  const total = rows.reduce((a, b) => a + b[1], 0);
  const active = emps.filter(e => e.status === 'Active');
  const offb = window.HR.offboarding || [];
  const term = emps.filter(e => e.status === 'Terminated').length;
  const groupLabel = (GROUP_FIELDS.find(f => f[0] === groupBy) || [])[1];

  const exportCsv = () => {
    const csv = `${groupLabel},Count\n` + rows.map(r => `"${r[0]}",${r[1]}`).join('\n');
    try {
      const blob = new Blob([csv], { type: 'text/csv' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `report-by-${groupBy}.csv`; a.click();
    } catch (e) {}
  };

  const selStyle = { padding: '8px 12px', borderRadius: 'var(--r-md)', border: '1.5px solid var(--line)', background: 'var(--surface)', color: 'var(--ink)', fontSize: 13.5, fontWeight: 600, fontFamily: 'var(--font-body)', cursor: 'pointer', outline: 'none' };

  return (
    <div className="fade-in">
      <h1 style={{ fontSize: 'clamp(22px,3vw,28px)', marginBottom: 4 }}>Reports</h1>
      <p style={{ color: 'var(--ink-2)', fontSize: 14.5, marginBottom: 18 }}>Build headcount & workforce reports live from your HR data.</p>

      <div className="statgrid" style={{ marginBottom: 'var(--gap)' }}>
        <StatCard icon="users" label="Active employees" value={active.length} />
        <StatCard icon="star" label="Providers" value={active.filter(e => e.provider).length} tone="ok" />
        <StatCard icon="building" label="Offices" value={new Set(active.map(e => e.loc)).size} />
        <StatCard icon="bell" label="Separations (all-time)" value={term + offb.length} tone="warn" />
      </div>

      {/* builder */}
      <div className="card" style={{ padding: 'var(--pad)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', marginBottom: 18, paddingBottom: 16, borderBottom: '1px solid var(--line-soft)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink-3)' }}>Group by</span>
            <select value={groupBy} onChange={e => setGroupBy(e.target.value)} style={selStyle}>{GROUP_FIELDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink-3)' }}>Status</span>
            <select value={statusF} onChange={e => setStatusF(e.target.value)} style={selStyle}>{['Active', 'All', 'Terminated', 'Suspended'].map(s => <option key={s}>{s}</option>)}</select>
          </div>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, color: 'var(--ink-2)', cursor: 'pointer' }}>
            <input type="checkbox" checked={provOnly} onChange={e => setProvOnly(e.target.checked)} style={{ width: 16, height: 16, accentColor: 'var(--accent)' }} /> Providers only
          </label>
          <button className="btn btn-ghost" style={{ marginLeft: 'auto' }} onClick={exportCsv}><Icon name="doc" /> Export CSV</button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.3fr) minmax(0,1fr)', gap: 'calc(var(--gap) + 8px)', alignItems: 'start' }}>
          <div>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink-3)', marginBottom: 12 }}>Headcount by {groupLabel.toLowerCase()} · {total} total</div>
            <BarList data={rows} />
          </div>
          <div>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink-3)', marginBottom: 12 }}>Table</div>
            <div style={{ border: '1px solid var(--line)', borderRadius: 'var(--r-md)', overflow: 'hidden' }}>
              {rows.map((r, i) => (
                <div key={r[0]} style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 13px', borderTop: i ? '1px solid var(--line-soft)' : 'none', fontSize: 13.5 }}>
                  <span style={{ fontWeight: 500 }}>{r[0]}</span>
                  <span className="mono" style={{ fontWeight: 600 }}>{r[1]} <span style={{ color: 'var(--ink-3)', fontWeight: 400 }}>· {Math.round(r[1] / total * 100)}%</span></span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {!access.caps.payroll && <div style={{ fontSize: 12.5, color: 'var(--ink-3)', marginTop: 16, display: 'flex', gap: 7, alignItems: 'center' }}><Icon name="lock" style={{ width: 14, height: 14 }} /> Compensation & payroll reports are restricted to HR, Accounting, and Admins.</div>}
    </div>
  );
}

function Toggle({ on, onClick, disabled }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{ width: 38, height: 22, borderRadius: 99, border: 'none', position: 'relative', cursor: disabled ? 'not-allowed' : 'pointer', flex: 'none',
      background: on ? 'var(--accent)' : 'var(--line)', opacity: disabled ? 0.5 : 1, transition: 'background .15s' }}>
      <span style={{ position: 'absolute', top: 2, left: on ? 18 : 2, width: 18, height: 18, borderRadius: '50%', background: '#fff', transition: 'left .15s', boxShadow: 'var(--shadow-sm)' }} />
    </button>
  );
}

const PERM_COLS = [['admin', 'Admin'], ['manager', 'Manager'], ['canPrint', 'Print'], ['canSuspend', 'Suspend'], ['canTerminate', 'Terminate'], ['canDelete', 'Delete']];

const SAVE_LABEL = { saving: 'Saving…', saved: 'Saved', error: 'Save failed — retry', conflict: 'Someone else saved — reload' };

/* The dialogue shown when "See Everyone" is switched on for someone: company-wide
   everywhere, or only on the pages picked here. Pages come from SEE_ALL_PAGES (rbac.jsx),
   which lists only the pages whose contents are scoped by the visible-people list. */
function SeeEveryoneModal({ name, pages, onCancel, onSave }) {
  const ALL = (typeof SEE_ALL_PAGES !== 'undefined' ? SEE_ALL_PAGES : []);
  const [mode, setMode] = useState(pages && pages.length ? 'pages' : 'global');
  const [picked, setPicked] = useState(() => new Set(pages || []));
  const flip = id => setPicked(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const Radio = ({ v, children }) => (
    <button onClick={() => setMode(v)} style={{ display: 'flex', alignItems: 'center', gap: 9, background: 'none', border: 'none', padding: '7px 0', cursor: 'pointer', textAlign: 'left', width: '100%', color: 'var(--ink)' }}>
      <span style={{ width: 16, height: 16, borderRadius: '50%', border: '2px solid', borderColor: mode === v ? 'var(--accent)' : 'var(--line)', display: 'grid', placeItems: 'center', flex: 'none' }}>
        {mode === v && <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)' }} />}
      </span>
      <span style={{ fontSize: 13.5, fontWeight: 600 }}>{children}</span>
    </button>
  );
  return ReactDOM.createPortal((
    <div onClick={onCancel} style={{ position: 'fixed', inset: 0, zIndex: 90, background: 'oklch(0.3 0.03 250 / 0.4)', display: 'grid', placeItems: 'start center', overflowY: 'auto', padding: 20 }}>
      <div className="card fade-in" onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 460, maxHeight: '90vh', overflowY: 'auto', padding: 'clamp(20px,4vw,28px)', boxShadow: 'var(--shadow-lg)' }}>
        <h2 style={{ fontSize: 18 }}>See Everyone</h2>
        <p style={{ color: 'var(--ink-2)', fontSize: 13.5, marginTop: 6 }}>{name} will see every employee, not only their own reports. This changes what they can see — not what they can change.</p>
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 2 }}>Globally? Or only on certain pages:</div>
          <Radio v="global">Globally — every page</Radio>
          <Radio v="pages">Only on certain pages</Radio>
          {mode === 'pages' && (
            <div style={{ marginTop: 8, paddingLeft: 25, display: 'grid', gap: 2 }}>
              {ALL.map(pg => (
                <button key={pg.id} onClick={() => flip(pg.id)} style={{ display: 'flex', alignItems: 'center', gap: 9, background: 'none', border: 'none', padding: '6px 0', cursor: 'pointer', textAlign: 'left', width: '100%', color: 'var(--ink)' }}>
                  <span style={{ width: 16, height: 16, borderRadius: 4, border: '2px solid', borderColor: picked.has(pg.id) ? 'var(--accent)' : 'var(--line)', background: picked.has(pg.id) ? 'var(--accent)' : 'transparent', display: 'grid', placeItems: 'center', flex: 'none' }}>
                    {picked.has(pg.id) && <Icon name="check" style={{ width: 11, height: 11, color: '#fff' }} />}
                  </span>
                  <span style={{ fontSize: 13.5 }}>{pg.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <p style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 14, display: 'flex', gap: 6, alignItems: 'center' }}><Icon name="lock" style={{ width: 13, height: 13, flex: 'none' }} /> The Directory is company-wide for everyone already, so it is not listed here.</p>
        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <button className="btn btn-quiet" style={{ flex: 1, justifyContent: 'center' }} onClick={onCancel}>Cancel</button>
          <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }} disabled={mode === 'pages' && !picked.size} onClick={() => onSave(mode === 'global' ? [] : Array.from(picked))}><Icon name="check" /> Apply</button>
        </div>
      </div>
    </div>
  ), document.body);
}

function AdminUsers({ me, access, flags, flagDefs, onFlag, page = 'security' }) {
  // Permissions live in the dedicated accessControl store (/api/accesscontrol), one
  // doc per person keyed by email. Rows = every active employee, overlaid with their
  // current overrides; saving writes each person you changed to that store.
  const baseRows = useMemo(() => (window.EMPLOYEES || [])
    .filter(e => e.status === 'Active')
    .map(e => ({ first: e.first, last: e.last, email: (e.workEmail || e.email || '') }))
    .filter(r => r.email)
    .sort((a, b) => (a.last || '').localeCompare(b.last || '')), []);
  const [rows, setRows] = useState(baseRows);
  const [saveStatus, setStatus] = useState('idle');
  const [dirty, setDirty] = useState(false);
  /* "See Everyone" is Admin-only — HR and Leadership may open this page to read
     permissions, but the column and its dialogue do not render for them. */
  const canSeeAll = !!(access && access.flags && access.flags.isAdmin);
  const [seeAllRow, setSeeAllRow] = useState(null);   // row index being configured
  const changed = useRef(new Set());

  useEffect(() => {
    if (typeof fetchAccessControl !== 'function') return;
    let cancelled = false;
    fetchAccessControl().then(overrides => {
      if (cancelled) return;
      const byEmail = {}; (overrides || []).forEach(o => { if (o.email) byEmail[o.email.toLowerCase()] = o; });
      setRows(rs => rs.map(r => ({ ...r, ...(byEmail[r.email.toLowerCase()] || {}) })));
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const toggle = (i, col) => {
    setDirty(true);
    setRows(rs => rs.map((r, j) => { if (j !== i) return r; changed.current.add(r.email.toLowerCase()); return { ...r, [col]: !r[col] }; }));
  };
  /* Switching See Everyone ON asks global-or-pages first; switching it OFF clears both. */
  const toggleSeeAll = (i) => {
    if (rows[i].seeAll) {
      setDirty(true);
      setRows(rs => rs.map((r, j) => { if (j !== i) return r; changed.current.add(r.email.toLowerCase()); return { ...r, seeAll: false, seeAllPages: [] }; }));
    } else setSeeAllRow(i);
  };
  const applySeeAll = (pages) => {
    const i = seeAllRow;
    setDirty(true);
    setRows(rs => rs.map((r, j) => { if (j !== i) return r; changed.current.add(r.email.toLowerCase()); return { ...r, seeAll: true, seeAllPages: pages }; }));
    setSeeAllRow(null);
  };

  const save = async () => {
    if (typeof saveAccessOverride !== 'function') { setStatus('error'); return; }
    setStatus('saving');
    try {
      const toSave = rows.filter(r => changed.current.has(r.email.toLowerCase()));
      for (const r of toSave) {
        await saveAccessOverride({ email: r.email, admin: !!r.admin, manager: !!r.manager, canPrint: !!r.canPrint, canSuspend: !!r.canSuspend, canTerminate: !!r.canTerminate, canDelete: !!r.canDelete, seeAll: !!r.seeAll, seeAllPages: r.seeAllPages || [] });
      }
      changed.current.clear();
      setStatus('saved'); setDirty(false);
      setTimeout(() => setStatus(s => (s === 'saved' ? 'idle' : s)), 1600);
    } catch (e) { setStatus('error'); }
  };
  const groups = flagDefs ? [...new Set(flagDefs.map(f => f.group))] : [];
  const COLS = `220px repeat(${PERM_COLS.length + (canSeeAll ? 1 : 0)}, 1fr)`;

  return (
    <div className="fade-in">
      <h1 style={{ fontSize: 'clamp(22px,3vw,28px)', marginBottom: 4 }}>{page === 'modules' ? 'Modules' : 'Permissions'}</h1>
      <p style={{ color: 'var(--ink-2)', fontSize: 14.5, marginBottom: 16 }}>{page === 'modules' ? 'Phased feature rollout — turn modules on or off.' : 'User access and permissions.'}</p>

      {page === 'modules' && flagDefs && (
        <div>
          <p style={{ fontSize: 13.5, color: 'var(--ink-2)', marginBottom: 16 }}>Turn modules on or off to phase your rollout. Disabled features disappear from everyone’s navigation until you switch them on.</p>
          {groups.map(g => (
            <div key={g} style={{ marginBottom: 18 }}>
              <div style={{ fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--ink-3)', marginBottom: 10 }}>{g}</div>
              <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                {flagDefs.filter(f => f.group === g).map((f, i) => (
                  <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px var(--pad)', borderTop: i ? '1px solid var(--line-soft)' : 'none' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: 14, display: 'flex', alignItems: 'center', gap: 8 }}>{f.label}{f.id === 'paychex' && (flags[f.id] === false) && <span className="badge badge-warn">Phase 2</span>}</div>
                      {f.note && <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 2 }}>{f.note}</div>}
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 600, color: flags[f.id] !== false ? 'var(--ok)' : 'var(--ink-3)' }}>{flags[f.id] !== false ? 'Live' : 'Off'}</span>
                    <Toggle on={flags[f.id] !== false} onClick={() => onFlag(f.id, flags[f.id] === false)} />
                  </div>
                ))}
              </div>
            </div>
          ))}
          <div style={{ fontSize: 12.5, color: 'var(--ink-3)', display: 'flex', gap: 7, alignItems: 'center' }}><Icon name="bolt" style={{ width: 14, height: 14, color: 'var(--accent)' }} /> Changes apply instantly for every user. Paychex-dependent actions stay hidden until the integration is enabled.</div>
        </div>
      )}

      {page === 'security' && (
      <div>
      {seeAllRow != null && (
        <SeeEveryoneModal
          name={`${rows[seeAllRow].first} ${rows[seeAllRow].last}`.trim() || rows[seeAllRow].email}
          pages={rows[seeAllRow].seeAllPages || []}
          onCancel={() => setSeeAllRow(null)}
          onSave={applySeeAll} />
      )}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <div style={{ minWidth: canSeeAll ? 830 : 720 }}>
            <div style={{ display: 'grid', gridTemplateColumns: COLS, padding: '12px var(--pad)', borderBottom: '1px solid var(--line)', background: 'var(--surface-2)', fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--ink-3)' }}>
              <div>User</div>
              {PERM_COLS.map(([k, l]) => <div key={k} style={{ textAlign: 'center' }}>{l}</div>)}
              {canSeeAll && <div style={{ textAlign: 'center' }}>See Everyone</div>}
            </div>
            {rows.map((u, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: COLS, padding: '12px var(--pad)', borderBottom: i < rows.length - 1 ? '1px solid var(--line-soft)' : 'none', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Avatar name={`${u.first} ${u.last}`} size={32} />
                  <div style={{ minWidth: 0 }}><div style={{ fontWeight: 600, fontSize: 13.5 }}>{u.first} {u.last}</div><div className="mono" style={{ fontSize: 11, color: 'var(--ink-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.email}</div></div>
                </div>
                {PERM_COLS.map(([k]) => <div key={k} style={{ display: 'grid', placeItems: 'center' }}><Toggle on={!!u[k]} onClick={() => toggle(i, k)} /></div>)}
                {canSeeAll && (
                  <div style={{ display: 'grid', placeItems: 'center', gap: 3 }}>
                    <Toggle on={!!u.seeAll} onClick={() => toggleSeeAll(i)} />
                    {u.seeAll && (
                      <button onClick={() => setSeeAllRow(i)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 10.5, fontWeight: 600, color: 'var(--accent-strong)' }}>
                        {(u.seeAllPages && u.seeAllPages.length) ? `${u.seeAllPages.length} page${u.seeAllPages.length > 1 ? 's' : ''}` : 'Globally'}
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12.5, color: 'var(--ink-3)', display: 'flex', alignItems: 'center', gap: 7 }}><Icon name="shield" style={{ width: 14, height: 14, color: 'var(--accent)' }} /> Changes are logged. Only Admins can grant Delete.</span>
        {saveStatus !== 'idle' && saveStatus !== 'saved' && <span style={{ fontSize: 12.5, fontWeight: 600, color: saveStatus === 'conflict' || saveStatus === 'error' ? 'var(--danger)' : 'var(--ink-3)' }}>{SAVE_LABEL[saveStatus]}</span>}
        {saveStatus === 'saved' && !dirty && <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ok)', display: 'inline-flex', alignItems: 'center', gap: 5 }}><Icon name="check" style={{ width: 13, height: 13 }} /> Saved</span>}
        <button className="btn btn-primary" style={{ marginLeft: 'auto' }} onClick={save} disabled={saveStatus === 'saving' || !dirty}><Icon name="check" /> {saveStatus === 'saving' ? 'Saving…' : 'Save changes'}</button>
      </div>
      </div>
      )}
    </div>
  );
}

Object.assign(window, { Reports, AdminUsers, Toggle, SeeEveryoneModal });
