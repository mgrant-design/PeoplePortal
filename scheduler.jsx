/* scheduler.jsx — schedule builder (full rewrite per SCHEDULER.md).
   Click-to-edit only (D9). Weekly grid, any week (past/future). Shift form has
   presets AND typed times (D10). Everyone on the office roster appears (D11);
   the by-Department view groups on the employee record's department field.
   Publishing locks per office, per week (D5). Supervisor edits to a published
   week queue for manager approval; the server decides, never the client.
   No wages (D2), no coverage targets (D12), no drag-and-drop, no auto-fill. */

const SCHED_VIEWS = [['dept', 'By department'], ['person', 'By team member']];

/* How the week grid should be sized, MEASURED rather than guessed from a media query.
   A viewport breakpoint is wrong here: [data-textsize] is a `zoom` on .main (styles.css),
   which changes the layout width the grid actually gets by ±10% while the viewport — and
   so every media query — reads unchanged. Density moves --gap, and [data-font="bold"]
   uppercases the whole app, widening every label. So we measure the real thing: probe the
   live font for the width of a shift label and a name, add the chrome around them, and
   compare against the width .main actually offers.

   Returns px: { narrow, side, name, day, need }. Defaults are today's values, so the
   first paint before measurement is identical to the current desktop grid. */
const SCHED_FIT_DEFAULT = { narrow: false, side: 250, name: 200, day: 96, need: 872 };
function useSchedFit() {
  const [fit, setFit] = useState(SCHED_FIT_DEFAULT);
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
      const prev = last ? JSON.parse(last) : SCHED_FIT_DEFAULT;
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
    .map(e => ({ id: e.id, name: e.name, dept: e.department || 'Unassigned', office, emailLower: (e.emailLower || e.workEmail || '').toLowerCase() }));
}
const deptHue = (() => { const cache = {}; let i = 0; const hues = [220, 155, 280, 75, 195, 25, 320, 110]; return d => (d in cache ? cache[d] : (cache[d] = hues[i++ % hues.length])); })();

/* one shift block in the grid.
   `pub` = published (the committed green state); `ot` = this person's week is over
   their overtime threshold; `note` shows under the time with a speech bubble. */
function SchedShift({ s, hue, multi, dim, hi, ot, onClick }) {
  const open = !!s.open, off = !!s.offered, pub = !!s.pub;
  const tint = open ? 'oklch(0.7 0.14 75)' : off ? 'oklch(0.65 0.16 320)' : pub ? 'oklch(0.68 0.14 150)' : `oklch(0.65 0.13 ${hue})`;
  const edge = open ? 'var(--warn)' : off ? 'oklch(0.6 0.16 320)' : pub ? 'oklch(0.55 0.14 150)' : `oklch(0.58 0.14 ${hue})`;
  const label = open ? 'oklch(0.55 0.13 65)' : off ? 'oklch(0.55 0.16 320)' : pub ? 'oklch(0.44 0.13 150)' : `oklch(0.5 0.14 ${hue})`;
  return (
    <button onClick={onClick} className="sched-shift" style={{ display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer', border: 'none', position: 'relative',
      background: `color-mix(in oklab, ${tint} ${pub && !open && !off ? 20 : open ? 18 : 16}%, var(--surface))`,
      borderLeft: `3px solid ${edge}`,
      boxShadow: ot ? 'inset 0 0 0 1.5px oklch(0.58 0.19 25)' : 'none',
      borderRadius: 'var(--r-sm)', padding: '5px 8px', opacity: dim ? 0.35 : 1,
      outline: hi ? '2px solid var(--accent)' : 'none', outlineOffset: 1 }}>
      <span className="mono" style={{ fontSize: 11.5, fontWeight: 700, color: `color-mix(in oklab, ${label} 60%, var(--ink))` }}>{shiftRange(s)}{ot ? <span title="Over their weekly hours" style={{ marginLeft: 4, color: 'oklch(0.55 0.19 25)' }}>⚠</span> : null}</span>
      <span style={{ display: 'block', fontSize: 10, color: 'var(--ink-3)', marginTop: 1 }}>
        {open ? 'Open shift' : off ? 'Offered for swap' : `${shiftHrs(s)}h`}{multi ? ` · ${s._office}` : ''}{!s.pub && !open ? ' · new' : ''}
      </span>
      {s.note && <span style={{ display: 'flex', alignItems: 'flex-start', gap: 3, fontSize: 10, color: 'var(--ink-2)', marginTop: 3, lineHeight: 1.35 }}><Icon name="chat" style={{ width: 10, height: 10, flex: 'none', marginTop: 1 }} /> {s.note}</span>}
    </button>
  );
}

function Scheduler({ me, access, onBack }) {
  const OFFICES = useMemo(() => schedOffices(), []);
  const isSup = !!(access && access.flags && access.flags.isSupervisor && !access.flags.isAdmin);
  const [offices, setOffices] = useState(() => OFFICES); // "All" is the default view
  const [weekKey, setWeekKey] = useState(() => thisWeekKey());
  const [view, setView] = useState('dept');
  const [docs, setDocs] = useState({});           // office → week doc
  const [requests, setRequests] = useState([]);   // edits / swaps / blackouts, scoped
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);       // { office, empId|null, date, shift|null }
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('name');   // name | hours
  const [statusHi, setStatusHi] = useState(null); // empty | unpub | open
  const [focusEmp, setFocusEmp] = useState(null);
  const [collapsed, setCollapsed] = useState({}); // 'office|dept' → true
  const [menu, setMenu] = useState(null);         // 'copy' | 'options' | null
  const [tplModal, setTplModal] = useState(null); // 'save' | 'load'
  const [regOpen, setRegOpen] = useState(false);  // regular-hours editor
  const [impOpen, setImpOpen] = useState(false);  // Deputy import
  const [regHours, setRegHours] = useState([]);   // standing weekly-hours profiles
  const [templates, setTemplates] = useState([]);
  const [toast, setToast] = useState(null);
  /* phone layout (see useSchedFit): which day is showing, and which sheet is open */
  const fit = useSchedFit();
  const narrow = fit.narrow;
  const [mDay, setMDay] = useState(null);       // ISO date | null = auto (today, else Mon)
  const flash = m => { setToast(m); setTimeout(() => setToast(null), 3200); };

  const days = useMemo(() => weekDaysFor(weekKey), [weekKey]);
  const roster = useMemo(() => {
    let r = offices.flatMap(officeRoster);
    if (search.trim()) { const q = search.trim().toLowerCase(); r = r.filter(p => p.name.toLowerCase().includes(q)); }
    return r;
  }, [offices, search]);
  const multi = offices.length > 1;
  /* unfiltered team for the regular-hours picker (the search box scopes the grid, not this) */
  const allRoster = useMemo(() => offices.flatMap(officeRoster), [offices]);
  useEffect(() => { fetchRegHours().then(setRegHours).catch(() => setRegHours([])); }, []);

  /* every displayed shift, tagged with its office */
  const shifts = useMemo(() => offices.flatMap(o => ((docs[o] && docs[o].shifts) || []).map(s => ({ ...s, _office: o }))), [docs, offices]);
  const allWeekShifts = shifts; // conflict checks run against the loaded week
  const blackouts = useMemo(() => requests.filter(r => r.type === 'blackout' && r.status === 'approved'), [requests]);
  const pending = useMemo(() => requests.filter(r =>
    (r.type === 'edit' && r.status === 'pending') || (r.type === 'swap' && r.status === 'pending') ||
    (r.type === 'blackout' && (r.status === 'hr_review' || r.status === 'mgr_review'))), [requests]);

  const load = (force) => {
    if (dirty && !force && !window.confirm('You have unpublished changes — loading discards them. Continue?')) return;
    repeatsRef.current = []; setDirty(false); setLoading(true);
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

  /* ---- persistence: DRAFT MODEL. Edits live in local state only; nothing touches
          Cosmos until Publish, which saves the week, locks it, and notifies.
          One exception, because it's an approval queue rather than a save: a
          SUPERVISOR editing a PUBLISHED week sends each change to the server
          immediately so the manager can approve or reject it. ---- */
  const docsRef = useRef(docs); useEffect(() => { docsRef.current = docs; }, [docs]);
  const [dirty, setDirty] = useState(false);
  const applyLocal = (office, fn) => setDocs(d => {
    const doc = d[office] || { id: `${weekKey}__${office}`, office, weekKey, published: false, shifts: [] };
    return { ...d, [office]: { ...doc, shifts: fn(doc.shifts || []), _dirty: true } };
  });
  /* warn before the tab closes with unpublished local edits */
  useEffect(() => {
    const h = (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', h); return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);
  const oneChange = async (office, change, localFn) => {
    const doc = docsRef.current[office];
    if (doc && doc.published && isSup) {
      try {
        const res = await schedAction({ action: 'edit', office, weekKey: change.weekKey || weekKey, change });
        if (res.pending) { flash('Sent to your manager for approval — the schedule updates when they approve.'); fetchSchedRequests().then(setRequests).catch(() => {}); }
      } catch (e) { flash('Change failed: ' + e.message); load(true); }
      return;
    }
    applyLocal(office, localFn); setDirty(true);
  };
  const saveAll = async (office, nextShifts) => { applyLocal(office, () => nextShifts); setDirty(true); };
  /* repeat copies aimed at OTHER weeks: held here until Publish, then written into
     their own week documents (each week is its own doc in Cosmos) */
  const repeatsRef = useRef([]); // [{ office, weekKey, shift }]

  /* ---- shift form save / delete (incl. repeats §2.2) ---- */
  const saveShift = async (form) => {
    const base = { id: form.shift ? form.shift.id : newShiftId(), empId: form.empId, open: form.open || undefined, date: form.date, start: form.start, end: form.end };
    if (Number(form.breakMins) > 0) base.breakMins = Math.round(Number(form.breakMins));
    if (String(form.note || '').trim()) base.note = String(form.note).trim().slice(0, 280);
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
      else { repeatsRef.current.push({ office: form.office, weekKey: wk, shift: copy }); setDirty(true); }
    }
    if (extra.length) flash(`Shift repeated onto ${extra.length} more ${form.repeat === 'daily' ? 'day' : 'week'}${extra.length === 1 ? '' : 's'} — saved when you publish.`);
  };
  const deleteShift = async (form) => {
    setModal(null);
    await oneChange(form.office, { op: 'remove', shiftId: form.shift.id }, list => list.filter(s => s.id !== form.shift.id));
  };

  /* ---- publish (§2.4) — publishes every selected office's week in view ---- */
  const unpubCount = shifts.filter(s => !s.pub).length;
  const publish = async () => {
    /* save-then-publish, per office: this is the ONLY write path for drafts */
    for (const office of offices) {
      const doc = docsRef.current[office];
      if (!doc || !(doc.shifts || []).length) continue;
      if (doc._dirty) {
        try { await schedAction({ action: 'save', office, weekKey, shifts: doc.shifts }); }
        catch (e) { flash(office + ' save failed: ' + e.message + ' — not published.'); continue; }
      }
      try {
        const res = await schedAction({ action: 'publish', office, weekKey });
        const n = res.notify; const parts = [];
        if (n && !n.simulated) { if (n.gchat) parts.push('Google Chat'); if (n.sms) parts.push(`${n.sms} text${n.sms === 1 ? '' : 's'}`); }
        flash(`${office} week published${parts.length ? ' — team notified via ' + parts.join(' + ') : ''}.`);
      } catch (e) { flash(office + ' publish failed: ' + e.message); }
    }
    /* write the held repeat copies into their future weeks (saved, not published —
       you publish those weeks when you build them) */
    for (const r of repeatsRef.current.splice(0)) {
      try { await schedAction({ action: 'edit', office: r.office, weekKey: r.weekKey, change: { op: 'add', shift: r.shift } }); }
      catch (e) { flash(`Repeat for week of ${r.weekKey} failed: ` + e.message); }
    }
    setDirty(false);
    load(true);
  };

  /* ---- fill empty cells from each person's standing regular hours (MH #2) ----
     Replay only: never touches a cell that already has a shift, never invents times. */
  const fillFromRegular = async () => {
    setMenu(null);
    let added = 0, skipped = 0;
    for (const office of offices) {
      const cur = (docs[office] && docs[office].shifts) || [];
      const team = officeRoster(office);
      const next = [];
      team.forEach(p => {
        if (!regHoursFor(regIndex, p)) { skipped++; return; }
        days.forEach(d => {
          const taken = cur.some(s => s.empId === p.id && s.date === d.date) || next.some(s => s.empId === p.id && s.date === d.date);
          if (taken) return;
          const reg = regHoursOnDate(regIndex, p, d.date);
          if (!reg) return;
          const sh = { id: newShiftId(), empId: p.id, date: d.date, start: reg.start, end: reg.end };
          if (reg.breakMins > 0) sh.breakMins = reg.breakMins;
          next.push(sh);
        });
      });
      if (next.length) { await saveAll(office, [...cur, ...next]); added += next.length; }
    }
    if (!added) flash(skipped ? 'No regular hours set for anyone in view — set them under Options → Regular hours.' : 'Every slot with regular hours is already filled.');
    else flash(`Filled ${added} empty slot${added === 1 ? '' : 's'} from regular hours — saved when you publish.`);
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
    const tShifts = ((docs[office] && docs[office].shifts) || []).map(s => ({ empId: s.empId, open: s.open, dow: Math.max(0, Math.round((parseISO(s.date) - parseISO(weekKey)) / 86400000)), start: s.start, end: s.end, breakMins: s.breakMins }));
    try { await schedAction({ action: 'template_save', office, name, shifts: tShifts }); flash(`Template “${name}” saved for ${office}.`); }
    catch (e) { flash('Template save failed: ' + e.message); }
  };
  const loadTemplate = async (tpl) => {
    setTplModal(null);
    const office = offices[0];
    const cur = (docs[office] && docs[office].shifts) || [];
    const added = (tpl.shifts || []).map(s => ({ id: newShiftId(), empId: s.empId, open: s.open || undefined, date: addDaysISO(weekKey, s.dow), start: s.start, end: s.end, breakMins: Number(s.breakMins) || undefined }));
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
  /* overtime (MH #5): whose displayed week passes their threshold (own, else standard 40) */
  const regIndex = useMemo(() => regHoursIndex(regHours), [regHours]);
  const otIds = useMemo(() => {
    const set = new Set();
    allRoster.forEach(p => { if (hoursOf(p.id) > otThreshold(regIndex, p)) set.add(p.id); });
    return set;
  }, [allRoster, shifts, regIndex]);
  const sidebar = useMemo(() => {
    const list = roster.map(p => ({ ...p, hours: Math.round(hoursOf(p.id) * 10) / 10, ot: otIds.has(p.id) }));
    return list.sort((a, b) => sortBy === 'hours' ? b.hours - a.hours : a.name.localeCompare(b.name));
  }, [roster, shifts, sortBy, otIds]);

  /* ---- row groups ----
     Dept view: one group per office+department ("Clinical Team — Islandia").
     Membership = everyone whose HOME office is that office (so unscheduled people
     have a row to click) PLUS anyone with a shift AT that office this week, even
     if their home is elsewhere — each row shows only that office's shifts. */
  const rows = useMemo(() => {
    const list = focusEmp ? roster.filter(p => p.id === focusEmp) : roster;
    if (view === 'person') {
      const seen = new Set();
      const people = list.filter(p => seen.has(p.id) ? false : seen.add(p.id)).sort((a, b) => a.name.localeCompare(b.name));
      return [{ office: null, dept: null, people }];
    }
    const all = (typeof EMPLOYEES !== 'undefined' ? EMPLOYEES : []);
    const q = search.trim().toLowerCase();
    const groups = {};
    const put = (office, p) => {
      const k = office + '|' + p.dept;
      groups[k] = groups[k] || { office, dept: p.dept, people: [] };
      if (!groups[k].people.some(x => x.id === p.id)) groups[k].people.push(p);
    };
    list.forEach(p => { if (!focusEmp || p.id === focusEmp) put(p.office, p); });
    /* guests: scheduled at an office that isn't their home */
    shifts.forEach(s => {
      if (!s.empId) return;
      const e = all.find(x => x.id === s.empId);
      if (!e || (e.loc || e.location) === s._office) return;
      if (q && !(e.name || '').toLowerCase().includes(q)) return;
      if (focusEmp && e.id !== focusEmp) return;
      put(s._office, { id: e.id, name: e.name, dept: e.department || 'Unassigned', office: s._office });
    });
    return Object.values(groups)
      .sort((a, b) => a.dept.localeCompare(b.dept) || a.office.localeCompare(b.office))
      .map(g => ({ ...g, people: g.people.sort((a, b) => a.name.localeCompare(b.name)) }));
  }, [roster, view, focusEmp, shifts, search]);

  /* dept view rows show only that group's office; person view shows all selected */
  const cellShifts = (pid, date, office) => shifts.filter(s => s.empId === pid && s.date === date && (!office || s._office === office));
  const boFor = (pid, date) => blackouts.some(b => b.empId === pid && (b.dates || []).includes(date));
  const published = offices.every(o => docs[o] && docs[o].published);
  const anySaved = offices.some(o => docs[o] && (docs[o].shifts || []).length);
  const colTemplate = `${fit.name}px repeat(7, minmax(${fit.day}px, 1fr))`;
  const dim = s => statusHi === 'unpub' ? !!s.pub : statusHi === 'open' ? !(s.open || s.offered) : false;

  const toggleOffice = (o) => setOffices(cur => cur.length === OFFICES.length ? [o] : cur.includes(o) ? (cur.length > 1 ? cur.filter(x => x !== o) : cur) : [...cur, o]);

  /* ================= PHONE LAYOUT =================
     A separate render path, reached only when useSchedFit() says the week grid cannot fit. The desktop
     return below is untouched: same state, same handlers, same ShiftModal. One axis at a
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
    const openSlot = (office, empId) => setModal({ office: office || offices[0], empId: empId || null, date: dayISO, shift: null });

    return (
      <StepShell icon="grid" eyebrow="Scheduling" title="Schedule builder" onBack={onBack}
        subtitle="Pick a day, then tap a shift to edit it or Add to create one. Publish saves and notifies.">

        {/* Week: name, back, forward, refresh. No menus anywhere on this screen — every
           control from the desktop screen is drawn where it belongs. */}
        <div className="schm-weekrow">
          <button className="schm-nav" onClick={() => setWeekKey(k => addWeeks(k, -1))} aria-label="Previous week"><Icon name="chevron" style={{ width: 18, height: 18, transform: 'rotate(180deg)' }} /></button>
          <button className="schm-weeknow" onClick={() => setWeekKey(thisWeekKey())}>
            <b>{weekLabel(weekKey)}</b>
            <small>{weekKey === thisWeekKey() ? 'This week' : 'Tap for this week'}</small>
          </button>
          <button className="schm-nav" onClick={() => setWeekKey(k => addWeeks(k, 1))} aria-label="Next week"><Icon name="chevron" style={{ width: 18, height: 18 }} /></button>
          <button className="schm-nav" onClick={load} aria-label="Refresh"><Icon name="refresh" style={{ width: 18, height: 18 }} /></button>
        </div>

        {/* the four ways to fill a week in from something else */}
        <div className="schm-acts">
          <button onClick={copyLastWeek}>Copy last week</button>
          <button onClick={fillFromRegular}>Fill empties from regular hours</button>
          <button onClick={() => openTpl('save')}>Save as template</button>
          <button onClick={() => openTpl('load')}>Load template</button>
        </div>

        <div className="schm-acts">
          <button onClick={() => setOffices(OFFICES)} className={offices.length === OFFICES.length ? 'on' : ''}>All</button>
          {OFFICES.map(o => (
            <button key={o} onClick={() => toggleOffice(o)} className={offices.length !== OFFICES.length && offices.includes(o) ? 'on' : ''}>{o}</button>
          ))}
        </div>

        <div className="schm-seg">
          {SCHED_VIEWS.map(([id, label]) => (
            <button key={id} onClick={() => setView(id)} className={view === id ? 'on' : ''}>{label}</button>
          ))}
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
          {[['empty', emptyCount, 'empty'], ['unpub', unpubCount, 'unpublished'], ['open', openCount, 'open']].map(([id, n, label]) => (
            <button key={id} onClick={() => setStatusHi(h => h === id ? null : id)} className={statusHi === id ? 'on' : ''}>
              <b className="mono">{n}</b> {label}
            </button>
          ))}
          <span className="mono schm-status-tot">{dayTotal} today · {dayHrs}h</span>
        </div>

        {published && anySaved && <div className="schm-note"><Icon name="check" style={{ width: 14, height: 14 }} /> All shifts published{isSup ? ' — your edits need manager approval' : ''}</div>}
        {pending.length > 0 && <ApprovalsPanel me={me} access={access} requests={pending} onActed={load} flash={flash} />}

        {loading ? <div className="schm-empty">Loading…</div> : dayGroups.length === 0 ? (
          <div className="schm-empty">No one on the roster for this selection.</div>
        ) : dayGroups.map(g => {
          const gk = g.office + '|' + g.dept;
          const closed = !!collapsed[gk];
          const hue = deptHue(g.dept || 'Unassigned');
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
                    return (
                      <button key={s.id} className="schm-row" onClick={() => setModal({ office: s._office, empId: p.id, date: dayISO, shift: s })}
                        style={{ opacity: dim(s) ? 0.35 : 1, borderLeftColor: s.open ? 'var(--warn)' : s.offered ? 'oklch(0.6 0.16 320)' : s.pub ? 'oklch(0.55 0.14 150)' : `oklch(0.58 0.14 ${hue})` }}>
                        <Avatar name={p.name} size={38} style={{ background: `linear-gradient(150deg, oklch(0.7 0.1 ${deptHue(p.dept)}), oklch(0.55 0.12 ${deptHue(p.dept)}))` }} />
                        <span className="schm-row-txt">
                          <span className="schm-row-name">{p.name}{otIds.has(p.id) && <em className="schm-ot">OT</em>}</span>
                          <span className="schm-row-time mono">{shiftRange(s)}</span>
                          <span className="schm-row-sub">
                            {s.open ? 'Open shift' : s.offered ? 'Offered for swap' : `${shiftHrs(s)}h`}
                            {multi ? ` · ${s._office}` : ''}{!s.pub && !s.open ? ' · new' : ''}{bo ? ' · blackout' : ''}
                          </span>
                          {s.note && <span className="schm-row-note"><Icon name="chat" style={{ width: 11, height: 11, flex: 'none' }} /> {s.note}</span>}
                        </span>
                        <Icon name="chevron" style={{ width: 15, height: 15, color: 'var(--ink-3)', flex: 'none' }} />
                      </button>
                    );
                  }))}
                  {g.off.length > 0 && (
                    <div className="schm-off">
                      {g.off.map(({ p }) => (
                        <button key={p.id} onClick={() => openSlot(g.office, p.id)} className={boFor(p.id, dayISO) ? 'bo' : ''}
                          title={boFor(p.id, dayISO) ? 'Approved blackout — this person can’t work this day' : 'Not scheduled — tap to add'}>
                          {p.name}{boFor(p.id, dayISO) ? ' ⃰' : ''}
                        </button>
                      ))}
                    </div>
                  )}
                  <button className="schm-add" onClick={() => openSlot(g.office, null)}>+ Add shift</button>
                </>
              )}
            </div>
          );
        })}

        {/* staff list, with the search and sort that act on it sitting directly on top */}
        <div className="schm-team">
          <div className="schm-search">
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search team…" />
            <button onClick={() => setSortBy(s2 => s2 === 'name' ? 'hours' : 'name')}>{sortBy === 'name' ? 'A–Z' : 'Hrs'}</button>
          </div>
          {focusEmp && (
            <button className="schm-clear" onClick={() => setFocusEmp(null)}>Showing one person — show everyone again</button>
          )}
          {sidebar.map(p => (
            <div key={p.id + p.office} className={focusEmp === p.id ? 'schm-teamrow on' : 'schm-teamrow'}>
              <button className="schm-teamname" onClick={() => setFocusEmp(focusEmp === p.id ? null : p.id)}>
                <Avatar name={p.name} size={34} style={{ background: `linear-gradient(150deg, oklch(0.7 0.1 ${deptHue(p.dept)}), oklch(0.55 0.12 ${deptHue(p.dept)}))` }} />
                <span><b>{p.name}</b><small>{p.dept}</small></span>
                <span className="mono">{p.hours}h{p.ot ? <em className="schm-ot">OT</em> : null}</span>
              </button>
              <button className="schm-teamreg" onClick={() => setRegOpen(true)}>Regular hours</button>
            </div>
          ))}
        </div>

        {/* acts on the whole displayed week, so it sits below the week's content */}
        <div className="schm-danger">
          <button onClick={() => bulk('unassign')}>Mark all shifts open</button>
          <button className="d" onClick={() => { if (window.confirm('Delete every shift currently displayed? This cannot be undone.')) bulk('delete'); }}>Delete all shifts</button>
          <button onClick={() => setImpOpen(true)}>Import from Deputy</button>
        </div>

        {/* Publish is the one thing you are always about to do — pinned, never scrolled away */}
        <div className="schm-pubbar">
          <button className="btn btn-primary" disabled={!dirty && unpubCount === 0} onClick={publish}>
            <Icon name="check" /> Publish{unpubCount ? ` (${unpubCount})` : ''}
          </button>
        </div>

        {modal && <ShiftModal key={(modal.shift && modal.shift.id) || 'new'} modal={modal} offices={offices} weekShifts={allWeekShifts} blackouts={blackouts} regIndex={regIndex} onSave={saveShift} onDelete={deleteShift} onClose={() => setModal(null)} />}
        {impOpen && <DeputyImportModal offices={OFFICES} flash={flash} onDone={() => { setImpOpen(false); load(true); }} onClose={() => setImpOpen(false)} />}
        {regOpen && <RegularHoursModal roster={allRoster} profiles={regHours} flash={flash}
          onSaved={p => { setRegHours(list => [...list.filter(x => x.id !== p.id), p]); }}
          onClose={() => setRegOpen(false)} />}
        {tplModal === 'save' && <NameModal title="Save week as template" hint={`Saves ${offices[0]}'s currently displayed week as a reusable setup.`} onSave={saveTemplate} onClose={() => setTplModal(null)} />}
        {tplModal === 'load' && <LoadTplModal office={offices[0]} templates={templates} onPick={loadTemplate} onDelete={async t => { try { await schedAction({ action: 'template_delete', office: offices[0], id: t.id }); setTemplates(x => x.filter(y => y.id !== t.id)); } catch (e) { flash(e.message); } }} onClose={() => setTplModal(null)} />}

        {toast && (
          <div className="fade-in" style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 95, background: 'var(--ink)', color: 'var(--surface)', padding: '11px 20px', borderRadius: 'var(--r-pill)', fontSize: 13.5, fontWeight: 600, boxShadow: 'var(--shadow-lg)', display: 'flex', alignItems: 'center', gap: 9 }}>
            <Icon name="check" style={{ width: 16, height: 16, color: 'oklch(0.8 0.13 155)' }} /> {toast}
          </div>
        )}
      </StepShell>
    );
  }

  return (
    <StepShell icon="grid" eyebrow="Scheduling" title="Schedule builder"
      subtitle="Click any slot to add a shift. You can repeat shifts across weeks, and copy a week's schedule as a future template with the Copy button. To lock-in a schedule, click Publish; this will save your changes and send notification that the latest schedule is available to view."
      onBack={onBack}
      aside={
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="btn btn-ghost" onClick={load} title="Reload changes made by others"><Icon name="refresh" /> Refresh</button>
          <div style={{ position: 'relative' }}>
            <button className="btn btn-ghost" onClick={() => setMenu(m => m === 'copy' ? null : 'copy')}><Icon name="doc" /> Copy <Icon name="chevron" style={{ width: 14, height: 14, transform: 'rotate(90deg)' }} /></button>
            {menu === 'copy' && <Dropdown onClose={() => setMenu(null)} items={[
              ['Copy last week', `Pull ${weekLabel(addWeeks(weekKey, -1))} into this week`, copyLastWeek],
              ['Fill empties from regular hours', 'Lay each person’s standing hours onto their empty slots only', fillFromRegular],
              ['Save as template…', 'Keep this week as a named setup', () => openTpl('save')],
              ['Load template…', 'Apply a saved setup to this week', () => openTpl('load')],
            ]} />}
          </div>
          <div style={{ position: 'relative' }}>
            <button className="btn btn-ghost" onClick={() => setMenu(m => m === 'options' ? null : 'options')}><Icon name="dots" /> Options</button>
            {menu === 'options' && <Dropdown onClose={() => setMenu(null)} items={[
              ['Mark all shifts open', 'Every displayed shift stays in place but is flagged open — up for grabs', () => bulk('unassign')],
              ['Regular hours…', 'Set someone’s standing weekly hours and overtime threshold', () => { setMenu(null); setRegOpen(true); }],
              ['Import from Deputy…', 'Load a Deputy roster export into this week’s schedule', () => { setMenu(null); setImpOpen(true); }],
              ['Delete all shifts', 'Removes every displayed shift — irreversible', () => { if (window.confirm('Delete every shift currently displayed? This cannot be undone.')) bulk('delete'); }, true],
            ]} />}
          </div>
          <button className="btn btn-primary" disabled={!dirty && unpubCount === 0} onClick={publish}>
            <Icon name="check" /> Publish{unpubCount ? ` (${unpubCount})` : ''}
          </button>
        </div>
      }>

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
          {SCHED_VIEWS.map(([id, label]) => (
            <button key={id} onClick={() => setView(id)} style={{ border: 'none', cursor: 'pointer', padding: '7px 14px', fontSize: 12.5, fontWeight: 600, background: view === id ? 'var(--ink)' : 'var(--surface)', color: view === id ? 'var(--surface)' : 'var(--ink-2)' }}>{label}</button>
          ))}
        </div>
        {published && anySaved && <span className="badge badge-ok"><Icon name="check" /> All shifts published{isSup ? ' — your edits need manager approval' : ''}</span>}
      </div>

      {pending.length > 0 && <ApprovalsPanel me={me} access={access} requests={pending} onActed={load} flash={flash} />}

      <div style={{ display: 'grid', gridTemplateColumns: `${fit.side}px minmax(0, 1fr)`, gap: 'var(--gap)', alignItems: 'start' }}>
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
                  <span style={{ display: 'block', fontSize: 10.5, color: 'var(--ink-3)' }}>{p.dept}</span>
                </span>
                <span className="mono" style={{ fontSize: 12, fontWeight: 700, color: p.ot ? 'oklch(0.52 0.18 25)' : p.hours ? 'var(--ink)' : 'var(--ink-3)', display: 'flex', alignItems: 'center', gap: 4 }}>{p.ot && <span title={`Over ${otThreshold(regIndex, p)}h this week`} style={{ width: 6, height: 6, borderRadius: '50%', background: 'oklch(0.58 0.19 25)', flex: 'none' }} />}{p.hours}h</span>
              </button>
            ))}
            {sidebar.length === 0 && <div style={{ padding: 16, fontSize: 13, color: 'var(--ink-3)' }}>No one matches.</div>}
          </div>
        </div>

        {/* the grid — minWidth:0 lets the 1fr track shrink below the 900px inner min-content,
            so the overflowX:auto scroller below actually scrolls instead of pushing the page */}
        <div className="card" style={{ padding: 0, minWidth: 0 }}>
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

              {rows.map(group => {
                const gk = group.office + '|' + group.dept;
                const closed = !!collapsed[gk];
                return (
                <React.Fragment key={gk}>
                  {group.dept && (
                    <div onClick={() => setCollapsed(c => ({ ...c, [gk]: !closed }))} style={{ display: 'grid', gridTemplateColumns: colTemplate, background: `color-mix(in oklab, oklch(0.65 0.1 ${deptHue(group.dept)}) 10%, var(--surface))`, borderBottom: '1px solid var(--line)', cursor: 'pointer', userSelect: 'none' }} title={closed ? 'Expand' : 'Collapse'}>
                      <div style={{ padding: '6px 14px', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.06em', color: `color-mix(in oklab, oklch(0.5 0.13 ${deptHue(group.dept)}) 65%, var(--ink))`, display: 'flex', alignItems: 'center', gap: 7, whiteSpace: 'nowrap', minWidth: 0 }}>
                        <Icon name="chevron" style={{ width: 11, height: 11, flex: 'none', transform: closed ? 'none' : 'rotate(90deg)', transition: 'transform .12s' }} />
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{group.dept} — {group.office}{closed ? ` (${group.people.length})` : ''}</span>
                      </div>
                      {days.map(d => {
                        const ids = new Set(group.people.map(p => p.id));
                        const n = shifts.filter(s => s.date === d.date && !s.open && ids.has(s.empId) && (!group.office || s._office === group.office)).length;
                        return (
                          <div key={d.date} style={{ borderLeft: '1px solid var(--line)', display: 'grid', placeItems: 'center', padding: '4px 2px' }}>
                            <span className="mono" title={`${n} scheduled`} style={{ fontSize: 10.5, fontWeight: 700, minWidth: 17, textAlign: 'center', padding: '1px 5px', borderRadius: 'var(--r-pill)', color: n ? `color-mix(in oklab, oklch(0.45 0.13 ${deptHue(group.dept)}) 70%, var(--ink))` : 'var(--ink-3)', background: n ? 'color-mix(in oklab, var(--surface) 70%, transparent)' : 'transparent' }}>{n || '·'}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {!closed && group.people.map((p, ri) => (
                    <div key={p.id + p.office} style={{ display: 'grid', gridTemplateColumns: colTemplate, borderBottom: '1px solid var(--line-soft)' }}>
                      <div style={{ padding: '8px 13px', display: 'flex', alignItems: 'center', gap: 9, borderRight: '1px solid var(--line)', minWidth: 0 }}>
                        <Avatar name={p.name} size={28} style={{ background: `linear-gradient(150deg, oklch(0.7 0.1 ${deptHue(p.dept)}), oklch(0.55 0.12 ${deptHue(p.dept)}))` }} />
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: 12.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                          {view === 'person' && <div style={{ fontSize: 10.5, color: 'var(--ink-3)' }}>{p.dept}</div>}
                        </div>
                      </div>
                      {days.map(d => {
                        const list = cellShifts(p.id, d.date, group.office);
                        const bo = boFor(p.id, d.date);
                        const isEmpty = list.length === 0;
                        return (
                          <div key={d.date} onClick={() => { if (isEmpty) setModal({ office: p.office, empId: p.id, date: d.date, shift: null }); }}
                            className="sched-cell"
                            style={{ borderLeft: '1px solid var(--line-soft)', padding: 4, minHeight: 48, display: 'flex', flexDirection: 'column', gap: 3, cursor: isEmpty ? 'pointer' : 'default',
                              background: bo ? 'repeating-linear-gradient(45deg, var(--danger-soft), var(--danger-soft) 6px, transparent 6px, transparent 12px)' : 'transparent',
                              outline: statusHi === 'empty' && isEmpty ? '2px dashed var(--accent)' : 'none', outlineOffset: -2 }}
                            title={bo ? 'Approved blackout — this person can’t work this day' : ''}>
                            {list.map(s => <SchedShift key={s.id + s._office} s={s} hue={deptHue(p.dept)} multi={multi && !group.office} dim={dim(s)} hi={statusHi === 'unpub' && !s.pub} ot={otIds.has(p.id)} onClick={() => setModal({ office: s._office, empId: p.id, date: d.date, shift: s })} />)}
                            {isEmpty && <div style={{ flex: 1, display: 'grid', placeItems: 'center', color: 'var(--ink-3)', opacity: 0.3 }}><Icon name="plus" style={{ width: 13, height: 13 }} /></div>}
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

      {modal && <ShiftModal key={(modal.shift && modal.shift.id) || 'new'} modal={modal} offices={offices} weekShifts={allWeekShifts} blackouts={blackouts} regIndex={regIndex} onSave={saveShift} onDelete={deleteShift} onClose={() => setModal(null)} />}
      {impOpen && <DeputyImportModal offices={OFFICES} flash={flash} onDone={() => { setImpOpen(false); load(true); }} onClose={() => setImpOpen(false)} />}
      {regOpen && <RegularHoursModal roster={allRoster} profiles={regHours} flash={flash}
        onSaved={p => { setRegHours(list => [...list.filter(x => x.id !== p.id), p]); }}
        onClose={() => setRegOpen(false)} />}
      {tplModal === 'save' && <NameModal title="Save week as template" hint={`Saves ${offices[0]}'s currently displayed week as a reusable setup.`} onSave={saveTemplate} onClose={() => setTplModal(null)} />}
      {tplModal === 'load' && <LoadTplModal office={offices[0]} templates={templates} onPick={loadTemplate} onDelete={async t => { try { await schedAction({ action: 'template_delete', office: offices[0], id: t.id }); setTemplates(x => x.filter(y => y.id !== t.id)); } catch (e) { flash(e.message); } }} onClose={() => setTplModal(null)} />}

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

/* modals render through a portal to document.body: an ancestor with a CSS transform
   makes position:fixed anchor to that ancestor instead of the viewport, which is why
   the popup was landing mid-scroll-area instead of mid-screen */
function SchedPortal({ children }) { return ReactDOM.createPortal(children, document.body); }

/* ---- the shift form (§2.1, §2.2, §2.3): presets + typed times, repeats,
        conflict warning that never blocks ---- */
function ShiftModal({ modal, offices, weekShifts, blackouts, regIndex, onSave, onDelete, onClose }) {
  const s = modal.shift;
  const [office, setOffice] = useState(modal.office);
  const [open, setOpen] = useState(s ? !!s.open : false);
  const [empId, setEmpId] = useState(s ? (s.empId || '') : (modal.empId || ''));
  const [date, setDate] = useState(modal.date);
  const [start, setStart] = useState(s ? s.start : '09:00');
  const [end, setEnd] = useState(s ? s.end : '17:00');
  const [breakMins, setBreakMins] = useState(s ? (Number(s.breakMins) || 0) : DEFAULT_MEAL_BREAK);
  const [note, setNote] = useState(s ? (s.note || '') : '');
  const [repeat, setRepeat] = useState('none');
  const [repeatN, setRepeatN] = useState(3);
  const team = officeRoster(office);
  const others = (typeof EMPLOYEES !== 'undefined' ? EMPLOYEES : [])
    .filter(e => e.status === 'Active' && (e.loc || e.location) !== office && !['', 'Unassigned'].includes(e.loc || e.location || ''))
    .map(e => ({ id: e.id, name: e.name, dept: e.department || 'Unassigned', office: e.loc || e.location, emailLower: (e.emailLower || e.workEmail || '').toLowerCase() }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const emp = team.find(p => p.id === empId) || others.find(p => p.id === empId);

  const conflict = useMemo(() => open || !empId ? { shifts: [], blackout: null } :
    shiftConflicts({ shifts: weekShifts, blackouts, empId, date, start, end, excludeId: s && s.id }),
    [empId, date, start, end, open]);
  const hasConflict = conflict.shifts.length > 0 || !!conflict.blackout;
  const valid = date && start && end && timeMins(end) > timeMins(start) && empId;

  const preset = SHIFT_PRESETS.find(p => p.start === start && p.end === end);

  /* regular hours (MH #2/#5): the person's standing hours for this weekday, and
     whether this week's total would pass their overtime threshold */
  const reg = useMemo(() => empId && emp ? regHoursOnDate(regIndex, emp, date) : null, [regIndex, empId, date, emp]);
  const useReg = () => { if (reg) { setStart(reg.start); setEnd(reg.end); setBreakMins(reg.breakMins); } };
  const ot = useMemo(() => {
    if (!empId || open || !valid) return null;
    const limit = otThreshold(regIndex, emp || { id: empId });
    const others = (weekShifts || []).filter(x => x.empId === empId && !x.open && x.id !== (s && s.id));
    const total = others.reduce((a, x) => a + shiftHrs(x), 0) + shiftHrs({ start, end, breakMins });
    const over = Math.round((total - limit) * 10) / 10;
    return over > 0 ? { over, limit, total: Math.round(total * 10) / 10 } : null;
  }, [regIndex, empId, open, valid, weekShifts, start, end, breakMins, emp]);
  return (
    <SchedPortal>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'oklch(0.2 0.02 230 / 0.4)', zIndex: 80 }} />
      <div className="card fade-in" role="dialog" aria-modal="true" style={{ position: 'fixed', top: 'calc(64px + 16px)', left: 0, right: 0, margin: '0 auto', zIndex: 81, width: 'min(480px, 94vw)', maxHeight: 'calc(100vh - 64px - 32px)', overflowY: 'auto', padding: 0, boxShadow: 'var(--shadow-lg)' }}>
        <div style={{ padding: '16px 20px 12px', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--accent-strong)' }}>{s ? 'Edit shift' : 'New shift'}</div>
            <h3 style={{ fontSize: 17, margin: '2px 0 0' }}>{office} · {date}</h3>
          </div>
          <button onClick={onClose} className="btn btn-quiet" style={{ width: 30, height: 30, padding: 0, justifyContent: 'center' }}><Icon name="x" style={{ width: 14, height: 14 }} /></button>
        </div>
        <div style={{ padding: '14px 20px', display: 'flex', flexDirection: 'column', gap: 13 }}>
          {ot && (
            <div style={{ border: '1.5px solid oklch(0.58 0.19 25)', background: 'color-mix(in oklab, oklch(0.6 0.19 25) 10%, var(--surface))', borderRadius: 'var(--r-md)', padding: '10px 13px', fontSize: 12.5, lineHeight: 1.5, color: 'oklch(0.45 0.16 25)' }}>
              <b style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Icon name="bell" style={{ width: 14, height: 14 }} /> Regular working hours exceeded by {ot.over} {ot.over === 1 ? 'hour' : 'hours'}</b>
              <div style={{ marginTop: 3 }}>This week would total <b className="mono">{ot.total}h</b> against a {ot.limit}h limit. You can still save.</div>
            </div>
          )}
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
                <optgroup label={office}>
                  {team.map(p => <option key={p.id} value={p.id}>{p.name} · {p.dept}</option>)}
                </optgroup>
                <optgroup label="Other offices">
                  {others.map(p => <option key={p.id} value={p.id}>{p.name} · {p.office}</option>)}
                </optgroup>
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
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-2)' }}>Time — pick a preset or type exact times</div>
              {reg && (
                <span style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>
                  Regular hours <span className="mono">{fmt12(reg.start)}–{fmt12(reg.end)}</span>
                  <button onClick={useReg} className="btn btn-quiet" style={{ marginLeft: 6, padding: '2px 9px', fontSize: 11, fontWeight: 700 }}>Use</button>
                </span>
              )}
            </div>
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
              <span className="mono" style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink-2)', whiteSpace: 'nowrap' }}>{valid ? shiftHrs({ start, end, breakMins }) + 'h' : '—'}</span>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 9, fontSize: 12, fontWeight: 700, color: 'var(--ink-2)' }}>Unpaid break
              <input type="number" min="0" max="480" step="5" value={breakMins} onChange={e => setBreakMins(Math.max(0, Number(e.target.value) || 0))} className="mono" style={{ width: 68, padding: '7px 9px', border: '1px solid var(--line)', borderRadius: 'var(--r-sm)', fontSize: 13, background: 'var(--surface)' }} />
              <span style={{ fontWeight: 600, color: 'var(--ink-3)' }}>minutes — deducted from the total{breakMins ? ` (${fmt12(start)}–${fmt12(end)} less ${breakLabel(breakMins)})` : ''}</span>
            </label>
          </div>
          {!s && (
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <label style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 5, fontSize: 12, fontWeight: 700, color: 'var(--ink-2)' }}>Repeat
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
          <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 12, fontWeight: 700, color: 'var(--ink-2)' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Icon name="chat" style={{ width: 13, height: 13 }} /> Note for this shift <span style={{ fontWeight: 600, color: 'var(--ink-3)' }}>— the employee sees it once published</span></span>
            <textarea value={note} onChange={e => setNote(e.target.value.slice(0, 280))} rows="2" placeholder="e.g. Lab case manager — cover front desk at lunch" style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 'var(--r-sm)', fontSize: 13.5, background: 'var(--surface)', resize: 'vertical', fontFamily: 'inherit' }}></textarea>
          </label>
          {hasConflict && (
            <div style={{ border: '1.5px solid var(--warn)', background: 'var(--warn-soft)', borderRadius: 'var(--r-md)', padding: '10px 13px', fontSize: 12.5, lineHeight: 1.5, color: 'oklch(0.42 0.11 60)' }}>
              <b style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Icon name="bell" style={{ width: 14, height: 14 }} /> Conflict</b>
              {conflict.shifts.map(c => <div key={c.id}>{emp ? emp.name : 'They'} already work{emp ? 's' : ''} {shiftRange(c)} this day{c._office && c._office !== office ? ` at ${c._office}` : ''}.</div>)}
              {conflict.blackout && <div>{emp ? emp.name : 'This person'} has an approved blackout on {date}.</div>}
              <div style={{ marginTop: 4, fontWeight: 600 }}>You can still save — the warning never blocks.</div>
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, padding: '13px 20px 16px', borderTop: '1px solid var(--line)' }}>
          {s && <button onClick={() => onDelete({ office, shift: s })} className="btn btn-ghost" style={{ color: 'oklch(0.55 0.15 25)' }}><Icon name="trash" /> Delete</button>}
          <div style={{ flex: 1 }} />
          <button onClick={onClose} className="btn btn-ghost">Cancel</button>
          <button disabled={!valid} onClick={() => onSave({ office, empId, open, date, start, end, breakMins, note, repeat, repeatN, shift: s })} className="btn btn-primary">
            <Icon name="check" /> {hasConflict ? 'Save anyway' : 'Save shift'}
          </button>
        </div>
      </div>
    </SchedPortal>
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
    <SchedPortal>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'oklch(0.2 0.02 230 / 0.4)', zIndex: 80 }} />
      <div className="card fade-in" style={{ position: 'fixed', top: 'calc(64px + 16px)', left: 0, right: 0, margin: '0 auto', zIndex: 81, width: 'min(380px, 92vw)', maxHeight: 'calc(100vh - 64px - 32px)', overflowY: 'auto', padding: 20, boxShadow: 'var(--shadow-lg)' }}>
        <h3 style={{ fontSize: 16, marginBottom: 4 }}>{title}</h3>
        <p style={{ fontSize: 12.5, color: 'var(--ink-3)', marginBottom: 12 }}>{hint}</p>
        <input autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="Template name" onKeyDown={e => { if (e.key === 'Enter' && name.trim()) onSave(name.trim()); }}
          style={{ width: '100%', boxSizing: 'border-box', padding: '9px 11px', border: '1px solid var(--line)', borderRadius: 'var(--r-sm)', fontSize: 14, background: 'var(--surface)' }} />
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
          <button onClick={onClose} className="btn btn-ghost">Cancel</button>
          <button disabled={!name.trim()} onClick={() => onSave(name.trim())} className="btn btn-primary"><Icon name="check" /> Save</button>
        </div>
      </div>
    </SchedPortal>
  );
}

function LoadTplModal({ office, templates, onPick, onDelete, onClose }) {
  return (
    <SchedPortal>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'oklch(0.2 0.02 230 / 0.4)', zIndex: 80 }} />
      <div className="card fade-in" style={{ position: 'fixed', top: 'calc(64px + 16px)', left: 0, right: 0, margin: '0 auto', zIndex: 81, width: 'min(420px, 92vw)', maxHeight: 'calc(100vh - 64px - 32px)', overflowY: 'auto', padding: 20, boxShadow: 'var(--shadow-lg)' }}>
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
    </SchedPortal>
  );
}

Object.assign(window, { Scheduler });
