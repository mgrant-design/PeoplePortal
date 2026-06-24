/* scheduler.jsx — Deputy-style schedule builder.
   Draft → Publish · Copy last week / pay period · role-based coverage ·
   open-shifts lane (create / assign / claim) · drag-to-swap. */

function shiftHours(tpl) {
  const toMin = s => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
  let end = toMin(tpl.end), start = toMin(tpl.start);
  if (end <= start) end += 12 * 60;
  return Math.round((end - start) / 60 * 10) / 10;
}

let OPEN_SEQ = 100;

function reqsFor(loc, dayIdx) {
  return dayIdx >= 5 ? (WEEKEND_REQS[loc] || {}) : (COVERAGE_REQS[loc] || {});
}

/* generate a full canonical week (used by Copy) */
function canonicalWeek(team) {
  const cells = {};
  team.forEach((u, i) => {
    const days = u.role === 'Front Desk' ? [0,1,2,3,4] : [0,1,2,3,4];
    days.forEach(d => {
      let tpl = 's-mid';
      if (u.role === 'Front Desk') tpl = 's-open';
      else if (u.role === 'RDH') tpl = i % 2 ? 's-mid' : 's-open';
      else if (u.role === 'Dentist') tpl = 's-mid';
      cells[`${u.id}|${d}`] = { tpl, status: 'draft' };
    });
    if (i === 0) cells[`${u.id}|5`] = { tpl: 's-half', status: 'draft' };
  });
  return cells;
}

function ShiftChip({ tpl, draftFlag, open, draggable, onDragStart, onRemove, onAssign }) {
  const hue = tpl.hue;
  return (
    <div draggable={draggable} onDragStart={onDragStart} className="shiftchip"
      style={{ position: 'relative', userSelect: 'none', width: '100%',
        background: open ? 'var(--warn-soft)' : `oklch(0.96 0.05 ${hue})`,
        border: draftFlag ? `1.5px dashed oklch(0.6 0.13 ${open ? 75 : hue})` : `1px solid transparent`,
        borderLeft: `3px solid oklch(0.58 0.14 ${open ? 75 : hue})`,
        borderRadius: 'var(--r-sm)', padding: '6px 9px', cursor: draggable ? 'grab' : 'default', whiteSpace: 'nowrap' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: `oklch(0.4 0.13 ${open ? 75 : hue})` }}>{open ? 'Open' : tpl.label}</span>
        {draftFlag && <span style={{ fontSize: 8.5, fontWeight: 800, letterSpacing: '.05em', color: 'var(--ink-3)', border: '1px solid var(--line)', borderRadius: 3, padding: '0 3px', textTransform: 'uppercase' }}>Draft</span>}
      </div>
      <div className="mono" style={{ fontSize: 10, color: 'var(--ink-2)', marginTop: 1 }}>{tpl.start}–{tpl.end}</div>
      {open && onAssign && <button onClick={onAssign} className="btn btn-ghost" style={{ marginTop: 5, padding: '3px 8px', fontSize: 10.5, width: '100%', justifyContent: 'center' }}>Assign →</button>}
      {onRemove && <button onClick={onRemove} className="shift-x" style={{ position: 'absolute', top: 3, right: 3, width: 17, height: 17, borderRadius: '50%', border: 'none', background: 'var(--surface)', color: 'var(--ink-3)', display: 'grid', placeItems: 'center', opacity: 0, transition: 'opacity .12s', boxShadow: 'var(--shadow-sm)' }}><Icon name="x" style={{ width: 10, height: 10 }} /></button>}
    </div>
  );
}

function Scheduler({ onBack }) {
  const [location, setLocation] = useState('Riverside');
  const [cells, setCells] = useState(() => {
    const o = {}; Object.entries(SEED_SHIFTS).forEach(([k, v]) => { o[k] = { tpl: v, status: 'published' }; }); return o;
  });
  const [open, setOpen] = useState(() => ({ 2: [{ id: 'op-1', tpl: 's-close' }] })); // a pre-existing open shift Wed
  const [dirty, setDirty] = useState(false);
  const [dragOver, setDragOver] = useState(null);
  const [copyOpen, setCopyOpen] = useState(false);
  const [assignFor, setAssignFor] = useState(null); // {day, id}
  const [picked, setPicked] = useState(null); // tap-to-move: {kind:'tpl'|'mv', tpl?, from?}
  const [toast, setToast] = useState(null);
  const tplById = useMemo(() => Object.fromEntries(SHIFT_TEMPLATES.map(t => [t.id, t])), []);
  const isAll = location === 'All locations';
  const team = SCHED_TEAMS[location] || [];

  const flash = (m) => { setToast(m); setTimeout(() => setToast(null), 2600); };
  const touch = () => setDirty(true);
  const setData = (e, p) => e.dataTransfer.setData('text/plain', JSON.stringify(p));
  const getData = (e) => { try { return JSON.parse(e.dataTransfer.getData('text/plain')); } catch { return null; } };

  const dropPerson = (e, key) => {
    e.preventDefault(); setDragOver(null); const p = getData(e); if (!p) return;
    setCells(c => {
      const n = { ...c };
      if (p.k === 'tpl') n[key] = { tpl: p.tpl, status: 'draft' };
      else if (p.k === 'mv') { if (p.from === key) return c; const swap = n[key]; n[key] = { ...n[p.from], status: 'draft' }; if (swap) n[p.from] = { ...swap, status: 'draft' }; else delete n[p.from]; }
      else if (p.k === 'om') { n[key] = { tpl: p.tpl, status: 'draft' }; }
      return n;
    });
    if (p.k === 'om') setOpen(o => ({ ...o, [p.day]: (o[p.day] || []).filter(s => s.id !== p.id) }));
    touch();
  };
  const removeCell = (key) => { setCells(c => { const n = { ...c }; delete n[key]; return n; }); touch(); };

  const dropOpenLane = (e, day) => {
    e.preventDefault(); setDragOver(null); const p = getData(e); if (!p) return;
    if (p.k === 'tpl') { setOpen(o => ({ ...o, [day]: [...(o[day] || []), { id: 'op-' + (++OPEN_SEQ), tpl: p.tpl }] })); touch(); }
    else if (p.k === 'mv') {
      const cell = cells[p.from]; if (!cell) return;
      setOpen(o => ({ ...o, [day]: [...(o[day] || []), { id: 'op-' + (++OPEN_SEQ), tpl: cell.tpl }] }));
      removeCell(p.from);
    }
  };
  const dropTrash = (e) => {
    e.preventDefault(); setDragOver(null); const p = getData(e); if (!p) return;
    if (p.k === 'mv') removeCell(p.from);
    else if (p.k === 'om') setOpen(o => ({ ...o, [p.day]: (o[p.day] || []).filter(s => s.id !== p.id) }));
  };

  const assign = (uid, day, shift) => {
    setCells(c => ({ ...c, [`${uid}|${day}`]: { tpl: shift.tpl, status: 'draft' } }));
    setOpen(o => ({ ...o, [day]: (o[day] || []).filter(s => s.id !== shift.id) }));
    setAssignFor(null); touch(); flash('Open shift assigned — added as a draft change.');
  };

  // tap-to-move (mobile-friendly): tap a chip to pick up, tap a cell to drop
  const tapCell = (key) => {
    if (!picked) { if (cells[key]) setPicked({ kind: 'mv', from: key }); return; }
    setCells(c => {
      const n = { ...c };
      if (picked.kind === 'tpl') n[key] = { tpl: picked.tpl, status: 'draft' };
      else if (picked.kind === 'mv') { if (picked.from === key) return c; const swap = n[key]; n[key] = { ...n[picked.from], status: 'draft' }; if (swap) n[picked.from] = { ...swap, status: 'draft' }; else delete n[picked.from]; }
      return n;
    });
    setPicked(null); touch();
  };

  const publish = () => { setCells(c => Object.fromEntries(Object.entries(c).map(([k, v]) => [k, { ...v, status: 'published' }]))); setDirty(false); setPicked(null); flash('Schedule published — staff notified by Google Chat & text.'); };
  const applyCopy = (label) => { setCells(canonicalWeek(team)); setCopyOpen(false); setDirty(true); flash(`${label} copied in as a draft. Review, then publish.`); };
  const clearWeek = () => { setCells({}); setCopyOpen(false); setDirty(true); setOpen({}); flash('Week cleared.'); };

  const smartFill = () => {
    setCells(c => {
      const next = { ...c };
      WEEK_DAYS.forEach((_, d) => {
        const req = reqsFor(location, d);
        Object.entries(req).forEach(([role, need]) => {
          let have = team.filter(u => u.role === role && next[`${u.id}|${d}`]).length;
          const cands = team.filter(u => u.role === role && !next[`${u.id}|${d}`]).sort((a, b) => (b.skills ? b.skills.length : 0) - (a.skills ? a.skills.length : 0));
          for (const u of cands) {
            if (have >= need) break;
            const tpl = role === 'Front Desk' ? 's-open' : role === 'Dentist' ? 's-mid' : (have % 2 ? 's-mid' : 's-open');
            next[`${u.id}|${d}`] = { tpl, status: 'draft' };
            have++;
          }
        });
      });
      return next;
    });
    setDirty(true);
    flash('Smart-filled coverage by role & skills — review the draft, then publish.');
  };

  /* coverage: filled[role][day] from assigned cells only */
  const coverage = useMemo(() => {
    const byRole = {};
    SCHED_ROLES.forEach(r => byRole[r] = WEEK_DAYS.map(() => 0));
    team.forEach(u => WEEK_DAYS.forEach((_, d) => { if (cells[`${u.id}|${d}`] && byRole[u.role]) byRole[u.role][d]++; }));
    return byRole;
  }, [cells, team]);

  const dayGaps = WEEK_DAYS.map((_, d) => {
    const req = reqsFor(location, d); let gap = 0;
    Object.entries(req).forEach(([r, need]) => { gap += Math.max(0, need - (coverage[r] ? coverage[r][d] : 0)); });
    return gap;
  });
  const totalShifts = Object.keys(cells).length;
  const totalHours = Math.round(Object.values(cells).reduce((s, c) => s + shiftHours(tplById[c.tpl]), 0));
  const totalGaps = dayGaps.reduce((a, b) => a + b, 0);
  const rolesForLoc = SCHED_ROLES.filter(r => team.some(u => u.role === r) || (COVERAGE_REQS[location] || {})[r]);

  const colTemplate = `184px repeat(${WEEK_DAYS.length}, minmax(96px, 1fr))`;

  return (
    <StepShell icon="grid" eyebrow="Scheduling · Manager view" title="Schedule builder"
      subtitle="Build the week as a draft, then publish. Drag shifts onto slots, copy a previous week, and watch role coverage fill in. Unfilled needs go to the open-shifts lane for staff to claim."
      onBack={onBack}
      aside={
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button className="btn btn-ghost" onClick={smartFill} title="Auto-fill role coverage using skills"><Icon name="sparkle" /> Smart fill</button>
          <div style={{ position: 'relative' }}>
            <button className="btn btn-ghost" onClick={() => setCopyOpen(o => !o)}><Icon name="refresh" /> Copy <Icon name="chevron" style={{ width: 14, height: 14, transform: 'rotate(90deg)' }} /></button>
            {copyOpen && (
              <>
                <div onClick={() => setCopyOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
                <div className="card fade-in" style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 41, width: 230, padding: 6, boxShadow: 'var(--shadow-lg)' }}>
                  {[['Copy last week', 'Jun 15–21'], ['Copy last pay period', '2 weeks · Jun 8–21']].map(([t, s]) => (
                    <button key={t} onClick={() => applyCopy(t)} className="copy-item" style={{ width: '100%', textAlign: 'left', border: 'none', background: 'none', padding: '9px 11px', borderRadius: 'var(--r-sm)', cursor: 'pointer' }}>
                      <div style={{ fontSize: 13.5, fontWeight: 600 }}>{t}</div>
                      <div className="mono" style={{ fontSize: 11, color: 'var(--ink-3)' }}>{s}</div>
                    </button>
                  ))}
                  <div style={{ height: 1, background: 'var(--line)', margin: '4px 0' }} />
                  <button onClick={clearWeek} className="copy-item" style={{ width: '100%', textAlign: 'left', border: 'none', background: 'none', padding: '9px 11px', borderRadius: 'var(--r-sm)', cursor: 'pointer', fontSize: 13.5, fontWeight: 600, color: 'oklch(0.55 0.15 25)' }}>Clear week</button>
                </div>
              </>
            )}
          </div>
          {dirty && <span className="badge badge-warn"><Icon name="bolt" /> Draft</span>}
          <button className="btn btn-primary" disabled={!dirty} onClick={publish}><Icon name="check" /> {dirty ? 'Publish' : 'Published'}</button>
        </div>
      }>

      {/* location tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        <Icon name="pin" style={{ width: 16, height: 16, color: 'var(--ink-3)' }} />
        {['All locations', ...SCHED_LOCATIONS].map(loc => (
          <button key={loc} onClick={() => { setLocation(loc); setAssignFor(null); }}
            style={{ border: '1px solid', borderColor: location === loc ? 'var(--accent)' : 'var(--line)', background: location === loc ? 'var(--accent-soft)' : 'var(--surface)',
              color: location === loc ? 'var(--accent-strong)' : 'var(--ink-2)', borderRadius: 'var(--r-pill)', padding: '7px 16px', fontSize: 13.5, fontWeight: 600 }}>
            {loc}{loc !== 'All locations' && <span style={{ opacity: 0.6, fontWeight: 500 }}> · {SCHED_TEAMS[loc].length}</span>}
          </button>
        ))}
        {!isAll && <span className="badge badge-prog" style={{ marginLeft: 'auto', padding: '6px 13px' }}><Icon name="clock" /> {totalHours} hrs scheduled · {totalShifts} shifts</span>}
      </div>

      {isAll ? <AllLocationsView tplById={tplById} /> : <>
      {(() => { const off = (typeof approvedTimeoff === 'function' ? approvedTimeoff() : []); if (!off.length) return null; return (
        <div className="card" style={{ padding: '10px 16px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', background: 'var(--accent-softer)', borderColor: 'var(--accent)' }}>
          <span style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--accent-strong)', display: 'inline-flex', alignItems: 'center', gap: 6 }}><Icon name="calendar" style={{ width: 14, height: 14 }} /> Approved time off</span>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', flex: 1 }}>
            {off.map(r => <span key={r.id} className="badge badge-ok" style={{ fontWeight: 600 }}>{r.name.split(' ')[0]} · {r.start} · {r.hours}h{r.paid ? '' : ' unpaid'}</span>)}
          </div>
        </div>
      ); })()}

      {/* palette */}
      <div className="card" style={{ padding: '11px 16px', display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-2)', textTransform: 'uppercase', letterSpacing: '.04em' }}>{picked ? 'Tap a slot to place' : 'Tap or drag a shift →'}</span>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', flex: 1 }}>
          {SHIFT_TEMPLATES.map(t => <div key={t.id} style={{ minWidth: 102, outline: picked && picked.kind === 'tpl' && picked.tpl === t.id ? '2px solid var(--accent)' : 'none', borderRadius: 'var(--r-sm)' }} onClick={() => setPicked(picked && picked.kind === 'tpl' && picked.tpl === t.id ? null : { kind: 'tpl', tpl: t.id })}><ShiftChip tpl={t} draggable onDragStart={e => setData(e, { k: 'tpl', tpl: t.id })} /></div>)}
        </div>
        {picked && <button className="btn btn-quiet" style={{ padding: '6px 12px', fontSize: 12.5 }} onClick={() => setPicked(null)}><Icon name="x" style={{ width: 13, height: 13 }} /> Cancel</button>}
        <div onDragOver={e => { e.preventDefault(); setDragOver('trash'); }} onDragLeave={() => setDragOver(null)} onDrop={dropTrash}
          style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 14px', borderRadius: 'var(--r-md)', border: '1.5px dashed', fontSize: 12.5, fontWeight: 600,
            borderColor: dragOver === 'trash' ? 'var(--warn)' : 'var(--line)', color: dragOver === 'trash' ? 'oklch(0.5 0.12 70)' : 'var(--ink-3)', background: dragOver === 'trash' ? 'var(--warn-soft)' : 'transparent' }}>
          <Icon name="trash" style={{ width: 15, height: 15 }} /> Remove
        </div>
      </div>

      {/* grid */}
      <div className="card" style={{ padding: 0, overflow: 'visible' }}>
        <div style={{ overflowX: 'auto' }}>
          <div style={{ minWidth: 820 }}>
            {/* header */}
            <div style={{ display: 'grid', gridTemplateColumns: colTemplate, borderBottom: '1px solid var(--line)', background: 'var(--surface-2)' }}>
              <div style={{ padding: '10px 14px', fontSize: 11.5, fontWeight: 700, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '.04em', display: 'flex', alignItems: 'center', gap: 7 }}>
                <Icon name="users" style={{ width: 15, height: 15 }} /> {location}
              </div>
              {WEEK_DAYS.map((d, di) => (
                <div key={d} style={{ padding: '8px 6px', textAlign: 'center', borderLeft: '1px solid var(--line)' }}>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>{d.split(' ')[0]} <span className="mono" style={{ fontSize: 10.5, color: 'var(--ink-3)', fontWeight: 500 }}>{d.split(' ')[1]}</span></div>
                  <div style={{ marginTop: 4 }}>
                    {dayGaps[di] === 0
                      ? <span className="badge badge-ok" style={{ fontSize: 10, padding: '2px 7px' }}><Icon name="check" /> Covered</span>
                      : <span className="badge badge-warn" style={{ fontSize: 10, padding: '2px 7px' }}><Icon name="bell" /> {dayGaps[di]} gap{dayGaps[di]>1?'s':''}</span>}
                  </div>
                </div>
              ))}
            </div>

            {/* coverage matrix */}
            <div style={{ display: 'grid', gridTemplateColumns: colTemplate, borderBottom: '2px solid var(--line)', background: 'oklch(0.985 0.006 230)' }}>
              <div style={{ padding: '8px 14px', fontSize: 11, fontWeight: 700, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '.04em', display: 'flex', alignItems: 'center' }}>Coverage</div>
              {WEEK_DAYS.map((_, di) => {
                const req = reqsFor(location, di);
                return (
                  <div key={di} style={{ padding: '6px 5px', borderLeft: '1px solid var(--line-soft)', display: 'flex', flexDirection: 'column', gap: 3 }}>
                    {rolesForLoc.map(r => {
                      const need = req[r] || 0; if (!need && !(coverage[r] && coverage[r][di])) return null;
                      const have = coverage[r] ? coverage[r][di] : 0; const ok = have >= need;
                      return (
                        <div key={r} title={r} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4, fontSize: 10, padding: '1px 5px', borderRadius: 5,
                          background: need === 0 ? 'transparent' : ok ? 'var(--ok-soft)' : 'var(--warn-soft)', color: need === 0 ? 'var(--ink-3)' : ok ? 'oklch(0.42 0.12 155)' : 'oklch(0.5 0.13 60)', fontWeight: 600 }}>
                          <span>{r === 'Front Desk' ? 'FD' : r}</span><span className="mono">{have}/{need || '–'}</span>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>

            {/* open-shifts lane */}
            <div style={{ display: 'grid', gridTemplateColumns: colTemplate, borderBottom: '1px solid var(--line)', background: 'var(--warn-soft)' }}>
              <div style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8, borderRight: '1px solid var(--line)' }}>
                <div style={{ width: 28, height: 28, borderRadius: 8, background: 'oklch(0.92 0.08 75)', display: 'grid', placeItems: 'center', color: 'oklch(0.5 0.13 60)', flex: 'none' }}><Icon name="bell" style={{ width: 16, height: 16 }} /></div>
                <div><div style={{ fontWeight: 700, fontSize: 12.5 }}>Open shifts</div><div style={{ fontSize: 10.5, color: 'oklch(0.5 0.12 60)' }}>drag here to open</div></div>
              </div>
              {WEEK_DAYS.map((_, di) => {
                const isOver = dragOver === 'open|' + di; const list = open[di] || [];
                return (
                  <div key={di} onDragOver={e => { e.preventDefault(); setDragOver('open|' + di); }} onDragLeave={() => setDragOver(d => d === 'open|' + di ? null : d)} onDrop={e => dropOpenLane(e, di)}
                    style={{ borderLeft: '1px solid var(--line-soft)', padding: 5, minHeight: 46, display: 'flex', flexDirection: 'column', gap: 4, position: 'relative',
                      background: isOver ? 'oklch(0.92 0.09 75)' : 'transparent', outline: isOver ? '2px dashed oklch(0.6 0.13 75)' : 'none', outlineOffset: -2 }}>
                    {list.map(s => (
                      <div key={s.id} style={{ position: 'relative' }}>
                        <ShiftChip tpl={tplById[s.tpl]} open draggable onDragStart={e => setData(e, { k: 'om', day: di, id: s.id, tpl: s.tpl })}
                          onAssign={() => setAssignFor(assignFor && assignFor.id === s.id ? null : { day: di, id: s.id })}
                          onRemove={() => setOpen(o => ({ ...o, [di]: o[di].filter(x => x.id !== s.id) }))} />
                        {assignFor && assignFor.id === s.id && (
                          <>
                            <div onClick={() => setAssignFor(null)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
                            <div className="card fade-in" style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 41, width: 190, padding: 6, boxShadow: 'var(--shadow-lg)' }}>
                              <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--ink-3)', padding: '4px 8px' }}>Assign to</div>
                              {team.filter(u => !cells[`${u.id}|${di}`]).map(u => (
                                <button key={u.id} onClick={() => assign(u.id, di, s)} className="copy-item" style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, border: 'none', background: 'none', padding: '7px 8px', borderRadius: 'var(--r-sm)', cursor: 'pointer', textAlign: 'left' }}>
                                  <Avatar name={u.name} size={24} style={{ background: `linear-gradient(150deg, oklch(0.7 0.1 ${u.color}), oklch(0.55 0.12 ${u.color}))` }} />
                                  <span style={{ fontSize: 12.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.name.split(' ')[0]} <span style={{ color: 'var(--ink-3)', fontWeight: 500 }}>· {u.role}</span></span>
                                </button>
                              ))}
                              {team.filter(u => !cells[`${u.id}|${di}`]).length === 0 && <div style={{ fontSize: 12, color: 'var(--ink-3)', padding: '6px 8px' }}>Everyone’s already scheduled.</div>}
                            </div>
                          </>
                        )}
                      </div>
                    ))}
                    {list.length === 0 && <div style={{ flex: 1, display: 'grid', placeItems: 'center', opacity: isOver ? 1 : 0.35, color: 'oklch(0.55 0.1 70)', fontSize: 10.5 }}>—</div>}
                  </div>
                );
              })}
            </div>

            {/* person rows */}
            {team.map((u, ri) => (
              <div key={u.id} style={{ display: 'grid', gridTemplateColumns: colTemplate, borderBottom: ri < team.length - 1 ? '1px solid var(--line-soft)' : 'none' }}>
                <div style={{ padding: '9px 13px', display: 'flex', alignItems: 'center', gap: 10, borderRight: '1px solid var(--line)' }}>
                  <Avatar name={u.name} size={32} style={{ background: `linear-gradient(150deg, oklch(0.7 0.1 ${u.color}), oklch(0.55 0.12 ${u.color}))` }} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--ink-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={u.skills ? u.skills.join(', ') : ''}>{u.role}{u.skills && u.skills.length ? ` · ${u.skills.slice(0, 2).join(', ')}` : ''}</div>
                  </div>
                </div>
                {WEEK_DAYS.map((_, di) => {
                  const key = `${u.id}|${di}`; const cell = cells[key]; const isOver = dragOver === key;
                  return (
                    <div key={di} onDragOver={e => { e.preventDefault(); setDragOver(key); }} onDragLeave={() => setDragOver(d => d === key ? null : d)} onDrop={e => dropPerson(e, key)} onClick={() => tapCell(key)}
                      className="sched-cell"
                      style={{ borderLeft: '1px solid var(--line-soft)', padding: 5, minHeight: 54, display: 'flex', cursor: picked ? 'pointer' : 'default',
                        background: isOver || (picked && picked.kind === 'mv' && picked.from === key) ? 'var(--accent-softer)' : 'transparent', outline: isOver ? '2px dashed var(--accent)' : (picked && picked.kind === 'mv' && picked.from === key ? '2px solid var(--accent)' : 'none'), outlineOffset: -2 }}>
                      {cell ? (
                        <div style={{ width: '100%' }}><ShiftChip tpl={tplById[cell.tpl]} draftFlag={cell.status === 'draft'} draggable onDragStart={e => setData(e, { k: 'mv', from: key })} onRemove={() => removeCell(key)} /></div>
                      ) : (
                        <div style={{ flex: 1, display: 'grid', placeItems: 'center', color: 'var(--ink-3)', opacity: isOver || picked ? 0.7 : 0 }}><Icon name="plus" style={{ width: 15, height: 15 }} /></div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      <p style={{ fontSize: 12.5, color: 'var(--ink-3)', marginTop: 12, display: 'flex', alignItems: 'center', gap: 7, lineHeight: 1.5 }}>
        <Icon name="bolt" style={{ width: 14, height: 14, flex: 'none' }} /> On a phone? <b>Tap</b> a shift then tap a slot to place it; tap a placed shift to pick it up and tap another slot to move or swap. On desktop, drag. Staff are notified by Google Chat &amp; text on publish.
      </p>
      </>}

      {toast && (
        <div className="fade-in" style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 60, background: 'var(--ink)', color: 'var(--surface)', padding: '11px 20px', borderRadius: 'var(--r-pill)', fontSize: 13.5, fontWeight: 600, boxShadow: 'var(--shadow-lg)', display: 'flex', alignItems: 'center', gap: 9 }}>
          <Icon name="check" style={{ width: 16, height: 16, color: 'oklch(0.8 0.13 155)' }} /> {toast}
        </div>
      )}
    </StepShell>
  );
}

function AllLocationsView({ tplById }) {
  const hrs = (tplId) => { const t = tplById[tplId]; if (!t) return 0; const toMin = s => { const [h, m] = s.split(':').map(Number); return h * 60 + m; }; let e = toMin(t.end), s = toMin(t.start); if (e <= s) e += 12 * 60; return (e - s) / 60; };
  const locs = SCHED_LOCATIONS.map(loc => {
    const team = SCHED_TEAMS[loc];
    const wk = canonicalWeek(team);
    const rows = team.map(u => {
      const shifts = WEEK_DAYS.map((_, d) => wk[`${u.id}|${d}`] ? wk[`${u.id}|${d}`].tpl : null);
      const h = shifts.reduce((a, t) => a + (t ? hrs(t) : 0), 0);
      return { u, shifts, h };
    });
    const total = rows.reduce((a, r) => a + r.h, 0);
    return { loc, team, rows, total };
  });
  const grand = locs.reduce((a, l) => a + l.total, 0);

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 'var(--gap)', marginBottom: 'var(--gap)' }}>
        <div className="card" style={{ padding: 'var(--pad)' }}><div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--ink-3)', letterSpacing: '.04em' }}>All locations</div><div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 26 }}>{Math.round(grand)}h</div><div style={{ fontSize: 12, color: 'var(--ink-3)' }}>scheduled this week</div></div>
        {locs.map(l => (
          <div key={l.loc} className="card" style={{ padding: 'var(--pad)' }}><div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--ink-3)', letterSpacing: '.04em' }}>{l.loc}</div><div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 26 }}>{Math.round(l.total)}h</div><div style={{ fontSize: 12, color: 'var(--ink-3)' }}>{l.team.length} staff</div></div>
        ))}
      </div>

      {locs.map(l => (
        <div key={l.loc} style={{ marginBottom: 'var(--gap)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '0 2px 10px' }}>
            <Icon name="pin" style={{ width: 16, height: 16, color: 'var(--accent)' }} />
            <h3 style={{ fontSize: 16 }}>{l.loc}</h3>
            <span className="badge badge-prog">{Math.round(l.total)} hrs</span>
          </div>
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <div style={{ minWidth: 720 }}>
                <div style={{ display: 'grid', gridTemplateColumns: `170px repeat(${WEEK_DAYS.length}, 1fr) 60px`, background: 'var(--surface-2)', borderBottom: '1px solid var(--line)' }}>
                  <div style={{ padding: '9px 14px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--ink-3)', letterSpacing: '.04em' }}>Staff</div>
                  {WEEK_DAYS.map(d => <div key={d} style={{ padding: '9px 4px', textAlign: 'center', fontSize: 11, fontWeight: 700, color: 'var(--ink-3)', borderLeft: '1px solid var(--line-soft)' }}>{d.split(' ')[0]}</div>)}
                  <div style={{ padding: '9px 6px', textAlign: 'right', fontSize: 11, fontWeight: 700, color: 'var(--ink-3)', borderLeft: '1px solid var(--line-soft)' }}>Hrs</div>
                </div>
                {l.rows.map((r, ri) => (
                  <div key={r.u.id} style={{ display: 'grid', gridTemplateColumns: `170px repeat(${WEEK_DAYS.length}, 1fr) 60px`, borderBottom: ri < l.rows.length - 1 ? '1px solid var(--line-soft)' : 'none', alignItems: 'center' }}>
                    <div style={{ padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
                      <Avatar name={r.u.name} size={28} style={{ background: `linear-gradient(150deg, oklch(0.7 0.1 ${r.u.color}), oklch(0.55 0.12 ${r.u.color}))` }} />
                      <div style={{ minWidth: 0 }}><div style={{ fontWeight: 600, fontSize: 12.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.u.name}</div><div style={{ fontSize: 10.5, color: 'var(--ink-3)' }}>{r.u.role}</div></div>
                    </div>
                    {r.shifts.map((t, di) => (
                      <div key={di} style={{ padding: 4, borderLeft: '1px solid var(--line-soft)', minHeight: 40, display: 'grid', placeItems: 'center' }}>
                        {t ? <div title={tplById[t].label} style={{ width: '100%', textAlign: 'center', fontSize: 9.5, fontWeight: 700, padding: '4px 2px', borderRadius: 6, background: `oklch(0.96 0.05 ${tplById[t].hue})`, color: `oklch(0.4 0.13 ${tplById[t].hue})` }}>{tplById[t].start}</div> : <span style={{ color: 'var(--ink-3)', opacity: 0.4, fontSize: 11 }}>·</span>}
                      </div>
                    ))}
                    <div className="mono" style={{ padding: '0 8px', textAlign: 'right', fontWeight: 600, fontSize: 12.5, borderLeft: '1px solid var(--line-soft)' }}>{Math.round(r.h)}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      ))}
      <p style={{ fontSize: 12.5, color: 'var(--ink-3)', marginTop: 4, display: 'flex', gap: 7, alignItems: 'center' }}>
        <Icon name="bolt" style={{ width: 14, height: 14 }} /> A read-only roll-up of every location’s published week. Pick a single location above to edit its schedule.
      </p>
    </div>
  );
}

Object.assign(window, { Scheduler });
