/* api/offersign/index.js — candidate-facing offer accept/decline, reached by an emailed
   link, NOT a Google sign-in. No roster account, no app login — a candidate authenticates
   purely by holding the long random token mailed to them when Amanda Vibert approves and
   sends the offer (see api/applicants: isApproveAction).

   GET  /api/offersign?id=<applicantId>&token=<token>  → { offer summary }, token-gated
   POST /api/offersign  { id, token, decision: 'signed'|'declined', signature?,
                           declineReason?, declineNote? }
        → records the candidate's own decision, exactly like the manual "Record signature
          received" / "Candidate declined" path Amanda already has, then fires the same
          onboarding-team notification.

   Token is single-use: cleared from the record once a decision is recorded, and this
   endpoint always re-checks the LIVE record (never trust a decision made against a stale
   token). A request against an offer that is no longer 'sent' (already signed/declined,
   or reverted to draft) is rejected — the link can't be replayed. */

const { cosmos, listAll, strip, collPath, cosmosConfigured } = require('../_shared/cosmos');
const { logAudit } = require('../_shared/audit');

const OFFER_DECLINE_REASONS = [
  'Wage/Salary', 'Schedule', 'Benefits package (including PTO, Med/Dental, 401K)',
  'Poor cultural fit', 'Limited growth potential', 'Accepted another offer',
  'Stayed at current job', 'Personal or family reasons', 'Other',
];

/* Same Chat ping used by api/applicants, kept local to avoid a circular require. */
const https = require('https');
function httpPost(urlStr, { body = '' } = {}) {
  return new Promise((resolve, reject) => {
    let url; try { url = new URL(urlStr); } catch (e) { return reject(new Error('bad url')); }
    const payload = JSON.stringify(body);
    const rq = https.request({ hostname: url.hostname, path: url.pathname + url.search, method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } }, (res) => { let data = ''; res.on('data', c => data += c); res.on('end', () => resolve({ status: res.statusCode, body: data })); });
    rq.on('error', reject);
    rq.write(payload);
    rq.end();
  });
}
async function notifyOfferEvent(rec, kind) {
  const webhook = process.env.APPLICANTS_GCHAT_WEBHOOK || 'https://chat.googleapis.com/v1/spaces/AAQAkOiCoJI/messages?key=AIzaSyDdI0hCZtE6vySjMm-WEfRq3CPzqKqqsHI&token=fcyGX8KZCW7epE63Gqn8Y1fqFg0mJ0IL8Xy_GPzPC2E';
  const text = kind === 'declined'
    ? `❌ *Offer declined (by candidate)* — ${rec.name || 'Applicant'} (${rec.role || 'role TBD'}, ${rec.office || 'office TBD'}) declined via the emailed offer link${rec.offer && rec.offer.declineReason ? `: ${rec.offer.declineReason}` : ''}.`
    : `✅ *Offer signed (by candidate)* — ${rec.name || 'Applicant'} (${rec.role || 'role TBD'}, ${rec.office || 'office TBD'}) accepted &amp; e-signed via the emailed offer link. Ready for onboarding (orientation, Paychex, schedule).`;
  try { await httpPost(webhook, { body: { text } }); } catch (e) { /* best-effort */ }
}

module.exports = async function (context, req) {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
  if (req.method === 'OPTIONS') { context.res = { status: 204, headers }; return; }
  if (!cosmosConfigured()) { context.res = { status: 500, headers, body: JSON.stringify({ error: 'Missing Cosmos config' }) }; return; }

  const coll = collPath('applicants');
  const id = (req.method === 'GET' ? req.query.id : (req.body || {}).id) || '';
  const token = (req.method === 'GET' ? req.query.token : (req.body || {}).token) || '';
  if (!id || !token) { context.res = { status: 400, headers, body: JSON.stringify({ error: 'Missing id or token' }) }; return; }

  let docs;
  try { docs = (await listAll(coll)).map(strip); }
  catch (e) { context.res = { status: 500, headers, body: JSON.stringify({ error: 'read failed', detail: e.message }) }; return; }
  const rec = docs.find(d => d.id === id);
  const o = rec && rec.offer;
  const valid = rec && o && o.status === 'sent' && o.signToken && o.signToken === token
    && (!o.signTokenExpires || Date.now() < o.signTokenExpires);
  if (!valid) { context.res = { status: 404, headers, body: JSON.stringify({ error: 'This offer link is invalid, expired, or already used.' }) }; return; }

  if (req.method === 'GET') {
    context.res = { status: 200, headers, body: JSON.stringify({
      offer: {
        name: rec.name, role: o.role, startDate: o.startDate, pay: o.pay, payType: o.payType,
        jobDescription: o.jobDescription, extra: o.extra, office: rec.office,
      },
      declineReasons: OFFER_DECLINE_REASONS,
    }) };
    return;
  }

  // POST — record the candidate's decision
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  const decision = body.decision;
  if (decision !== 'signed' && decision !== 'declined') {
    context.res = { status: 400, headers, body: JSON.stringify({ error: 'decision must be signed or declined' }) }; return;
  }

  let nextOffer;
  if (decision === 'signed') {
    const signature = String(body.signature || '').trim();
    if (!signature) { context.res = { status: 400, headers, body: JSON.stringify({ error: 'Signature (typed full legal name) is required' }) }; return; }
    nextOffer = { ...o, status: 'signed', signature, signedAt: Date.now(), signedVia: 'candidate-email-link', signToken: null, signTokenExpires: null };
  } else {
    const declineReason = body.declineReason;
    if (!OFFER_DECLINE_REASONS.includes(declineReason)) { context.res = { status: 400, headers, body: JSON.stringify({ error: 'A valid decline reason is required' }) }; return; }
    if (declineReason === 'Other' && !String(body.declineNote || '').trim()) { context.res = { status: 400, headers, body: JSON.stringify({ error: 'Please specify a reason' }) }; return; }
    nextOffer = { ...o, status: 'declined', declineReason, declineNote: String(body.declineNote || '').trim().slice(0, 600), declinedAt: Date.now(), declinedBy: 'Candidate (self-service link)', signToken: null, signTokenExpires: null };
  }

  const nextRec = { ...rec, offer: nextOffer, stage: decision === 'signed' ? 'hired' : rec.stage, hiredAt: decision === 'signed' ? Date.now() : rec.hiredAt, updatedBy: 'candidate-self-service', updatedAt: new Date().toISOString() };
  const up = await cosmos({ verb: 'POST', resId: coll, path: `/${coll}/docs`, body: nextRec, partitionKey: nextRec.office, upsert: true });
  if (up.status !== 200 && up.status !== 201) { context.res = { status: 500, headers, body: JSON.stringify({ error: 'save failed', status: up.status }) }; return; }

  await notifyOfferEvent(nextRec, decision);
  await logAudit({ subjectType: 'applicant', subjectId: rec.id, action: decision === 'signed' ? 'offerSignedByCandidate' : 'offerDeclinedByCandidate', actorEmail: 'candidate', detail: decision === 'signed' ? 'Candidate accepted & e-signed via emailed link' : 'Candidate declined via emailed link: ' + nextOffer.declineReason });

  context.res = { status: 200, headers, body: JSON.stringify({ ok: true, decision }) };
};
