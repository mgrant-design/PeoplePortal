/* sched-core.jsx — scheduling foundation shared by scheduler.jsx, myschedule.jsx
   and notifications.jsx. Loaded right after data.jsx.

   Shift record (D4): a week doc holds a flat LIST of shifts —
     { id, empId, date:'YYYY-MM-DD', start:'07:00', end:'15:00', breakMins?:30,
       note?:'text shown to the employee', open?:true (unassigned),
       offered?:true, offeredBy?:empId }
   breakMins is an UNPAID break subtracted from the shift's hours (a 7:00–17:00
   shift with a 30m meal is 9.5h, not 10h). Absent = 0, so shifts saved before the
   field existed behave exactly as they did.
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

/* Which weekday a schedule week begins on — 1 Monday (the default), 0 Sunday, 2 Tuesday.
   Set once from org config at sign-in; every week calculation reads it.

   CHANGING THIS RE-BUCKETS EXISTING WEEKS. A week document's id is its start date, so a
   week saved while Monday-start lives under a Monday. Switch to Sunday-start and a date
   now resolves to the Sunday before, which is a DIFFERENT document id — the old week is
   still in Cosmos but nothing looks there any more. It is a deliberate, announced change,
   not a display preference. */
const WEEK_STARTS = [[1, 'Monday'], [2, 'Tuesday'], [0, 'Sunday']];
let SCHED_WEEK_START = 1;
function setWeekStart(n) {
  const v = Number(n);
  if (WEEK_STARTS.some(([k]) => k === v)) SCHED_WEEK_START = v;
  return SCHED_WEEK_START;
}
const weekStart = () => SCHED_WEEK_START;
/* the start date of the week containing `date` (Date or ISO string) */
function weekKeyOf(date) {
  const d = date instanceof Date ? new Date(date) : parseISO(date);
  d.setDate(d.getDate() - ((d.getDay() - SCHED_WEEK_START + 7) % 7));
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
/* Paid hours for a shift: elapsed time minus the unpaid break. */
function shiftHrs(s) {
  const br = Math.max(0, Number(s && s.breakMins) || 0);
  const len = timeMins(s.end) - timeMins(s.start) - br;
  return Math.round(Math.max(0, len) / 6) / 10;
}
/* "9h 30m"-style label for a break, for places that show the deduction */
function breakLabel(mins) {
  const m = Math.max(0, Number(mins) || 0);
  if (!m) return '';
  return m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? ' ' + (m % 60) + 'm' : ''}` : `${m}m`;
}
/* "16:30" → "4:30p"; the one copy lives in approvals-text.js, which the server shares */
function fmt12(t) { return window.pdTime12(t); }
const shiftRange = s => `${fmt12(s.start)}–${fmt12(s.end)}`;
function timesOverlap(aStart, aEnd, bStart, bEnd) {
  return timeMins(aStart) < timeMins(bEnd) && timeMins(bStart) < timeMins(aEnd);
}

/* ---- conflicts (§2.3: warn, never block) ----
   Returns { shifts:[...], timeOff } — existing same-person shifts overlapping the
   candidate time on that date, and approved time off covering the date (if any).
   timeOff entries are { empId, dates } from fetchApprovedTimeOff. */
function shiftConflicts({ shifts, timeOff, empId, date, start, end, excludeId }) {
  const hit = (shifts || []).filter(s =>
    s.empId === empId && s.date === date && s.id !== excludeId && !s.open &&
    timesOverlap(start, end, s.start, s.end));
  const off = (timeOff || []).find(t => t.empId === empId && (t.dates || []).includes(date));
  return { shifts: hit, timeOff: off || null };
}

/* approved time off overlapping from..to (ISO days), as [{ empId, dates }], for the
   people whose schedule the caller sees (scoped by api/approvals) */
async function fetchApprovedTimeOff({ from, to }) {
  const list = (await pdApi('/api/approvals', { query: { kind: 'timeoff', status: 'approved', from, to } })).timeOff || [];
  return list.map(t => {
    const emp = typeof findByEmail === 'function' ? findByEmail(t.email) : null;
    const dates = [];
    const last = t.end < to ? t.end : to;
    for (let d = t.start > from ? t.start : from; d <= last; d = addDaysISO(d, 1)) dates.push(d);
    return { empId: emp ? emp.id : t.email, dates };
  });
}

let SHIFT_SEQ = 0;
const newShiftId = () => 'sh-' + Date.now().toString(36) + '-' + (++SHIFT_SEQ) + Math.random().toString(36).slice(2, 5);

/* ---- /api/schedule client (sandbox has no /api, so reads reject and callers
        fall back to empty state) ---- */
async function fetchSchedules({ office, offices, weekKey } = {}) {
  const query = {
    office: office || undefined,
    offices: offices && offices.length ? offices.join('|') : undefined,
    weekKey: weekKey || undefined,
  };
  return (await pdApi('/api/schedule', { query })).schedules || [];
}
async function fetchSchedTemplates(office) {
  return (await pdApi('/api/schedule', { query: { templates: office } })).templates || [];
}
/* every write goes through one action endpoint:
   save | publish | retract | template_save | template_delete */
function schedAction(body) {
  return pdApi('/api/schedule', { method: 'POST', body });
}

Object.assign(window, {
  SHIFT_PRESETS, WEEK_STARTS, setWeekStart, weekStart,
  weekKeyOf, addDaysISO, addWeeks, thisWeekKey, weekDaysFor, weekLabel, isoDate, parseISO,
  timeMins, shiftHrs, fmt12, shiftRange, timesOverlap, shiftConflicts, newShiftId, breakLabel,
  fetchSchedules, fetchSchedTemplates, schedAction, fetchApprovedTimeOff,
});
