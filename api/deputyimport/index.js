/* api/deputyimport/index.js — one-way migration: write a parsed Deputy roster export
   into our own week documents, and record a receipt in `importLog`.

   POST /api/deputyimport { mode:'merge'|'replace', fileName, shifts:[{office,weekKey,shift}],
                            unresolved:[...] }

   Admin-only. The client parses and resolves the CSV against the roster (it has the
   employee list already); this endpoint re-sanitizes every shift, groups them into
   week docs, and writes them UNPUBLISHED so a human reviews before anyone is notified.

   It does NOT touch `regularHours` — standing weekly hours are entered by managers,
   never derived from an import. Deputy is not read at runtime by anything.

   Disposable: once the migration is done this endpoint can be deleted. */

const { verifyGoogleToken, tokenFromReq } = require('../_shared/auth');
const { cosmos, listAll, strip, collPath, cosmosConfigured, loadAccessControl, applyAccessControl } = require('../_shared/cosmos');

const ALLOWED = ['puredental.com', 'foureversmile.com', 'puredentallab.com'];
const SCHEDULES = collPath('schedules');
const IMPORTLOG = collPath('importLog');
const MAX_SHIFTS = 5000;

/* same canonical shift record api/schedule writes */
function cleanShift(s) {
  if (!s || typeof s !== 'object') return null;
  const t = v => String(v || '').slice(0, 60);
  const time = v => /^\d{1,2}:\d{2}$/.test(String(v || '')) ? String(v) : null;
  const date = v => /^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : null;
  const out = { id: t(s.id), empId: t(s.empId), date: date(s.date), start: time(s.start), end: time(s.end) };
  if (!out.id || !out.empId || !out.date || !out.start || !out.end) return null;
  const br = Number(s.breakMins);
  if (isFinite(br) && br > 0) out.breakMins = Math.min(480, Math.round(br));
  const note = String(s.note || '').trim().slice(0, 280);
  if (note) out.note = note;
  return out;
}

module.exports = async function (context, req) {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Google-Token',
  };
  const send = (status, body) => { context.res = { status, headers, body: JSON.stringify(body) }; };
  if (req.method === 'OPTIONS') { context.res = { status: 204, headers }; return; }
  if (req.method !== 'POST') return send(405, { error: 'POST only' });

  let identity;
  try { identity = await verifyGoogleToken(tokenFromReq(req)); }
  catch (e) { return send(401, { error: 'Not authenticated', detail: e.message }); }
  if (!ALLOWED.includes(identity.email.split('@')[1] || '')) return send(403, { error: 'Domain not allowed' });
  if (!cosmosConfigured()) return send(500, { error: 'Missing Cosmos config' });

  try {
    /* admin check from the live roster + accessControl, same as everywhere else */
    const employees = (await listAll(collPath('roster'))).map(strip);
    const me = employees.find(e => (e.workEmail || '').toLowerCase() === identity.email);
    if (!me) return send(403, { error: 'No roster account for ' + identity.email });
    let ref = { users: [] };
    try {
      const sup = (await listAll(collPath('appState'))).find(d => d.id === 'roster-support');
      if (sup) ref = { users: sup.users || [] };
    } catch (e) {}
    const usersByEmail = {}; (ref.users || []).forEach(u => { if (u.email) usersByEmail[u.email.toLowerCase()] = u; });
    try { applyAccessControl(usersByEmail, await loadAccessControl()); } catch (e) {}
    if (!(usersByEmail[identity.email] || {}).admin) return send(403, { error: 'Importing is admin-only' });

    let input = req.body;
    if (typeof input === 'string') { try { input = JSON.parse(input); } catch (e) { input = null; } }
    if (!input || !Array.isArray(input.shifts)) return send(400, { error: 'shifts[] is required' });
    if (input.shifts.length > MAX_SHIFTS) return send(400, { error: `Too many rows in one import (max ${MAX_SHIFTS})` });
    const replace = input.mode === 'replace';

    /* group the incoming shifts by office + week */
    const groups = {};
    let rejected = 0;
    const validIds = new Set(employees.map(e => e.id));
    input.shifts.forEach(r => {
      const office = String((r && r.office) || '').slice(0, 80);
      const weekKey = String((r && r.weekKey) || '');
      const shift = cleanShift(r && r.shift);
      if (!office || !/^\d{4}-\d{2}-\d{2}$/.test(weekKey) || !shift || !validIds.has(shift.empId)) { rejected++; return; }
      const k = weekKey + '__' + office;
      (groups[k] = groups[k] || { office, weekKey, shifts: [] }).shifts.push(shift);
    });

    const keys = Object.keys(groups);
    if (!keys.length) return send(400, { error: 'Nothing importable in that file', rejected });

    let written = 0;
    const weeks = [];
    for (const k of keys) {
      const g = groups[k];
      const id = `${g.weekKey}__${g.office}`;
      let existing = null;
      try {
        const got = await cosmos({ verb: 'GET', resId: `${SCHEDULES}/docs/${id}`, path: `/${SCHEDULES}/docs/${id}`, partitionKey: g.office });
        if (got.status === 200) existing = strip(got.body);
      } catch (e) {}
      const prior = (existing && Array.isArray(existing.shifts)) ? existing.shifts : [];
      /* merge skips a row that already exists for the same person, day and times, so
         re-running an import after fixing unresolved rows doesn't duplicate work */
      const sig = s => `${s.empId}|${s.date}|${s.start}|${s.end}`;
      const seen = new Set(prior.map(sig));
      const add = replace ? g.shifts : g.shifts.filter(s => !seen.has(sig(s)));
      const shifts = replace ? g.shifts : prior.concat(add);
      const doc = {
        ...(existing || { id, office: g.office, weekKey: g.weekKey }),
        id, office: g.office, weekKey: g.weekKey, shifts,
        published: false, publishedBy: null, publishedAt: null,
        updatedBy: identity.email, updatedAt: new Date().toISOString(),
        importedFrom: 'deputy', importedAt: new Date().toISOString(),
      };
      const up = await cosmos({ verb: 'POST', resId: SCHEDULES, path: `/${SCHEDULES}/docs`, body: doc, partitionKey: g.office, upsert: true });
      if (up.status !== 200 && up.status !== 201) return send(500, { error: 'write failed for ' + id, status: up.status, detail: up.body });
      written += add.length;
      weeks.push(id);
    }

    /* receipt — the audit trail for this run (its own container, kept permanently) */
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
          id: logId, source: 'deputy', fileName: String(input.fileName || '').slice(0, 200),
          mode: replace ? 'replace' : 'merge', ranBy: identity.email, ranAt: new Date().toISOString(),
          rowsSubmitted: input.shifts.length, shiftsWritten: written, rejected,
          weeks, offices: [...new Set(keys.map(k => groups[k].office))], unresolved,
        },
      });
    } catch (e) { /* the import itself succeeded; a missing receipt must not fail it */ }

    return send(200, { ok: true, written, rejected, weeks, logId });
  } catch (err) {
    context.res = { status: 500, headers, body: JSON.stringify({ error: err.message || 'error' }) };
  }
};
