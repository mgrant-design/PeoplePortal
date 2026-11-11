/* api/scheduleimport/index.js — one-way migration: write a parsed roster CSV export
   into our own week documents, and record a receipt in `importLog`.

   POST /api/scheduleimport { mode:'merge'|'replace', fileName, shifts:[{office,weekKey,shift}],
                            unresolved:[...] }

   Admin-only. The client parses and resolves the CSV against the roster (it has the
   employee list already); this endpoint re-sanitizes every shift and groups them into
   week docs. A week that already exists keeps its published state (an import changes no
   week's visibility); a week that did not exist starts UNPUBLISHED so a human reviews it
   before anyone is notified. A row with no person is an open shift (empId '' with open: true).

   It does NOT touch `regularHours` — standing weekly hours are entered by managers,
   never derived from an import. Nothing reads the previous system at runtime.

   Disposable: once the migration is done this endpoint can be deleted. */

const { handler, resolveCaller } = require('../_shared/caller');
const { cosmos, strip, collPath } = require('../_shared/cosmos');
const weekStore = require('../_shared/weeks');
const { cleanShift } = weekStore;   // the same canonical shift api/schedule writes

const SCHEDULES = collPath('schedules');
const IMPORTLOG = collPath('importLog');
const MAX_SHIFTS = 5000;

module.exports = handler(['POST'], async ({ req, body }) => {
  const c = await resolveCaller(req);
  const identity = c.identity;
  const employees = c.employees;
  if (!c.access.flags.isAdmin) return { status: 403, body: { error: 'Importing is admin-only' } };
    const input = body;
    if (!input || !Array.isArray(input.shifts)) return { status: 400, body: { error: 'shifts[] is required' } };
    if (input.shifts.length > MAX_SHIFTS) return { status: 400, body: { error: `Too many rows in one import (max ${MAX_SHIFTS})` } };
    const replace = input.mode === 'replace';

    /* group the incoming shifts by office + week */
    const groups = {};
    let rejected = 0;
    const validIds = new Set(employees.map(e => e.id));
    input.shifts.forEach(r => {
      const office = String((r && r.office) || '').slice(0, 80);
      const weekKey = String((r && r.weekKey) || '');
      const shift = cleanShift(r && r.shift);
      if (!office || !/^\d{4}-\d{2}-\d{2}$/.test(weekKey) || !shift || (shift.empId ? !validIds.has(shift.empId) : !shift.open)) { rejected++; return; }
      const k = weekKey + '__' + office;
      (groups[k] = groups[k] || { office, weekKey, shifts: [] }).shifts.push(shift);
    });

    const keys = Object.keys(groups);
    if (!keys.length) return { status: 400, body: { error: 'Nothing importable in that file', rejected } };

    /* receipt — the audit trail for this run (its own container, kept permanently); written
       for a run that stopped partway too, with where it stopped */
    const receipt = async (stopped) => {
      const logId = 'imp-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
      const unresolved = Array.isArray(input.unresolved) ? input.unresolved.slice(0, 500).map(u => ({
        line: Number(u && u.line) || 0,
        person: String((u && u.person) || '').slice(0, 120),
        reason: String((u && u.reason) || '').slice(0, 200),
        raw: String((u && u.raw) || '').slice(0, 200),
      })) : [];
      try {
        await cosmos({
          verb: 'POST', resId: IMPORTLOG, path: `/${IMPORTLOG}/docs`, partitionKey: logId, upsert: true,
          body: {
            id: logId, source: 'roster-csv', fileName: String(input.fileName || '').slice(0, 200),
            mode: replace ? 'replace' : 'merge', ranBy: identity.email, ranAt: new Date().toISOString(),
            rowsSubmitted: input.shifts.length, shiftsWritten: written, rejected,
            weeks, offices: [...new Set(keys.map(k => groups[k].office))], unresolved, ...(stopped ? { stopped } : {}),
          },
        });
      } catch (e) { /* a missing receipt must not change what the import answers */ }
      return logId;
    };

    let written = 0;
    const weeks = [];
    for (const k of keys) {
      const g = groups[k];
      const id = `${g.weekKey}__${g.office}`;
      const raw = await weekStore.getWeekRaw(g.office, g.weekKey);
      const existing = raw ? strip(raw) : null;
      const prior = (existing && Array.isArray(existing.shifts)) ? existing.shifts : [];
      /* merge skips a row that already exists for the same person (or open slot), day and times, so
         re-running an import after fixing unresolved rows doesn't duplicate work */
      const sig = s => `${s.empId}|${s.date}|${s.start}|${s.end}|${s.open ? 'open' : ''}`;
      const seen = new Set(prior.map(sig));
      const add = replace ? g.shifts : g.shifts.filter(s => !seen.has(sig(s)));
      const shifts = replace ? g.shifts : prior.concat(add);
      const doc = {
        ...(existing || { id, office: g.office, weekKey: g.weekKey, published: false, publishedBy: null, publishedAt: null }),
        id, office: g.office, weekKey: g.weekKey, shifts,
        importedFrom: 'csv', importedAt: new Date().toISOString(),
      };
      const saved = await weekStore.putWeek(doc, raw && raw._etag, identity.email);
      if (!saved) {
        const stopped = `The ${g.office} week of ${g.weekKey} changed while the import ran.`;
        const logId = await receipt(stopped);
        return { status: 409, body: { error: `${stopped} ${weeks.length ? `The ${weeks.length} week${weeks.length === 1 ? '' : 's'} before it ${weeks.length === 1 ? 'was' : 'were'} imported. ` : ''}${replace ? 'Run it again.' : 'Run it again; rows already imported are skipped.'}`, written, weeks, logId } };
      }
      written += add.length;
      weeks.push(id);
    }

    const logId = await receipt();
    return { status: 200, body: { ok: true, written, rejected, weeks, logId } };
});
