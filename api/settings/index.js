/* api/settings/index.js — each person's own appearance settings (userSettings, one doc per employee id).
   GET → { settings } (null when none saved). POST <settings object> → saves the caller's own. */

const { handler, resolveCaller, HttpError } = require('../_shared/caller');
const { cosmos, strip, collPath } = require('../_shared/cosmos');

const COLL = collPath('userSettings');

module.exports = handler(['GET', 'POST'], async ({ req, body }) => {
  const c = await resolveCaller(req);
  const empId = c.me.id;

  if (req.method === 'GET') {
    const r = await cosmos({ verb: 'GET', resId: `${COLL}/docs/${empId}`, path: `/${COLL}/docs/${empId}`, partitionKey: empId });
    if (r.status === 404) return { status: 200, body: { settings: null } };
    if (r.status !== 200) throw new Error('settings read failed: ' + r.status);
    return { status: 200, body: { settings: strip(r.body).prefs || null } };
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, 'settings object required');
  const doc = { id: empId, empId, prefs: body, updatedAt: new Date().toISOString() };
  const up = await cosmos({ verb: 'POST', resId: COLL, path: `/${COLL}/docs`, body: doc, partitionKey: empId, upsert: true });
  if (up.status !== 200 && up.status !== 201) throw new Error('settings write failed: ' + up.status);
  return { status: 200, body: { ok: true } };
});
