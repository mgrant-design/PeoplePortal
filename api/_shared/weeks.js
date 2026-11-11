/* api/_shared/weeks.js — what the schedule and approvals endpoints share about a week:
   cleaning a shift, and reading and writing a week document with its version. */

const db = require('./cosmos');

const SCHEDULES = db.collPath('schedules');

/* sanitize one client-supplied shift into the canonical record */
function cleanShift(s) {
  if (!s || typeof s !== 'object') return null;
  const t = v => String(v || '').slice(0, 60);
  const time = v => /^\d{1,2}:\d{2}$/.test(String(v || '')) ? String(v) : null;
  const date = v => /^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : null;
  const out = { id: t(s.id), empId: t(s.empId), date: date(s.date), start: time(s.start), end: time(s.end) };
  if (!out.id || !out.date || !out.start || !out.end || (!out.empId && !s.open)) return null;
  /* unpaid break, subtracted from the shift's hours; absent/0 = no deduction */
  const br = Number(s.breakMins);
  if (isFinite(br) && br > 0) out.breakMins = Math.min(480, Math.round(br));
  /* free-text note on the shift; visible to the employee once the week is published */
  const note = String(s.note || '').trim().slice(0, 280);
  if (note) out.note = note;
  if (s.open) out.open = true; /* open = flagged up-for-grabs; it keeps its row's empId as the anchor */
  if (s.pub) out.pub = true; /* stamped at publish; cleared by edits so the Publish button can count unpublished changes */
  if (s.offered) { out.offered = true; out.offeredBy = t(s.offeredBy); }
  return out;
}

/* the week document with its _etag; null only when there is no such week. Any other answer
   (throttled, server error) throws, so a failed read is never taken for an empty week. */
async function getWeekRaw(office, weekKey) {
  const id = `${weekKey}__${office}`;
  const r = await db.cosmos({ verb: 'GET', resId: `${SCHEDULES}/docs/${id}`, path: `/${SCHEDULES}/docs/${id}`, partitionKey: office });
  if (r.status === 404) return null;
  if (r.status !== 200) throw new Error('schedule read failed (' + r.status + ')');
  return r.body;
}

/* writes a week and returns it, or null when someone else got there first:
   with an etag it refuses to overwrite a newer version; with etag null (the week did not
   exist when it was read) it only creates, so it cannot overwrite a week made since. */
async function putWeek(doc, etag, by) {
  doc.updatedBy = by; doc.updatedAt = new Date().toISOString();
  const r = await db.cosmos({ verb: 'POST', resId: SCHEDULES, path: `/${SCHEDULES}/docs`, body: doc, partitionKey: doc.office, upsert: etag !== null, ifMatch: etag || undefined });
  if (r.status === 412 || (etag === null && r.status === 409)) return null;
  if (r.status !== 200 && r.status !== 201) throw new Error('schedule write failed (' + r.status + ')');
  return db.strip(r.body);
}

module.exports = { cleanShift, getWeekRaw, putWeek, SCHEDULES };
