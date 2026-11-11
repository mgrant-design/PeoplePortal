/* weekmerge.js — how a manager's changes to a week are worked out and added to the stored
   week. Loaded by index.html and copied into api/_shared/ for the server (deploy workflow,
   npm run sync). Shifts are compared on what makes a shift (who, when, the flags an employee
   can set), never on `pub`, which publishing stamps. */
(function () {
  const KEYS = ['id', 'empId', 'date', 'start', 'end', 'open', 'offered', 'offeredBy', 'breakMins', 'note'];
  const canon = (s) => {
    const out = {};
    KEYS.forEach(k => { const v = s[k]; if (v !== undefined && v !== null && v !== '' && v !== false) out[k] = v; });
    return JSON.stringify(out);
  };
  const same = (a, b) => canon(a) === canon(b);

  /* what to add, change and remove to turn `base` (the week as it was opened) into `draft` */
  function diffWeek(base, draft) {
    const was = new Map((base || []).map(s => [s.id, s]));
    const now = new Map((draft || []).map(s => [s.id, s]));
    const add = [], update = [], remove = [];
    now.forEach((s, id) => {
      if (!was.has(id)) add.push(s);
      else if (!same(was.get(id), s)) update.push({ shift: s, was: was.get(id) });
    });
    was.forEach((s, id) => { if (!now.has(id)) remove.push({ id, was: s }); });
    return { add, update, remove };
  }

  /* add the changes to the shifts as they are now. A change to a shift that is no longer
     as the manager saw it is left out and listed in `conflicts`. → { shifts, conflicts } */
  function applyChanges(shifts, changes) {
    const out = shifts.slice(); const conflicts = [];
    const at = (id) => out.findIndex(s => s.id === id);
    (changes.add || []).forEach(s => {
      const i = at(s.id);
      if (i < 0) out.push(s); else if (!same(out[i], s)) conflicts.push({ id: s.id, why: 'added by someone else' });
    });
    (changes.update || []).forEach(({ shift, was }) => {
      const i = at(shift.id);
      if (i < 0) conflicts.push({ id: shift.id, why: 'removed by someone else' });
      else if (!same(out[i], was)) conflicts.push({ id: shift.id, why: 'changed by someone else' });
      else out[i] = shift;
    });
    (changes.remove || []).forEach(({ id, was }) => {
      const i = at(id);
      if (i < 0) return;   // already gone
      if (!same(out[i], was)) conflicts.push({ id, why: 'changed by someone else' }); else out.splice(i, 1);
    });
    return { shifts: out, conflicts };
  }

  /* the stored week with the changes added; throws an error with status 409 and the clashes */
  function mergeWeek(stored, changes) {
    const { shifts, conflicts } = applyChanges(stored.shifts || [], changes);
    if (conflicts.length) {
      const e = new Error('Someone changed this week since you opened it'); e.status = 409; e.conflicts = conflicts; throw e;
    }
    return { ...stored, shifts };
  }

  const api = { diffWeek, applyChanges, mergeWeek };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else window.PD_WEEK = api;
})();
