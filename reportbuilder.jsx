/* reportbuilder.jsx — drag-and-drop report builder + Time & Overtime analytics.
   Redefines Reports (loaded after hradmin.jsx so this version wins). Uses globals
   StatCard (dashboard.jsx), BarList (hradmin.jsx), EMPLOYEES, deriveAccess. */

const RB_FIELDS = [
  { id: 'department', label: 'Department' },
  { id: 'loc', label: 'Office' },
  { id: 'status', label: 'Status' },
  { id: 'jobTitle', label: 'Job title' },
  { id: 'provider', label: 'Provider' },
  { id: 'providerType', label: 'Provider type' },
  { id: 'manager', label: 'Manager' },
  { id: 'level', label: 'Access level' },
  { id: 'tenure', label: 'Tenure' },
  { id: 'hireYear', label: 'Hire year' },
  { id: 'accountStatus', label: 'Account status' },
];
const RB_LABEL = Object.fromEntries(RB_FIELDS.map(f => [f.id, f.label]));
function rbVal(e, f) {
  if (f === 'provider') return e.provider ? 'Provider' : 'Non-provider';
  if (f === 'providerType') return e.provider ? (e.providerType || 'Provider') : 'Non-provider';
  if (f === 'manager') return e.manager || '—';
  if (f === 'level') return (typeof deriveAccess === 'function') ? deriveAccess(e).label : '—';
  if (f === 'hireYear') return (e.startDate || '').match(/\d{4}/) ? (e.startDate.match(/\d{4}/)[0]) : '—';
  if (f === 'tenure') return tenureBucket(e);
  if (f === 'accountStatus') return e.accountStatus || 'Complete';
  return e[f] || '—';
}
function tenureBucket(e) {
  const m = (e.startDate || '').match(/(\d{4})/); if (!m) return '—';
  const yrs = new Date().getFullYear() - (+m[1]);
  if (yrs < 1) return '< 1 year';
  if (yrs < 3) return '1–3 years';
  if (yrs < 5) return '3–5 years';
  if (yrs < 10) return '5–10 years';
  return '10+ years';
}
const RB_HUES = [220, 195, 155, 75, 280, 25, 320, 250];

function Zone({ title, hint, fields, onDrop, onRemove, single }) {
  const [over, setOver] = useState(false);
  return (
    <div onDragOver={e => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
      onDrop={e => { e.preventDefault(); setOver(false); const f = e.dataTransfer.getData('text/plain'); if (f) onDrop(f); }}
      style={{ flex: 1, minWidth: 150, border: '1.5px dashed', borderColor: over ? 'var(--accent)' : 'var(--line)', background: over ? 'var(--accent-softer)' : 'var(--surface-2)', borderRadius: 'var(--r-md)', padding: 10, minHeight: 64 }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--ink-3)', marginBottom: 7 }}>{title}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {fields.length === 0 && <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>{hint}</span>}
        {fields.map(f => (
          <span key={f} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--accent)', color: '#fff', borderRadius: 'var(--r-pill)', padding: '4px 6px 4px 11px', fontSize: 12.5, fontWeight: 600 }}>
            {RB_LABEL[f]}<button onClick={() => onRemove(f)} style={{ border: 'none', background: 'oklch(1 0 0 / 0.2)', color: '#fff', borderRadius: '50%', width: 16, height: 16, display: 'grid', placeItems: 'center', cursor: 'pointer' }}><Icon name="x" style={{ width: 9, height: 9 }} /></button>
          </span>
        ))}
      </div>
    </div>
  );
}

function ReportBuilder({ emps, onSchedule, canSchedule }) {
  emps = emps || EMPLOYEES;
  const [rows, setRows] = useState('department');
  const [cols, setCols] = useState(null);
  const [filters, setFilters] = useState([{ field: 'status', value: 'Active' }]);
  const [measure, setMeasure] = useState('count');

  const base = useMemo(() => emps.filter(e => filters.every(f => f.value === 'All' || rbVal(e, f.field) === f.value)), [filters, emps]);
  const colVals = useMemo(() => cols ? Array.from(new Set(base.map(e => rbVal(e, cols)))).sort() : ['Total'], [base, cols]);
  const pivot = useMemo(() => {
    const m = {};
    base.forEach(e => {
      const r = rbVal(e, rows); const c = cols ? rbVal(e, cols) : 'Total';
      m[r] = m[r] || {}; m[r][c] = (m[r][c] || 0) + 1;
    });
    return Object.entries(m).map(([k, v]) => ({ key: k, vals: v, total: Object.values(v).reduce((a, b) => a + b, 0) })).sort((a, b) => b.total - a.total);
  }, [base, rows, cols]);
  const grand = base.length;
  const maxRow = Math.max(1, ...pivot.map(p => p.total));

  const drop = (setter, cur) => (f) => { if (f === rows && setter !== setRows) setRows(null); if (f === cols && setter !== setCols) setCols(null); setter(f); };
  const addFilter = (f) => { if (!filters.some(x => x.field === f)) setFilters([...filters, { field: f, value: 'All' }]); };
  const filterVals = (f) => ['All', ...Array.from(new Set(emps.map(e => rbVal(e, f)))).sort()];

  const fmt = (n) => measure === 'pct' ? (grand ? Math.round(n / grand * 100) + '%' : '0%') : n;

  const exportCsv = () => {
    const head = [RB_LABEL[rows], ...colVals].join(',');
    const body = pivot.map(p => [p.key, ...colVals.map(c => p.vals[c] || 0)].join(',')).join('\n');
    try { const b = new Blob([head + '\n' + body], { type: 'text/csv' }); const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'report.csv'; a.click(); } catch (e) {}
  };

  return (
    <div>
      {/* palette */}
      <div className="card" style={{ padding: 'var(--pad)', marginBottom: 'var(--gap)' }}>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--ink-3)', marginBottom: 10 }}>Data elements — drag into a zone below</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
          {RB_FIELDS.map(f => (
            <span key={f.id} draggable onDragStart={e => e.dataTransfer.setData('text/plain', f.id)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 7, border: '1px solid var(--line)', background: 'var(--surface)', borderRadius: 'var(--r-pill)', padding: '7px 13px', fontSize: 13, fontWeight: 600, cursor: 'grab' }}>
              <Icon name="grid" style={{ width: 13, height: 13, color: 'var(--accent)' }} /> {f.label}
            </span>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Zone title="Group rows by" hint="Drag a field" fields={rows ? [rows] : []} onDrop={drop(setRows)} onRemove={() => setRows(null)} single />
          <Zone title="Break down by (columns)" hint="Optional" fields={cols ? [cols] : []} onDrop={drop(setCols)} onRemove={() => setCols(null)} single />
          <Zone title="Filters" hint="Drag fields to filter" fields={filters.map(f => f.field)} onDrop={addFilter} onRemove={(f) => setFilters(filters.filter(x => x.field !== f))} />
        </div>
        {/* filter value pickers + measure */}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginTop: 14 }}>
          {filters.map(f => (
            <label key={f.field} style={{ fontSize: 12.5, display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 600, color: 'var(--ink-2)' }}>
              {RB_LABEL[f.field]}:
              <select value={f.value} onChange={e => setFilters(filters.map(x => x.field === f.field ? { ...x, value: e.target.value } : x))} style={{ padding: '5px 9px', borderRadius: 'var(--r-sm)', border: '1px solid var(--line)', background: 'var(--surface)', color: 'var(--ink)', fontSize: 12.5, fontFamily: 'var(--font-body)' }}>
                {filterVals(f.field).map(v => <option key={v}>{v}</option>)}
              </select>
            </label>
          ))}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
            <div style={{ display: 'flex', gap: 2, background: 'var(--surface-2)', padding: 3, borderRadius: 'var(--r-pill)' }}>
              {['count', 'pct'].map(m => <button key={m} onClick={() => setMeasure(m)} style={{ border: 'none', borderRadius: 'var(--r-pill)', padding: '5px 12px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', background: measure === m ? 'var(--surface)' : 'transparent', color: measure === m ? 'var(--ink)' : 'var(--ink-3)', boxShadow: measure === m ? 'var(--shadow-sm)' : 'none' }}>{m === 'count' ? 'Count' : '% of total'}</button>)}
            </div>
            <button className="btn btn-ghost" onClick={exportCsv}><Icon name="doc" /> CSV</button>
            {canSchedule && <button className="btn btn-primary" disabled={!rows} onClick={() => onSchedule && onSchedule({ rows, cols, filters, measure })}><Icon name="mail" /> Schedule by email</button>}
          </div>
        </div>
      </div>

      {!rows ? <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--ink-3)' }}>Drag a field into <b>Group rows by</b> to build your report.</div> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.2fr) minmax(0,1fr)', gap: 'var(--gap)', alignItems: 'start' }}>
          {/* chart */}
          <div className="card" style={{ padding: 'var(--pad)' }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 14 }}>{RB_LABEL[rows]} {cols ? `× ${RB_LABEL[cols]}` : ''} · {grand} people</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {pivot.map(p => (
                <div key={p.key}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 4 }}><span style={{ fontWeight: 600 }}>{p.key}</span><span className="mono" style={{ color: 'var(--ink-3)' }}>{fmt(p.total)}</span></div>
                  <div style={{ display: 'flex', height: 9, borderRadius: 99, overflow: 'hidden', background: 'var(--surface-2)', width: (p.total / maxRow * 100) + '%', minWidth: 4 }}>
                    {colVals.map((c, i) => p.vals[c] ? <div key={c} title={`${c}: ${p.vals[c]}`} style={{ width: (p.vals[c] / p.total * 100) + '%', background: `oklch(0.62 0.13 ${RB_HUES[i % RB_HUES.length]})` }} /> : null)}
                  </div>
                </div>
              ))}
            </div>
            {cols && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--line-soft)' }}>
              {colVals.map((c, i) => <span key={c} style={{ fontSize: 11.5, display: 'inline-flex', alignItems: 'center', gap: 5, color: 'var(--ink-2)' }}><span style={{ width: 10, height: 10, borderRadius: 3, background: `oklch(0.62 0.13 ${RB_HUES[i % RB_HUES.length]})` }} /> {c}</span>)}
            </div>}
          </div>
          {/* table */}
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead><tr style={{ background: 'var(--surface-2)' }}>
                  <th style={{ textAlign: 'left', padding: '10px 14px', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--ink-3)' }}>{RB_LABEL[rows]}</th>
                  {colVals.map(c => <th key={c} style={{ textAlign: 'right', padding: '10px 14px', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--ink-3)' }}>{c}</th>)}
                </tr></thead>
                <tbody>
                  {pivot.map((p, i) => (
                    <tr key={p.key} style={{ borderTop: '1px solid var(--line-soft)' }}>
                      <td style={{ padding: '9px 14px', fontWeight: 600 }}>{p.key}</td>
                      {colVals.map(c => <td key={c} className="mono" style={{ padding: '9px 14px', textAlign: 'right' }}>{fmt(p.vals[c] || 0)}</td>)}
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ borderTop: '2px solid var(--line)', background: 'var(--surface-2)' }}>
                    <td style={{ padding: '9px 14px', fontWeight: 700 }}>Total</td>
                    {colVals.map(c => <td key={c} className="mono" style={{ padding: '9px 14px', textAlign: 'right', fontWeight: 700 }}>{fmt(pivot.reduce((a, p) => a + (p.vals[c] || 0), 0))}</td>)}
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- Time & Overtime ---------- */
function hashId(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; }
function schedWorked(e) {
  const h = hashId(e.id);
  const sched = 32 + (h % 7) * 2;            // 32–44
  const delta = (h % 3 === 0) ? (h % 9) : -(h % 5);
  const worked = Math.max(20, Math.min(48, sched + delta));
  return { sched, worked: Math.round(worked * 10) / 10 };
}
function otStatus(worked) { return worked > 40 ? 'over' : worked >= 36 ? 'approaching' : 'ok'; }
function empType(e) { return (hashId(e.id + 'ft') % 10 < 7) ? 'FT' : 'PT'; }
function classFlag(type, worked) { if (type === 'FT' && worked < 35) return 'ft-under'; if (type === 'PT' && worked >= 35) return 'pt-over'; return null; }

function TimeOvertime({ access, emps, paychexOn }) {
  const src = emps || EMPLOYEES;
  const list = useMemo(() => src.filter(e => e.status === 'Active').slice(0, 16).map(e => { const sw = schedWorked(e); const type = empType(e); return { ...e, ...sw, type, flag: classFlag(type, sw.worked) }; }), [src]);
  const [approved, setApproved] = useState({});
  const [posted, setPosted] = useState(false);
  const totSched = list.reduce((a, e) => a + e.sched, 0);
  const totWorked = list.reduce((a, e) => a + e.worked, 0);
  const over = list.filter(e => otStatus(e.worked) === 'over');
  const approaching = list.filter(e => otStatus(e.worked) === 'approaching');
  const ftUnder = list.filter(e => e.flag === 'ft-under');
  const ptOver = list.filter(e => e.flag === 'pt-over');
  const flagged = [...ftUnder, ...ptOver];

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 'var(--gap)', marginBottom: 'var(--gap)' }}>
        <StatCard icon="calendar" label="Scheduled (wk)" value={totSched + 'h'} />
        <StatCard icon="clock" label="Worked (wk)" value={Math.round(totWorked) + 'h'} tone={totWorked > totSched ? 'warn' : 'ok'} />
        <StatCard icon="bell" label="In overtime" value={over.length} tone="warn" sub="over 40h" />
        <StatCard icon="users" label="FT under 35h" value={ftUnder.length} tone={ftUnder.length ? 'warn' : 'ok'} sub="below full-time" />
        <StatCard icon="bolt" label="PT over 35h" value={ptOver.length} tone={ptOver.length ? 'accent' : 'ok'} sub="review status" />
      </div>

      {flagged.length > 0 && (
        <div className="card" style={{ padding: 'var(--pad)', marginBottom: 'var(--gap)', borderColor: 'var(--warn)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <Icon name="bell" style={{ width: 20, height: 20, color: 'oklch(0.55 0.13 60)', flex: 'none' }} />
            <div style={{ flex: 1, minWidth: 180 }}>
              <div style={{ fontWeight: 700, fontSize: 14.5 }}>{flagged.length} classification flag{flagged.length > 1 ? 's' : ''}</div>
              <p style={{ fontSize: 13, color: 'var(--ink-2)', marginTop: 2 }}>{ftUnder.length} full-time staff under 35h · {ptOver.length} part-time staff at/over 35h.</p>
            </div>
            <button className="btn btn-primary" disabled={posted} onClick={() => setPosted(true)}><Icon name="users" /> {posted ? 'Posted to team chat' : 'Notify team chat'}</button>
          </div>
          {posted && (
            <div className="fade-in" style={{ marginTop: 14, border: '1px solid var(--line)', borderRadius: 'var(--r-md)', overflow: 'hidden' }}>
              <div style={{ padding: '8px 14px', background: 'var(--surface-2)', borderBottom: '1px solid var(--line)', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}><Icon name="users" style={{ width: 14, height: 14, color: 'var(--accent)' }} /> Google Chat · # scheduling</div>
              <div style={{ padding: '12px 14px', display: 'flex', gap: 11 }}>
                <div style={{ width: 30, height: 30, borderRadius: '50%', flex: 'none', display: 'grid', placeItems: 'center', background: 'linear-gradient(150deg, var(--accent), var(--accent-strong))', color: '#fff' }}><Icon name="sparkle" style={{ width: 15, height: 15 }} /></div>
                <div style={{ fontSize: 13, color: 'var(--ink)', lineHeight: 1.5 }}>
                  <b>Onboarding Agent</b> <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--accent-strong)', background: 'var(--accent-soft)', borderRadius: 5, padding: '1px 5px' }}>BOT</span><br />
                  ⚠️ <b>Hours classification check</b> — pay period {PP_LABEL}:<br />
                  {ftUnder.length > 0 && <>• <b>Full-time under 35h:</b> {ftUnder.map(e => `${e.first} ${e.last[0]}. (${e.worked}h)`).join(', ')}<br /></>}
                  {ptOver.length > 0 && <>• <b>Part-time at/over 35h:</b> {ptOver.map(e => `${e.first} ${e.last[0]}. (${e.worked}h)`).join(', ')}<br /></>}
                  <span style={{ color: 'var(--ink-2)' }}>Managers, please review hours vs. classification.</span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <div style={{ minWidth: 680 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 0.6fr 0.7fr 0.7fr 1.2fr 1fr', padding: '10px 16px', background: 'var(--surface-2)', borderBottom: '1px solid var(--line)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--ink-3)' }}>
              <div>Employee</div><div>Type</div><div style={{ textAlign: 'right' }}>Sched</div><div style={{ textAlign: 'right' }}>Worked</div><div style={{ textAlign: 'center' }}>Sched vs worked</div><div style={{ textAlign: 'right' }}>Status</div>
            </div>
            {list.map((e, i) => {
              const st = otStatus(e.worked); const variance = Math.round((e.worked - e.sched) * 10) / 10; const max = 48;
              return (
                <div key={e.id} style={{ display: 'grid', gridTemplateColumns: '1.5fr 0.6fr 0.7fr 0.7fr 1.2fr 1fr', padding: '11px 16px', borderTop: i ? '1px solid var(--line-soft)' : 'none', alignItems: 'center', fontSize: 13.5 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                    <PhotoAvatar emp={e} size={30} />
                    <div style={{ minWidth: 0 }}><div style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontSize: 13.5 }}>{e.name}</div><div style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>{e.loc}</div></div>
                  </div>
                  <div><span className={`badge ${e.flag ? 'badge-warn' : 'badge-todo'}`} style={{ fontSize: 10.5 }}>{e.type}</span></div>
                  <div className="mono" style={{ textAlign: 'right' }}>{e.sched}h</div>
                  <div className="mono" style={{ textAlign: 'right', fontWeight: 600 }}>{e.worked}h</div>
                  <div style={{ padding: '0 8px' }}>
                    <div style={{ position: 'relative', height: 8, background: 'var(--surface-2)', borderRadius: 99 }}>
                      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: (e.sched / max * 100) + '%', borderRight: '2px solid var(--ink-3)' }} />
                      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: (e.worked / max * 100) + '%', background: st === 'over' ? 'oklch(0.6 0.16 30)' : st === 'approaching' ? 'oklch(0.7 0.14 75)' : 'var(--accent)', borderRadius: 99, opacity: 0.85 }} />
                    </div>
                    {e.flag ? <div className="mono" style={{ fontSize: 10.5, color: 'oklch(0.55 0.13 60)', marginTop: 3, fontWeight: 600 }}>{e.flag === 'ft-under' ? 'FT under 35h' : 'PT at/over 35h'}</div> : <div className="mono" style={{ fontSize: 10.5, color: 'var(--ink-3)', marginTop: 3 }}>{variance > 0 ? '+' : ''}{variance}h vs sched</div>}
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    {st === 'over'
                      ? (approved[e.id] ? <span className="badge badge-ok"><Icon name="check" /> OT approved</span> : <button className="btn btn-ghost" style={{ padding: '5px 11px', fontSize: 12.5, borderColor: 'var(--warn)' }} onClick={() => setApproved(a => ({ ...a, [e.id]: true }))}><Icon name="bell" /> Approve OT</button>)
                      : st === 'approaching' ? <span className="badge badge-warn"><Icon name="bolt" /> Approaching</span>
                      : <span className="badge badge-ok"><Icon name="check" /> On track</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <p style={{ fontSize: 12.5, color: 'var(--ink-3)', marginTop: 12, display: 'flex', gap: 7, alignItems: 'center', lineHeight: 1.5 }}>
        <Icon name="bolt" style={{ width: 14, height: 14, flex: 'none' }} /> Flags compare each person’s <b>classification</b> (FT/PT) to hours worked: full-time under 35h or part-time at/over 35h are surfaced for review and can be pushed to the team chat. {paychexOn ? <span><b>Worked hours sync live from Paychex.</b></span> : <span><b>Worked hours are estimated</b> until the Paychex integration is enabled.</span>}
      </p>
    </div>
  );
}

/* ---------- Reports shell (overrides hradmin) ---------- */
function Reports({ access, scope, paychexOn, me, flash }) {
  const [tab, setTab] = useState('Builder');
  const [schedFor, setSchedFor] = useState(undefined); // undefined=closed; null/def=open
  const emps = scope || EMPLOYEES; const active = emps.filter(e => e.status === 'Active');
  const canSchedule = !!(access.caps.viewTeam || access.caps.viewAll);
  const TABS = ['Builder', 'Headcount', 'Time & overtime', ...(canSchedule ? ['Scheduled'] : []), 'Requests'];
  const byField = (key) => { const m = {}; active.forEach(e => { const k = e[key] || '—'; m[k] = (m[k] || 0) + 1; }); return Object.entries(m).sort((a, b) => b[1] - a[1]); };
  const openSchedule = (def) => setSchedFor(def || null);
  const saveSchedule = (s) => { const list = (typeof loadSchedules === 'function') ? loadSchedules() : []; const next = [s, ...list]; if (typeof persistSchedules === 'function') persistSchedules(next); setSchedFor(undefined); setTab('Scheduled'); flash && flash('Report scheduled — first delivery set.'); };

  return (
    <div className="fade-in">
      <h1 style={{ fontSize: 'clamp(22px,3vw,28px)', marginBottom: 4 }}>Reports</h1>
      <p style={{ color: 'var(--ink-2)', fontSize: 14.5, marginBottom: 16 }}>Build reports by dragging data elements · live from your HR, scheduling & time data.</p>
      <div style={{ display: 'flex', gap: 4, marginBottom: 'var(--gap)', borderBottom: '1px solid var(--line)', flexWrap: 'wrap' }}>
        {TABS.map(tb => <button key={tb} onClick={() => setTab(tb)} style={{ border: 'none', background: 'none', padding: '10px 16px', fontSize: 14, fontWeight: 600, cursor: 'pointer', color: tab === tb ? 'var(--accent-strong)' : 'var(--ink-3)', borderBottom: `2px solid ${tab === tb ? 'var(--accent)' : 'transparent'}`, marginBottom: -1 }}>{tb}</button>)}
      </div>
      {!access.caps.viewAll && <div style={{ fontSize: 12.5, color: 'var(--accent-strong)', marginBottom: 12, display: 'flex', gap: 7, alignItems: 'center' }}><Icon name="users" style={{ width: 14, height: 14 }} /> Scoped to your team ({active.length} active).</div>}
      {tab === 'Builder' && <ReportBuilder emps={emps} onSchedule={openSchedule} canSchedule={canSchedule} />}
      {tab === 'Headcount' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 'var(--gap)' }}>
          <div className="card" style={{ padding: 'var(--pad)' }}><h3 style={{ fontSize: 15, marginBottom: 14 }}>By department</h3><BarList data={byField('department')} /></div>
          <div className="card" style={{ padding: 'var(--pad)' }}><h3 style={{ fontSize: 15, marginBottom: 14 }}>By office</h3><BarList data={byField('loc')} /></div>
        </div>
      )}
      {tab === 'Time & overtime' && <TimeOvertime access={access} emps={emps} paychexOn={paychexOn} />}
      {tab === 'Scheduled' && <ScheduledReports me={me} access={access} flash={flash} onNew={() => openSchedule(null)} />}
      {tab === 'Requests' && <ReportRequests me={me} access={access} flash={flash} />}
      {schedFor !== undefined && <ScheduleModal def={schedFor} me={me} onClose={() => setSchedFor(undefined)} onSave={saveSchedule} />}
      {!access.caps.payroll && <div style={{ fontSize: 12.5, color: 'var(--ink-3)', marginTop: 16, display: 'flex', gap: 7, alignItems: 'center' }}><Icon name="lock" style={{ width: 14, height: 14 }} /> Compensation reports are restricted to HR, Accounting & Admins.</div>}
    </div>
  );
}

/* ---------- Report requests (mirror of feature requests, scoped to reporting) ---------- */
const RR_STATUSES = ['Submitted', 'Under review', 'Planned', 'Built', 'Declined'];
const RR_TONE = { 'Submitted': 'badge-todo', 'Under review': 'badge-prog', 'Planned': 'badge-prog', 'Built': 'badge-ok', 'Declined': 'badge-todo' };
const RR_SEED = [
  { id: 'rr1', title: 'Monthly hours by provider', desc: 'Worked vs scheduled hours per provider, by location, each month.', freq: 'Monthly', by: 'Zane Marsh', status: 'Planned', votes: 7, ts: Date.now() - 6e8 },
  { id: 'rr2', title: 'New-hire time-to-productive', desc: 'Days from start date to first solo patient / first solo shift.', freq: 'Quarterly', by: 'Tobin Whitaker', status: 'Under review', votes: 4, ts: Date.now() - 3e8 },
  { id: 'rr3', title: 'Overtime by office trend', desc: 'Weekly overtime hours trended by office to spot staffing gaps.', freq: 'Weekly', by: 'Vera Zimmerman', status: 'Submitted', votes: 9, ts: Date.now() - 1e8 },
];
function loadRR() { try { const s = JSON.parse(localStorage.getItem('pd_report_requests')); return s && s.length ? s : RR_SEED; } catch (e) { return RR_SEED; } }
function persistRR(x) { try { localStorage.setItem('pd_report_requests', JSON.stringify(x)); } catch (e) {} }

function ReportRequests({ me, access, flash }) {
  const [items, setItems] = useState(loadRR);
  const [votes, setVotes] = useState(() => { try { return JSON.parse(localStorage.getItem('pd_rr_votes')) || {}; } catch (e) { return {}; } });
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ title: '', desc: '', freq: 'Monthly' });
  const isAdmin = access.caps.manageUsers || access.caps.viewAll;
  const save = (x) => { setItems(x); persistRR(x); };
  const inp = { width: '100%', padding: '10px 12px', borderRadius: 'var(--r-md)', fontSize: 14, border: '1.5px solid var(--line)', background: 'var(--surface)', color: 'var(--ink)', outline: 'none', fontFamily: 'var(--font-body)' };

  const submit = () => { if (!draft.title.trim()) return; const it = { id: 'rr' + Date.now(), title: draft.title.trim(), desc: draft.desc.trim(), freq: draft.freq, by: me ? me.name : 'You', status: 'Submitted', votes: 1, ts: Date.now() }; save([it, ...items]); const nv = { ...votes, [it.id]: 1 }; setVotes(nv); try { localStorage.setItem('pd_rr_votes', JSON.stringify(nv)); } catch (e) {} setAdding(false); setDraft({ title: '', desc: '', freq: 'Monthly' }); flash && flash('Report request submitted.'); };
  const setStatus = (id, status) => save(items.map(i => i.id === id ? { ...i, status } : i));
  const vote = (id) => { if (votes[id]) return; const nv = { ...votes, [id]: 1 }; setVotes(nv); try { localStorage.setItem('pd_rr_votes', JSON.stringify(nv)); } catch (e) {} save(items.map(i => i.id === id ? { ...i, votes: (i.votes || 0) + 1 } : i)); };
  const sorted = items.slice().sort((a, b) => (b.votes || 0) - (a.votes || 0));

  return (
    <div className="fade-in">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        <p style={{ fontSize: 13.5, color: 'var(--ink-2)' }}>Request a new report or data view. Admins triage and build them.</p>
        <button className="btn btn-primary" onClick={() => setAdding(a => !a)}><Icon name="plus" /> Request a report</button>
      </div>
      {adding && (
        <div className="card" style={{ padding: 'var(--pad)', marginBottom: 'var(--gap)', borderColor: 'var(--accent)' }}>
          <input value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })} placeholder="What should the report show?" style={{ ...inp, marginBottom: 10, fontWeight: 600 }} />
          <textarea value={draft.desc} onChange={e => setDraft({ ...draft, desc: e.target.value })} rows={3} placeholder="Which data, grouping, and filters do you need? Who's it for?" style={{ ...inp, resize: 'vertical', lineHeight: 1.5, marginBottom: 10 }} />
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <label style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink-2)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>How often:
              <select value={draft.freq} onChange={e => setDraft({ ...draft, freq: e.target.value })} style={{ ...inp, width: 'auto', appearance: 'auto' }}>{['One-time', 'Weekly', 'Monthly', 'Quarterly'].map(f => <option key={f}>{f}</option>)}</select>
            </label>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
              <button className="btn btn-quiet" onClick={() => setAdding(false)}>Cancel</button>
              <button className="btn btn-primary" disabled={!draft.title.trim()} onClick={submit}><Icon name="check" /> Submit</button>
            </div>
          </div>
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {sorted.map(it => (
          <div key={it.id} className="card" style={{ padding: 'var(--pad)', display: 'flex', alignItems: 'flex-start', gap: 14 }}>
            <button onClick={() => vote(it.id)} disabled={!!votes[it.id]} style={{ flex: 'none', width: 50, padding: '8px 0', borderRadius: 'var(--r-md)', border: '1px solid', borderColor: votes[it.id] ? 'var(--accent)' : 'var(--line)', background: votes[it.id] ? 'var(--accent-soft)' : 'var(--surface)', color: votes[it.id] ? 'var(--accent-strong)' : 'var(--ink-2)', cursor: votes[it.id] ? 'default' : 'pointer', textAlign: 'center' }}>
              <Icon name="chevron" style={{ width: 14, height: 14, transform: 'rotate(-90deg)' }} />
              <div style={{ fontWeight: 700, fontSize: 14 }}>{it.votes || 0}</div>
            </button>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 600, fontSize: 15 }}>{it.title}</span>
                <span className={`badge ${RR_TONE[it.status]}`}>{it.status}</span>
                <span className="badge badge-todo" style={{ fontSize: 10.5 }}>{it.freq}</span>
              </div>
              <p style={{ fontSize: 13.5, color: 'var(--ink-2)', marginTop: 4, lineHeight: 1.45 }}>{it.desc}</p>
              <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 6 }}>Requested by {it.by}</div>
              {isAdmin && (
                <div style={{ marginTop: 12 }}>
                  <select value={it.status} onChange={e => setStatus(it.id, e.target.value)} style={{ ...inp, width: 'auto', padding: '6px 10px', fontSize: 12.5 }}>{RR_STATUSES.map(s => <option key={s}>{s}</option>)}</select>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

Object.assign(window, { Reports, ReportBuilder, TimeOvertime, ReportRequests });
