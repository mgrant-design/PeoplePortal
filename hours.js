/* hours.js — hours worked from time clock punches, by week, with overtime. The week a
   punch belongs to is set by the day it started at the offices (US Eastern) and the
   organization's first day of the week (0 Sunday, 1 Monday, 2 Tuesday). Loaded by
   index.html; the tests load it as a module. */
(function () {
  const dayAtOffices = (ms) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));
  const addDays = (iso, n) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

  /* hours worked in one finished punch, less its breaks */
  function hoursOf(p) { return Math.max(0, (p.out - p.in) / 3600000 - (p.breakMins || 0) / 60); }

  /* the first day (YYYY-MM-DD) of the week a moment falls in */
  function weekKeyFor(ms, weekStart = 1) {
    const day = dayAtOffices(ms);
    const dow = new Date(day + 'T12:00:00Z').getUTCDay();
    return addDays(day, -((dow - weekStart + 7) % 7));
  }

  /* each week's hours, regular hours and overtime past the threshold, newest week first */
  function weeklyTotals(punches, { threshold = 40, weekStart = 1 } = {}) {
    const by = {};
    (punches || []).filter(p => p.out).forEach(p => { const k = weekKeyFor(p.in, weekStart); by[k] = (by[k] || 0) + hoursOf(p); });
    const round = (n) => Math.round(n * 100) / 100;
    return Object.keys(by).sort().reverse().map(weekKey => {
      const hours = round(by[weekKey]);
      return { weekKey, hours, regular: round(Math.min(hours, threshold)), overtime: round(Math.max(0, hours - threshold)) };
    });
  }

  const api = { hoursOf, weekKeyFor, weeklyTotals, dayAtOffices };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else window.PD_HOURS = api;
})();
