/* schedgrid.jsx — the pieces the Schedule tab and the Builder share: the sizing hook, the
   office and roster helpers, the shift block and the week, office, view, role and day
   controls, in the phone layout and the desktop layout. The Builder passes `editable`
   to the shift block; the Schedule tab does not. */

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

/* everyone, not the caller's scoped list — a posted schedule shows the whole office, and a
   manager given another office needs to see it and the people in it */
function schedAll() {
  if (typeof DIRECTORY !== 'undefined' && DIRECTORY.length) return DIRECTORY;
  return (typeof EMPLOYEES !== 'undefined' ? EMPLOYEES : []);
}

function schedOffices(people) {
  const out = [];
  people.forEach(e => {
    if (e.status !== 'Active') return;
    const l = e.loc || e.location;
    if (l && l !== 'Unassigned' && !out.includes(l)) out.push(l);
  });
  return out.sort();
}

/* the offices this person may schedule: the ones the server would accept a save for */
function editableOffices(me, access) {
  return window.PD_ACCESS_RULES.editableOfficeNames({ me, perms: access.perms, flags: access.flags, caps: access.caps }, schedOffices(schedAll()));
}
function officeRoster(office, people) {
  return people
    .filter(e => e.status === 'Active' && (e.loc || e.location) === office)
    .map(e => ({ id: e.id, name: e.name, dept: e.department || 'Unassigned', office, emailLower: (e.emailLower || e.workEmail || '').toLowerCase() }));
}
const deptHue = (() => { const cache = {}; let i = 0; const hues = [220, 155, 280, 75, 195, 25, 320, 110]; return d => (d in cache ? cache[d] : (cache[d] = hues[i++ % hues.length])); })();

/* one shift block in the grid.
   `pub` = published (the committed green state). In the Builder (`editable`) it is a
   button: `ot` = this person's week is over their overtime threshold, `dim` fades it, `dragging`
   fades it while dragged, and an unpublished shift reads "new". On the read-only Schedule tab
   it is plain, and `mineActions`, when given, renders under it — the offer/withdraw/claim-
   pending controls for the viewer's own shift. */
function SchedShift({ s, hue, multi, hi, editable, dim, ot, onClick, onDragStart, onDragEnd, dragging, mineActions }) {
  /* two different things share `s.open`: no empId = UNASSIGNED (sits in the Open shifts
     lane, nobody on it yet); empId + open = UP FOR GRABS (still this person's shift until
     a claim is approved). Same styling either way — only the label text differs. */
  const open = !!s.open, unassigned = !s.empId, off = !!s.offered, pub = !!s.pub;
  const tint = open ? 'oklch(0.7 0.14 75)' : off ? 'oklch(0.65 0.16 320)' : pub ? 'oklch(0.68 0.14 150)' : `oklch(0.65 0.13 ${hue})`;
  const edge = open ? 'var(--warn)' : off ? 'oklch(0.6 0.16 320)' : pub ? 'oklch(0.55 0.14 150)' : `oklch(0.58 0.14 ${hue})`;
  const label = open ? 'oklch(0.55 0.13 65)' : off ? 'oklch(0.55 0.16 320)' : pub ? 'oklch(0.44 0.13 150)' : `oklch(0.5 0.14 ${hue})`;
  const style = { display: 'block', width: '100%', textAlign: 'left',
    ...(editable ? { cursor: onDragStart ? 'grab' : 'pointer', border: 'none' } : {}),
    position: 'relative',
    background: `color-mix(in oklab, ${tint} ${pub && !open && !off ? 20 : open ? 18 : 16}%, var(--surface))`,
    borderLeft: `3px solid ${edge}`,
    ...(editable ? { boxShadow: ot ? 'inset 0 0 0 1.5px oklch(0.58 0.19 25)' : 'none' } : {}),
    borderRadius: 'var(--r-sm)', padding: '5px 8px',
    ...(editable ? { opacity: dragging ? 0.4 : dim ? 0.35 : 1 } : {}),
    outline: hi ? '2px solid var(--accent)' : 'none', outlineOffset: 1 };
  const body = (
    <>
      <span className="mono" style={{ fontSize: 11.5, fontWeight: 700, color: `color-mix(in oklab, ${label} 60%, var(--ink))` }}>{shiftRange(s)}{editable && ot ? <span title="Over their weekly hours" style={{ marginLeft: 4, color: 'oklch(0.55 0.19 25)' }}>⚠</span> : null}</span>
      <span style={{ display: 'block', fontSize: 10, color: 'var(--ink-3)', marginTop: 1 }}>
        {open ? (unassigned ? 'Unassigned' : 'Up for grabs') : off ? 'Offered for swap' : `${shiftHrs(s)}h`}{multi ? ` · ${s._office}` : ''}{editable && !s.pub && !open ? ' · new' : ''}
      </span>
      {s.note && <span style={{ display: 'flex', alignItems: 'flex-start', gap: 3, fontSize: 10, color: 'var(--ink-2)', marginTop: 3, lineHeight: 1.35 }}><Icon name="chat" style={{ width: 10, height: 10, flex: 'none', marginTop: 1 }} /> {s.note}</span>}
    </>
  );
  if (!editable) return <div className="sched-shift" style={style}>{body}{mineActions}</div>;
  return (
    <button onClick={onClick} className="sched-shift" draggable={!!onDragStart} onDragStart={onDragStart} onDragEnd={onDragEnd} style={style}>
      {body}
    </button>
  );
}

function SchedOfficeBar({ OFFICES, offices, setOffices, toggleOffice }) {
  return (
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
  );
}

function SchedWeekNav({ weekKey, setWeekKey }) {
  return (
        <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginLeft: 'auto' }}>
          <button className="btn btn-quiet" onClick={() => setWeekKey(k => addWeeks(k, -1))} title="Previous week" style={{ padding: '6px 9px' }}><Icon name="chevron" style={{ width: 14, height: 14, transform: 'rotate(180deg)' }} /></button>
          <button className="btn btn-quiet" onClick={() => setWeekKey(thisWeekKey())} style={{ fontWeight: 700, fontSize: 13.5, padding: '6px 12px' }}>{weekLabel(weekKey)}{weekKey === thisWeekKey() ? '' : ' ↺'}</button>
          <button className="btn btn-quiet" onClick={() => setWeekKey(k => addWeeks(k, 1))} title="Next week" style={{ padding: '6px 9px' }}><Icon name="chevron" style={{ width: 14, height: 14 }} /></button>
        </div>
  );
}

function SchedViewSwitch({ view, setView }) {
  return (
        <div style={{ display: 'flex', gap: 0, border: '1px solid var(--line)', borderRadius: 'var(--r-pill)', overflow: 'hidden' }}>
          {SCHED_VIEWS.map(([id, label]) => (
            <button key={id} onClick={() => setView(id)} style={{ border: 'none', cursor: 'pointer', padding: '7px 14px', fontSize: 12.5, fontWeight: 600, background: view === id ? 'var(--ink)' : 'var(--surface)', color: view === id ? 'var(--surface)' : 'var(--ink-2)' }}>{label}</button>
          ))}
        </div>
  );
}

function SchedRoleSelect({ dept, setDept, DEPTS }) {
  return (
        <select value={dept} onChange={e => setDept(e.target.value)} title="Show only one role"
          style={{ border: '1px solid', borderColor: dept ? 'var(--accent)' : 'var(--line)', background: dept ? 'var(--accent-soft)' : 'var(--surface)', color: dept ? 'var(--accent-strong)' : 'var(--ink-2)', borderRadius: 'var(--r-pill)', padding: '6px 12px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
          <option value="">All roles</option>
          {DEPTS.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
  );
}

function SchedWeekRow({ weekKey, setWeekKey, onRefresh }) {
  return (
        <div className="schm-weekrow">
          <button className="schm-nav" onClick={() => setWeekKey(k => addWeeks(k, -1))} aria-label="Previous week"><Icon name="chevron" style={{ width: 18, height: 18, transform: 'rotate(180deg)' }} /></button>
          <button className="schm-weeknow" onClick={() => setWeekKey(thisWeekKey())}>
            <b>{weekLabel(weekKey)}</b>
            <small>{weekKey === thisWeekKey() ? 'This week' : 'Tap for this week'}</small>
          </button>
          <button className="schm-nav" onClick={() => setWeekKey(k => addWeeks(k, 1))} aria-label="Next week"><Icon name="chevron" style={{ width: 18, height: 18 }} /></button>
          <button className="schm-nav" onClick={onRefresh} aria-label="Refresh"><Icon name="refresh" style={{ width: 18, height: 18 }} /></button>
        </div>
  );
}

function SchedOfficeChips({ OFFICES, offices, setOffices, toggleOffice }) {
  return (
        <div className="schm-acts">
          <button onClick={() => setOffices(OFFICES)} className={offices.length === OFFICES.length ? 'on' : ''}>All</button>
          {OFFICES.map(o => (
            <button key={o} onClick={() => toggleOffice(o)} className={offices.length !== OFFICES.length && offices.includes(o) ? 'on' : ''}>{o}</button>
          ))}
        </div>
  );
}

function SchedViewChips({ view, setView }) {
  return (
        <div className="schm-seg">
          {SCHED_VIEWS.map(([id, label]) => (
            <button key={id} onClick={() => setView(id)} className={view === id ? 'on' : ''}>{label}</button>
          ))}
        </div>
  );
}

function SchedRolePick({ DEPTS, dept, setDept }) {
  if (DEPTS.length <= 1) return null;
  return (
          <select value={dept} onChange={e => setDept(e.target.value)} className="schm-pick">
            <option value="">All roles</option>
            {DEPTS.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
  );
}

function SchedDayStrip({ days, dayISO, today, nOn, nOpenOn, setMDay }) {
  return (
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
  );
}

/* asked when someone leaves the Builder (another tab or page) with unpublished edits.
   Leaving keeps them; coming back to the week shows them again. */
function LeaveDraftsDialog({ onStay, onLeave }) {
  return ReactDOM.createPortal((
    <>
      <div onClick={onStay} style={{ position: 'fixed', inset: 0, background: 'oklch(0.2 0.02 230 / 0.4)', zIndex: 88 }} />
      <div className="card fade-in" role="dialog" aria-modal="true" style={{ position: 'fixed', top: '12vh', left: 0, right: 0, margin: '0 auto', zIndex: 89, width: 'min(420px, calc(100vw - 32px))', padding: 'clamp(18px,4vw,24px)' }}>
        <h3 style={{ fontSize: 17, marginBottom: 6 }}>You have unpublished changes. Leave anyway?</h3>
        <p style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.5 }}>Nobody sees them until you publish. They stay in the Builder, and they’re there when you come back to this week.</p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
          <button onClick={onStay} className="btn btn-ghost">Stay</button>
          <button onClick={onLeave} className="btn btn-primary">Leave anyway</button>
        </div>
      </div>
    </>
  ), document.body);
}

Object.assign(window, { LeaveDraftsDialog, SCHED_VIEWS, SCHED_FIT_DEFAULT, useSchedFit, schedAll, schedOffices, editableOffices, officeRoster, deptHue, SchedShift,
  SchedOfficeBar, SchedWeekNav, SchedViewSwitch, SchedRoleSelect, SchedWeekRow, SchedOfficeChips, SchedViewChips, SchedRolePick, SchedDayStrip });
