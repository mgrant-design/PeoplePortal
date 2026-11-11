/* api/notify/index.js — direct notices from one person to another, pushed live.
   GET  → the caller's own notices, newest first.
   POST { action: 'read' | 'delete' | 'restore', id } → change one of the caller's notices.
   POST { toEmail, title, body, urgent, category, deepLink } → send. Anyone with company-wide
   view can send to anyone; everyone else sends within their own office. */

const { handler, resolveCaller, HttpError } = require('../_shared/caller');
const { cosmos, listAll, strip } = require('../_shared/cosmos');
const { writeNotice, NOTICES } = require('../_shared/notices');

const officeOf = (e) => e.loc || e.location || 'Unassigned';
const nameOf = (e) => e.name || `${e.first || ''} ${e.last || ''}`.trim();

async function myNotice(email, id) {
  if (!id) throw new HttpError(400, 'id is required');
  const r = await cosmos({ verb: 'GET', resId: `${NOTICES}/docs/${id}`, path: `/${NOTICES}/docs/${id}`, partitionKey: email });
  if (r.status !== 200) throw new HttpError(404, 'notice not found');
  const doc = strip(r.body);
  if (doc.toEmail !== email) throw new HttpError(403, 'not your notice');
  return doc;
}

async function saveNotice(doc, partitionKey) {
  const r = await cosmos({ verb: 'POST', resId: NOTICES, path: `/${NOTICES}/docs`, body: doc, partitionKey, upsert: true });
  if (r.status !== 200 && r.status !== 201) throw new Error('notice write failed: ' + r.status);
}

module.exports = handler(['GET', 'POST'], async ({ context, req, body }) => {
  const c = await resolveCaller(req);
  const email = c.identity.email;

  if (req.method === 'GET') {
    const notices = (await listAll(NOTICES, { partitionKey: email })).map(strip)
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    return { status: 200, body: { notices } };
  }

  const input = body || {};
  if (input.action === 'read') {
    const next = { ...(await myNotice(email, input.id)), read: true };
    await saveNotice(next, email);
    return { status: 200, body: { ok: true, notice: next } };
  }
  if (input.action === 'delete') {
    // soft delete: hidden from the inbox, kept in the database
    const next = { ...(await myNotice(email, input.id)), dismissed: true, dismissedAt: new Date().toISOString() };
    await saveNotice(next, email);
    return { status: 200, body: { ok: true } };
  }
  if (input.action === 'restore') {
    const next = { ...(await myNotice(email, input.id)), dismissed: false };
    delete next.dismissedAt;
    await saveNotice(next, email);
    return { status: 200, body: { ok: true, notice: next } };
  }

  const toEmail = String(input.toEmail || '').toLowerCase();
  if (!toEmail || !(input.title || input.body)) throw new HttpError(400, 'toEmail and a title or body are required');
  const recip = c.employees.find(e => (e.workEmail || '').toLowerCase() === toEmail);
  if (!recip) throw new HttpError(404, 'Recipient not found');
  if (!c.access.caps.viewAll && officeOf(c.me) !== officeOf(recip)) throw new HttpError(403, 'You can only send to people in your office');

  const notice = await writeNotice(context, {
    to: toEmail, from: { email, name: nameOf(c.me) }, recipient: recip,
    title: input.title, body: input.body, deepLink: input.deepLink,
    category: input.category || 'message', urgent: input.urgent,
  });
  return { status: 200, body: { ok: true, notice } };
});
