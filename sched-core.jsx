/* sched-core.jsx — scheduling foundation shared by scheduler.jsx, myschedule.jsx
   and notifications.jsx. Loaded right after data.jsx.

   Shift record (D4): a week doc holds a flat LIST of shifts —
     { id, empId, date:'YYYY-MM-DD', start:'07:00', end:'15:00',
       open?:true (unassigned), offered?:true, offeredBy?:empId }
   Zero or more shifts per person-day. Times are 24h 'HH:MM' strings.

   Week doc (one per office+week, Cosmos `schedules`, partition /office):
     { id: `${weekKey}__${office}`, office, weekKey, shifts:[...],
       published, publishedBy, publishedAt, updatedBy, updatedAt }
   weekKey is the Monday's date (YYYY-MM-DD). Any week, past or future, is
   addressable — nothing is pinned to the current Monday. */

/* ---- shift-form presets (D10: presets AND typed times) ---- */
const SHIFT_PRESETS = [
  { label: 'Opening', start: '07:00', end: '15:00' },
  { label: 'Mid', start: '09:00', end: '17:00' },
  { label: 'Closing', start: '11:00', end: '19:00' },
  { label: 'Half day', start: '08:00', end: '12:00' },
];

/* ---- date math (all local time; keys/dates are YYYY-MM-DD strings) ---- */
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function isoDate(d) { const z = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`; }
function parseISO(s) { const [y, m, d] = String(s).split('-').map(Number); return new Date(y, m - 1, d); }
/* Monday of the week containing `date` (Date or ISO string) */
function weekKeyOf(date) {
  const d = date instanceof Date ? new Date(date) : parseISO(date);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return isoDate(d);
}
function addDaysISO(iso, n) { const d = parseISO(iso); d.setDate(d.getDate() + n); return isoDate(d); }
function addWeeks(weekKey, n) { return addDaysISO(weekKey, n * 7); }
const thisWeekKey = () => weekKeyOf(new Date());
/* Seven day descriptors for a week: [{date, dow(0=Mon), dname, dnum, month}] */
function weekDaysFor(weekKey) {
  return Array.from({ length: 7 }, (_, i) => {
    const d = parseISO(addDaysISO(weekKey, i));
    return { date: isoDate(d), dow: i, dname: DAY_NAMES[d.getDay()], dnum: d.getDate(), month: MONTH_NAMES[d.getMonth()] };
  });
}
/* Human label for a week, e.g. "Mar 2 – 8" or "Dec 29 – Jan 4" */
function weekLabel(weekKey) {
  const a = parseISO(weekKey), b = parseISO(addDaysISO(weekKey, 6));
  const sameM = a.getMonth() === b.getMonth();
  return `${MONTH_NAMES[a.getMonth()]} ${a.getDate()} – ${sameM ? '' : MONTH_NAMES[b.getMonth()] + ' '}${b.getDate()}`;
}

/* ---- time helpers ---- */
function timeMins(t) { const [h, m] = String(t || '0:0').split(':').map(Number); return (h || 0) * 60 + (m || 0); }
function shiftHrs(s) { const len = timeMins(s.end) - timeMins(s.start); return Math.round(Math.max(0, len) / 6) / 10; }
function fmt12(t) {
  let [h, m] = String(t || '').split(':').map(Number);
  if (isNaN(h)) return t || '';
  const ap = h >= 12 ? 'p' : 'a'; h = h % 12 || 12;
  return m ? `${h}:${String(m).padStart(2, '0')}${ap}` : `${h}${ap}`;
}
const shiftRange = s => `${fmt12(s.start)}–${fmt12(s.end)}`;
function timesOverlap(aStart, aEnd, bStart, bEnd) {
  return timeMins(aStart) < timeMins(bEnd) && timeMins(bStart) < timeMins(aEnd);
}

/* ---- conflicts (§2.3: warn, never block) ----
   Returns { shifts:[...], blackout } — existing same-person shifts overlapping the
   candidate time on that date, and an approved blackout covering the date (if any). */
function shiftConflicts({ shifts, blackouts, empId, date, start, end, excludeId }) {
  const hit = (shifts || []).filter(s =>
    s.empId === empId && s.date === date && s.id !== excludeId && !s.open &&
    timesOverlap(start, end, s.start, s.end));
  const bo = (blackouts || []).find(b =>
    b.status === 'approved' && b.empId === empId && (b.dates || []).includes(date));
  return { shifts: hit, blackout: bo || null };
}

let SHIFT_SEQ = 0;
const newShiftId = () => 'sh-' + Date.now().toString(36) + '-' + (++SHIFT_SEQ) + Math.random().toString(36).slice(2, 5);

/* ---- /api/schedule client (token sent like /api/roster; sandbox has no /api,
        so reads reject and callers fall back to empty state) ---- */
function schedToken() { return (typeof window !== 'undefined' && window.PD_GOOGLE_TOKEN) || ''; }
async function fetchSchedules({ office, offices, weekKey } = {}) {
  const qs = new URLSearchParams();
  if (office) qs.set('office', office);
  if (offices && offices.length) qs.set('offices', offices.join('|'));
  if (weekKey) qs.set('weekKey', weekKey);
  const res = await fetch('/api/schedule' + (qs.toString() ? '?' + qs : ''), { headers: { 'X-Google-Token': schedToken() } });
  if (!res.ok) throw new Error('schedule read failed (' + res.status + ')');
  return (await res.json()).schedules || [];
}
/* pending edits, swap claims and blackout requests, scoped server-side */
async function fetchSchedRequests() {
  const res = await fetch('/api/schedule?requests=1', { headers: { 'X-Google-Token': schedToken() } });
  if (!res.ok) throw new Error('requests read failed (' + res.status + ')');
  return (await res.json()).requests || [];
}
/* per-person-per-office access grants (§4) — admin sees all, others their own */
async function fetchSchedAccess() {
  const res = await fetch('/api/schedule?access=1', { headers: { 'X-Google-Token': schedToken() } });
  if (!res.ok) throw new Error('access read failed (' + res.status + ')');
  return (await res.json()).access || [];
}
async function fetchSchedTemplates(office) {
  const res = await fetch('/api/schedule?templates=' + encodeURIComponent(office), { headers: { 'X-Google-Token': schedToken() } });
  if (!res.ok) throw new Error('templates read failed (' + res.status + ')');
  return (await res.json()).templates || [];
}
/* every write goes through one action endpoint:
   save | publish | edit | edit_decide | offer | retract | claim | swap_decide |
   blackout_submit | blackout_hr | blackout_mgr | access_set | template_save | template_delete */
async function schedAction(body) {
  const res = await fetch('/api/schedule', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Google-Token': schedToken() },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || ('action failed (' + res.status + ')'));
  return data;
}

Object.assign(window, {
  SHIFT_PRESETS, weekKeyOf, addDaysISO, addWeeks, thisWeekKey, weekDaysFor, weekLabel, isoDate, parseISO,
  timeMins, shiftHrs, fmt12, shiftRange, timesOverlap, shiftConflicts, newShiftId,
  fetchSchedules, fetchSchedRequests, fetchSchedAccess, fetchSchedTemplates, schedAction,
});
