/* api/reghours/index.js — per-person regular working hours + overtime threshold.
   GET  /api/reghours  → profiles the caller may see (own always; all for viewAll/team)
   POST /api/reghours  → { action: 'save' | 'delete', profile | id }

   Its own endpoint, not folded into api/schedule, because this data has its own
   lifecycle: it is edited outside the weekly grid and is deliberately separate from
   BOTH the roster (permanent) and the week docs (change weekly). Same security shape
   as api/schedule: valid Google token, domain lock, roles derived
   server-side from the live roster. No wage data (SCHEDULER.md D2).

   Doc (container `regularHours`, partition /id), one per employee:
     { id:'jdoe@puredental.com', empId, office, role, periodType:'weekly',
       overtimeThreshold:40,
       days:{ mon:{start:'07:00',end:'17:00',breakMins:30,office?}, tue:null, ... },
       updatedBy, updatedAt } */

const { handler, resolveCaller, HttpError } = require('../_shared/caller');
const { cosmos, listAll, strip, collPath } = require('../_shared/cosmos');

const REGHOURS = collPath('regularHours');
const DOW = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

/* sanitize a client-supplied profile into the canonical record */
function cleanProfile(p) {
  if (!p || typeof p !== 'object') return null;
  const t = (v, n) => String(v == null ? '' : v).slice(0, n || 60);
  const time = v => /^\d{1,2}:\d{2}$/.test(String(v || '')) ? String(v) : null;
  const id = t(p.id, 120).toLowerCase();
  if (!id) return null;
  const days = {};
  DOW.forEach(d => {
    const src = p.days && p.days[d];
    if (!src) { days[d] = null; return; }
    const start = time(src.start), end = time(src.end);
    if (!start || !end) { days[d] = null; return; }
    let br = Number(src.breakMins);
    if (!isFinite(br) || br < 0) br = 0;
    const where = t(src.office);   // a day can be worked at another office than the person's own
    days[d] = { start, end, breakMins: Math.min(480, Math.round(br)), ...(where ? { office: where } : {}) };
  });
  let ot = Number(p.overtimeThreshold);
  if (!isFinite(ot) || ot <= 0) ot = 40;
  return {
    id, empId: t(p.empId), office: t(p.office), role: t(p.role),
    periodType: 'weekly', overtimeThreshold: Math.min(168, ot), days,
  };
}

module.exports = handler(['GET', 'POST'], async ({ req, body }) => {
  const c = await resolveCaller(req);
  const { flags, caps } = c.access;
  const email = c.identity.email;
  const myOffice = c.me.loc || c.me.location || 'Unassigned';
  const canEdit = flags.isAdmin || flags.isManager || flags.isHR;
  const officeOf = (e) => e.loc || e.location || '';
  const personFor = (id) => c.employees.find(e => (e.workEmail || '').toLowerCase() === id);

  if (req.method === 'GET') {
    let docs = [];
    try { docs = (await listAll(REGHOURS)).map(strip); } catch (e) { docs = []; }
    if (!caps.viewAll && !flags.isManager && !flags.isSupervisor) docs = docs.filter(d => d.id === email);
    else if (!caps.viewAll) docs = docs.filter(d => d.office === myOffice || d.id === email);
    return { status: 200, body: { profiles: docs, canEdit } };
  }

  const input = body || {};
  if (!input.action) throw new HttpError(400, 'action is required');
  if (!canEdit) throw new HttpError(403, 'Managers, HR and admins set regular hours');

  if (input.action === 'save') {
    const doc = cleanProfile(input.profile);
    if (!doc) throw new HttpError(400, 'a valid profile is required');
    // who the profile is for is the roster record that owns this email; the office and role
    // come from the roster only when the form sent none
    const person = personFor(doc.id);
    if (!person) throw new HttpError(404, 'That person is not on the roster');
    doc.empId = person.id; doc.office = doc.office || officeOf(person); doc.role = doc.role || person.department || person.jobTitle || '';
    // outside company-wide view, both the person and the profile belong to the manager's office
    if (!caps.viewAll && (officeOf(person) !== myOffice || doc.office !== myOffice)) throw new HttpError(403, 'You can only set regular hours for ' + myOffice);
    doc.updatedBy = email;
    doc.updatedAt = new Date().toISOString();
    const up = await cosmos({ verb: 'POST', resId: REGHOURS, path: `/${REGHOURS}/docs`, body: doc, partitionKey: doc.id, upsert: true });
    if (up.status !== 200 && up.status !== 201) throw new Error('regular hours write failed: ' + up.status);
    return { status: 200, body: { ok: true, profile: strip(up.body) } };
  }

  if (input.action === 'delete') {
    const id = String(input.id || '').toLowerCase();
    if (!id) throw new HttpError(400, 'id is required');
    if (!caps.viewAll) {
      // the person's office from the roster; for someone no longer on it, the office saved on the profile
      const person = personFor(id);
      let office = person ? officeOf(person) : null;
      if (office === null) {
        const got = await cosmos({ verb: 'GET', resId: `${REGHOURS}/docs/${id}`, path: `/${REGHOURS}/docs/${id}`, partitionKey: id });
        if (got.status === 404) return { status: 200, body: { ok: true } };
        if (got.status !== 200) throw new Error('regular hours read failed: ' + got.status);
        office = got.body.office || '';
      }
      if (office !== myOffice) throw new HttpError(403, 'You can only remove regular hours for ' + myOffice);
    }
    const del = await cosmos({ verb: 'DELETE', resId: `${REGHOURS}/docs/${id}`, path: `/${REGHOURS}/docs/${id}`, partitionKey: id });
    if (del.status !== 204 && del.status !== 404) throw new Error('regular hours delete failed: ' + del.status);
    return { status: 200, body: { ok: true } };
  }

  throw new HttpError(400, 'unknown action');
});
