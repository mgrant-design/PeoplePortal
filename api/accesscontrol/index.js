/* api/accesscontrol/index.js — per-person permission grants ("accessControl" container,
   one doc per person keyed by lowercased email).
   GET  → every grant (admins, HR and leadership).
   POST { email, admin?, canPrint?, canSuspend?, canTerminate?, canDelete?, manager?, supervisor?, seeAll?,
          seeAllPages?, schedLocations?, schedTeams? }
        → saves one person's grant (admins only).
   POST { email, remove: true } → deletes that person's grant (admins only). */

const { handler, resolveCaller, HttpError } = require('../_shared/caller');
const { cosmos, listAll, strip, collPath, loadSupportForWrite } = require('../_shared/cosmos');

const COLL = collPath('accessControl');
const APP = collPath('appState');

/* earlier saves copied grants into roster-support.users; once a person's grant is saved or
   removed here, their old copy goes, so a removed grant cannot come back from it */
async function clearOldCopy(id) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const raw = await loadSupportForWrite();
    if (!raw || !Array.isArray(raw.users) || !raw.users.some(u => String((u && u.email) || '').toLowerCase() === id)) return;
    const next = { ...strip(raw), users: raw.users.filter(u => String((u && u.email) || '').toLowerCase() !== id) };
    const r = await cosmos({ verb: 'POST', resId: APP, path: `/${APP}/docs`, body: next, partitionKey: next.type || 'roster-support', upsert: true, ifMatch: raw._etag });
    if (r.status === 200 || r.status === 201) return;
    if (r.status !== 412) throw new Error('clearing the old grant copy failed: ' + r.status);
  }
  throw new Error('clearing the old grant copy kept meeting newer saves');
}
const FIELDS = ['admin', 'canPrint', 'canSuspend', 'canTerminate', 'canDelete', 'manager', 'supervisor', 'seeAll'];
/* page ids "See Everyone" is limited to (empty means every page), and the offices and
   teams a person schedules (['*'] means all; unset means their own office) */
const LIST_FIELDS = ['seeAllPages', 'schedLocations', 'schedTeams'];
const STRICT_LISTS = ['schedLocations', 'schedTeams'];

module.exports = handler(['GET', 'POST'], async ({ req, body }) => {
  const c = await resolveCaller(req);

  if (req.method === 'GET') {
    if (!c.access.caps.viewAll) throw new HttpError(403, 'Not allowed to view permissions');
    return { status: 200, body: { overrides: (await listAll(COLL)).map(strip) } };
  }

  if (!c.access.flags.isAdmin) throw new HttpError(403, 'Only an administrator can edit permissions');
  const input = body || {};
  if (!input.email) throw new HttpError(400, 'email is required');
  const id = String(input.email).toLowerCase();

  if (input.remove) {
    const del = await cosmos({ verb: 'DELETE', resId: `${COLL}/docs/${id}`, path: `/${COLL}/docs/${id}`, partitionKey: id });
    if (del.status !== 204 && del.status !== 404) throw new Error('grant delete failed: ' + del.status);
    await clearOldCopy(id);
    return { status: 200, body: { ok: true, removed: id } };
  }

  STRICT_LISTS.forEach(f => { if (input[f] !== undefined && !Array.isArray(input[f])) throw new HttpError(400, f + ' must be a list'); });
  const doc = { id, email: id, updatedBy: c.identity.email, updatedAt: new Date().toISOString() };
  FIELDS.forEach(f => { if (input[f] !== undefined) doc[f] = !!input[f]; });
  LIST_FIELDS.forEach(f => {
    if (input[f] === undefined) return;
    const list = Array.isArray(input[f]) ? input[f] : [];
    doc[f] = (STRICT_LISTS.includes(f) ? list.filter(v => typeof v === 'string' && v) : list).map(v => String(v).slice(0, 60)).slice(0, 40);
  });
  const up = await cosmos({ verb: 'POST', resId: COLL, path: `/${COLL}/docs`, body: doc, partitionKey: id, upsert: true });
  if (up.status !== 200 && up.status !== 201) throw new Error('grant write failed: ' + up.status);
  await clearOldCopy(id);
  return { status: 200, body: { ok: true, override: strip(up.body) } };
});
