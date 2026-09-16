/* scheduleread.jsx — THE schedule: the published week for every office, everyone's shifts,
   readable by everyone, plus the personal actions that used to live on a separate page —
   your note, offering a shift you can't work, claiming an offered one, and blackout dates.
   It is a clone of the builder (scheduler.jsx) with every editing control removed, so the
   grid, week/office/view controls and phone layout match exactly. Only weeks a manager has
   published are ever shown; the server strips other people's shift notes and never sends a
   draft.

   It is a clone on purpose: the builder is not modified to serve two jobs.

   SchedulePage (bottom of this file) is the page itself: this view, plus the Builder as a
   second tab for anyone who may schedule. */

const RoSCHED_VIEWS = [['dept', 'By department'], ['person', 'By team member']];

/* How the week grid should be sized, MEASURED rather than guessed from a media query.
   A viewport breakpoint is wrong here: [data-textsize] is a `zoom` on .main (styles.css),
   which changes the layout width the grid actually gets by ±10% while the viewport — and
   so every media query — reads unchanged. Density moves --gap, and [data-font="bold"]
   uppercases the whole app, widening every label. So we measure the real thing: probe the
   live font for the width of a shift label and a name, add the chrome around them, and
   compare against the width .main actually offers.

   Returns px: { narrow, side, name, day, need }. Defaults are today's values, so the
   first paint before measurement is identical to the current desktop grid. */
const RoSCHED_FIT_DEFAULT = { narrow: false, side: 250, name: 200, day: 96, need: 872 };
function RouseSchedFit() {
  const [fit, setFit] = useState(RoSCHED_FIT_DEFAULT);
  useEffect(() => {
    const host = document.querySelector('.main') || document.body;
    const mk = (css, text) => {
      const s = document.createElement('span');
      s.style.cssText = 'position:absolute;left:-9999px;top:0;visibility:hidden;white-space:pre;' + css;
      s.textContent = text;
      host.appendChild(s);
      return s;
    };
    /* widest ordinary shift label, in whatever font is currently active */
    const chip = mk("font:700 11.5px var(--font-mono,'JetBrains Mono',ui-monospace,monospace)", '11a–7p');
    let last = null, tid = 0;
    const decide = () => {
      tid = 0;
      const cs = getComputedStyle(host);
      const avail = host.clientWidth - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0);
      const gap = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--gap')) || 18;
      const forced = document.documentElement.classList.contains('pd-mobile-view');
      /* Two desktop layouts plus the phone one. The name column keeps its original
         200px in every case — narrowing it was an unannounced regression. Only the day
         floor and the sidebar give, and only when the measured width demands it. */
      const dayMin = Math.ceil(chip.offsetWidth) + 27;
      const WIDE = { narrow: false, side: 250, name: 200, day: 96, need: 200 + 7 * 96 };
      const TIGHT = { narrow: false, side: 210, name: 200, day: dayMin, need: 200 + 7 * dayMin };
      const PHONE = { narrow: true, side: 210, name: 200, day: dayMin, need: 200 + 7 * dayMin };
      const roomFor = c => c.need + c.side + gap;
      /* Hysteresis (HYST_UP): each switch changes the layout, which changes the available
         width — without a dead band the states oscillate forever and hang the tab. Moving
         DOWN to a smaller layout uses the bare threshold; moving back UP needs 40px more. */
      const prev = last ? JSON.parse(last) : RoSCHED_FIT_DEFAULT;
      const rank = f => f.narrow ? 0 : f.side === 250 ? 2 : 1;
      const HYST_UP = 40;
      const up = c => avail >= roomFor(c) + HYST_UP;
      let next;
      if (forced) next = PHONE;
      else if (rank(prev) === 2) next = avail >= roomFor(WIDE) ? WIDE : (avail >= roomFor(TIGHT) ? TIGHT : PHONE);
      else if (rank(prev) === 1) next = up(WIDE) ? WIDE : (avail >= roomFor(TIGHT) ? TIGHT : PHONE);
      else next = up(WIDE) ? WIDE : (up(TIGHT) ? TIGHT : PHONE);
      const key = JSON.stringify(next);
      if (key !== last) { last = key; setFit(next); }
    };
    /* coalesce to one measurement per tick — RO can fire several times per layout pass.
       A timer, not requestAnimationFrame: rAF never fires in a hidden or non-painting tab,
       which would latch this guard permanently and freeze the layout at its first answer. */
    const measure = () => { if (!tid) tid = setTimeout(decide, 0); };
    decide();
    const ro = new ResizeObserver(measure);
    ro.observe(host);
    /* appearance.jsx flips these attributes on <html>; each can change the answer */
    const mo = new MutationObserver(measure);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-textsize', 'data-density', 'data-font', 'data-theme'] });
    return () => { if (tid) clearTimeout(tid); ro.disconnect(); mo.disconnect(); chip.remove(); };
  }, []);
  return fit;
}

/* everyone, not the caller's scoped list — a posted schedule shows the whole office */
function schedAll() {
  if (typeof DIRECTORY !== 'undefined' && DIRECTORY.length) return DIRECTORY;
  return (typeof EMPLOYEES !== 'undefined' ? EMPLOYEES : []);
}
function RoschedOffices() {
  const out = [];
  schedAll().forEach(e => {
    if (e.status !== 'Active') return;
    const l = e.loc || e.location;
    if (l && l !== 'Unassigned' && !out.includes(l)) out.push(l);
  });
  return out.sort();
}
function RoofficeRoster(office) {
  return schedAll()
    .filter(e => e.status === 'Active' && (e.loc || e.location) === office)
    .map(e => ({ id: e.id, name: e.name, dept: e.department || 'Unassigned', office, emailLower: (e.emailLower || e.workEmail || '').toLowerCase() }));
}
const RodeptHue = (() => { const cache = {}; let i = 0; const hues = [220, 155, 280, 75, 195, 25, 320, 110]; return d => (d in cache ? cache[d] : (cache[d] = hues[i++ % hues.length])); })();

/* one shift block in the grid.
   `pub` = published (the committed green state); `mineActions`, when given, renders under
   the shift — the offer/withdraw/claim-pending controls for the viewer's own shift. */
function RoSchedShift({ s, hue, multi, hi, mineActions }) {
  /* two different things share `s.open`: no empId = UNASSIGNED (sits in the Open shifts
     lane, nobody on it yet); empId + open = UP FOR GRABS (still this person's shift until
     a claim is approved). Same styling either way — only the label text differs. */
  const open = !!s.open, unassigned = !s.empId, off = !!s.offered, pub = !!s.pub;
  const tint = open ? 'oklch(0.7 0.14 75)' : off ? 'oklch(0.65 0.16 320)' : pub ? 'oklch(0.68 0.14 150)' : `oklch(0.65 0.13 ${hue})`;
  const edge = open ? 'var(--warn)' : off ? 'oklch(0.6 0.16 320)' : pub ? 'oklch(0.55 0.14 150)' : `oklch(0.58 0.14 ${hue})`;
  const label = open ? 'oklch(0.55 0.13 65)' : off ? 'oklch(0.55 0.16 320)' : pub ? 'oklch(0.44 0.13 150)' : `oklch(0.5 0.14 ${hue})`;
  return (
    <div className="sched-shift" style={{ display: 'block', width: '100%', textAlign: 'left', position: 'relative',
      background: `color-mix(in oklab, ${tint} ${pub && !open && !off ? 20 : open ? 18 : 16}%, var(--surface))`,
      borderLeft: `3px solid ${edge}`,
      borderRadius: 'var(--r-sm)', padding: '5px 8px',
      outline: hi ? '2px solid var(--accent)' : 'none', outlineOffset: 1 }}>
      <span className="mono" style={{ fontSize: 11.5, fontWeight: 700, color: `color-mix(in oklab, ${label} 60%, var(--ink))` }}>{shiftRange(s)}</span>
      <span style={{ display: 'block', fontSize: 10, color: 'var(--ink-3)', marginTop: 1 }}>
        {open ? (unassigned ? 'Unassigned' : 'Up for grabs') : off ? 'Offered for swap' : `${shiftHrs(s)}h`}{multi ? ` · ${s._office}` : ''}
      </span>
      {s.note && <span style={{ display: 'flex', alignItems: 'flex-start', gap: 3, fontSize: 10, color: 'var(--ink-2)', marginTop: 3, lineHeight: 1.35 }}><Icon name="chat" style={{ width: 10, height: 10, flex: 'none', marginTop: 1 }} /> {s.note}</span>}
      {mineActions}
    </div>
  );
}

function ScheduleRead({ me, access }) {
  const OFFICES = useMemo(() => RoschedOffices(), []);
  /* Opens on the office she is scheduled at this week. Two offices in one week is normal,
     so the chips stay and she can add or switch. Falls back to her home office when she
     has no shifts that week, so the page is never blank for a reason she can't see. */
  const [offices, setOffices] = useState(() => (me.loc && OFFICES.includes(me.loc)) ? [me.loc] : OFFICES.slice(0, 1));
  const pickedRef = useRef(false);
  /* Every published shift for the week, across every office — not just the ones selected
     above. This is where "her own shifts across offices", the swap board and blackout
     conflict checks all draw from; the grid below still scopes to `offices`. */
  const [allShifts, setAllShifts] = useState([]);
  const [tick, setTick] = useState(0);
  const [weekKey, setWeekKey] = useState(() => thisWeekKey());
  const [view, setView] = useState('dept');
  const [docs, setDocs] = useState({});           // office → week doc
  const [requests, setRequests] = useState([]);   // edits / swaps / blackouts, scoped
  const [loading, setLoading] = useState(true);
  const [dept, setDept] = useState('');           // '' = every department
  const [collapsed, setCollapsed] = useState({}); // 'office|dept' → true
  const [boOpen, setBoOpen] = useState(false);
  const [confirmClaim, setConfirmClaim] = useState(null); // shift pending claim confirm
  const [toast, setToast] = useState(null);
  /* phone layout (see RouseSchedFit): which day is showing */
  const fit = RouseSchedFit();
  const narrow = fit.narrow;
  const [mDay, setMDay] = useState(null);       // ISO date | null = auto (today, else Mon)
  const flash = m => { setToast(m); setTimeout(() => setToast(null), 3200); };

  const days = useMemo(() => weekDaysFor(weekKey), [weekKey]);
  const search = '';
  const roster = useMemo(() => {
    let r = offices.flatMap(RoofficeRoster);
    if (dept) r = r.filter(p => p.dept === dept);
    return r;
  }, [offices, dept]);
  const multi = offices.length > 1;
  const allRoster = useMemo(() => offices.flatMap(RoofficeRoster), [offices]);
  /* every department present across the selected offices — "only the Dental Assistants
     in the offices I pick", which the name-only search box could never do */
  const DEPTS = useMemo(() => [...new Set(allRoster.map(p => p.dept).filter(Boolean))].sort(), [allRoster]);

  /* every displayed shift, tagged with its office — only weeks a manager has published */
  const shifts = useMemo(() => offices.flatMap(o => ((docs[o] && docs[o].published) ? ((docs[o].shifts) || []).map(s => ({ ...s, _office: o })) : [])), [docs, offices]);
  const blackouts = useMemo(() => requests.filter(r => r.type === 'blackout' && r.status === 'approved'), [requests]);

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
  /* live update: a manager published a week, or someone acted on an offer/claim/blackout
     anywhere — reload the grid and the cross-office data below */
  useEffect(() => {
    const onPub = () => { load(); setTick(t => t + 1); };
    window.addEventListener('pd-schedule-changed', onPub);
    return () => window.removeEventListener('pd-schedule-changed', onPub);
  }, [offices.join('|'), weekKey]);

  /* her own shifts and the swap board both come from every office, not just the ones on
     screen — someone at Hauppauge on Monday and Garden City on Tuesday has to see both in
     her own strip, and a shift offered at an office she isn't currently viewing still has
     to show up here to be claimed. */
  useEffect(() => {
    let dead = false;
    fetchSchedules({ weekKey }).then(list => {
      if (dead) return;
      const flat = (list || []).filter(d => d.published).flatMap(d => (d.shifts || []).map(s => ({ ...s, _office: d.office })));
      setAllShifts(flat);
      /* first load of the first week decides which office the page opens on */
      if (!pickedRef.current) {
        const her = Array.from(new Set(flat.filter(s => s.empId === me.id).map(s => s._office).filter(Boolean)));
        if (her.length) { pickedRef.current = true; setOffices(her); }
      }
    }).catch(() => { if (!dead) setAllShifts([]); });
    return () => { dead = true; };
  }, [weekKey, me.id, tick]);

  const myShifts = useMemo(() => allShifts.filter(s => s.empId === me.id), [allShifts, me.id]);
  /* teammates' offered shifts + manager-flagged unassigned/up-for-grabs ones — the swap board */
  const board = useMemo(() => allShifts.filter(s => (s.offered || s.open) && s.empId !== me.id), [allShifts, me.id]);
  const myBlackouts = useMemo(() => requests.filter(r => r.type === 'blackout' && r.empId === me.id), [requests, me.id]);
  const mySwaps = useMemo(() => requests.filter(r => r.type === 'swap' && (r.toEmpId === me.id || r.fromEmpId === me.id)), [requests, me.id]);
  const pendingClaimIds = useMemo(() => new Set(requests.filter(r => r.type === 'swap' && r.status === 'pending').map(r => r.shiftId)), [requests]);

  const myWeek = useMemo(() => days.map(d => ({
    day: d,
    list: myShifts.filter(s => s.date === d.date).sort((a, b) => timeMins(a.start) - timeMins(b.start)),
  })), [days, myShifts]);
  const myNext = useMemo(() => {
    const today = isoDate(new Date());
    return myShifts.slice().sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start)).find(s => s.date >= today) || null;
  }, [myShifts]);

  /* ---- personal actions: offer a shift you can't work, retract it, claim someone else's
          offered/unassigned one. Each is a server write with no local draft — the grid
          always reflects what's actually saved, so a reload after any of these refreshes
          both the office-scoped grid and the cross-office board/blackout data. ---- */
  const refresh = () => { load(); setTick(t => t + 1); };
  const offer = async (s) => {
    try { await schedAction({ action: 'offer', office: s._office, weekKey, shiftId: s.id }); flash('Shift offered — teammates can now claim it; your manager approves the hand-off.'); refresh(); }
    catch (e) { flash(e.message); }
  };
  const retract = async (s) => {
    try { await schedAction({ action: 'retract', office: s._office, weekKey, shiftId: s.id }); flash('Offer withdrawn — the shift is yours again.'); refresh(); }
    catch (e) { flash(e.message); }
  };
  const claim = async (s) => {
    setConfirmClaim(null);
    try { await schedAction({ action: 'claim', office: s._office, weekKey, shiftId: s.id }); flash('Claim sent to the manager — the schedule changes only when they approve.'); refresh(); }
    catch (e) { flash(e.message); }
  };
  /* conflict check at claim time: warn, never block */
  const startClaim = (s) => {
    const c = shiftConflicts({ shifts: myShifts, blackouts: myBlackouts.filter(b => b.status === 'approved'), empId: me.id, date: s.date, start: s.start, end: s.end });
    if (c.shifts.length || c.blackout) setConfirmClaim({ shift: s, conflict: c });
    else claim(s);
  };
  /* the offer/withdraw/claim-pending controls rendered under the viewer's own shift chip */
  const myShiftActions = (s) => {
    if (s.empId !== me.id) return null;
    if (s.offered) {
      return pendingClaimIds.has(s.id)
        ? <span style={{ display: 'block', marginTop: 5, fontSize: 10.5, color: 'var(--ink-3)' }}>claim awaiting manager</span>
        : <button onClick={(e) => { e.stopPropagation(); retract(s); }} className="btn btn-quiet" style={{ marginTop: 5, padding: '3px 9px', fontSize: 11, width: '100%', justifyContent: 'center' }}>Withdraw offer</button>;
    }
    if (!s.open) return <button onClick={(e) => { e.stopPropagation(); offer(s); }} className="btn btn-ghost" style={{ marginTop: 5, padding: '3px 9px', fontSize: 11, width: '100%', justifyContent: 'center' }}>Can’t work — offer it</button>;
    return <span style={{ display: 'block', marginTop: 5, fontSize: 10.5, fontWeight: 700, color: 'oklch(0.45 0.12 65)' }}>Up for grabs — yours until a claim is approved</span>;
  };

  /* ---- row groups ----
     Dept view: one group per office+department ("Clinical Team — Islandia").
     Membership = everyone whose HOME office is that office (so unscheduled people
     have a row to click) PLUS anyone with a shift AT that office this week, even
     if their home is elsewhere — each row shows only that office's shifts. */
  const rows = useMemo(() => {
    const list = roster;
    if (view === 'person') {
      const seen = new Set();
      const people = list.filter(p => seen.has(p.id) ? false : seen.add(p.id)).sort((a, b) => a.name.localeCompare(b.name));
      return [{ office: null, dept: null, people }];
    }
    const all = schedAll();
    const q = search.trim().toLowerCase();
    const groups = {};
    const put = (office, p) => {
      const k = office + '|' + p.dept;
      groups[k] = groups[k] || { office, dept: p.dept, people: [] };
      if (!groups[k].people.some(x => x.id === p.id)) groups[k].people.push(p);
    };
    list.forEach(p => put(p.office, p));
    /* guests: scheduled at an office that isn't their home */
    shifts.forEach(s => {
      if (!s.empId) return;
      const e = all.find(x => x.id === s.empId);
      if (!e || (e.loc || e.location) === s._office) return;
      if (q && !(e.name || '').toLowerCase().includes(q)) return;
      const d = e.department || 'Unassigned';
      if (dept && d !== dept) return;   /* guests obey the department filter too */
      put(s._office, { id: e.id, name: e.name, dept: d, office: s._office });
    });
    return Object.values(groups)
      .sort((a, b) => a.dept.localeCompare(b.dept) || a.office.localeCompare(b.office))
      .map(g => ({ ...g, people: g.people.sort((a, b) => a.name.localeCompare(b.name)) }));
  }, [roster, view, shifts, dept]);

  /* dept view rows show only that group's office; person view shows all selected */
  const cellShifts = (pid, date, office) => shifts.filter(s => s.empId === pid && s.date === date && (!office || s._office === office));

  const openLane = useMemo(() => shifts.filter(s => !s.empId), [shifts]);
  const openOn = (date) => openLane.filter(s => s.date === date);
  /* a blackout is a person's own time-off request — shown only on their own row */
  const boFor = (pid, date) => pid === me.id && blackouts.some(b => b.empId === pid && (b.dates || []).includes(date));
  const colTemplate = `${fit.name}px repeat(7, minmax(${fit.day}px, 1fr))`;

  const toggleOffice = (o) => setOffices(cur => cur.length === OFFICES.length ? [o] : cur.includes(o) ? (cur.length > 1 ? cur.filter(x => x !== o) : cur) : [...cur, o]);

  /* ================= PHONE LAYOUT =================
     A separate render path, reached only when RouseSchedFit() says the week grid cannot fit. The desktop
     return below is untouched: same state, same handlers. One axis at a
     time — a week strip picks the day, the body lists that day's people in one column.
     Everything here is namespaced .schm-* in styles.css so it cannot reach the desktop. */
  if (narrow) {
    const today = isoDate(new Date());
    const dayISO = mDay && days.some(d => d.date === mDay) ? mDay
      : (days.some(d => d.date === today) ? today : days[0].date);
    const dayShifts = (pid, office) => cellShifts(pid, dayISO, office);
    const nOn = iso => shifts.filter(s => s.date === iso && !s.open).length;
    const nOpenOn = iso => shifts.filter(s => s.date === iso && (s.open || s.offered)).length;
    const dayGroups = rows.map(g => {
      const people = g.people.map(p => ({ p, list: dayShifts(p.id, g.office) }));
      return { ...g, on: people.filter(x => x.list.length), off: people.filter(x => !x.list.length) };
    }).filter(g => g.on.length || g.off.length);
    const dayTotal = dayGroups.reduce((a, g) => a + g.on.reduce((b, x) => b + x.list.filter(s => !s.open).length, 0), 0);
    const dayHrs = Math.round(dayGroups.reduce((a, g) => a + g.on.reduce((b, x) => b + x.list.reduce((c, s) => c + (s.open ? 0 : shiftHrs(s)), 0), 0), 0) * 10) / 10;

    return (
      <StepShell icon="grid" eyebrow="Scheduling" title="Schedule"
        subtitle="The published week. Pick a day to see who is on.">

        {/* Week: name, back, forward, refresh, blackout dates. No menus anywhere on this
           screen — nothing here writes to the schedule except your own offer/claim/blackout. */}
        <div className="schm-weekrow">
          <button className="schm-nav" onClick={() => setWeekKey(k => addWeeks(k, -1))} aria-label="Previous week"><Icon name="chevron" style={{ width: 18, height: 18, transform: 'rotate(180deg)' }} /></button>
          <button className="schm-weeknow" onClick={() => setWeekKey(thisWeekKey())}>
            <b>{weekLabel(weekKey)}</b>
            <small>{weekKey === thisWeekKey() ? 'This week' : 'Tap for this week'}</small>
          </button>
          <button className="schm-nav" onClick={() => setWeekKey(k => addWeeks(k, 1))} aria-label="Next week"><Icon name="chevron" style={{ width: 18, height: 18 }} /></button>
          <button className="schm-nav" onClick={load} aria-label="Refresh"><Icon name="refresh" style={{ width: 18, height: 18 }} /></button>
        </div>

        <div className="schm-acts">
          <button onClick={() => setBoOpen(true)}>Blackout dates</button>
        </div>

        <div className="schm-acts">
          <button onClick={() => setOffices(OFFICES)} className={offices.length === OFFICES.length ? 'on' : ''}>All</button>
          {OFFICES.map(o => (
            <button key={o} onClick={() => toggleOffice(o)} className={offices.length !== OFFICES.length && offices.includes(o) ? 'on' : ''}>{o}</button>
          ))}
        </div>

        <div className="schm-seg">
          {RoSCHED_VIEWS.map(([id, label]) => (
            <button key={id} onClick={() => setView(id)} className={view === id ? 'on' : ''}>{label}</button>
          ))}
        </div>

        {/* a button per department becomes a wall once there are more than a few, and this
            screen already stacks several control rows — one picker instead */}
        {DEPTS.length > 1 && (
          <select value={dept} onChange={e => setDept(e.target.value)} className="schm-pick">
            <option value="">All roles</option>
            {DEPTS.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        )}

        <div className="schr-next">
          {myNext ? (
            <>
              <span className="schr-next-lbl">Your next shift</span>
              <b>{myNext.date === isoDate(new Date()) ? 'Today' : myNext.date} · {shiftRange(myNext)}</b>
              <span className="mono">{shiftHrs(myNext)}h · {myNext._office}</span>
            </>
          ) : <span className="schr-next-lbl">Nothing scheduled for you this week</span>}
        </div>

        {/* the week, as seven tap targets — the second axis without rendering it */}
        <div className="schm-strip">
          {days.map(d => {
            const on = d.date === dayISO, n = nOn(d.date), o = nOpenOn(d.date);
            return (
              <button key={d.date} onClick={() => setMDay(d.date)} className={on ? 'schm-day on' : 'schm-day'}>
                <span className="schm-day-dow">{d.dname.slice(0, 1)}</span>
                <span className="schm-day-num">{d.dnum}</span>
                <span className="schm-day-n">{n || '·'}{o ? <i /> : null}</span>
                {d.date === today && <span className="schm-day-today" />}
              </button>
            );
          })}
        </div>

        <div className="schm-status">
          <span className="mono schm-status-tot">{dayTotal} today · {dayHrs}h</span>
        </div>

        {openOn(dayISO).length > 0 && (
          <div className="schm-group">
            <div className="schm-group-head" style={{ background: 'var(--warn-soft)', color: 'oklch(0.42 0.11 60)' }}>
              <Icon name="bell" style={{ width: 13, height: 13, flex: 'none' }} />
              <span>Unassigned</span>
              <small>{openOn(dayISO).length} unassigned</small>
            </div>
            {openOn(dayISO).map(s2 => (
              <div key={s2.id} className="schm-row" style={{ borderLeftColor: 'var(--warn)' }}>
                <span className="schm-row-txt">
                  <span className="schm-row-name">Unassigned</span>
                  <span className="schm-row-time mono">{shiftRange(s2)}</span>
                  <span className="schm-row-sub">{shiftHrs(s2)}h{multi ? ' · ' + s2._office : ''}</span>
                  {s2.note && <span className="schm-row-note"><Icon name="chat" style={{ width: 11, height: 11, flex: 'none' }} /> {s2.note}</span>}
                </span>
              </div>
            ))}
          </div>
        )}

        {loading ? <div className="schm-empty">Loading…</div> : dayGroups.length === 0 ? (
          <div className="schm-empty">No one on the roster for this selection.</div>
        ) : dayGroups.map(g => {
          const gk = g.office + '|' + g.dept;
          const closed = !!collapsed[gk];
          const hue = RodeptHue(g.dept || 'Unassigned');
          return (
            <div className="schm-group" key={gk || 'all'}>
              <button className="schm-group-head" onClick={() => setCollapsed(c => ({ ...c, [gk]: !closed }))}
                style={{ background: `color-mix(in oklab, oklch(0.65 0.1 ${hue}) 8%, var(--surface))`, color: `color-mix(in oklab, oklch(0.5 0.13 ${hue}) 70%, var(--ink))` }}>
                <Icon name="chevron" style={{ width: 13, height: 13, flex: 'none', transform: closed ? 'none' : 'rotate(90deg)', transition: 'transform .12s' }} />
                <span>{g.dept ? `${g.dept}${multi ? ' — ' + g.office : ''}` : (multi ? offices.length + ' offices' : offices[0])}</span>
                <small>{g.on.length} on{g.off.length ? ` · ${g.off.length} off` : ''}</small>
              </button>
              {!closed && (
                <>
                  {g.on.map(({ p, list }) => list.map(s => {
                    const bo = boFor(p.id, dayISO);
                    const mine = p.id === me.id;
                    return (
                      <div key={s.id} className="schm-row"
                        style={{ borderLeftColor: s.open ? 'var(--warn)' : s.offered ? 'oklch(0.6 0.16 320)' : s.pub ? 'oklch(0.55 0.14 150)' : `oklch(0.58 0.14 ${hue})` }}>
                        <Avatar name={p.name} size={38} style={{ background: `linear-gradient(150deg, oklch(0.7 0.1 ${RodeptHue(p.dept)}), oklch(0.55 0.12 ${RodeptHue(p.dept)}))` }} />
                        <span className="schm-row-txt">
                          <span className="schm-row-name">{p.name}{mine ? ' · you' : ''}</span>
                          <span className="schm-row-time mono">{shiftRange(s)}</span>
                          <span className="schm-row-sub">
                            {s.open ? (s.empId ? 'Up for grabs' : 'Unassigned') : s.offered ? 'Offered for swap' : `${shiftHrs(s)}h`}
                            {multi ? ` · ${s._office}` : ''}{bo ? ' · blackout' : ''}
                          </span>
                          {s.note && <span className="schm-row-note"><Icon name="chat" style={{ width: 11, height: 11, flex: 'none' }} /> {s.note}</span>}
                          {mine && myShiftActions(s)}
                        </span>
                      </div>
                    );
                  }))}
                  {g.off.length > 0 && (
                    <div className="schm-off">
                      {g.off.map(({ p }) => (
                        <span key={p.id} className={boFor(p.id, dayISO) ? 'bo' : ''}
                          title={boFor(p.id, dayISO) ? 'Approved blackout — this person can’t work this day' : 'Not scheduled'}>
                          {p.name}{boFor(p.id, dayISO) ? ' ⃰' : ''}
                        </span>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })}

        {board.length > 0 && (
          <div className="schm-group">
            <div className="schm-group-head" style={{ background: 'oklch(0.96 0.04 320)', color: 'oklch(0.45 0.15 320)' }}>
              <Icon name="refresh" style={{ width: 13, height: 13, flex: 'none' }} />
              <span>Up for grabs this week</span>
            </div>
            {board.sort((a, b) => a.date.localeCompare(b.date)).map(s => {
              const owner = schedAll().find(e => e.id === s.empId);
              const claimed = pendingClaimIds.has(s.id);
              return (
                <div key={s.id + s._office} className="schm-row">
                  <span className="schm-row-txt">
                    <span className="schm-row-name">{s.date} · {shiftRange(s)}</span>
                    <span className="schm-row-sub">{s.empId ? `${owner ? owner.name + "'s shift, " : ''}up for grabs` : 'Unassigned'} · {s._office}</span>
                  </span>
                  {claimed ? <span className="badge badge-warn" style={{ fontSize: 10.5 }}>claim pending</span> :
                    <button className="btn btn-primary" style={{ padding: '4px 13px', fontSize: 12 }} onClick={() => startClaim(s)}>Claim</button>}
                </div>
              );
            })}
          </div>
        )}

        {toast && (
          <div className="fade-in" style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 95, background: 'var(--ink)', color: 'var(--surface)', padding: '11px 20px', borderRadius: 'var(--r-pill)', fontSize: 13.5, fontWeight: 600, boxShadow: 'var(--shadow-lg)', display: 'flex', alignItems: 'center', gap: 9 }}>
            <Icon name="check" style={{ width: 16, height: 16, color: 'oklch(0.8 0.13 155)' }} /> {toast}
          </div>
        )}

        {boOpen && <BlackoutModal onClose={() => setBoOpen(false)} onSubmit={async (dates, reason) => {
          setBoOpen(false);
          try { await schedAction({ action: 'blackout_submit', dates, reason }); flash('Blackout request sent — HR confirms PTO first, then your manager approves.'); refresh(); }
          catch (e) { flash(e.message); }
        }} />}
        {confirmClaim && <ClaimConfirm confirmClaim={confirmClaim} onCancel={() => setConfirmClaim(null)} onClaim={() => claim(confirmClaim.shift)} />}
      </StepShell>
    );
  }

  return (
    <StepShell icon="grid" eyebrow="Scheduling" title="Schedule"
      subtitle="The published week for each office — who is on, and when. Your own shifts are marked; offer one you can't work, or claim one that's up for grabs."
      aside={<button className="btn btn-ghost" onClick={() => setBoOpen(true)}><Icon name="calendar" /> Blackout dates</button>}>

      {/* her week first — one line per day, short enough that the office grid stays in view */}
      <div className="schr-mine">
        {myWeek.map(({ day, list }) => (
          <div key={day.date} className={'schr-mine-day' + (day.date === isoDate(new Date()) ? ' today' : '') + (list.length ? '' : ' off')}>
            <b>{day.dname.slice(0, 3)}</b>
            <span className="mono">{day.month} {day.dnum}</span>
            {list.length === 0 ? <i>Off</i> : list.map(s => (
              <em key={s.id}>{shiftRange(s)}<small>{s._office}</small></em>
            ))}
          </div>
        ))}
      </div>

      {/* selectors: offices (multi), week, view */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <Icon name="pin" style={{ width: 16, height: 16, color: 'var(--ink-3)' }} />
          <button onClick={() => setOffices(OFFICES)}
            style={{ border: '1px solid', borderColor: offices.length === OFFICES.length ? 'var(--accent)' : 'var(--line)', background: offices.length === OFFICES.length ? 'var(--accent-soft)' : 'var(--surface)',
              color: offices.length === OFFICES.length ? 'var(--accent-strong)' : 'var(--ink-2)', borderRadius: 'var(--r-pill)', padding: '6px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
            All
          </button>
          {OFFICES.map(o => {
            const on = offices.length !== OFFICES.length && offices.includes(o);
            return (
              <button key={o} onClick={() => toggleOffice(o)}
                style={{ border: '1px solid', borderColor: on ? 'var(--accent)' : 'var(--line)', background: on ? 'var(--accent-soft)' : 'var(--surface)',
                  color: on ? 'var(--accent-strong)' : 'var(--ink-2)', borderRadius: 'var(--r-pill)', padding: '6px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                {o}
              </button>
            );
          })}
        </div>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginLeft: 'auto' }}>
          <button className="btn btn-quiet" onClick={() => setWeekKey(k => addWeeks(k, -1))} title="Previous week" style={{ padding: '6px 9px' }}><Icon name="chevron" style={{ width: 14, height: 14, transform: 'rotate(180deg)' }} /></button>
          <button className="btn btn-quiet" onClick={() => setWeekKey(thisWeekKey())} style={{ fontWeight: 700, fontSize: 13.5, padding: '6px 12px' }}>{weekLabel(weekKey)}{weekKey === thisWeekKey() ? '' : ' ↺'}</button>
          <button className="btn btn-quiet" onClick={() => setWeekKey(k => addWeeks(k, 1))} title="Next week" style={{ padding: '6px 9px' }}><Icon name="chevron" style={{ width: 14, height: 14 }} /></button>
        </div>
        <div style={{ display: 'flex', gap: 0, border: '1px solid var(--line)', borderRadius: 'var(--r-pill)', overflow: 'hidden' }}>
          {RoSCHED_VIEWS.map(([id, label]) => (
            <button key={id} onClick={() => setView(id)} style={{ border: 'none', cursor: 'pointer', padding: '7px 14px', fontSize: 12.5, fontWeight: 600, background: view === id ? 'var(--ink)' : 'var(--surface)', color: view === id ? 'var(--surface)' : 'var(--ink-2)' }}>{label}</button>
          ))}
        </div>
        <select value={dept} onChange={e => setDept(e.target.value)} title="Show only one role"
          style={{ border: '1px solid', borderColor: dept ? 'var(--accent)' : 'var(--line)', background: dept ? 'var(--accent-soft)' : 'var(--surface)', color: dept ? 'var(--accent-strong)' : 'var(--ink-2)', borderRadius: 'var(--r-pill)', padding: '6px 12px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
          <option value="">All roles</option>
          {DEPTS.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 'var(--gap)', alignItems: 'start' }}>
        {/* the grid — minWidth:0 lets the 1fr track shrink below the 900px inner min-content,
            so the overflowX:auto scroller below actually scrolls instead of pushing the page.
            overflow:hidden clips the header row and the row borders to the card's radius —
            without it they paint square over the rounded corners. */}
        <div className="card" style={{ padding: 0, minWidth: 0, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <div style={{ minWidth: fit.need }}>
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

              {openLane.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: colTemplate, borderBottom: '1px solid var(--line)', background: 'color-mix(in oklab, var(--warn) 7%, var(--surface))' }}>
                  <div style={{ padding: '8px 13px', display: 'flex', alignItems: 'center', gap: 8, borderRight: '1px solid var(--line)', minWidth: 0 }}>
                    <div style={{ width: 26, height: 26, borderRadius: 'var(--r-sm)', flex: 'none', display: 'grid', placeItems: 'center', background: 'var(--warn-soft)', color: 'oklch(0.45 0.12 60)' }}><Icon name="bell" style={{ width: 14, height: 14 }} /></div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 12.5 }}>Unassigned</div>
                      <div style={{ fontSize: 10.5, color: 'var(--ink-3)' }}>{openLane.length} unassigned</div>
                    </div>
                  </div>
                  {days.map(d => (
                    <div key={d.date} style={{ borderLeft: '1px solid var(--line-soft)', padding: 4, minHeight: 48, display: 'flex', flexDirection: 'column', gap: 3 }}>
                      {openOn(d.date).map(s => (
                        <RoSchedShift key={s.id + s._office} s={s} hue={75} multi={multi} />
                      ))}
                    </div>
                  ))}
                </div>
              )}
              {rows.map(group => {
                const gk = group.office + '|' + group.dept;
                const closed = !!collapsed[gk];
                return (
                <React.Fragment key={gk}>
                  {group.dept && (
                    <div onClick={() => setCollapsed(c => ({ ...c, [gk]: !closed }))} style={{ display: 'grid', gridTemplateColumns: colTemplate, background: `color-mix(in oklab, oklch(0.65 0.1 ${RodeptHue(group.dept)}) 10%, var(--surface))`, borderBottom: '1px solid var(--line)', cursor: 'pointer', userSelect: 'none' }} title={closed ? 'Expand' : 'Collapse'}>
                      <div style={{ padding: '6px 14px', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.06em', color: `color-mix(in oklab, oklch(0.5 0.13 ${RodeptHue(group.dept)}) 65%, var(--ink))`, display: 'flex', alignItems: 'center', gap: 7, whiteSpace: 'nowrap', minWidth: 0 }}>
                        <Icon name="chevron" style={{ width: 11, height: 11, flex: 'none', transform: closed ? 'none' : 'rotate(90deg)', transition: 'transform .12s' }} />
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{group.dept} — {group.office}{closed ? ` (${group.people.length})` : ''}</span>
                      </div>
                      {days.map(d => {
                        const ids = new Set(group.people.map(p => p.id));
                        const n = shifts.filter(s => s.date === d.date && !s.open && ids.has(s.empId) && (!group.office || s._office === group.office)).length;
                        return (
                          <div key={d.date} style={{ borderLeft: '1px solid var(--line)', display: 'grid', placeItems: 'center', padding: '4px 2px' }}>
                            <span className="mono" title={`${n} scheduled`} style={{ fontSize: 10.5, fontWeight: 700, minWidth: 17, textAlign: 'center', padding: '1px 5px', borderRadius: 'var(--r-pill)', color: n ? `color-mix(in oklab, oklch(0.45 0.13 ${RodeptHue(group.dept)}) 70%, var(--ink))` : 'var(--ink-3)', background: n ? 'color-mix(in oklab, var(--surface) 70%, transparent)' : 'transparent' }}>{n || '·'}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {!closed && group.people.map((p, ri) => (
                    <div key={p.id + p.office} style={{ display: 'grid', gridTemplateColumns: colTemplate, borderBottom: '1px solid var(--line-soft)', background: p.id === me.id ? 'var(--accent-softer)' : undefined, boxShadow: p.id === me.id ? 'inset 3px 0 0 var(--accent)' : undefined }}>
                      <div style={{ padding: '8px 13px', display: 'flex', alignItems: 'center', gap: 9, borderRight: '1px solid var(--line)', minWidth: 0 }}>
                        <Avatar name={p.name} size={28} style={{ background: `linear-gradient(150deg, oklch(0.7 0.1 ${RodeptHue(p.dept)}), oklch(0.55 0.12 ${RodeptHue(p.dept)}))` }} />
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: p.id === me.id ? 800 : 600, fontSize: 12.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: p.id === me.id ? 'var(--accent-strong)' : undefined }}>{p.name}{p.id === me.id ? ' · you' : ''}</div>
                          {view === 'person' && <div style={{ fontSize: 10.5, color: 'var(--ink-3)' }}>{p.dept}</div>}
                        </div>
                      </div>
                      {days.map(d => {
                        const list = cellShifts(p.id, d.date, group.office);
                        const bo = boFor(p.id, d.date);
                        const isEmpty = list.length === 0;
                        return (
                          <div key={d.date} style={{ borderLeft: '1px solid var(--line-soft)', padding: 4, minHeight: 48, display: 'flex', flexDirection: 'column', gap: 3,
                              background: bo ? 'repeating-linear-gradient(45deg, var(--danger-soft), var(--danger-soft) 6px, transparent 6px, transparent 12px)' : 'transparent' }}
                            title={bo ? 'Approved blackout — this person can’t work this day' : ''}>
                            {list.map(s => <RoSchedShift key={s.id + s._office} s={s} hue={RodeptHue(p.dept)} multi={multi && !group.office} mineActions={p.id === me.id ? myShiftActions(s) : null} />)}
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </React.Fragment>
                );
              })}
              {roster.length === 0 && <div style={{ padding: 36, textAlign: 'center', color: 'var(--ink-3)', fontSize: 14 }}>{loading ? 'Loading…' : 'No active employees at the selected office(s).'}</div>}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, padding: '9px 14px', borderTop: '1px solid var(--line)', background: 'var(--surface-2)', alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--ink-3)' }} className="mono">{shifts.filter(s => !s.open).length} shifts · {Math.round(shifts.reduce((a, s) => a + (s.open ? 0 : shiftHrs(s)), 0))} hrs</span>
          </div>
        </div>
      </div>

      {/* swap board: teammates' offered shifts + unassigned/up-for-grabs shifts, company-wide */}
      {board.length > 0 && (
        <div className="card" style={{ marginTop: 'var(--gap)', padding: 'var(--pad)' }}>
          <div style={{ fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.05em', color: 'oklch(0.45 0.15 320)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}><Icon name="refresh" style={{ width: 14, height: 14 }} /> Up for grabs this week</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {board.sort((a, b) => a.date.localeCompare(b.date)).map(s => {
              const owner = schedAll().find(e => e.id === s.empId);
              const claimed = pendingClaimIds.has(s.id);
              return (
                <div key={s.id + s._office} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', fontSize: 13, padding: '8px 10px', borderRadius: 'var(--r-md)', background: !s.empId ? 'var(--warn-soft)' : 'oklch(0.96 0.04 320)' }}>
                  <span className="mono" style={{ fontWeight: 700 }}>{s.date}</span>
                  <span className="mono">{shiftRange(s)}</span>
                  <span style={{ color: 'var(--ink-2)', flex: 1 }}>{!s.empId ? 'Unassigned' : s.open ? `${owner ? owner.name + "'s shift, " : ''}up for grabs` : `${owner ? owner.name : 'A teammate'} can’t work it`} · {s._office}</span>
                  {claimed ? <span className="badge badge-warn" style={{ fontSize: 10.5 }}>claim pending approval</span> :
                    <button className="btn btn-primary" style={{ padding: '4px 13px', fontSize: 12 }} onClick={() => startClaim(s)}>Claim</button>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* my blackout & swap requests, with where they sit in the approval chain */}
      {(myBlackouts.length > 0 || mySwaps.length > 0) && (
        <div className="card" style={{ marginTop: 'var(--gap)', padding: 'var(--pad)' }}>
          <div style={{ fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--ink-3)', marginBottom: 10 }}>My requests</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
            {myBlackouts.map(b => (
              <div key={b.id} style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ flex: 1 }}>Blackout · {b.dates.join(', ')}{b.reason ? ` — ${b.reason}` : ''}</span>
                <span className={'badge ' + (b.status === 'approved' ? 'badge-ok' : b.status === 'denied' ? 'badge-warn' : 'badge-prog')} style={{ fontSize: 10.5 }}>
                  {b.status === 'hr_review' ? 'awaiting HR (PTO check)' : b.status === 'mgr_review' ? 'HR confirmed — awaiting manager' : b.status}
                </span>
              </div>
            ))}
            {mySwaps.map(r => (
              <div key={r.id} style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ flex: 1 }}>{r.toEmpId === me.id ? `Claim on ${r.fromName}'s` : `${r.toName} claimed your`} {r.date} {fmt12(r.start)}–{fmt12(r.end)} shift</span>
                <span className={'badge ' + (r.status === 'approved' ? 'badge-ok' : r.status === 'rejected' ? 'badge-warn' : 'badge-prog')} style={{ fontSize: 10.5 }}>{r.status === 'pending' ? 'awaiting manager' : r.status}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {boOpen && <BlackoutModal onClose={() => setBoOpen(false)} onSubmit={async (dates, reason) => {
        setBoOpen(false);
        try { await schedAction({ action: 'blackout_submit', dates, reason }); flash('Blackout request sent — HR confirms PTO first, then your manager approves.'); refresh(); }
        catch (e) { flash(e.message); }
      }} />}
      {confirmClaim && <ClaimConfirm confirmClaim={confirmClaim} onCancel={() => setConfirmClaim(null)} onClaim={() => claim(confirmClaim.shift)} />}

      {toast && (
        <div className="fade-in" style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 90, background: 'var(--ink)', color: 'var(--surface)', padding: '11px 20px', borderRadius: 'var(--r-pill)', fontSize: 13.5, fontWeight: 600, boxShadow: 'var(--shadow-lg)', display: 'flex', alignItems: 'center', gap: 9 }}>
          <Icon name="check" style={{ width: 16, height: 16, color: 'oklch(0.8 0.13 155)' }} /> {toast}
        </div>
      )}
    </StepShell>
  );
}

/* claim-time conflict warning — shared by both layouts */
function ClaimConfirm({ confirmClaim, onCancel, onClaim }) {
  return (
    <>
      <div onClick={onCancel} style={{ position: 'fixed', inset: 0, background: 'oklch(0.2 0.02 230 / 0.4)', zIndex: 80 }} />
      <div className="card fade-in" style={{ position: 'fixed', top: '3vh', left: 0, right: 0, margin: '0 auto', maxHeight: '94vh', overflowY: 'auto', zIndex: 81, width: 'min(400px, 92vw)', padding: 20, boxShadow: 'var(--shadow-lg)' }}>
        <h3 style={{ fontSize: 16, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 7 }}><Icon name="bell" style={{ width: 16, height: 16, color: 'var(--warn)' }} /> Heads up — conflict</h3>
        <div style={{ fontSize: 13.5, lineHeight: 1.55, color: 'var(--ink-2)' }}>
          {confirmClaim.conflict.shifts.map(c => <p key={c.id} style={{ margin: '0 0 6px' }}>You already work {shiftRange(c)} on {c.date}.</p>)}
          {confirmClaim.conflict.blackout && <p style={{ margin: '0 0 6px' }}>You have an approved blackout on {confirmClaim.shift.date}.</p>}
          <p style={{ margin: 0 }}>You can still claim it — your manager decides.</p>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
          <button onClick={onCancel} className="btn btn-ghost">Never mind</button>
          <button onClick={onClaim} className="btn btn-primary">Claim anyway</button>
        </div>
      </div>
    </>
  );
}

/* blackout-date submission: pick dates, optional reason; HR → Manager */
function BlackoutModal({ onClose, onSubmit }) {
  const [dates, setDates] = useState([]);
  const [pick, setPick] = useState('');
  const [reason, setReason] = useState('');
  const add = () => { if (pick && !dates.includes(pick)) setDates(d => [...d, pick].sort()); setPick(''); };
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'oklch(0.2 0.02 230 / 0.4)', zIndex: 80 }} />
      <div className="card fade-in" style={{ position: 'fixed', top: '3vh', left: 0, right: 0, margin: '0 auto', maxHeight: '94vh', overflowY: 'auto', zIndex: 81, width: 'min(420px, 92vw)', padding: 20, boxShadow: 'var(--shadow-lg)' }}>
        <h3 style={{ fontSize: 16, marginBottom: 4 }}>Blackout dates</h3>
        <p style={{ fontSize: 12.5, color: 'var(--ink-3)', marginBottom: 12, lineHeight: 1.5 }}>Days you can’t work. HR confirms you have the PTO to cover them, then your manager approves — only then do they take effect on the schedule.</p>
        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          <input type="date" value={pick} onChange={e => setPick(e.target.value)} style={{ flex: 1, padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 'var(--r-sm)', fontSize: 13.5, background: 'var(--surface)' }} />
          <button className="btn btn-ghost" disabled={!pick} onClick={add}><Icon name="plus" /> Add</button>
        </div>
        {dates.length > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
            {dates.map(d => (
              <span key={d} className="badge badge-prog" style={{ cursor: 'pointer' }} title="Remove" onClick={() => setDates(x => x.filter(y => y !== d))}>{d} ✕</span>
            ))}
          </div>
        )}
        <textarea value={reason} onChange={e => setReason(e.target.value)} placeholder="Reason (optional)" rows="2" style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 'var(--r-sm)', fontSize: 13.5, background: 'var(--surface)', resize: 'vertical', fontFamily: 'inherit' }}></textarea>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
          <button onClick={onClose} className="btn btn-ghost">Cancel</button>
          <button disabled={!dates.length} onClick={() => onSubmit(dates, reason)} className="btn btn-primary"><Icon name="check" /> Submit</button>
        </div>
      </div>
    </>
  );
}

/* The page: the schedule everyone reads, and the builder for anyone who may schedule.
   With no scheduling permission there is one view and no tab bar. */
function SchedulePage({ me, access }) {
  const canBuild = !!(access && access.caps && access.caps.schedule);
  const [tab, setTab] = useState('schedule');
  if (!canBuild) return <ScheduleRead me={me} access={access} />;
  const Tab = ({ id, children }) => (
    <button onClick={() => setTab(id)} style={{ border: 'none', background: 'none', padding: '9px 2px', margin: 0, cursor: 'pointer', fontSize: 14.5, fontWeight: 700, fontFamily: 'var(--font-display)',
      color: tab === id ? 'var(--accent-strong)' : 'var(--ink-3)', borderBottom: '2.5px solid ' + (tab === id ? 'var(--accent)' : 'transparent') }}>{children}</button>
  );
  return (
    <div>
      <div style={{ display: 'flex', gap: 20, borderBottom: '1px solid var(--line)', marginBottom: 18 }}>
        <Tab id="schedule">Schedule</Tab>
        <Tab id="builder">Builder</Tab>
      </div>
      {tab === 'schedule' ? <ScheduleRead me={me} access={access} /> : <Scheduler me={me} access={access} />}
    </div>
  );
}

Object.assign(window, { ScheduleRead, SchedulePage });
