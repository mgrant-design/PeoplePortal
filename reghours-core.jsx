/* reghours-core.jsx — regular working hours: /api/reghours client, lookup helpers
   and the profile editor. Loaded after sched-core.jsx.

   A profile is a person's STANDING week ("normally works Mon 7:00–5:00, 30m meal")
   plus their overtime threshold. It lives in its own Cosmos container, separate from
   the roster (permanent) and from the week docs (change weekly). It is entered and
   edited by managers — never derived from an import.

   Profiles power: the "Use regular hours" fill in the shift form, the week-level
   fill of empty cells, and the overtime threshold the weekly total is checked
   against. Actual shifts remain the source of truth for what is scheduled. */

const REG_DOW = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const REG_DOW_LABEL = { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' };
const DEFAULT_OT_THRESHOLD = 40;   /* "Standard 40 hours" — the default for everyone */
const DEFAULT_MEAL_BREAK = 30;     /* minutes; the usual unpaid meal break */

/* ---- client (sandbox has no /api, so reads reject and callers fall back to []) ---- */
function regToken() { return (typeof window !== 'undefined' && window.PD_GOOGLE_TOKEN) || ''; }
async function fetchRegHours() {
  const res = await fetch('/api/reghours', { headers: { 'X-Google-Token': regToken() } });
  if (!res.ok) throw new Error('regular hours read failed (' + res.status + ')');
  return (await res.json()).profiles || [];
}
async function saveRegHours(profile) {
  const res = await fetch('/api/reghours', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Google-Token': regToken() },
    body: JSON.stringify({ action: 'save', profile }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || ('save failed (' + res.status + ')'));
  return data.profile;
}

/* ---- lookup ---- */
/* index a profile list by its id (lowercased work email) */
function regHoursIndex(list) { const m = {}; (list || []).forEach(p => { if (p && p.id) m[p.id] = p; }); return m; }
/* the profile for an employee record, or null */
function regHoursFor(index, emp) {
  if (!index || !emp) return null;
  const key = (emp.emailLower || emp.workEmail || '').toLowerCase();
  return (key && index[key]) || null;
}
/* a person's overtime threshold — their own if set, otherwise the standard 40 */
function otThreshold(index, emp) {
  const p = regHoursFor(index, emp);
  const n = p && Number(p.overtimeThreshold);
  return isFinite(n) && n > 0 ? n : DEFAULT_OT_THRESHOLD;
}
/* the standing hours for one ISO date, or null if they don't normally work it.
   weekDaysFor() indexes Monday=0, which matches REG_DOW. */
function regHoursOnDate(index, emp, date) {
  const p = regHoursFor(index, emp);
  if (!p || !p.days) return null;
  const d = parseISO(date);
  const key = REG_DOW[(d.getDay() + 6) % 7];
  const day = p.days[key];
  return day && day.start && day.end ? { start: day.start, end: day.end, breakMins: Number(day.breakMins) || 0 } : null;
}
/* sum of a profile's standing week, break-subtracted — the "hours per period"
   figure. Derived, never stored: it is not the same number as the OT threshold. */
function regHoursWeekTotal(profile) {
  if (!profile || !profile.days) return 0;
  const total = REG_DOW.reduce((a, k) => {
    const d = profile.days[k];
    return d && d.start && d.end ? a + shiftHrs({ start: d.start, end: d.end, breakMins: d.breakMins }) : a;
  }, 0);
  return Math.round(total * 10) / 10;
}
/* a blank profile for someone with none yet */
function blankRegHours(emp) {
  return {
    id: (emp.emailLower || emp.workEmail || '').toLowerCase(),
    empId: emp.id || '', office: emp.loc || emp.location || '', role: emp.department || emp.jobTitle || '',
    periodType: 'weekly', overtimeThreshold: DEFAULT_OT_THRESHOLD,
    days: REG_DOW.reduce((o, k) => { o[k] = null; return o; }, {}),
  };
}

/* ---- editor ----
   Picks a person, then edits their standing week. Mirrors the shift form's
   vocabulary (presets, typed times, an unpaid break) so it reads as the same tool. */
function RegPortal({ children }) { return ReactDOM.createPortal(children, document.body); }

function RegularHoursModal({ roster, profiles, onSaved, onClose, flash }) {
  const [pickId, setPickId] = useState('');
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const index = useMemo(() => regHoursIndex(profiles), [profiles]);
  const people = useMemo(() => (roster || []).slice().sort((a, b) => a.name.localeCompare(b.name)), [roster]);

  const pick = (id) => {
    setPickId(id);
    const emp = people.find(p => p.id === id);
    if (!emp) { setDraft(null); return; }
    const existing = regHoursFor(index, emp);
    setDraft(existing ? JSON.parse(JSON.stringify(existing)) : blankRegHours(emp));
  };
  const setDay = (k, patch) => setDraft(d => ({ ...d, days: { ...d.days, [k]: patch } }));
  const toggleDay = (k) => setDraft(d => ({ ...d, days: { ...d.days, [k]: d.days[k] ? null : { start: '09:00', end: '17:00', breakMins: DEFAULT_MEAL_BREAK } } }));

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    try { const p = await saveRegHours(draft); flash('Regular hours saved.'); onSaved(p); }
    catch (e) { flash(e.message); }
    setSaving(false);
  };

  const weekTotal = draft ? regHoursWeekTotal(draft) : 0;
  const noEmail = draft && !draft.id;

  return (
    <RegPortal>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'oklch(0.2 0.02 230 / 0.4)', zIndex: 80 }} />
      <div className="card fade-in" role="dialog" aria-modal="true" style={{ position: 'fixed', top: 'calc(64px + 16px)', left: 0, right: 0, margin: '0 auto', zIndex: 81, width: 'min(560px, 94vw)', maxHeight: 'calc(100vh - 64px - 32px)', overflowY: 'auto', padding: 0, boxShadow: 'var(--shadow-lg)' }}>
        <div style={{ padding: '16px 20px 12px', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <div style={{ fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--accent-strong)' }}>Regular hours</div>
            <h3 style={{ fontSize: 17, margin: '2px 0 0' }}>Standing weekly hours</h3>
            <p style={{ fontSize: 12.5, color: 'var(--ink-3)', margin: '4px 0 0', lineHeight: 1.5 }}>The hours someone normally works. Used to fill a week and to flag overtime — it never changes a shift on its own.</p>
          </div>
          <button onClick={onClose} className="btn btn-quiet" style={{ width: 30, height: 30, padding: 0, flex: 'none', justifyContent: 'center' }}><Icon name="x" style={{ width: 14, height: 14 }} /></button>
        </div>

        <div style={{ padding: '14px 20px', display: 'flex', flexDirection: 'column', gap: 13 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 12, fontWeight: 700, color: 'var(--ink-2)' }}>Employee
            <select value={pickId} onChange={e => pick(e.target.value)} style={{ padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 'var(--r-sm)', fontSize: 13.5, background: 'var(--surface)' }}>
              <option value="">— pick —</option>
              {people.map(p => <option key={p.id} value={p.id}>{p.name} · {p.dept}{regHoursFor(index, p) ? ' ✓' : ''}</option>)}
            </select>
          </label>

          {noEmail && (
            <div style={{ border: '1.5px solid var(--warn)', background: 'var(--warn-soft)', borderRadius: 'var(--r-md)', padding: '10px 13px', fontSize: 12.5, lineHeight: 1.5, color: 'oklch(0.42 0.11 60)' }}>
              This person has no work email on their roster record, so there's nothing to key their regular hours to. Add a work email first.
            </div>
          )}

          {draft && !noEmail && (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                {REG_DOW.map(k => {
                  const d = draft.days[k];
                  return (
                    <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap', padding: '7px 10px', borderRadius: 'var(--r-md)', background: d ? 'var(--accent-softer)' : 'var(--surface-2)' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 7, width: 116, fontSize: 12.5, fontWeight: 700, color: 'var(--ink-2)', cursor: 'pointer' }}>
                        <input type="checkbox" checked={!!d} onChange={() => toggleDay(k)} /> {REG_DOW_LABEL[k]}
                      </label>
                      {d ? (
                        <>
                          <input type="time" value={d.start} onChange={e => setDay(k, { ...d, start: e.target.value })} style={{ width: 110, padding: '6px 8px', border: '1px solid var(--line)', borderRadius: 'var(--r-sm)', fontSize: 13, background: 'var(--surface)' }} />
                          <span style={{ color: 'var(--ink-3)' }}>→</span>
                          <input type="time" value={d.end} onChange={e => setDay(k, { ...d, end: e.target.value })} style={{ width: 110, padding: '6px 8px', border: '1px solid var(--line)', borderRadius: 'var(--r-sm)', fontSize: 13, background: 'var(--surface)' }} />
                          <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: 'var(--ink-3)', fontWeight: 600 }}>
                            <input type="number" min="0" max="480" step="5" value={d.breakMins} onChange={e => setDay(k, { ...d, breakMins: Math.max(0, Number(e.target.value) || 0) })} className="mono" style={{ width: 58, padding: '6px 7px', border: '1px solid var(--line)', borderRadius: 'var(--r-sm)', fontSize: 12.5, background: 'var(--surface)' }} /> min unpaid break
                          </label>
                          <span className="mono" style={{ marginLeft: 'auto', fontSize: 12.5, fontWeight: 700, color: 'var(--ink-2)' }}>{shiftHrs({ start: d.start, end: d.end, breakMins: d.breakMins })}h</span>
                        </>
                      ) : <span style={{ fontSize: 12.5, color: 'var(--ink-3)' }}>Doesn't normally work</span>}
                    </div>
                  );
                })}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', paddingTop: 4, borderTop: '1px solid var(--line-soft)' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, fontWeight: 700, color: 'var(--ink-2)' }}>Overtime after
                  <input type="number" min="1" max="168" value={draft.overtimeThreshold} onChange={e => setDraft(d => ({ ...d, overtimeThreshold: Math.max(1, Number(e.target.value) || DEFAULT_OT_THRESHOLD) }))} className="mono" style={{ width: 70, padding: '7px 9px', border: '1px solid var(--line)', borderRadius: 'var(--r-sm)', fontSize: 13, background: 'var(--surface)' }} />
                  <span style={{ fontWeight: 600, color: 'var(--ink-3)' }}>hrs/week</span>
                </label>
                <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>Standard is {DEFAULT_OT_THRESHOLD}. Their standing week totals <b className="mono">{weekTotal}h</b>.</span>
              </div>
            </>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, padding: '13px 20px 16px', borderTop: '1px solid var(--line)' }}>
          <div style={{ flex: 1 }} />
          <button onClick={onClose} className="btn btn-ghost">Cancel</button>
          <button disabled={!draft || noEmail || saving} onClick={save} className="btn btn-primary"><Icon name="check" /> {saving ? 'Saving…' : 'Save regular hours'}</button>
        </div>
      </div>
    </RegPortal>
  );
}

Object.assign(window, {
  REG_DOW, REG_DOW_LABEL, DEFAULT_OT_THRESHOLD, DEFAULT_MEAL_BREAK, RegPortal,
  fetchRegHours, saveRegHours, regHoursIndex, regHoursFor, otThreshold, regHoursOnDate,
  regHoursWeekTotal, blankRegHours, RegularHoursModal,
});
