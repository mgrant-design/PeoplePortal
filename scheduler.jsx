/* scheduler.jsx — schedule builder (full rewrite per SCHEDULER.md).
   Click-to-edit only (D9). Weekly grid, any week (past/future). Shift form has
   presets AND typed times (D10). Everyone on the office roster appears (D11);
   the by-Department view groups on the employee record's department field.
   Publishing locks per office, per week (D5). Supervisor edits to a published
   week queue for manager approval; the server decides, never the client.
   No wages (D2), no coverage targets (D12), no drag-and-drop, no auto-fill. */

/* ---- Builder logic with no screen parts ---- */
/* a message at the bottom of the page. A new one replaces the one showing and gets its own
   full time; ok = false shows it as a problem. */
function makeFlash(show, timers) {
  const t = timers || { set: (fn, ms) => setTimeout(fn, ms), clear: (id) => clearTimeout(id) };
  let timer = null;
  return (m, ok = true, ms = 3200) => { t.clear(timer); show({ m, ok }); timer = t.set(() => show(null), ms); };
}

/* "Eli Test, Tue, Nov 17 8a–4p" for each clashing shift; three named, then a count */
function clashText(list) {
  const people = schedAll();
  const one = (sh) => {
    const p = people.find(e => e.id === sh.empId);
    const day = new Date(sh.date + 'T00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    return `${p ? p.name : 'Open shift'}, ${day} ${shiftRange(sh)}`;
  };
  return list.slice(0, 3).map(one).join('; ') + (list.length > 3 ? ` and ${list.length - 3} more` : '');
}

/* a supervisor's changes to a published week, sent one by one as requests to their manager.
   A change to an existing shift carries the shift as the supervisor's screen had it (`was`),
   so the server refuses it if the shift has changed since. → how many went, and the ones
   that didn't, in the same shape as the changes. */
async function sendChangesForApproval(office, wk, changes, submit) {
  const list = [
    ...(changes.add || []).map(sh => ({ op: 'add', shift: sh })),
    ...(changes.update || []).map(u => ({ op: 'update', shift: u.shift, was: u.was })),
    ...(changes.remove || []).map(r => ({ op: 'remove', shiftId: r.id, was: r.was })),
  ];
  let sent = 0; const failed = { add: [], update: [], remove: [] }; let why = '';
  for (const change of list) {
    try { await submit('schedEdit', { office, weekKey: wk, change }); sent++; }
    catch (e) {
      why = why || e.message;
      if (change.op === 'add') failed.add.push(change.shift);
      else if (change.op === 'update') failed.update.push({ shift: change.shift, was: change.was });
      else failed.remove.push({ id: change.shiftId, was: change.was });
    }
  }
  return { sent, failed, why, failedCount: failed.add.length + failed.update.length + failed.remove.length };
}

/* saves one office's draft at Publish. → { publish: true, clear: true } when it saved and the
   week can be published; { clear: true, note } when a manager published the week meanwhile
   and every change went to the supervisor's manager; { remaining, note } when some couldn't
   be sent (remaining = the week with only those changes, so nothing is sent twice);
   { note } when the save failed and the draft stays as it is. */
async function saveDraftChanges({ office, weekKey, doc, isSup, save, submit }) {
  const changes = PD_WEEK.diffWeek(doc._base || [], doc.shifts || []);
  try {
    if (changes.add.length || changes.update.length || changes.remove.length) await save({ action: 'save', office, weekKey, changes });
    return { publish: true, clear: true };
  } catch (e) {
    if (!(isSup && e.body && e.body.pendingRequired)) return { note: { m: `${office} save failed: ${e.message} — not published.`, ok: false } };
    const r = await sendChangesForApproval(office, weekKey, changes, submit);
    const went = `${r.sent} change${r.sent === 1 ? '' : 's'} went to your manager`;
    if (!r.failedCount) return { clear: true, note: { m: `${office}: a manager published this week meanwhile, so your ${went} for approval.`, ok: true } };
    return {
      remaining: PD_WEEK.applyChanges(doc._base || [], r.failed).shifts,
      note: { m: `${office}: ${went}; ${r.failedCount} couldn’t be sent (${r.why}) and stay${r.failedCount === 1 ? 's' : ''} as a draft.`, ok: false },
    };
  }
}

/* writes the held repeat copies into their own weeks. One aimed at a week that is already
   published goes to a supervisor's manager as a request. → the copies to keep for the next
   Publish (the ones that failed), and a note for each. */
async function saveHeldRepeats(held, { isSup, save, submit }) {
  const kept = [], notes = [];
  for (const r of held) {
    const changes = { add: [r.shift], update: [], remove: [] };
    try { await save({ action: 'save', office: r.office, weekKey: r.weekKey, changes }); }
    catch (e) {
      let why = e.message;
      if (isSup && e.body && e.body.pendingRequired) {
        const sent = await sendChangesForApproval(r.office, r.weekKey, changes, submit);
        if (!sent.failedCount) continue;
        why = sent.why;
      }
      kept.push(r);
      notes.push({ m: `Repeat for week of ${r.weekKey} wasn’t saved (${why}). It’s kept and will be tried again when you publish.`, ok: false });
    }
  }
  return { kept, notes };
}

/* one message for a whole Publish, the problems first, shown long enough to read */
function publishSummary(notes) {
  if (!notes.length) return null;
  const bad = notes.filter(n => !n.ok), good = notes.filter(n => n.ok);
  return { m: [...bad, ...good].map(n => n.m).join(' '), ok: !bad.length, ms: Math.min(20000, 3200 + 2500 * (notes.length - 1) + (bad.length ? 5000 : 0)) };
}
/* ---- end of Builder logic ---- */

function Scheduler({ me, access, onBack }) {
  const OFFICES = useMemo(() => editableOffices(me, access), [me.id, access]);
  const isSup = !!(access && access.flags && access.flags.isSupervisor && !access.flags.isAdmin);
  /* org config is Admin / HR / Leadership on the server; mirror it so the menu entry only
     shows to someone whose save would actually be accepted */
  const canOrg = !!(access && access.flags && (access.flags.isAdmin || access.flags.isHR || access.flags.isExec));
  const [offices, setOffices] = useState(() => { const v = PD_DRAFTS.getView(); const keep = v && v.offices.filter(o => OFFICES.includes(o)); return keep && keep.length ? keep : OFFICES; }); // "All" is the default view
  // a different set of editable offices (an admin previewing another level, a changed setting) resets the view
  const officesSeen = useRef(OFFICES.join('|'));
  useEffect(() => { if (officesSeen.current !== OFFICES.join('|')) { officesSeen.current = OFFICES.join('|'); setOffices(OFFICES); } }, [OFFICES.join('|')]);
  const [weekKey, setWeekKey] = useState(() => { const v = PD_DRAFTS.getView(); return (v && v.weekKey) || thisWeekKey(); });
  useEffect(() => { PD_DRAFTS.setView({ weekKey, offices }); }, [weekKey, offices.join('|')]);
  const [view, setView] = useState('dept');
  const [docs, setDocs] = useState({});           // office → week doc
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);       // { office, empId|null, date, shift|null }
  const [search, setSearch] = useState('');
  const [dept, setDept] = useState('');           // '' = every department
  /* hours-first by default: whoever is closest to overtime belongs at the top, which is
     the reason to look at this list at all */
  const [sortBy, setSortBy] = useState('hours');  // name | hours
  const [statusHi, setStatusHi] = useState(null); // empty | unpub | open
  const [focusEmp, setFocusEmp] = useState(null);
  const [collapsed, setCollapsed] = useState({}); // 'office|dept' → true
  const [menu, setMenu] = useState(null);         // 'copy' | 'options' | null
  const [tplModal, setTplModal] = useState(null); // 'save' | 'load'
  const [regOpen, setRegOpen] = useState(false);  // regular-hours editor
  const [impOpen, setImpOpen] = useState(false);  // CSV schedule import
  const [regHours, setRegHours] = useState([]);   // standing weekly-hours profiles
  const [templates, setTemplates] = useState([]);
  const [toast, setToast] = useState(null);
  /* phone layout (see useSchedFit): which day is showing, and which sheet is open */
  const fit = useSchedFit();
  const narrow = fit.narrow;
  const [mDay, setMDay] = useState(null);       // ISO date | null = auto (today, else Mon)
  const flashRef = useRef(null);
  if (!flashRef.current) flashRef.current = makeFlash(setToast);
  const flash = flashRef.current;

  const days = useMemo(() => weekDaysFor(weekKey), [weekKey]);
  const roster = useMemo(() => {
    let r = offices.flatMap(o => officeRoster(o, schedAll()));
    if (search.trim()) { const q = search.trim().toLowerCase(); r = r.filter(p => p.name.toLowerCase().includes(q)); }
    if (dept) r = r.filter(p => p.dept === dept);
    return r;
  }, [offices, search, dept]);
  const multi = offices.length > 1;
  /* unfiltered team for the regular-hours picker (the search box scopes the grid, not this) */
  const allRoster = useMemo(() => offices.flatMap(o => officeRoster(o, schedAll())), [offices]);
  /* every department present across the selected offices — "only the Dental Assistants
     in the offices I pick", which the name-only search box could never do */
  const DEPTS = useMemo(() => [...new Set(allRoster.map(p => p.dept).filter(Boolean))].sort(), [allRoster]);
  useEffect(() => { fetchRegHours().then(setRegHours).catch(() => setRegHours([])); }, []);

  /* every displayed shift, tagged with its office */
  const shifts = useMemo(() => offices.flatMap(o => ((docs[o] && docs[o].shifts) || []).map(s => ({ ...s, _office: o }))), [docs, offices]);
  const allWeekShifts = shifts; // conflict checks run against the loaded week
  /* approved time off for the week on screen: striped on the grid, warned on in the shift dialog */
  const [timeOff, setTimeOff] = useState([]);
  useEffect(() => {
    const days = weekDaysFor(weekKey);
    const get = () => fetchApprovedTimeOff({ from: days[0].date, to: days[6].date }).then(setTimeOff).catch(() => setTimeOff([]));
    get();
    window.addEventListener('pd-approvals-changed', get);
    return () => window.removeEventListener('pd-approvals-changed', get);
  }, [weekKey]);
  /* mode: nothing = ask first if there are unpublished edits, then discard them; true = discard;
     'keep' = put the unpublished edits kept in PD_DRAFTS back over what the server sent */
  const loadSeq = useRef(0);
  const load = (mode) => {
    if (mode !== 'keep') {
      if (dirty && mode !== true && !window.confirm('You have unpublished changes — loading discards them. Continue?')) return;
      PD_DRAFTS.clearWeek(weekKey, offices); repeatsRef.current = []; PD_DRAFTS.setRepeats([]);
    }
    setLoading(true);
    const failed = { v: false };
    const mine = ++loadSeq.current;
    fetchSchedules({ offices, weekKey }).catch(() => { failed.v = true; return []; }).then((scheds) => {
      if (mine !== loadSeq.current) return;   // a newer load (another week or office) has started
      if (failed.v) {
        // the saved week didn't load: show the drafts as they are, change nothing in the store
        const only = {};
        offices.forEach(o => { const d = PD_DRAFTS.get(weekKey, o); if (d) only[o] = { ...d, _dirty: true }; });
        setDocs(only); setLoading(false); setDirty(Object.keys(only).length > 0 || repeatsRef.current.length > 0);
        flash('Couldn’t load the saved week. Your unpublished edits are kept; reload before publishing.', false, 8000);
        return;
      }
      const next = {};
      // _base is the week as the server sent it: what the draft's changes are measured from
      scheds.forEach(d => { if (Array.isArray(d.shifts)) next[d.office] = { ...d, _base: JSON.parse(JSON.stringify(d.shifts)) }; });
      let kept = false; const clashed = [];
      offices.forEach(o => {
        const draft = PD_DRAFTS.get(weekKey, o);
        if (!draft) return;
        // put the draft's changes onto the week as it is now; one that clashes with a change made meanwhile is left out
        const server = next[o] || { id: `${weekKey}__${o}`, office: o, weekKey, published: false, shifts: [], _base: [] };
        const { shifts, conflicts } = PD_WEEK.applyChanges(server.shifts, PD_WEEK.diffWeek(draft._base || [], draft.shifts));
        next[o] = { ...server, shifts, _dirty: true };
        PD_DRAFTS.put(weekKey, o, next[o]);
        const mine = [...(draft.shifts || []), ...(draft._base || [])];
        conflicts.forEach(c => { const sh = mine.find(x => x.id === c.id); if (sh) clashed.push(sh); });
        kept = true;
      });
      setDocs(next); setLoading(false);
      setDirty(kept || repeatsRef.current.length > 0);
      if (clashed.length) flash('Someone changed shifts you also changed, so your edits to them were left out: ' + clashText(clashed) + '. Review the week before publishing.', false, 10000);
    });
  };
  useEffect(() => load('keep'), [offices.join('|'), weekKey]);

  /* ---- persistence: DRAFT MODEL. Edits live in local state only; nothing touches
          Cosmos until Publish, which saves the week, locks it, and notifies.
          One exception, because it's an approval queue rather than a save: a
          SUPERVISOR editing a PUBLISHED week sends each change to the server
          immediately so the manager can approve or reject it. ---- */
  const docsRef = useRef(docs); useEffect(() => { docsRef.current = docs; }, [docs]);
  const [dirty, setDirty] = useState(false);
  /* our own publish() broadcasts a change for every office it saves, which reaches this
     same tab. Without this guard that self-broadcast lands on the dirty-guard below and
     asks "discard your changes?" mid-publish — for a change we already made. */
  const publishingRef = useRef(false);

  // Live update: another manager saved/published this same office+week. Reuses load()'s
  // existing dirty-guard (it already confirms before discarding local edits on a manual
  // reload) — a broadcast just triggers that same path instead of waiting for a refresh.
  // No detail (or an office/week that isn't open here) is ignored.
  useEffect(() => {
    const onChanged = (e) => {
      if (publishingRef.current) return;
      const d = e && e.detail;
      if (d && d.office && !offices.includes(d.office)) return;
      if (d && d.weekKey && d.weekKey !== weekKey) return;
      load('keep');
    };
    window.addEventListener('pd-schedule-changed', onChanged);
    return () => window.removeEventListener('pd-schedule-changed', onChanged);
  }, [offices.join('|'), weekKey, dirty]);
  const applyLocal = (office, fn) => setDocs(d => {
    const doc = d[office] || { id: `${weekKey}__${office}`, office, weekKey, published: false, shifts: [] };
    const next = { ...doc, _base: doc._base || (doc.shifts || []), shifts: fn(doc.shifts || []), _dirty: true };
    PD_DRAFTS.put(weekKey, office, next);
    return { ...d, [office]: next };
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
        await submitApproval('schedEdit', { office, weekKey: change.weekKey || weekKey, change });
        flash('Sent to your manager for approval — the schedule updates when they approve.');
      } catch (e) { flash('Change failed: ' + e.message, false); load('keep'); }
      return;
    }
    applyLocal(office, localFn); setDirty(true);
  };
  /* Bulk tools (copy last week, fill/build from regular hours, load template, mark-all-open,
     delete-all) all land here. A supervisor editing a PUBLISHED week must go through the same
     per-change approval queue oneChange() already gives a single shift edit — writing the
     whole list straight to the draft skipped that queue, so the supervisor did the work and
     then hit a 409 on Publish ("supervisor changes go through per-change approval"). Diff
     against what's there and replay each difference through oneChange instead. */
  const saveAll = async (office, nextShifts) => {
    const doc = docsRef.current[office];
    if (doc && doc.published && isSup) {
      const curById = new Map((doc.shifts || []).map(s => [s.id, s]));
      const nextById = new Map(nextShifts.map(s => [s.id, s]));
      for (const [id, s] of nextById) {
        const cur = curById.get(id);
        if (!cur) await oneChange(office, { op: 'add', shift: s }, list => [...list, s]);
        else if (JSON.stringify(cur) !== JSON.stringify(s)) await oneChange(office, { op: 'update', shift: s, was: cur }, list => [...list.filter(x => x.id !== s.id), s]);
      }
      for (const id of curById.keys()) {
        if (!nextById.has(id)) await oneChange(office, { op: 'remove', shiftId: id, was: curById.get(id) }, list => list.filter(x => x.id !== id));
      }
      return;
    }
    applyLocal(office, () => nextShifts); setDirty(true);
  };
  /* repeat copies aimed at OTHER weeks: held here until Publish, then written into
     their own week documents (each week is its own doc in Cosmos) */
  const repeatsRef = useRef(PD_DRAFTS.getRepeats()); // [{ office, weekKey, shift }]

  /* ---- shift form save / delete (incl. repeats §2.2) ---- */
  const saveShift = async (form) => {
    const base = { id: form.shift ? form.shift.id : newShiftId(), empId: form.empId, open: form.open || undefined, date: form.date, start: form.start, end: form.end };
    if (Number(form.breakMins) > 0) base.breakMins = Math.round(Number(form.breakMins));
    if (String(form.note || '').trim()) base.note = String(form.note).trim().slice(0, 280);
    setModal(null);
    await oneChange(form.office, form.shift ? { op: 'update', shift: base, was: form.shift } : { op: 'add', shift: base }, list => [...list.filter(s => s.id !== base.id), base]);
    /* repeats: daily or weekly × N, each lands in its own week doc via the same
       queued-or-applied edit action */
    const extra = [];
    if (form.repeat === 'daily') for (let i = 1; i <= form.repeatN; i++) extra.push(addDaysISO(form.date, i));
    if (form.repeat === 'weekly') for (let i = 1; i <= form.repeatN; i++) extra.push(addDaysISO(form.date, i * 7));
    for (const date of extra) {
      const wk = weekKeyOf(date);
      const copy = { ...base, id: newShiftId(), date };
      if (wk === weekKey) await oneChange(form.office, { op: 'add', shift: copy }, list => [...list, copy]);
      else { repeatsRef.current.push({ office: form.office, weekKey: wk, shift: copy }); PD_DRAFTS.setRepeats(repeatsRef.current); setDirty(true); }
    }
    if (extra.length) flash(`Shift repeated onto ${extra.length} more ${form.repeat === 'daily' ? 'day' : 'week'}${extra.length === 1 ? '' : 's'} — ${isSup ? 'saved or sent to your manager when you publish' : 'saved when you publish'}.`);
  };
  const deleteShift = async (form) => {
    setModal(null);
    await oneChange(form.office, { op: 'remove', shiftId: form.shift.id, was: form.shift }, list => list.filter(s => s.id !== form.shift.id));
  };

  /* ---- publish (§2.4) — publishes every selected office's week in view ---- */
  const unpubCount = shifts.filter(s => !s.pub).length;
  const [pubAsk, setPubAsk] = useState(false);   // publish-type step
  const [wkAsk, setWkAsk] = useState(false);     // which weekday a week starts on
  const publish = async (notifyMode) => {
    setPubAsk(false);
    publishingRef.current = true;
    /* pulled out before the office loop below: a self-triggered live-update reload
       (guarded off above, but belt-and-suspenders) must never race this array empty
       before these are written */
    const held = repeatsRef.current.splice(0);
    try {
      /* save-then-publish, per office: this is the ONLY write path for drafts.
         An office whose shifts were emptied locally (Options → Delete all shifts) must
         still be saved — skipping it left the deletion unwritten and load() pulled the
         old shifts straight back, so "delete all" silently did nothing. Only skip an
         office with nothing saved AND nothing to save. */
      const notes = [];   // every message of this Publish, shown once at the end with the problems first
      for (const office of offices) {
        const doc = docsRef.current[office];
        if (!doc) continue;
        if (!(doc.shifts || []).length && !doc._dirty) continue;
        if (doc._dirty) {
          const r = await saveDraftChanges({ office, weekKey, doc, isSup, save: schedAction, submit: submitApproval });
          if (r.clear) PD_DRAFTS.clear(weekKey, office);
          if (r.remaining) PD_DRAFTS.put(weekKey, office, { ...doc, shifts: r.remaining });
          if (r.note) notes.push(r.note);
          if (!r.publish) continue;
        }
        try {
          const res = await schedAction({ action: 'publish', office, weekKey, notify: notifyMode });
          const n = res.notify; const parts = [];
          if (n && !n.simulated) { if (n.gchat) parts.push('Google Chat'); if (n.sms) parts.push(`${n.sms} text${n.sms === 1 ? '' : 's'}`); }
          const who = res.notified === 0 ? 'nobody to notify'
            : `${res.notified} ${res.notified === 1 ? 'person' : 'people'} notified${res.mode === 'updates' ? ' (changes only)' : ''}`;
          notes.push({ m: `${office} week published — ${who}${parts.length ? ' via ' + parts.join(' + ') : ''}.`, ok: true });
        } catch (e) { notes.push({ m: office + ' publish failed: ' + e.message, ok: false }); }
      }
      /* write the held repeat copies into their future weeks (saved, not published —
         you publish those weeks when you build them); the ones that fail are kept */
      const reps = await saveHeldRepeats(held, { isSup, save: schedAction, submit: submitApproval });
      repeatsRef.current.push(...reps.kept);
      notes.push(...reps.notes);
      const sum = publishSummary(notes);
      if (sum) flash(sum.m, sum.ok, sum.ms);
      PD_DRAFTS.setRepeats(repeatsRef.current);
      load('keep');   // anything that failed to save stays as a draft
    } finally { publishingRef.current = false; }
  };

  /* ---- lay standing regular hours onto the week ----
     `mode` 'empty' fills only slots with nothing in them; 'rebuild' replaces whatever is
     on the days a person's profile covers, which is the auto-schedule people expect.

     This iterates PEOPLE, not offices, and routes each day to the office named on that
     day of the profile. Iterating offices and taking officeRoster(office) — everyone whose
     HOME is that office — was the bug: someone working Monday at one site and Tuesday at
     another got built into their home office all week, silently, in the wrong place. */
  const fillFromRegular = async (mode) => {
    setMenu(null);
    const rebuild = mode === 'rebuild';
    /* a shift may land in an office that isn't currently displayed; collect them so the
       week can be pulled into view, because publish() only writes the selected offices —
       an invisible shift would never be published and would look like data loss */
    const byOffice = {};
    const bucket = o => (byOffice[o] = byOffice[o] || { add: [], drop: new Set() });
    let skipped = 0;

    allRoster.forEach(p => {
      if (!regHoursFor(regIndex, p)) { skipped++; return; }
      days.forEach(d => {
        const reg = regHoursOnDate(regIndex, p, d.date);
        if (!reg) return;
        const office = reg.office || p.office;
        if (!office) return;
        const existing = shifts.filter(s => s.empId === p.id && s.date === d.date);
        if (existing.length && !rebuild) return;                 /* 'empty' never overwrites */
        if (existing.length && rebuild) existing.forEach(s => bucket(s._office).drop.add(s.id));
        const sh = { id: newShiftId(), empId: p.id, date: d.date, start: reg.start, end: reg.end };
        if (reg.breakMins > 0) sh.breakMins = reg.breakMins;
        bucket(office).add.push(sh);
      });
    });

    const touched = Object.keys(byOffice).filter(o => OFFICES.includes(o));   // never an office the server would refuse
    let added = 0;
    for (const office of touched) {
      const { add, drop } = byOffice[office];
      const cur = ((docsRef.current[office] && docsRef.current[office].shifts) || []).filter(s => !drop.has(s.id));
      if (!add.length && !drop.size) continue;
      await saveAll(office, [...cur, ...add]);
      added += add.length;
    }
    /* bring any office we just wrote into the current selection so it is visible AND
       publishable — writing somewhere you can't see is worse than not writing at all */
    const unseen = touched.filter(o => !offices.includes(o));
    if (unseen.length) setOffices(cur => [...new Set([...cur, ...unseen])]);

    if (!added) flash(skipped ? 'No regular hours set for anyone in view — set them under Options → Regular hours.' : 'Everyone with regular hours is already scheduled.');
    else flash(`${rebuild ? 'Built' : 'Filled'} ${added} shift${added === 1 ? '' : 's'} from regular hours${unseen.length ? ' — added ' + unseen.join(', ') + ' to the view' : ''}. Saved when you publish.`);
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
      } catch (e) { flash('Copy failed: ' + e.message, false); }
    }
  };
  const openTpl = (kind) => { setMenu(null); setTplModal(kind); if (kind === 'load') fetchSchedTemplates(offices[0]).then(setTemplates).catch(() => setTemplates([])); };
  const saveTemplate = async (name) => {
    setTplModal(null);
    const office = offices[0];
    const tShifts = ((docs[office] && docs[office].shifts) || []).map(s => ({ empId: s.empId, open: s.open, dow: Math.max(0, Math.round((parseISO(s.date) - parseISO(weekKey)) / 86400000)), start: s.start, end: s.end, breakMins: s.breakMins }));
    try { await schedAction({ action: 'template_save', office, name, shifts: tShifts }); flash(`Template “${name}” saved for ${office}.`); }
    catch (e) { flash('Template save failed: ' + e.message, false); }
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
    if (kind === 'unassign') flash('All displayed shifts are now up for grabs.');
  };

  /* ---- status counts (§3.2) ----
     unassignedCount: nobody on the shift at all (the Open shifts lane).
     grabsCount: still on someone's row, but flagged up for grabs or already offered. */
  const unassignedCount = shifts.filter(s => !s.empId).length;
  const grabsCount = shifts.filter(s => s.empId && (s.open || s.offered)).length;
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
      const d = e.department || 'Unassigned';
      if (dept && d !== dept) return;   /* guests obey the department filter too */
      put(s._office, { id: e.id, name: e.name, dept: d, office: s._office });
    });
    return Object.values(groups)
      .sort((a, b) => a.dept.localeCompare(b.dept) || a.office.localeCompare(b.office))
      .map(g => ({ ...g, people: g.people.sort((a, b) => a.name.localeCompare(b.name)) }));
  }, [roster, view, focusEmp, shifts, search, dept]);

  /* dept view rows show only that group's office; person view shows all selected */
  const cellShifts = (pid, date, office) => shifts.filter(s => s.empId === pid && s.date === date && (!office || s._office === office));
  /* Shifts with nobody on them. They cannot sit on a person's row — there is no person —
     so they get a lane of their own at the top of the grid, which is also where a manager
     looks to see what still needs covering. */
  /* ---- drag and drop (desktop only) ----
     Added ALONGSIDE click-to-edit, not replacing it: clicking a slot still opens the form,
     and that stays the way to create or change a shift. Dragging only MOVES an existing
     one — to another day, another person, or another office — because that is the bit
     muscle memory reaches for and the bit clicking is clumsy at.

     Not offered on the phone layout: it shows one day at a time in a single column, so
     there is nothing to drag across, and a long-press to pick up fights with scrolling.

     A move across offices is two edits, not one — a shift lives inside its office's week
     document, so it is removed from one and added to the other. */
  const [drag, setDrag] = useState(null);        // the shift being carried
  const [dropAt, setDropAt] = useState(null);    // 'empId|date|office' currently under it
  const moveShift = async (s2, toEmpId, toDate, toOffice) => {
    setDrag(null); setDropAt(null);
    const sameSlot = s2.empId === (toEmpId || '') && s2.date === toDate && s2._office === toOffice;
    if (sameSlot) return;
    const moved = { ...s2, empId: toEmpId || '', date: toDate };
    delete moved._office; delete moved.pub;      /* moved = unpublished again */
    if (!toEmpId) moved.open = true; else delete moved.open;
    if (s2._office === toOffice) {
      await oneChange(toOffice, { op: 'update', shift: moved }, list => [...list.filter(x => x.id !== moved.id), moved]);
    } else {
      const landed = { ...moved, id: newShiftId() };
      await oneChange(s2._office, { op: 'remove', shiftId: s2.id }, list => list.filter(x => x.id !== s2.id));
      await oneChange(toOffice, { op: 'add', shift: landed }, list => [...list, landed]);
    }
  };
  const dropProps = (toEmpId, toDate, toOffice) => {
    const key = (toEmpId || '') + '|' + toDate + '|' + toOffice;
    return {
      onDragOver: e => { if (drag) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; if (dropAt !== key) setDropAt(key); } },
      onDragLeave: () => { if (dropAt === key) setDropAt(null); },
      onDrop: e => { e.preventDefault(); if (drag) moveShift(drag, toEmpId, toDate, toOffice); },
      'data-drop': dropAt === key ? 'on' : undefined,
    };
  };
  const isDropping = (toEmpId, toDate, toOffice) => dropAt === ((toEmpId || '') + '|' + toDate + '|' + toOffice);

    const deleteAllConfirmMsg = isSup && offices.some(o => docs[o] && docs[o].published)
    ? 'Delete every shift currently displayed? Published weeks send this to your manager for approval, one change at a time.'
    : 'Delete every shift currently displayed? This cannot be undone.';
  const openLane = useMemo(() => shifts.filter(s => !s.empId), [shifts]);
  const openOn = (date) => openLane.filter(s => s.date === date);
  const boFor = (pid, date) => timeOff.some(t => t.empId === pid && t.dates.includes(date));
  const published = offices.every(o => docs[o] && docs[o].published);
  const anySaved = offices.some(o => docs[o] && (docs[o].shifts || []).length);
  const colTemplate = `${fit.name}px repeat(7, minmax(${fit.day}px, 1fr))`;
  const dim = s => statusHi === 'unpub' ? !!s.pub
    : statusHi === 'unassigned' ? !!s.empId
    : statusHi === 'grabs' ? !(s.empId && (s.open || s.offered))
    : false;

  const toggleOffice = (o) => setOffices(cur => cur.length === OFFICES.length ? [o] : cur.includes(o) ? (cur.length > 1 ? cur.filter(x => x !== o) : cur) : [...cur, o]);

  /* ---- working one role at a time ----
     The week opens on everyone, at every office, which is what a scheduler asked for —
     but that is one 48px row per person, so a full roster is several screens of scrolling
     and the day header is long gone by the time you reach the bottom. Nothing here filters
     anything out; it only folds the groups you are not working on, so the roster stays
     whole and the page stops being a mile long. */
  const groupKeys = useMemo(() => rows.filter(g => g.dept).map(g => g.office + '|' + g.dept), [rows]);
  const collapseAll = () => setCollapsed(Object.fromEntries(groupKeys.map(k => [k, true])));
  const expandAll = () => setCollapsed({});
  const allClosed = groupKeys.length > 0 && groupKeys.every(k => collapsed[k]);
  /* Roles, merged across offices: she builds "all the hygienists", and they sit in a
     separate group per office. This is the index into those — counts for the role as a
     whole, and one click to work it alone. */
  const roleNav = useMemo(() => {
    const m = {};
    rows.forEach(g => {
      if (!g.dept) return;
      const r = m[g.dept] = m[g.dept] || { dept: g.dept, people: 0, scheduled: 0 };
      r.people += g.people.length;
      const ids = new Set(g.people.map(p => p.id));
      r.scheduled += shifts.filter(s => !s.open && ids.has(s.empId) && (!g.office || s._office === g.office)).length;
    });
    return Object.values(m).sort((a, b) => a.dept.localeCompare(b.dept));
  }, [rows, shifts]);
  /* open this role's groups (at every office), fold everything else, and jump to it */
  const soloRole = (d) => {
    setCollapsed(Object.fromEntries(groupKeys.map(k => [k, k.split('|')[1] !== d])));
    setTimeout(() => {
      const el = document.querySelector(`[data-grp-dept="${CSS.escape(d)}"]`);
      if (el && el.scrollIntoView) el.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }, 0);
  };
  const soloed = roleNav.length > 1 && groupKeys.some(k => collapsed[k]) && groupKeys.some(k => !collapsed[k])
    ? (groupKeys.find(k => !collapsed[k]) || '|').split('|')[1] : null;

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
        <SchedWeekRow weekKey={weekKey} setWeekKey={setWeekKey} onRefresh={load} />

        {/* the four ways to fill a week in from something else */}
        <div className="schm-acts">
          <button onClick={copyLastWeek}>Copy last week</button>
          <button onClick={() => fillFromRegular('empty')}>Fill empties from regular hours</button>
          <button onClick={() => fillFromRegular('rebuild')}>Build week from regular hours</button>
          <button onClick={() => openTpl('save')}>Save as template</button>
          <button onClick={() => openTpl('load')}>Load template</button>
        </div>

        <SchedOfficeChips OFFICES={OFFICES} offices={offices} setOffices={setOffices} toggleOffice={toggleOffice} />

        <SchedViewChips view={view} setView={setView} />

        {/* a button per department becomes a wall once there are more than a few, and this
            screen already stacks several control rows — one picker instead */}
        <SchedRolePick DEPTS={DEPTS} dept={dept} setDept={setDept} />

        {/* the week, as seven tap targets — the second axis without rendering it */}
        <SchedDayStrip days={days} dayISO={dayISO} today={today} nOn={nOn} nOpenOn={nOpenOn} setMDay={setMDay} />

        <div className="schm-status">
          {[['empty', emptyCount, 'empty'], ['unpub', unpubCount, 'unpublished'], ['unassigned', unassignedCount, 'unassigned'], ['grabs', grabsCount, 'up for grabs']].map(([id, n, label]) => (
            <button key={id} onClick={() => setStatusHi(h => h === id ? null : id)} className={statusHi === id ? 'on' : ''}>
              <b className="mono">{n}</b> {label}
            </button>
          ))}
          <span className="mono schm-status-tot">{dayTotal} today · {dayHrs}h</span>
        </div>

        {published && anySaved && <div className="schm-note"><Icon name="check" style={{ width: 14, height: 14 }} /> All shifts published{isSup ? ' — your edits need manager approval' : ''}</div>}

        {openOn(dayISO).length > 0 && (
          <div className="schm-group">
            <div className="schm-group-head" style={{ background: 'var(--warn-soft)', color: 'oklch(0.42 0.11 60)' }}>
              <Icon name="bell" style={{ width: 13, height: 13, flex: 'none' }} />
              <span>Unassigned</span>
              <small>{openOn(dayISO).length} unassigned</small>
            </div>
            {openOn(dayISO).map(s2 => (
              <button key={s2.id} className="schm-row" style={{ borderLeftColor: 'var(--warn)' }}
                onClick={() => setModal({ office: s2._office, empId: null, date: dayISO, shift: s2 })}>
                <span className="schm-row-txt">
                  <span className="schm-row-name">Unassigned</span>
                  <span className="schm-row-time mono">{shiftRange(s2)}</span>
                  <span className="schm-row-sub">{shiftHrs(s2)}h{multi ? ' · ' + s2._office : ''}</span>
                  {s2.note && <span className="schm-row-note"><Icon name="chat" style={{ width: 11, height: 11, flex: 'none' }} /> {s2.note}</span>}
                </span>
                <Icon name="chevron" style={{ width: 15, height: 15, color: 'var(--ink-3)', flex: 'none' }} />
              </button>
            ))}
          </div>
        )}

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
                            {s.open ? 'Up for grabs' : s.offered ? 'Offered for swap' : `${shiftHrs(s)}h`}
                            {multi ? ` · ${s._office}` : ''}{!s.pub && !s.open ? ' · new' : ''}{bo ? ' · time off' : ''}
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
                          title={boFor(p.id, dayISO) ? 'Approved time off — this person can’t work this day' : 'Not scheduled — tap to add'}>
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
          <button onClick={() => bulk('unassign')}>Mark all shifts up for grabs</button>
          <button className="d" onClick={() => { if (window.confirm(deleteAllConfirmMsg)) bulk('delete'); }}>Delete all shifts</button>
          <button onClick={() => setImpOpen(true)}>Import a schedule CSV</button>
        </div>

        {/* Publish is the one thing you are always about to do — pinned, never scrolled away */}
        <div className="schm-pubbar">
          <button className="btn btn-primary" disabled={!dirty && unpubCount === 0} onClick={() => setPubAsk(true)}>
            <Icon name="check" /> Publish{unpubCount ? ` (${unpubCount})` : ''}
          </button>
        </div>

        {wkAsk && <WeekStartModal onSaved={() => { setWkAsk(false); setWeekKey(thisWeekKey()); load(true); }} onClose={() => setWkAsk(false)} flash={flash} />}
        {pubAsk && <PublishAsk unpubCount={unpubCount} onPick={publish} onClose={() => setPubAsk(false)} />}
        {modal && <ShiftModal key={(modal.shift && modal.shift.id) || 'new'} modal={modal} offices={offices} weekShifts={allWeekShifts} timeOff={timeOff} regIndex={regIndex} onSave={saveShift} onDelete={deleteShift} onClose={() => setModal(null)} />}
        {impOpen && <ScheduleImportModal offices={OFFICES} flash={flash} onDone={() => { setImpOpen(false); load(true); }} onClose={() => setImpOpen(false)} />}
        {regOpen && <RegularHoursModal roster={allRoster} profiles={regHours} offices={OFFICES} flash={flash}
          onSaved={p => { setRegHours(list => [...list.filter(x => x.id !== p.id), p]); }}
          onClose={() => setRegOpen(false)} />}
        {tplModal === 'save' && <NameModal title="Save week as template" hint={`Saves ${offices[0]}'s currently displayed week as a reusable setup.`} onSave={saveTemplate} onClose={() => setTplModal(null)} />}
        {tplModal === 'load' && <LoadTplModal office={offices[0]} templates={templates} onPick={loadTemplate} onDelete={async t => { try { await schedAction({ action: 'template_delete', office: offices[0], id: t.id }); setTemplates(x => x.filter(y => y.id !== t.id)); } catch (e) { flash(e.message); } }} onClose={() => setTplModal(null)} />}

        {toast && (
          <div className="fade-in" style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 95, background: 'var(--ink)', color: 'var(--surface)', padding: '11px 20px', borderRadius: 'var(--r-pill)', fontSize: 13.5, fontWeight: 600, boxShadow: 'var(--shadow-lg)', display: 'flex', alignItems: 'center', gap: 9 }}>
            <Icon name={toast.ok ? 'check' : 'x'} style={{ width: 16, height: 16, color: toast.ok ? 'oklch(0.8 0.13 155)' : 'var(--warn)' }} /> {toast.m}
          </div>
        )}
      </StepShell>
    );
  }

  return (
    <StepShell icon="grid" eyebrow="Scheduling" title="Schedule builder"
      subtitle="Click any slot to add a shift, or drag a shift to move it — to another day, another person, or another office. Drop one on the Open shifts row to leave it unassigned. You can repeat shifts across weeks, and copy a week's schedule as a future template with the Copy button. To lock-in a schedule, click Publish; this will save your changes and send notification that the latest schedule is available to view."
      onBack={onBack}
      aside={
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="btn btn-ghost" onClick={load} title="Reload changes made by others"><Icon name="refresh" /> Refresh</button>
          <div style={{ position: 'relative' }}>
            <button className="btn btn-ghost" onClick={() => setMenu(m => m === 'copy' ? null : 'copy')}><Icon name="doc" /> Copy <Icon name="chevron" style={{ width: 14, height: 14, transform: 'rotate(90deg)' }} /></button>
            {menu === 'copy' && <Dropdown onClose={() => setMenu(null)} items={[
              ['Copy last week', `Pull ${weekLabel(addWeeks(weekKey, -1))} into this week`, copyLastWeek],
              ['Fill empties from regular hours', 'Lay each person’s standing hours onto their empty slots only', () => fillFromRegular('empty')],
              ['Build week from regular hours', 'Lay down everyone’s standing week, replacing what’s on those days', () => fillFromRegular('rebuild')],
              ['Save as template…', 'Keep this week as a named setup', () => openTpl('save')],
              ['Load template…', 'Apply a saved setup to this week', () => openTpl('load')],
            ]} />}
          </div>
          <div style={{ position: 'relative' }}>
            <button className="btn btn-ghost" onClick={() => setMenu(m => m === 'options' ? null : 'options')}><Icon name="dots" /> Options</button>
            {menu === 'options' && <Dropdown onClose={() => setMenu(null)} items={[
              ['Mark all shifts up for grabs', 'Every displayed shift stays in place but is flagged up for grabs', () => bulk('unassign')],
              ['Regular hours…', 'Set someone’s standing weekly hours and overtime threshold', () => { setMenu(null); setRegOpen(true); }],
              ...(canOrg ? [['Week starts on…', 'Which weekday a schedule week begins — currently ' + (WEEK_STARTS.find(([k]) => k === weekStart()) || [,'Monday'])[1], () => { setMenu(null); setWkAsk(true); }]] : []),
              ['Import a schedule CSV…', 'Load a roster CSV export into this week’s schedule', () => { setMenu(null); setImpOpen(true); }],
              ['Delete all shifts', 'Removes every displayed shift — irreversible', () => { if (window.confirm(deleteAllConfirmMsg)) bulk('delete'); }, true],
            ]} />}
          </div>
          <button className="btn btn-primary" disabled={!dirty && unpubCount === 0} onClick={() => setPubAsk(true)}>
            <Icon name="check" /> Publish{unpubCount ? ` (${unpubCount})` : ''}
          </button>
        </div>
      }>

      {/* selectors: offices (multi), week, view */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        <SchedOfficeBar OFFICES={OFFICES} offices={offices} setOffices={setOffices} toggleOffice={toggleOffice} />
        <SchedWeekNav weekKey={weekKey} setWeekKey={setWeekKey} />
        <SchedViewSwitch view={view} setView={setView} />
        <SchedRoleSelect dept={dept} setDept={setDept} DEPTS={DEPTS} />
        {view === 'dept' && groupKeys.length > 1 && (
          <button onClick={allClosed ? expandAll : collapseAll} title={allClosed ? 'Open every role' : 'Fold every role — then open the one you are working on'}
            style={{ border: '1px solid var(--line)', background: 'var(--surface)', color: 'var(--ink-2)', borderRadius: 'var(--r-pill)', padding: '6px 12px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Icon name="chevron" style={{ width: 12, height: 12, transform: allClosed ? 'rotate(90deg)' : 'rotate(-90deg)' }} /> {allClosed ? 'Expand all' : 'Collapse all'}
          </button>
        )}
        {published && anySaved && <span className="badge badge-ok"><Icon name="check" /> All shifts published{isSup ? ' — your edits need manager approval' : ''}</span>}
      </div>


      <div style={{ display: 'grid', gridTemplateColumns: `${fit.side}px minmax(0, 1fr)`, gap: 'var(--gap)', alignItems: 'start' }}>
        {/* team sidebar (§3.2 — hours, search, sort; no cost per D2) */}
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {/* Roles first: the week is built one role at a time, so this is the index into
              the grid rather than a filter — clicking opens that role everywhere and folds
              the rest. Sticky so it stays reachable while the grid scrolls past it. */}
          {view === 'dept' && roleNav.length > 1 && (
            <div style={{ borderBottom: '1px solid var(--line)' }}>
              <div style={{ padding: '9px 12px 6px', fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--ink-3)' }}>Roles</div>
              {roleNav.map(r => {
                const on = soloed === r.dept;
                return (
                  <button key={r.dept} onClick={() => on ? expandAll() : soloRole(r.dept)}
                    title={on ? 'Show every role again' : `Work ${r.dept} on its own`}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', border: 'none', cursor: 'pointer', padding: '7px 12px',
                      background: on ? 'var(--accent-soft)' : 'transparent', borderBottom: '1px solid var(--line-soft)' }}>
                    <span style={{ width: 8, height: 8, borderRadius: 2, flex: 'none', background: `oklch(0.65 0.13 ${deptHue(r.dept)})` }} />
                    <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: on ? 800 : 600, color: on ? 'var(--accent-strong)' : 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.dept}</span>
                    <span className="mono" style={{ fontSize: 11, color: 'var(--ink-3)', flex: 'none' }}>{r.scheduled}/{r.people}</span>
                  </button>
                );
              })}
            </div>
          )}
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
                    <div key={d.date} className="sched-cell" onClick={() => setModal({ office: offices[0], empId: null, date: d.date, shift: null, open: true })}
                      {...dropProps('', d.date, offices[0])}
                      style={{ borderLeft: '1px solid var(--line-soft)', padding: 4, minHeight: 48, display: 'flex', flexDirection: 'column', gap: 3, cursor: 'pointer',
                        background: isDropping('', d.date, offices[0]) ? 'var(--accent-soft)' : 'transparent',
                        outline: isDropping('', d.date, offices[0]) ? '2px solid var(--accent)' : 'none', outlineOffset: -2 }}>
                      {openOn(d.date).map(s => (
                        <SchedShift editable key={s.id + s._office} s={s} hue={75} multi={multi} dim={dim(s)} hi={statusHi === 'unpub' && !s.pub} ot={false}
                          dragging={drag && drag.id === s.id}
                          onDragStart={() => setDrag(s)} onDragEnd={() => { setDrag(null); setDropAt(null); }}
                          onClick={(e) => { e.stopPropagation(); setModal({ office: s._office, empId: null, date: d.date, shift: s }); }} />
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
                    <div data-grp-dept={group.dept} onClick={() => setCollapsed(c => ({ ...c, [gk]: !closed }))} style={{ display: 'grid', gridTemplateColumns: colTemplate, background: `color-mix(in oklab, oklch(0.65 0.1 ${deptHue(group.dept)}) 10%, var(--surface))`, borderBottom: '1px solid var(--line)', cursor: 'pointer', userSelect: 'none' }} title={closed ? 'Expand' : 'Collapse'}>
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
                            {...dropProps(p.id, d.date, group.office || p.office)}
                            style={{ borderLeft: '1px solid var(--line-soft)', padding: 4, minHeight: 48, display: 'flex', flexDirection: 'column', gap: 3, cursor: isEmpty ? 'pointer' : 'default',
                              background: isDropping(p.id, d.date, group.office || p.office) ? 'var(--accent-soft)'
                                : bo ? 'repeating-linear-gradient(45deg, var(--danger-soft), var(--danger-soft) 6px, transparent 6px, transparent 12px)' : 'transparent',
                              outline: isDropping(p.id, d.date, group.office || p.office) ? '2px solid var(--accent)' : statusHi === 'empty' && isEmpty ? '2px dashed var(--accent)' : 'none', outlineOffset: -2 }}
                            title={bo ? 'Approved time off — this person can’t work this day' : ''}>
                            {list.map(s => <SchedShift editable key={s.id + s._office} s={s} hue={deptHue(p.dept)} multi={multi && !group.office} dim={dim(s)} hi={statusHi === 'unpub' && !s.pub} ot={otIds.has(p.id)}
                              dragging={drag && drag.id === s.id}
                              onDragStart={() => setDrag(s)} onDragEnd={() => { setDrag(null); setDropAt(null); }}
                              onClick={() => setModal({ office: s._office, empId: p.id, date: d.date, shift: s })} />)}
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
            {[['empty', emptyCount, 'empty slots'], ['unpub', unpubCount, 'unpublished'], ['unassigned', unassignedCount, 'unassigned'], ['grabs', grabsCount, 'up for grabs / offered']].map(([id, n, label]) => (
              <button key={id} onClick={() => setStatusHi(h => h === id ? null : id)}
                style={{ border: '1px solid', borderColor: statusHi === id ? 'var(--accent)' : 'var(--line)', background: statusHi === id ? 'var(--accent-soft)' : 'var(--surface)', borderRadius: 'var(--r-pill)', padding: '4px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', color: statusHi === id ? 'var(--accent-strong)' : 'var(--ink-2)' }}>
                <b className="mono">{n}</b> {label}
              </button>
            ))}
            <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--ink-3)' }} className="mono">{shifts.filter(s => !s.open).length} shifts · {Math.round(shifts.reduce((a, s) => a + (s.open ? 0 : shiftHrs(s)), 0))} hrs</span>
          </div>
        </div>
      </div>

      {wkAsk && <WeekStartModal onSaved={() => { setWkAsk(false); setWeekKey(thisWeekKey()); load(true); }} onClose={() => setWkAsk(false)} flash={flash} />}
      {pubAsk && <PublishAsk unpubCount={unpubCount} onPick={publish} onClose={() => setPubAsk(false)} />}
      {modal && <ShiftModal key={(modal.shift && modal.shift.id) || 'new'} modal={modal} offices={offices} weekShifts={allWeekShifts} timeOff={timeOff} regIndex={regIndex} onSave={saveShift} onDelete={deleteShift} onClose={() => setModal(null)} />}
      {impOpen && <ScheduleImportModal offices={OFFICES} flash={flash} onDone={() => { setImpOpen(false); load(true); }} onClose={() => setImpOpen(false)} />}
      {regOpen && <RegularHoursModal roster={allRoster} profiles={regHours} offices={OFFICES} flash={flash}
        onSaved={p => { setRegHours(list => [...list.filter(x => x.id !== p.id), p]); }}
        onClose={() => setRegOpen(false)} />}
      {tplModal === 'save' && <NameModal title="Save week as template" hint={`Saves ${offices[0]}'s currently displayed week as a reusable setup.`} onSave={saveTemplate} onClose={() => setTplModal(null)} />}
      {tplModal === 'load' && <LoadTplModal office={offices[0]} templates={templates} onPick={loadTemplate} onDelete={async t => { try { await schedAction({ action: 'template_delete', office: offices[0], id: t.id }); setTemplates(x => x.filter(y => y.id !== t.id)); } catch (e) { flash(e.message); } }} onClose={() => setTplModal(null)} />}

      {toast && (
        <div className="fade-in" style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 90, background: 'var(--ink)', color: 'var(--surface)', padding: '11px 20px', borderRadius: 'var(--r-pill)', fontSize: 13.5, fontWeight: 600, boxShadow: 'var(--shadow-lg)', display: 'flex', alignItems: 'center', gap: 9 }}>
          <Icon name={toast.ok ? 'check' : 'x'} style={{ width: 16, height: 16, color: toast.ok ? 'oklch(0.8 0.13 155)' : 'var(--warn)' }} /> {toast.m}
        </div>
      )}
    </StepShell>
  );
}

/* Which weekday a schedule week starts on. Saved to org config, so it is one setting for
   everyone rather than a per-person view preference — a week has to mean the same thing to
   the manager building it and the employee reading it.

   The warning is not decoration: a week document's id IS its start date, so changing this
   makes today's date resolve to a different document. Weeks already saved don't move, and
   nothing looks for them at the old id any more. */
function WeekStartModal({ onSaved, onClose, flash }) {
  const [pick, setPick] = useState(weekStart());
  const [saving, setSaving] = useState(false);
  const changed = pick !== weekStart();
  const save = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await saveOrgSection('weekStart', pick);
      setWeekStart(pick);
      flash('Week now starts on ' + (WEEK_STARTS.find(([k]) => k === pick) || [, ''])[1] + '.');
      onSaved();
    } catch (e) { flash(e.message === 'conflict' ? 'Someone else just changed this. Reload and try again.' : 'Could not save: ' + e.message, false); setSaving(false); }
  };
  return (
    <SchedPortal>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'oklch(0.2 0.02 230 / 0.4)', zIndex: 88 }} />
      <div className="card fade-in" role="dialog" aria-modal="true" style={{ position: 'fixed', top: '3vh', left: 0, right: 0, margin: '0 auto', zIndex: 89, width: 'min(430px, 94vw)', maxHeight: '94vh', overflowY: 'auto', padding: 20, boxShadow: 'var(--shadow-lg)' }}>
        <h3 style={{ fontSize: 17, marginBottom: 3 }}>Week starts on</h3>
        <p style={{ fontSize: 12.5, color: 'var(--ink-3)', marginBottom: 14 }}>Applies to everyone — the schedule builder, My schedule and notifications.</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          {WEEK_STARTS.map(([k, label]) => (
            <label key={k} style={{ display: 'flex', gap: 9, alignItems: 'center', cursor: 'pointer', padding: '10px 12px', borderRadius: 'var(--r-md)', border: '1.5px solid', borderColor: pick === k ? 'var(--accent)' : 'var(--line)', background: pick === k ? 'var(--accent-softer)' : 'transparent' }}>
              <input type="radio" name="wkstart" checked={pick === k} onChange={() => setPick(k)} />
              <b style={{ fontSize: 13.5 }}>{label}</b>
              {k === 1 && <span style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>default</span>}
            </label>
          ))}
        </div>
        {changed && (
          <div style={{ marginTop: 13, padding: '10px 13px', borderRadius: 'var(--r-md)', border: '1.5px solid var(--warn)', background: 'var(--warn-soft)', fontSize: 12.5, lineHeight: 1.5, color: 'oklch(0.42 0.11 60)' }}>
            <b style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Icon name="bell" style={{ width: 14, height: 14 }} /> This re-buckets saved weeks</b>
            <div style={{ marginTop: 3 }}>A week is stored under its start date. Weeks already built stay where they are, but they'll no longer line up with the new week boundaries — expect to rebuild any week that spans the change.</div>
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
          <button onClick={onClose} className="btn btn-ghost">Cancel</button>
          <button onClick={save} disabled={!changed || saving} className="btn btn-primary"><Icon name="check" /> {saving ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
    </SchedPortal>
  );
}

/* Publish-type step: notify everyone with a shift, or only the people whose
   week actually changed. Shown on both layouts so the choice is never desktop-only. */
function PublishAsk({ unpubCount, onPick, onClose }) {
  const [mode, setMode] = useState('all');
  return (
    <SchedPortal>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'oklch(0.2 0.02 230 / 0.4)', zIndex: 88 }} />
      <div className="card fade-in" role="dialog" aria-modal="true" style={{ position: 'fixed', top: '3vh', left: 0, right: 0, margin: '0 auto', maxHeight: '94vh', overflowY: 'auto', zIndex: 89, width: 'min(430px, 94vw)', padding: 20, boxShadow: 'var(--shadow-lg)' }}>
        <h3 style={{ fontSize: 17, marginBottom: 3 }}>Publish schedule</h3>
        <p style={{ fontSize: 12.5, color: 'var(--ink-3)', marginBottom: 14 }}>
          {unpubCount ? `${unpubCount} unpublished change${unpubCount === 1 ? '' : 's'}. ` : ''}Team members only see shifts once they're published.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          {[['all', 'Publish all', 'Everyone with a shift this week is notified'],
            ['updates', 'Publish updates', 'Only people whose shifts were added, changed or removed']].map(([id, label, hint]) => (
            <label key={id} style={{ display: 'flex', gap: 9, alignItems: 'flex-start', cursor: 'pointer', padding: '10px 12px', borderRadius: 'var(--r-md)', border: '1.5px solid', borderColor: mode === id ? 'var(--accent)' : 'var(--line)', background: mode === id ? 'var(--accent-softer)' : 'transparent' }}>
              <input type="radio" name="pubmode" checked={mode === id} onChange={() => setMode(id)} style={{ marginTop: 2 }} />
              <span><b style={{ fontSize: 13.5 }}>{label}</b><span style={{ display: 'block', fontSize: 11.5, color: 'var(--ink-3)' }}>{hint}</span></span>
            </label>
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
          <button onClick={onClose} className="btn btn-ghost">Cancel</button>
          <button onClick={() => onPick(mode)} className="btn btn-primary"><Icon name="check" /> Publish</button>
        </div>
      </div>
    </SchedPortal>
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
function ShiftModal({ modal, offices, weekShifts, timeOff, regIndex, onSave, onDelete, onClose }) {
  const s = modal.shift;
  const [office, setOffice] = useState(modal.office);
  const [open, setOpen] = useState(s ? !!s.open : !!modal.open);
  const [empId, setEmpId] = useState(s ? (s.empId || '') : (modal.empId || ''));
  const [date, setDate] = useState(modal.date);
  const [start, setStart] = useState(s ? s.start : '09:00');
  const [end, setEnd] = useState(s ? s.end : '17:00');
  const [breakMins, setBreakMins] = useState(s ? (Number(s.breakMins) || 0) : DEFAULT_MEAL_BREAK);
  const [note, setNote] = useState(s ? (s.note || '') : '');
  const [repeat, setRepeat] = useState('none');
  const [repeatN, setRepeatN] = useState(3);
  const team = officeRoster(office, schedAll());
  const others = (typeof EMPLOYEES !== 'undefined' ? EMPLOYEES : [])
    .filter(e => e.status === 'Active' && (e.loc || e.location) !== office && !['', 'Unassigned'].includes(e.loc || e.location || ''))
    .map(e => ({ id: e.id, name: e.name, dept: e.department || 'Unassigned', office: e.loc || e.location, emailLower: (e.emailLower || e.workEmail || '').toLowerCase() }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const emp = team.find(p => p.id === empId) || others.find(p => p.id === empId);

  const conflict = useMemo(() => open || !empId ? { shifts: [], timeOff: null } :
    shiftConflicts({ shifts: weekShifts, timeOff, empId, date, start, end, excludeId: s && s.id }),
    [empId, date, start, end, open]);
  const hasConflict = conflict.shifts.length > 0 || !!conflict.timeOff;
  /* an open shift is valid with nobody on it — being unassigned is the point */
  const valid = date && start && end && timeMins(end) > timeMins(start) && (empId || open);

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
<div className="card fade-in" role="dialog" aria-modal="true" style={{ position: 'fixed', top: '3vh', left: 0, right: 0, margin: '0 auto', zIndex: 81, width: 'min(480px, 94vw)', maxHeight: '90vh', overflowY: 'auto', padding: 0, boxShadow: 'var(--shadow-lg)' }}>
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
            {(
              <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, fontWeight: 600, color: 'var(--ink-2)', paddingBottom: 9, whiteSpace: 'nowrap', cursor: 'pointer' }} title="Stays on their row until someone's claim is approved — visible for teammates to claim">
                <input type="checkbox" checked={open} onChange={e => setOpen(e.target.checked)} /> Up for grabs
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
              {conflict.timeOff && <div>{emp ? emp.name : 'This person'} has approved time off on {date}.</div>}
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

function NameModal({ title, hint, onSave, onClose }) {
  const [name, setName] = useState('');
  return (
<>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'oklch(0.2 0.02 230 / 0.4)', zIndex: 80 }} />
      <div className="card fade-in" style={{ position: 'fixed', top: '3vh', left: 0, right: 0, margin: '0 auto', maxHeight: '94vh', overflowY: 'auto', zIndex: 81, width: 'min(380px, 92vw)', padding: 20, boxShadow: 'var(--shadow-lg)' }}>
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
      <div className="card fade-in" style={{ position: 'fixed', top: '3vh', left: 0, right: 0, margin: '0 auto', maxHeight: '94vh', overflowY: 'auto', zIndex: 81, width: 'min(420px, 92vw)', padding: 20, boxShadow: 'var(--shadow-lg)' }}>
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

Object.assign(window, { Scheduler });
