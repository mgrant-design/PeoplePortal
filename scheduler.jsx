/* scheduler.jsx — schedule builder (full rewrite per SCHEDULER.md).
   Click-to-edit only (D9). Weekly grid, any week (past/future). Shift form has
   presets AND typed times (D10). Everyone on the office roster appears (D11);
   the by-Department view groups on the employee record's department field.
   Publishing locks per office, per week (D5). Supervisor edits to a published
   week queue for manager approval; the server decides, never the client.
   No wages (D2), no coverage targets (D12), no drag-and-drop, no auto-fill. */

const SCHED_VIEWS = [['person', 'By team member'], ['dept', 'By department']];

function schedOffices() {
  const out = [];
  (typeof EMPLOYEES !== 'undefined' ? EMPLOYEES : []).forEach(e => {
    if (e.status !== 'Active') return;
    const l = e.loc || e.location;
    if (l && l !== 'Unassigned' && !out.includes(l)) out.push(l);
  });
  return out.sort();
}
function officeRoster(office) {
  return (typeof EMPLOYEES !== 'undefined' ? EMPLOYEES : [])
    .filter(e => e.status === 'Active' && (e.loc || e.location) === office)
    .map(e => ({ id: e.id, name: e.name, dept: e.department || 'Unassigned', office }));
}
const deptHue = (() => { const cache = {}; let i = 0; const hues = [220, 155, 280, 75, 195, 25, 320, 110]; return d => (d in cache ? cache[d] : (cache[d] = hues[i++ % hues.length])); })();

/* one shift block in the grid */
function SchedShift({ s, hue, multi, dim, hi, onClick }) {
  const open = !!s.open, off = !!s.offered;
  return (
    <button onClick={onClick} className="sched-shift" style={{ display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer', border: 'none', position: 'relative',
      background: open ? 'var(--warn-soft)' : off ? 'oklch(0.95 0.06 320)' : `oklch(0.96 0.05 ${hue})`,
      borderLeft: `3px solid ${open ? 'var(--warn)' : off ? 'oklch(0.6 0.16 320)' : `oklch(0.58 0.14 ${hue})`}`,
      borderRadius: 'var(--r-sm)', padding: '5px 8px', opacity: dim ? 0.35 : 1,
      outline: hi ? '2px solid var(--accent)' : 'none', outlineOffset: 1 }}>
      <span className="mono" style={{ fontSize: 11.5, fontWeight: 700, color: open ? 'oklch(0.45 0.12 65)' : off ? 'oklch(0.45 0.15 320)' : `oklch(0.4 0.13 ${hue})` }}>{shiftRange(s)}</span>
      <span style={{ display: 'block', fontSize: 10, color: 'var(--ink-3)', marginTop: 1 }}>
        {open ? 'Open shift' : off ? 'Offered for swap' : `${shiftHrs(s)}h`}{multi ? ` · ${s._office}` : ''}{!s.pub && !open ? ' · new' : ''}
      </span>
    </button>
  );
}

function Scheduler({ me, access, onBack }) {
  const OFFICES = useMemo(() => schedOffices(), []);
  const isSup = !!(access && access.flags && access.flags.isSupervisor && !access.flags.isAdmin);
  const [offices, setOffices] = useState(() => {
    const mine = me && (me.loc || me.location);
    return OFFICES.includes(mine) ? [mine] : OFFICES.slice(0, 1);
  });
  const [weekKey, setWeekKey] = useState(() => thisWeekKey());
  const [view, setView] = useState('person');
  const [docs, setDocs] = useState({});           // office → week doc
  const [requests, setRequests] = useState([]);   // edits / swaps / blackouts, scoped
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);       // { office, empId|null, date, shift|null }
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('name');   // name | hours
  const [statusHi, setStatusHi] = useState(null); // empty | unpub | open
  const [focusEmp, setFocusEmp] = useState(null);
  const [menu, setMenu] = useState(null);         // 'copy' | 'options' | null
  const [tplModal, setTplModal] = useState(null); // 'save' | 'load'
  const [templates, setTemplates] = useState([]);
  const [insights, setInsights] = useState(false);
  const [toast, setToast] = useState(null);
  const flash = m => { setToast(m); setTimeout(() => setToast(null), 3200); };

  const days = useMemo(() => weekDaysFor(weekKey), [weekKey]);
  const roster = useMemo(() => {
    let r = offices.flatMap(officeRoster);
    if (search.trim()) { const q = search.trim().toLowerCase(); r = r.filter(p => p.name.toLowerCase().includes(q)); }
    return r;
  }, [offices, search]);
  const multi = offices.length > 1;

  /* every displayed shift, tagged with its office */
  const shifts = useMemo(() => offices.flatMap(o => ((docs[o] && docs[o].shifts) || []).map(s => ({ ...s, _office: o }))), [docs, offices]);
  const allWeekShifts = shifts; // conflict checks run against the loaded week
  const blackouts = useMemo(() => requests.filter(r => r.type === 'blackout' && r.status === 'approved'), [requests]);
  const pending = useMemo(() => requests.filter(r =>
    (r.type === 'edit' && r.status === 'pending') || (r.type === 'swap' && r.status === 'pending') ||
    (r.type === 'blackout' && (r.status === 'hr_review' || r.status === 'mgr_review'))), [requests]);

  const load = () => {
    setLoading(true);
    Promise.all([
      fetchSchedules({ offices, weekKey }).catch(() => []),
      fetchSchedRequests().catch(() => []),
    ]).then(([scheds, reqs]) => {
      const next = {};
      scheds.forEach(d => { if (Array.isArray(d.shifts)) next[d.office] = d; });
      setDocs(next); setRequests(reqs); setLoading(false);
    });
  };
  useEffect(load, [offices.join('|'), weekKey]);

  /* ---- persistence: managers apply immediately; supervisors on a published week
          queue per-change approvals (server enforces either way) ---- */
  const applyLocal = (office, fn) => setDocs(d => {
    const doc = d[office] || { id: `${weekKey}__${office}`, office, weekKey, published: false, shifts: [] };
    return { ...d, [office]: { ...doc, shifts: fn(doc.shifts || []) } };
  });
  const oneChange = async (office, change, localFn) => {
    const doc = docs[office];
    const queued = doc && doc.published && isSup;
    if (!queued) applyLocal(office, localFn);
    try {
      const res = await schedAction({ action: 'edit', office, weekKey: change.weekKey || weekKey, change });
      if (res.pending) { flash('Sent to your manager for approval — the schedule updates when they approve.'); fetchSchedRequests().then(setRequests).catch(() => {}); }
    } catch (e) { flash('Save failed: ' + e.message); load(); }
  };
  const saveAll = async (office, nextShifts) => {
    applyLocal(office, () => nextShifts);
    try { await schedAction({ action: 'save', office, weekKey, shifts: nextShifts }); }
    catch (e) { flash('Save failed: ' + e.message); load(); }
  };

  /* ---- shift form save / delete (incl. repeats §2.2) ---- */
  const saveShift = async (form) => {
    const base = { id: form.shift ? form.shift.id : newShiftId(), empId: form.empId, open: form.open || undefined, date: form.date, start: form.start, end: form.end };
    setModal(null);
    await oneChange(form.office, { op: form.shift ? 'update' : 'add', shift: base }, list => [...list.filter(s => s.id !== base.id), base]);
    /* repeats: daily or weekly × N, each lands in its own week doc via the same
       queued-or-applied edit action */
    const extra = [];
    if (form.repeat === 'daily') for (let i = 1; i <= form.repeatN; i++) extra.push(addDaysISO(form.date, i));
    if (form.repeat === 'weekly') for (let i = 1; i <= form.repeatN; i++) extra.push(addDaysISO(form.date, i * 7));
    for (const date of extra) {
      const wk = weekKeyOf(date);
      const copy = { ...base, id: newShiftId(), date };
      if (wk === weekKey) await oneChange(form.office, { op: 'add', shift: copy }, list => [...list, copy]);
      else await schedAction({ action: 'edit', office: form.office, weekKey: wk, change: { op: 'add', shift: copy } }).catch(e => flash('Repeat save failed: ' + e.message));
    }
    if (extra.length) flash(`Shift repeated onto ${extra.length} more ${form.repeat === 'daily' ? 'day' : 'week'}${extra.length === 1 ? '' : 's'}.`);
  };
  const deleteShift = async (form) => {
    setModal(null);
    await oneChange(form.office, { op: 'remove', shiftId: form.shift.id }, list => list.filter(s => s.id !== form.shift.id));
  };

  /* ---- publish (§2.4) — publishes every selected office's week in view ---- */
  const unpubCount = shifts.filter(s => !s.pub).length;
  const publish = async () => {
    for (const office of offices) {
      const doc = docs[office];
      if (!doc || !(doc.shifts || []).length) continue;
      try {
        const res = await schedAction({ action: 'publish', office, weekKey });
        const n = res.notify; const parts = [];
        if (n && !n.simulated) { if (n.gchat) parts.push('Google Chat'); if (n.sms) parts.push(`${n.sms} text${n.sms === 1 ? '' : 's'}`); }
        flash(`${office} week published${parts.length ? ' — team notified via ' + parts.join(' + ') : ''}.`);
      } catch (e) { flash(office + ' publish failed: ' + e.message); }
    }
    load();
  };

  /* ---- copy & templates (§3.3) ---- */
  const copyLastWeek = async () => {
    setMenu(null);
    const prev = addWeeks(weekKey, -1);
    for (const office of offices) {
      try {
        const [prevDoc] = await fetchSchedules({ office, weekKey: prev });
        if (!prevDoc || !(prevDoc.shifts || []).length) { flash(`Nothing saved for ${office} last week.`); continue; }
        const moved = prevDoc.shifts.map(s => ({ ...s, id: newShiftId(), pub: undefined, offered: undefined, offeredBy: undefined, date: addDaysISO(s.date, 7) }));
        const cur = (docs[office] && docs[office].shifts) || [];
        await saveAll(office, [...cur, ...moved]);
        flash(`Copied ${moved.length} shifts from last week into ${office}.`);
      } catch (e) { flash('Copy failed: ' + e.message); }
    }
  };
  const openTpl = (kind) => { setMenu(null); setTplModal(kind); if (kind === 'load') fetchSchedTemplates(offices[0]).then(setTemplates).catch(() => setTemplates([])); };
  const saveTemplate = async (name) => {
    setTplModal(null);
    const office = offices[0];
    const tShifts = ((docs[office] && docs[office].shifts) || []).map(s => ({ empId: s.empId, open: s.open, dow: Math.max(0, Math.round((parseISO(s.date) - parseISO(weekKey)) / 86400000)), start: s.start, end: s.end }));
    try { await schedAction({ action: 'template_save', office, name, shifts: tShifts }); flash(`Template “${name}” saved for ${office}.`); }
    catch (e) { flash('Template save failed: ' + e.message); }
  };
  const loadTemplate = async (tpl) => {
    setTplModal(null);
    const office = offices[0];
    const cur = (docs[office] && docs[office].shifts) || [];
    const added = (tpl.shifts || []).map(s => ({ id: newShiftId(), empId: s.empId, open: s.open || undefined, date: addDaysISO(weekKey, s.dow), start: s.start, end: s.end }));
    await saveAll(office, [...cur, ...added]);
    flash(`Loaded “${tpl.name}” — ${added.length} shifts added.`);
  };

  /* ---- options: bulk actions on what's displayed (WYSIWYG, §3.2) ---- */
  const bulk = async (kind) => {
    setMenu(null);
    for (const office of offices) {
      const cur = (docs[office] && docs[office].shifts) || [];
      if (!cur.length) continue;
      if (kind === 'unassign') await saveAll(office, cur.map(s => ({ ...s, open: true, offered: undefined, offeredBy: undefined })));
      if (kind === 'delete') await saveAll(office, []);
    }
    if (kind === 'delete') flash('All displayed shifts deleted.');
    if (kind === 'unassign') flash('All displayed shifts are now open (unassigned).');
  };

  /* ---- status counts (§3.2) ---- */
  const openCount = shifts.filter(s => s.open || s.offered).length;
  const emptyCount = roster.reduce((a, p) => a + days.filter(d => !shifts.some(s => s.empId === p.id && s.date === d.date)).length, 0);

  /* ---- per-person totals & sort ---- */
  const hoursOf = pid => shifts.filter(s => s.empId === pid && !s.open).reduce((a, s) => a + shiftHrs(s), 0);
  const sidebar = useMemo(() => {
    const list = roster.map(p => ({ ...p, hours: Math.round(hoursOf(p.id) * 10) / 10 }));
    return list.sort((a, b) => sortBy === 'hours' ? b.hours - a.hours : a.name.localeCompare(b.name));
  }, [roster, shifts, sortBy]);

  const rows = useMemo(() => {
    const list = focusEmp ? roster.filter(p => p.id === focusEmp) : roster;
    if (view === 'person') return [{ dept: null, people: [...list].sort((a, b) => a.name.localeCompare(b.name)) }];
    const by = {};
    list.forEach(p => { (by[p.dept] = by[p.dept] || []).push(p); });
    return Object.keys(by).sort().map(dept => ({ dept, people: by[dept].sort((a, b) => a.name.localeCompare(b.name)) }));
  }, [roster, view, focusEmp]);

  const cellShifts = (pid, date) => shifts.filter(s => s.empId === pid && s.date === date);
  const boFor = (pid, date) => blackouts.some(b => b.empId === pid && (b.dates || []).includes(date));
  const published = offices.every(o => docs[o] && docs[o].published);
  const anySaved = offices.some(o => docs[o] && (docs[o].shifts || []).length);
  const colTemplate = `200px repeat(7, minmax(96px, 1fr))`;
  const dim = s => statusHi === 'unpub' ? !!s.pub : statusHi === 'open' ? !(s.open || s.offered) : false;

  const toggleOffice = (o) => setOffices(cur => cur.includes(o) ? (cur.length > 1 ? cur.filter(x => x !== o) : cur) : [...cur, o]);

  return (
    <StepShell icon="grid" eyebrow="Scheduling" title="Schedule builder"
      subtitle="Click any slot to add a shift — presets or exact times. Repeat shifts across weeks, copy or template whole weeks, then publish to lock and notify."
      onBack={onBack}
      aside={
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="btn btn-ghost" onClick={load} title="Reload changes made by others"><Icon name="refresh" /> Refresh</button>
          <button className="btn btn-ghost" onClick={() => setInsights(true)}><Icon name="list" /> Insights</button>
          <div style={{ position: 'relative' }}>
            <button className="btn btn-ghost" onClick={() => setMenu(m => m === 'copy' ? null : 'copy')}><Icon name="doc" /> Copy <Icon name="chevron" style={{ width: 14, height: 14, transform: 'rotate(90deg)' }} /></button>
            {menu === 'copy' && <Dropdown onClose={() => setMenu(null)} items={[
              ['Copy last week', `Pull ${weekLabel(addWeeks(weekKey, -1))} into this week`, copyLastWeek],
              ['Save as template…', 'Keep this week as a named setup', () => openTpl('save')],
              ['Load template…', 'Apply a saved setup to this week', () => openTpl('load')],
            ]} />}
          </div>
          <div style={{ position: 'relative' }}>
            <button className="btn btn-ghost" onClick={() => setMenu(m => m === 'options' ? null : 'options')}><Icon name="dots" /> Options</button>
            {menu === 'options' && <Dropdown onClose={() => setMenu(null)} items={[
              ['Mark all shifts open', 'Every displayed shift stays in place but is flagged open — up for grabs', () => bulk('unassign')],
              ['Delete all shifts', 'Removes every displayed shift — irreversible', () => { if (window.confirm('Delete every shift currently displayed? This cannot be undone.')) bulk('delete'); }, true],
            ]} />}
          </div>
          <button className="btn btn-primary" disabled={!anySaved} onClick={publish}>
            <Icon name="check" /> Publish{unpubCount ? ` (${unpubCount})` : ''}
          </button>
        </div>
      }>

      {/* selectors: offices (multi), week, view */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <Icon name="pin" style={{ width: 16, height: 16, color: 'var(--ink-3)' }} />
          {OFFICES.map(o => (
            <button key={o} onClick={() => toggleOffice(o)}
              style={{ border: '1px solid', borderColor: offices.includes(o) ? 'var(--accent)' : 'var(--line)', background: offices.includes(o) ? 'var(--accent-soft)' : 'var(--surface)',
                color: offices.includes(o) ? 'var(--accent-strong)' : 'var(--ink-2)', borderRadius: 'var(--r-pill)', padding: '6px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              {o}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginLeft: 'auto' }}>
          <button className="btn btn-quiet" onClick={() => setWeekKey(k => addWeeks(k, -1))} title="Previous week" style={{ padding: '6px 9px' }}><Icon name="chevron" style={{ width: 14, height: 14, transform: 'rotate(180deg)' }} /></button>
          <button className="btn btn-quiet" onClick={() => setWeekKey(thisWeekKey())} style={{ fontWeight: 700, fontSize: 13.5, padding: '6px 12px' }}>{weekLabel(weekKey)}{weekKey === thisWeekKey() ? '' : ' ↺'}</button>
          <button className="btn btn-quiet" onClick={() => setWeekKey(k => addWeeks(k, 1))} title="Next week" style={{ padding: '6px 9px' }}><Icon name="chevron" style={{ width: 14, height: 14 }} /></button>
        </div>
        <div style={{ display: 'flex', gap: 0, border: '1px solid var(--line)', borderRadius: 'var(--r-pill)', overflow: 'hidden' }}>
          {SCHED_VIEWS.map(([id, label]) => (
            <button key={id} onClick={() => setView(id)} style={{ border: 'none', cursor: 'pointer', padding: '7px 14px', fontSize: 12.5, fontWeight: 600, background: view === id ? 'var(--ink)' : 'var(--surface)', color: view === id ? 'var(--surface)' : 'var(--ink-2)' }}>{label}</button>
          ))}
        </div>
        {published && anySaved && <span className="badge badge-ok"><Icon name="check" /> Published{isSup ? ' — your edits need manager approval' : ''}</span>}
      </div>

      {pending.length > 0 && <ApprovalsPanel me={me} access={access} requests={pending} onActed={load} flash={flash} />}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(210px, 250px) 1fr', gap: 'var(--gap)', alignItems: 'start' }}>
        {/* team sidebar (§3.2 — hours, search, sort; no cost per D2) */}
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--line)', display: 'flex', gap: 8 }}>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search team…" style={{ flex: 1, minWidth: 0, border: '1px solid var(--line)', borderRadius: 'var(--r-sm)', padding: '6px 9px', fontSize: 13, background: 'var(--surface)' }} />
            <button className="btn btn-quiet" onClick={() => setSortBy(s => s === 'name' ? 'hours' : 'name')} title="Toggle sort" style={{ padding: '6px 9px', fontSize: 11.5, fontWeight: 700 }}>{sortBy === 'name' ? 'A–Z' : 'Hrs'}</button>
          </div>
          <div style={{ maxHeight: 560, overflowY: 'auto' }}>
            {sidebar.map(p => (
              <button key={p.id + p.office} onClick={() => setFocusEmp(f => f === p.id ? null : p.id)}
                style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', textAlign: 'left', border: 'none', cursor: 'pointer', padding: '8px 12px', background: focusEmp === p.id ? 'var(--accent-soft)' : 'transparent', borderBottom: '1px solid var(--line-soft)' }}>
                <Avatar name={p.name} size={28} style={{ background: `linear-gradient(150deg, oklch(0.7 0.1 ${deptHue(p.dept)}), oklch(0.55 0.12 ${deptHue(p.dept)}))` }} />
                <span style={{ minWidth: 0, flex: 1 }}>
                  <span style={{ display: 'block', fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                  <span style={{ display: 'block', fontSize: 10.5, color: 'var(--ink-3)' }}>{p.dept}{multi ? ` · ${p.office}` : ''}</span>
                </span>
                <span className="mono" style={{ fontSize: 12, fontWeight: 700, color: p.hours ? 'var(--ink)' : 'var(--ink-3)' }}>{p.hours}h</span>
              </button>
            ))}
            {sidebar.length === 0 && <div style={{ padding: 16, fontSize: 13, color: 'var(--ink-3)' }}>No one matches.</div>}
          </div>
        </div>

        {/* the grid */}
        <div className="card" style={{ padding: 0 }}>
          <div style={{ overflowX: 'auto' }}>
            <div style={{ minWidth: 900 }}>
              <div style={{ display: 'grid', gridTemplateColumns: colTemplate, borderBottom: '1px solid var(--line)', background: 'var(--surface-2)' }}>
                <div style={{ padding: '10px 14px', fontSize: 11.5, fontWeight: 700, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '.04em', display: 'flex', alignItems: 'center', gap: 7 }}>
                  <Icon name="users" style={{ width: 15, height: 15 }} /> {multi ? offices.length + ' offices' : offices[0]}
                </div>
                {days.map(d => (
                  <div key={d.date} style={{ padding: '9px 6px', textAlign: 'center', borderLeft: '1px solid var(--line)' }}>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{d.dname} <span className="mono" style={{ fontSize: 10.5, color: 'var(--ink-3)', fontWeight: 500 }}>{d.month} {d.dnum}</span></div>
                  </div>
                ))}
              </div>

              {rows.map(group => (
                <React.Fragment key={group.dept || 'all'}>
                  {group.dept && (
                    <div style={{ display: 'grid', gridTemplateColumns: colTemplate, background: `oklch(0.975 0.012 ${deptHue(group.dept)})`, borderBottom: '1px solid var(--line)' }}>
                      <div style={{ padding: '6px 14px', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.06em', color: `oklch(0.42 0.1 ${deptHue(group.dept)})` }}>{group.dept}</div>
                      {days.map(d => {
                        const n = group.people.filter(p => cellShifts(p.id, d.date).length).length;
                        return <div key={d.date} className="mono" style={{ padding: '6px 5px', textAlign: 'center', borderLeft: '1px solid var(--line-soft)', fontSize: 10.5, fontWeight: 700, color: n ? `oklch(0.42 0.1 ${deptHue(group.dept)})` : 'var(--ink-3)' }}>{n || '–'}</div>;
                      })}
                    </div>
                  )}
                  {group.people.map((p, ri) => (
                    <div key={p.id + p.office} style={{ display: 'grid', gridTemplateColumns: colTemplate, borderBottom: '1px solid var(--line-soft)' }}>
                      <div style={{ padding: '8px 13px', display: 'flex', alignItems: 'center', gap: 9, borderRight: '1px solid var(--line)', minWidth: 0 }}>
                        <Avatar name={p.name} size={28} style={{ background: `linear-gradient(150deg, oklch(0.7 0.1 ${deptHue(p.dept)}), oklch(0.55 0.12 ${deptHue(p.dept)}))` }} />
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: 12.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                          <div style={{ fontSize: 10.5, color: 'var(--ink-3)' }}>{view === 'person' ? p.dept : ''}{multi ? (view === 'person' ? ' · ' : '') + p.office : ''}</div>
                        </div>
                      </div>
                      {days.map(d => {
                        const list = cellShifts(p.id, d.date);
                        const bo = boFor(p.id, d.date);
                        const isEmpty = list.length === 0;
                        return (
                          <div key={d.date} onClick={() => { if (isEmpty) setModal({ office: p.office, empId: p.id, date: d.date, shift: null }); }}
                            className="sched-cell"
                            style={{ borderLeft: '1px solid var(--line-soft)', padding: 4, minHeight: 48, display: 'flex', flexDirection: 'column', gap: 3, cursor: isEmpty ? 'pointer' : 'default',
                              background: bo ? 'repeating-linear-gradient(45deg, var(--danger-soft), var(--danger-soft) 6px, transparent 6px, transparent 12px)' : 'transparent',
                              outline: statusHi === 'empty' && isEmpty ? '2px dashed var(--accent)' : 'none', outlineOffset: -2 }}
                            title={bo ? 'Approved blackout — this person can’t work this day' : ''}>
                            {list.map(s => <SchedShift key={s.id + s._office} s={s} hue={deptHue(p.dept)} multi={multi} dim={dim(s)} hi={statusHi === 'unpub' && !s.pub} onClick={() => setModal({ office: s._office, empId: p.id, date: d.date, shift: s })} />)}
                            {isEmpty && <div style={{ flex: 1, display: 'grid', placeItems: 'center', color: 'var(--ink-3)', opacity: 0.3 }}><Icon name="plus" style={{ width: 13, height: 13 }} /></div>}
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </React.Fragment>
              ))}
              {roster.length === 0 && <div style={{ padding: 36, textAlign: 'center', color: 'var(--ink-3)', fontSize: 14 }}>{loading ? 'Loading…' : 'No active employees at the selected office(s).'}</div>}
            </div>
          </div>

          {/* status overview bar (§3.2) — click to highlight */}
          <div style={{ display: 'flex', gap: 8, padding: '9px 14px', borderTop: '1px solid var(--line)', background: 'var(--surface-2)', alignItems: 'center', flexWrap: 'wrap' }}>
            {[['empty', emptyCount, 'empty slots'], ['unpub', unpubCount, 'unpublished'], ['open', openCount, 'open / offered']].map(([id, n, label]) => (
              <button key={id} onClick={() => setStatusHi(h => h === id ? null : id)}
                style={{ border: '1px solid', borderColor: statusHi === id ? 'var(--accent)' : 'var(--line)', background: statusHi === id ? 'var(--accent-soft)' : 'var(--surface)', borderRadius: 'var(--r-pill)', padding: '4px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', color: statusHi === id ? 'var(--accent-strong)' : 'var(--ink-2)' }}>
                <b className="mono">{n}</b> {label}
              </button>
            ))}
            <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--ink-3)' }} className="mono">{shifts.filter(s => !s.open).length} shifts · {Math.round(shifts.reduce((a, s) => a + (s.open ? 0 : shiftHrs(s)), 0))} hrs</span>
          </div>
        </div>
      </div>

      {modal && <ShiftModal key={(modal.shift && modal.shift.id) || 'new'} modal={modal} offices={offices} weekShifts={allWeekShifts} blackouts={blackouts} onSave={saveShift} onDelete={deleteShift} onClose={() => setModal(null)} />}
      {tplModal === 'save' && <NameModal title="Save week as template" hint={`Saves ${offices[0]}'s currently displayed week as a reusable setup.`} onSave={saveTemplate} onClose={() => setTplModal(null)} />}
      {tplModal === 'load' && <LoadTplModal office={offices[0]} templates={templates} onPick={loadTemplate} onDelete={async t => { try { await schedAction({ action: 'template_delete', office: offices[0], id: t.id }); setTemplates(x => x.filter(y => y.id !== t.id)); } catch (e) { flash(e.message); } }} onClose={() => setTplModal(null)} />}
      {insights && <InsightsModal offices={offices} days={days} shifts={shifts} onClose={() => setInsights(false)} />}

      {toast && (
        <div className="fade-in" style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 90, background: 'var(--ink)', color: 'var(--surface)', padding: '11px 20px', borderRadius: 'var(--r-pill)', fontSize: 13.5, fontWeight: 600, boxShadow: 'var(--shadow-lg)', display: 'flex', alignItems: 'center', gap: 9 }}>
          <Icon name="check" style={{ width: 16, height: 16, color: 'oklch(0.8 0.13 155)' }} /> {toast}
        </div>
      )}
    </StepShell>
  );
}

/* small anchored dropdown */
function Dropdown({ items, onClose }) {
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
      <div className="card fade-in" style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 41, width: 250, padding: 6, boxShadow: 'var(--shadow-lg)' }}>
        {items.map(([t, s, fn, danger]) => (
          <button key={t} onClick={fn} className="copy-item" style={{ width: '100%', textAlign: 'left', border: 'none', background: 'none', padding: '9px 11px', borderRadius: 'var(--r-sm)', cursor: 'pointer' }}>
            <div style={{ fontSize: 13.5, fontWeight: 600, color: danger ? 'oklch(0.55 0.15 25)' : 'var(--ink)' }}>{t}</div>
            <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>{s}</div>
          </button>
        ))}
      </div>
    </>
  );
}

/* ---- the shift form (§2.1, §2.2, §2.3): presets + typed times, repeats,
        conflict warning that never blocks ---- */
function ShiftModal({ modal, offices, weekShifts, blackouts, onSave, onDelete, onClose }) {
  const s = modal.shift;
  const [office, setOffice] = useState(modal.office);
  const [open, setOpen] = useState(s ? !!s.open : false);
  const [empId, setEmpId] = useState(s ? (s.empId || '') : (modal.empId || ''));
  const [date, setDate] = useState(modal.date);
  const [start, setStart] = useState(s ? s.start : '09:00');
  const [end, setEnd] = useState(s ? s.end : '17:00');
  const [repeat, setRepeat] = useState('none');
  const [repeatN, setRepeatN] = useState(3);
  const team = officeRoster(office);
  const emp = team.find(p => p.id === empId);

  const conflict = useMemo(() => open || !empId ? { shifts: [], blackout: null } :
    shiftConflicts({ shifts: weekShifts, blackouts, empId, date, start, end, excludeId: s && s.id }),
    [empId, date, start, end, open]);
  const hasConflict = conflict.shifts.length > 0 || !!conflict.blackout;
  const valid = date && start && end && timeMins(end) > timeMins(start) && empId;

  const preset = SHIFT_PRESETS.find(p => p.start === start && p.end === end);
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'oklch(0.2 0.02 230 / 0.4)', zIndex: 80 }} />
      <div className="card fade-in" role="dialog" aria-modal="true" style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', zIndex: 81, width: 'min(480px, 94vw)', maxHeight: '90vh', overflowY: 'auto', padding: 0, boxShadow: 'var(--shadow-lg)' }}>
        <div style={{ padding: '16px 20px 12px', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--accent-strong)' }}>{s ? 'Edit shift' : 'New shift'}</div>
            <h3 style={{ fontSize: 17, margin: '2px 0 0' }}>{office} · {date}</h3>
          </div>
          <button onClick={onClose} className="btn btn-quiet" style={{ width: 30, height: 30, padding: 0, justifyContent: 'center' }}><Icon name="x" style={{ width: 14, height: 14 }} /></button>
        </div>
        <div style={{ padding: '14px 20px', display: 'flex', flexDirection: 'column', gap: 13 }}>
          {offices.length > 1 && !s && (
            <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 12, fontWeight: 700, color: 'var(--ink-2)' }}>Office
              <select value={office} onChange={e => { setOffice(e.target.value); setEmpId(''); }} style={{ padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 'var(--r-sm)', fontSize: 13.5, background: 'var(--surface)' }}>
                {offices.map(o => <option key={o}>{o}</option>)}
              </select>
            </label>
          )}
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
            <label style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 5, fontSize: 12, fontWeight: 700, color: 'var(--ink-2)' }}>Employee
              <select value={empId} onChange={e => setEmpId(e.target.value)} style={{ padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 'var(--r-sm)', fontSize: 13.5, background: 'var(--surface)' }}>
                <option value="">— pick —</option>
                {team.map(p => <option key={p.id} value={p.id}>{p.name} · {p.dept}</option>)}
              </select>
            </label>
            {s && (
              <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, fontWeight: 600, color: 'var(--ink-2)', paddingBottom: 9, whiteSpace: 'nowrap', cursor: 'pointer' }} title="The shift stays on this row but is flagged open — visible for teammates to claim">
                <input type="checkbox" checked={open} onChange={e => setOpen(e.target.checked)} /> Mark open
              </label>
            )}
          </div>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 12, fontWeight: 700, color: 'var(--ink-2)' }}>Date
            <input type="date" value={date} onChange={e => setDate(e.target.value)} style={{ padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 'var(--r-sm)', fontSize: 13.5, background: 'var(--surface)' }} />
          </label>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-2)', marginBottom: 6 }}>Time — pick a preset or type exact times (D10)</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 9 }}>
              {SHIFT_PRESETS.map(p => (
                <button key={p.label} onClick={() => { setStart(p.start); setEnd(p.end); }}
                  style={{ border: '1px solid', borderColor: preset && preset.label === p.label ? 'var(--accent)' : 'var(--line)', background: preset && preset.label === p.label ? 'var(--accent-soft)' : 'var(--surface)', color: preset && preset.label === p.label ? 'var(--accent-strong)' : 'var(--ink-2)', borderRadius: 'var(--r-pill)', padding: '5px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                  {p.label} <span className="mono" style={{ opacity: 0.7 }}>{fmt12(p.start)}–{fmt12(p.end)}</span>
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <input type="time" value={start} onChange={e => setStart(e.target.value)} style={{ flex: 1, padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 'var(--r-sm)', fontSize: 13.5, background: 'var(--surface)' }} />
              <span style={{ color: 'var(--ink-3)' }}>→</span>
              <input type="time" value={end} onChange={e => setEnd(e.target.value)} style={{ flex: 1, padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 'var(--r-sm)', fontSize: 13.5, background: 'var(--surface)' }} />
              <span className="mono" style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink-2)', whiteSpace: 'nowrap' }}>{valid ? shiftHrs({ start, end }) + 'h' : '—'}</span>
            </div>
          </div>
          {!s && (
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <label style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 5, fontSize: 12, fontWeight: 700, color: 'var(--ink-2)' }}>Repeat (§2.2)
                <select value={repeat} onChange={e => setRepeat(e.target.value)} style={{ padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 'var(--r-sm)', fontSize: 13.5, background: 'var(--surface)' }}>
                  <option value="none">Don’t repeat</option>
                  <option value="daily">Daily — following days</option>
                  <option value="weekly">Weekly — same day, future weeks</option>
                </select>
              </label>
              {repeat !== 'none' && (
                <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 12, fontWeight: 700, color: 'var(--ink-2)', width: 110 }}>× {repeat === 'daily' ? 'days' : 'weeks'}
                  <input type="number" min="1" max="12" value={repeatN} onChange={e => setRepeatN(Math.min(12, Math.max(1, Number(e.target.value) || 1)))} className="mono" style={{ padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 'var(--r-sm)', fontSize: 13.5, background: 'var(--surface)' }} />
                </label>
              )}
            </div>
          )}
          {hasConflict && (
            <div style={{ border: '1.5px solid var(--warn)', background: 'var(--warn-soft)', borderRadius: 'var(--r-md)', padding: '10px 13px', fontSize: 12.5, lineHeight: 1.5, color: 'oklch(0.42 0.11 60)' }}>
              <b style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Icon name="bell" style={{ width: 14, height: 14 }} /> Conflict</b>
              {conflict.shifts.map(c => <div key={c.id}>{emp ? emp.name : 'They'} already work{emp ? 's' : ''} {shiftRange(c)} this day{c._office && c._office !== office ? ` at ${c._office}` : ''}.</div>)}
              {conflict.blackout && <div>{emp ? emp.name : 'This person'} has an approved blackout on {date}.</div>}
              <div style={{ marginTop: 4, fontWeight: 600 }}>You can still save — the warning never blocks (§2.3).</div>
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, padding: '13px 20px 16px', borderTop: '1px solid var(--line)' }}>
          {s && <button onClick={() => onDelete({ office, shift: s })} className="btn btn-ghost" style={{ color: 'oklch(0.55 0.15 25)' }}><Icon name="trash" /> Delete</button>}
          <div style={{ flex: 1 }} />
          <button onClick={onClose} className="btn btn-ghost">Cancel</button>
          <button disabled={!valid} onClick={() => onSave({ office, empId, open, date, start, end, repeat, repeatN, shift: s })} className="btn btn-primary">
            <Icon name="check" /> {hasConflict ? 'Save anyway' : 'Save shift'}
          </button>
        </div>
      </div>
    </>
  );
}

/* ---- approvals inline panel: pending supervisor edits, swap claims, blackout
        stages — the same items the notifications bar deep-links to ---- */
function ApprovalsPanel({ me, access, requests, onActed, flash }) {
  const isMgr = !!(access && access.flags && (access.flags.isManager || access.flags.isAdmin));
  const myEmail = ((me && me.workEmail) || '').toLowerCase();
  const act = async (body, okMsg) => {
    try { await schedAction(body); flash(okMsg); onActed(); }
    catch (e) { flash(e.message); }
  };
  const label = r =>
    r.type === 'edit' ? `${r.createdByName || r.createdBy} ${r.op === 'remove' ? 'removed a shift' : r.op === 'add' ? 'added a shift' : 'changed a shift'} · ${r.office} · wk ${r.weekKey}` :
    r.type === 'swap' ? `${r.toName} wants ${r.fromName}'s ${r.date} ${fmt12(r.start)}–${fmt12(r.end)} shift · ${r.office}` :
    `${r.name} — blackout ${r.dates.length === 1 ? r.dates[0] : r.dates[0] + ' +' + (r.dates.length - 1)}${r.reason ? ' · ' + r.reason : ''} · ${r.status === 'hr_review' ? 'awaiting HR (PTO check)' : 'awaiting manager'}`;
  const actions = r => {
    if (r.type === 'edit' && isMgr) return [['edit_decide', true, 'Approve'], ['edit_decide', false, 'Reject']];
    if (r.type === 'swap' && isMgr) return [['swap_decide', true, 'Approve'], ['swap_decide', false, 'Reject']];
    if (r.type === 'blackout' && r.status === 'mgr_review' && isMgr) return [['blackout_mgr', true, 'Approve'], ['blackout_mgr', false, 'Deny']];
    if (r.type === 'blackout' && r.status === 'hr_review') return [['blackout_hr', true, 'PTO confirmed'], ['blackout_hr', false, 'Insufficient PTO']]; // server verifies the HR approver identity
    return [];
  };
  const mine = requests.filter(r => actions(r).length || r.createdBy === myEmail);
  if (!mine.length) return null;
  return (
    <div className="card" style={{ padding: '12px 16px', marginBottom: 14, borderColor: 'var(--accent)', background: 'var(--accent-softer)' }}>
      <div style={{ fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--accent-strong)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}><Icon name="bell" style={{ width: 14, height: 14 }} /> Pending approvals</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {mine.map(r => (
          <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', fontSize: 13 }}>
            <span style={{ flex: 1, minWidth: 220 }}>{label(r)}</span>
            {actions(r).map(([action, approve, text]) => (
              <button key={text} className={approve ? 'btn btn-primary' : 'btn btn-ghost'} style={{ padding: '4px 12px', fontSize: 12 }}
                onClick={() => act({ action, id: r.id, office: r.office, approve }, approve ? 'Approved.' : 'Rejected.')}>{text}</button>
            ))}
            {!actions(r).length && <span className="badge badge-warn" style={{ fontSize: 10.5 }}>waiting</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

function NameModal({ title, hint, onSave, onClose }) {
  const [name, setName] = useState('');
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'oklch(0.2 0.02 230 / 0.4)', zIndex: 80 }} />
      <div className="card fade-in" style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', zIndex: 81, width: 'min(380px, 92vw)', padding: 20, boxShadow: 'var(--shadow-lg)' }}>
        <h3 style={{ fontSize: 16, marginBottom: 4 }}>{title}</h3>
        <p style={{ fontSize: 12.5, color: 'var(--ink-3)', marginBottom: 12 }}>{hint}</p>
        <input autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="Template name" onKeyDown={e => { if (e.key === 'Enter' && name.trim()) onSave(name.trim()); }}
          style={{ width: '100%', boxSizing: 'border-box', padding: '9px 11px', border: '1px solid var(--line)', borderRadius: 'var(--r-sm)', fontSize: 14, background: 'var(--surface)' }} />
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
          <button onClick={onClose} className="btn btn-ghost">Cancel</button>
          <button disabled={!name.trim()} onClick={() => onSave(name.trim())} className="btn btn-primary"><Icon name="check" /> Save</button>
        </div>
      </div>
    </>
  );
}

function LoadTplModal({ office, templates, onPick, onDelete, onClose }) {
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'oklch(0.2 0.02 230 / 0.4)', zIndex: 80 }} />
      <div className="card fade-in" style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', zIndex: 81, width: 'min(420px, 92vw)', padding: 20, boxShadow: 'var(--shadow-lg)' }}>
        <h3 style={{ fontSize: 16, marginBottom: 4 }}>Load a template</h3>
        <p style={{ fontSize: 12.5, color: 'var(--ink-3)', marginBottom: 12 }}>Adds the template’s shifts to {office}’s displayed week.</p>
        {templates.length === 0 && <div style={{ fontSize: 13.5, color: 'var(--ink-3)', padding: '10px 0' }}>No templates saved for {office} yet.</div>}
        {templates.map(t => (
          <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderBottom: '1px solid var(--line-soft)' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13.5, fontWeight: 600 }}>{t.name}</div>
              <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>{(t.shifts || []).length} shifts</div>
            </div>
            <button className="btn btn-primary" style={{ padding: '4px 12px', fontSize: 12 }} onClick={() => onPick(t)}>Load</button>
            <button className="btn btn-quiet" style={{ padding: '4px 8px' }} title="Delete template" onClick={() => onDelete(t)}><Icon name="trash" style={{ width: 13, height: 13 }} /></button>
          </div>
        ))}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
          <button onClick={onClose} className="btn btn-ghost">Close</button>
        </div>
      </div>
    </>
  );
}

/* ---- Insights (§3.3, D12): ACTUAL staffing counts by department and day —
        no targets, no gap badges, no wage or sales panels ---- */
function InsightsModal({ offices, days, shifts, onClose }) {
  const roster = offices.flatMap(officeRoster);
  const byId = Object.fromEntries(roster.map(p => [p.id, p]));
  const depts = [...new Set(roster.map(p => p.dept))].sort();
  const count = (dept, date) => new Set(shifts.filter(s => !s.open && s.date === date && byId[s.empId] && byId[s.empId].dept === dept).map(s => s.empId)).size;
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'oklch(0.2 0.02 230 / 0.4)', zIndex: 80 }} />
      <div className="card fade-in" style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', zIndex: 81, width: 'min(620px, 94vw)', maxHeight: '88vh', overflowY: 'auto', padding: 20, boxShadow: 'var(--shadow-lg)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <h3 style={{ fontSize: 17 }}>Insights — actual staffing</h3>
          <button onClick={onClose} className="btn btn-quiet" style={{ width: 30, height: 30, padding: 0, justifyContent: 'center' }}><Icon name="x" style={{ width: 14, height: 14 }} /></button>
        </div>
        <p style={{ fontSize: 12.5, color: 'var(--ink-3)', marginBottom: 14 }}>People scheduled per department per day across {offices.join(', ')}. Counts only — no targets (D12).</p>
        <div style={{ display: 'grid', gridTemplateColumns: `130px repeat(7, 1fr)`, gap: 1, background: 'var(--line-soft)', border: '1px solid var(--line)', borderRadius: 'var(--r-md)', overflow: 'hidden', fontSize: 12 }}>
          <div style={{ background: 'var(--surface-2)', padding: '7px 10px', fontWeight: 700 }}>Dept</div>
          {days.map(d => <div key={d.date} style={{ background: 'var(--surface-2)', padding: '7px 4px', textAlign: 'center', fontWeight: 700 }}>{d.dname}</div>)}
          {depts.map(dept => (
            <React.Fragment key={dept}>
              <div style={{ background: 'var(--surface)', padding: '7px 10px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{dept}</div>
              {days.map(d => { const n = count(dept, d.date); return <div key={d.date} className="mono" style={{ background: n ? `oklch(${Math.max(0.85, 0.97 - n * 0.03)} 0.05 ${deptHue(dept)})` : 'var(--surface)', padding: '7px 4px', textAlign: 'center', fontWeight: 700, color: n ? 'var(--ink)' : 'var(--ink-3)' }}>{n || '–'}</div>; })}
            </React.Fragment>
          ))}
        </div>
      </div>
    </>
  );
}

Object.assign(window, { Scheduler });
