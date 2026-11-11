/* api/_shared/notices.js — the one writer of portal notices: saves to the notices
   container (partitioned by recipient) and pushes it live to that one person. */

const { cosmos, collPath } = require('./cosmos');

const NOTICES = collPath('notices');
const CATS = ['action', 'message', 'mention', 'social'];
const LINK_IDS = ['applicantId', 'feedbackId', 'approvalId'];

/* to: recipient email; from: { email, name }; recipient: their roster record, if known;
   toName: the name to show when there is no roster record.
   Throws when the database write fails. */
async function writeNotice(context, { to, from = {}, recipient, toName, title, body, deepLink, category = 'action', urgent = false, id }) {
  const toEmail = String(to || '').toLowerCase();
  const notice = {
    id: id || 'nt-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
    kind: 'notice',
    category: CATS.includes(category) ? category : 'message',
    fromEmail: String(from.email || '').toLowerCase(), fromName: from.name || from.email || '',
    toEmail,
    toName: toName || (recipient ? (recipient.name || `${recipient.first || ''} ${recipient.last || ''}`.trim()) : toEmail),
    office: recipient ? (recipient.loc || recipient.location || 'Unassigned') : '',
    title: String(title || '').slice(0, 200),
    body: String(body || '').slice(0, 2000),
    urgent: !!urgent, read: false,
    createdAt: new Date().toISOString(),
  };
  if (deepLink && typeof deepLink === 'object' && deepLink.view) {
    notice.deepLink = { view: String(deepLink.view).slice(0, 40) };
    LINK_IDS.forEach(k => { if (deepLink[k]) notice.deepLink[k] = String(deepLink[k]).slice(0, 80); });
  }
  const r = await cosmos({ verb: 'POST', resId: NOTICES, path: `/${NOTICES}/docs`, body: notice, partitionKey: toEmail, upsert: true });
  if (r.status !== 200 && r.status !== 201) throw new Error('notice write failed: ' + r.status);
  context.bindings.signalRMessages = [...(context.bindings.signalRMessages || []), { userId: toEmail, target: 'notify', arguments: [notice] }];
  return notice;
}

module.exports = { writeNotice, NOTICES };
