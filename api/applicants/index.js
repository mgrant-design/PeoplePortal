/* api/applicants/index.js — read & write the hiring pipeline (Cosmos `applicants` container).
   GET  /api/applicants  → { applicants: [...] } — scoped to what the caller may see.
   POST /api/applicants  → upsert ONE applicant record (body = the record). Returns { ok, applicant }.

   The record IS the applicant (parsed name/contact/address, résumé text, stage, feedback,
   notes, offer, working-interview, and a `resumes` list of pointers to PDFs held in Blob
   Storage — see api/resumeupload). Container partition key: /office.

   Admins, HR, leadership and managers can open it. Managers see and write only their own office. */

const https = require('https');
const crypto = require('crypto');
const { handler, resolveCaller, accessFor } = require('../_shared/caller');
const { dayLabel } = require('../_shared/approvals-text');
const { normLoc, isActive } = require('../_shared/access-rules');
const { cosmos, listAll, strip, collPath } = require('../_shared/cosmos');
const { logAudit } = require('../_shared/audit');
const { sendEmail } = require('../_shared/email');
const { writeNotice } = require('../_shared/notices');
const { sendSms } = require('../_shared/sms');
const { hireSigned } = require('../_shared/hire');

/* The offer approver is the approvers.offer setting (Organization page, Approvers tab),
   checked here on the server. */
const nameOf = (e) => e.name || `${e.first || ''} ${e.last || ''}`.trim();
function offerApprover(c) {
  const email = String((((c.support || {}).approvers) || {}).offer || '').toLowerCase();
  const emp = email ? c.employees.find(e => (e.workEmail || '').toLowerCase() === email) : null;
  return { email, emp, name: emp ? nameOf(emp) : 'the offer approver' };
}

/* generic HTTPS POST, used for the Google Chat webhook (same pattern as api/schedule) */
function httpPost(urlStr, { headers = {}, body = '' } = {}) {
  return new Promise((resolve, reject) => {
    let url;
    try { url = new URL(urlStr); } catch (e) { return reject(new Error('bad url')); }
    const payload = typeof body === 'string' ? body : JSON.stringify(body);
    const opts = { hostname: url.hostname, path: url.pathname + url.search, method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload), ...headers } };
    const rq = https.request(opts, (res) => { let data = ''; res.on('data', c => data += c); res.on('end', () => resolve({ status: res.statusCode, body: data })); });
    rq.on('error', reject);
    rq.write(payload);
    rq.end();
  });
}

/* One Chat ping to the onboarding team, to the address in the APPLICANTS_GCHAT_WEBHOOK
   setting; with none set, nothing is posted. Never includes pay. */
async function notifyChat(text) {
  const summary = { gchat: false, simulated: false, errors: [] };
  const webhook = process.env.APPLICANTS_GCHAT_WEBHOOK;
  if (!webhook) return { ...summary, skipped: 'no Chat address set' };
  try {
    const r = await httpPost(webhook, { body: { text } });
    summary.gchat = r.status >= 200 && r.status < 300;
    if (!summary.gchat) summary.errors.push('gchat ' + r.status);
  } catch (e) { summary.errors.push('gchat ' + e.message); }
  return summary;
}

/* Offer-step notice: submitted for approval, approved & sent, or declined. */
async function notifyOfferEvent(rec, kind, approverName) {
  const declined = rec && rec.offer && rec.offer.status === 'declined' ? rec.offer : null;
  const text = kind === 'declined'
    ? `\u274c *Offer declined* \u2014 ${rec.name || 'Applicant'} (${rec.role || 'role TBD'}, ${rec.office || 'office TBD'}) declined${declined && declined.declineReason ? `: ${declined.declineReason}` : ''}. ${approverName} can revise and re-send, or archive.`
    : kind === 'submitted'
    ? `\ud83d\udcdd *Offer submitted for approval* \u2014 ${rec.name || 'Applicant'} (${rec.role || 'role TBD'}, ${rec.office || 'office TBD'}) is awaiting ${approverName}'s review.`
    : `\ud83d\udce8 *Offer sent* \u2014 ${rec.name || 'Applicant'} (${rec.role || 'role TBD'}, ${rec.office || 'office TBD'}) approved by ${approverName} and sent to the candidate for signature.`;
  return notifyChat(text);
}

/* Pipeline-phase notice: a new applicant entering the pool, or moving stage (screening,
   interview, working interview, offer, hired) or being archived. Keeps the onboarding
   team posted at every phase, not just the offer steps \u2014 this mirrors the original
   design intent before the Chat ping narrowed to offer events only. Skipped when the
   write is itself an offer-flow transition (notifyOfferEvent already covers those,
   including the stage flip to "hired" that happens at approval) to avoid double-posting. */
const STAGE_LABEL = { applied: 'Applied', screening: 'Screening', interview: 'Interview', working: 'Working interview', offer: 'Offer', hired: 'Hired', rejected: 'Archived' };
async function notifyStageEvent(rec, prevRec) {
  if (!prevRec) {
    return notifyChat(`\ud83c\udf1f *New applicant* \u2014 ${rec.name || 'Applicant'} entered the pipeline for ${rec.role || 'role TBD'} (${rec.office || 'office TBD'}).`);
  }
  if (rec.rejected && !prevRec.rejected) {
    return notifyChat(`\ud83d\udcc1 *Archived* \u2014 ${rec.name || 'Applicant'} (${rec.role || 'role TBD'}, ${rec.office || 'office TBD'}) was archived from ${STAGE_LABEL[rec.rejectedFrom] || rec.rejectedFrom || 'the pipeline'}.`);
  }
  if ((prevRec.stage || null) !== (rec.stage || null)) {
    const from = STAGE_LABEL[prevRec.stage] || prevRec.stage || '\u2014';
    const to = STAGE_LABEL[rec.stage] || rec.stage || '\u2014';
    return notifyChat(`\ud83d\udccc *${rec.name || 'Applicant'}* moved: ${from} \u2192 ${to} (${rec.role || 'role TBD'}, ${rec.office || 'office TBD'}).`);
  }
}

/* Base URL for the candidate-facing offer link. Derived from the request rather than a
   new env var — req.headers.host is the Static Web Apps front door, same for every env. */
function siteOrigin(req) {
  const host = (req.headers && (req.headers['x-forwarded-host'] || req.headers.host)) || '';
  return process.env.PORTAL_URL || (host ? `https://${host}` : '');
}

/* the candidate's one-time page for reviewing and signing or declining the offer */
function offerLink(rec, req) {
  return `${siteOrigin(req)}/offersign.html?id=${encodeURIComponent(rec.id)}&token=${encodeURIComponent(rec.offer.signToken)}`;
}

/* Text the candidate the same link. The text never carries pay. */
function textOfferToCandidate(rec, req) {
  return sendSms({ to: rec.phone, body: `Pure Dental: your offer for the ${rec.offer.role || rec.role || 'position'} role is ready. Review and respond here: ${offerLink(rec, req)}` });
}

/* Email the candidate a one-time link to review and sign/decline the offer themselves —
   no app login, no roster account, just the token. Fires once per approve-and-send;
   best-effort like the Chat webhook, never blocks the save if email isn't configured. */
async function emailOfferToCandidate(rec, req, approver) {
  if (!rec.email) return { sent: false, reason: 'applicant has no email on file' };
  const link = offerLink(rec, req);
  const firstName = (rec.name || '').split(' ')[0] || 'there';
  // The letter itself carries pay (that's its job); this notice email does not, matching
  // the "pay stays in the offer letter, nowhere else" rule.
  const html = `
    <p>Hi ${firstName},</p>
    <p>Congratulations — Pure Dental would like to offer you the <b>${rec.offer.role || rec.role || 'position'}</b> role${rec.office ? ` at our ${rec.office} office` : ''}.</p>
    <p>Please review the full offer and let us know your decision here:</p>
    <p><a href="${link}" style="display:inline-block;padding:10px 18px;background:#3f82b4;color:#fff;border-radius:6px;text-decoration:none;font-weight:600;">Review &amp; respond to your offer</a></p>
    <p>This link is unique to you — please don't forward it. If you have questions, just reply to this email.</p>
    <p>Welcome to the team,<br>${approver.name}<br>Pure Dental</p>`;
  // CC the manager who requested this hire, so they see the offer go out without being
  // on the candidate-facing thread's reply-all by default.
  const cc = rec.requestedByEmail && rec.requestedByEmail !== approver.email ? rec.requestedByEmail : undefined;
  return sendEmail({ to: rec.email, cc, subject: `Your offer from Pure Dental — ${rec.offer.role || rec.role || ''}`, html, fromName: approver.name });
}

/* Pay is for HR and Accounting only (caps.payroll): the offer's pay and the working
   interview's rate. Everyone else receives records without them, and their saves keep
   whatever pay is stored. */
const PAY_FIELDS = [['offer', 'pay'], ['workingInterview', 'rate']];
/* what goes to someone without pay rights: no amount, only whether one is on file */
function withoutPay(rec) {
  const out = { ...rec };
  PAY_FIELDS.forEach(([part, field]) => {
    if (out[part] && typeof out[part] === 'object') { const { [field]: pay, ...rest } = out[part]; out[part] = { ...rest, payOnFile: !!String(pay || '').trim() }; }
  });
  return out;
}
/* the on-file marker is for the screen only and never stored */
function withoutPayMarker(rec) {
  const out = { ...rec };
  PAY_FIELDS.forEach(([part]) => { if (out[part] && typeof out[part] === 'object' && 'payOnFile' in out[part]) { const { payOnFile, ...rest } = out[part]; out[part] = rest; } });
  return out;
}
function withStoredPay(rec, stored) {
  const out = withoutPayMarker(withoutPay(rec));
  PAY_FIELDS.forEach(([part, field]) => {
    const had = stored && stored[part] && typeof stored[part] === 'object' && field in stored[part];
    if (had && out[part] && typeof out[part] === 'object') out[part] = { ...out[part], [field]: stored[part][field] };
  });
  return out;
}

/* The candidate's signing link is made only by approving. Every other save keeps the
   stored link while the offer stays sent, and never takes one from the browser. */
function withStoredLink(rec, stored) {
  if (!rec.offer || typeof rec.offer !== 'object') return rec;
  const { signToken, signTokenExpires, ...offer } = rec.offer;
  const so = stored && stored.offer;
  if (so && so.signToken && so.status === 'sent' && offer.status === 'sent') { offer.signToken = so.signToken; offer.signTokenExpires = so.signTokenExpires; }
  // the candidate's drawn signature is never sent to a browser, so a save keeps the stored one
  if (so && so.signatureImage && offer.status === 'signed') offer.signatureImage = so.signatureImage;
  return { ...rec, offer };
}
const LOCKED = ['sent', 'signed', 'declined'];
/* the drawn signature stays in the database and is left out of what browsers receive */
function withoutSignatureImage(rec) {
  if (!rec.offer || !rec.offer.signatureImage) return rec;
  const { signatureImage, ...offer } = rec.offer;
  return { ...rec, offer };
}

module.exports = handler(['GET', 'POST'], async ({ context, req, body }) => {
  const c = await resolveCaller(req);
  const { identity, me } = c;
  const viewAll = c.access.caps.viewAll;
  const seesPay = c.access.caps.payroll;
  if (!c.access.caps.recruiting) return { status: 403, body: { error: 'Not allowed to view applicants' } };
  const coll = collPath('applicants');
    const myLoc = normLoc(me.location);

    /* ---------- READ ---------- */
    if (req.method === 'GET') {
      let docs;
      try { docs = (await listAll(coll)).map(strip); }
      catch (e) { throw new Error('applicants read failed: ' + e.message); }
      if (!viewAll) docs = docs.filter(d => normLoc(d.office) === myLoc);
      // Never hand the candidate's self-service sign token to anyone browsing the pipeline —
      // it's effectively a bearer credential for accepting/declining that one offer.
      docs = docs.map(d => d.offer && d.offer.signToken ? { ...d, offer: { ...d.offer, signToken: undefined, signTokenExpires: undefined } } : d);
      docs = docs.map(withoutSignatureImage);
      if (!seesPay) docs = docs.map(withoutPay);
      // One audit entry per view request (not per record) — enough to answer "who looked
      // at the pool and when" without a write per row on every page load.
      logAudit({ subjectType: 'applicant', subjectId: 'pool', action: 'viewed', actorEmail: identity.email, detail: `Viewed ${docs.length} applicant record(s)` });
      return { status: 200, body: { applicants: docs } };
    }

    /* ---------- WRITE: upsert one applicant ---------- */
    let doc = body;
    if (!doc || typeof doc !== 'object' || !doc.id) {
      return { status: 400, body: { error: 'Body must be an applicant record with an id' } };
    }
    // team-level callers may only write applicants at their own office
    if (!viewAll && normLoc(doc.office) !== myLoc) {
      return { status: 403, body: { error: 'Applicant is outside your office' } };
    }
    for (const part of ['offer', 'workingInterview']) {
      const v = doc[part];
      if (v != null && (typeof v !== 'object' || Array.isArray(v))) return { status: 400, body: { error: part + ' must be a record' } };
    }

    // One read of the prior record, reused below both to gate offer-status transitions and
    // to diff for the audit log — avoids re-listing the whole container twice per write.
    let prevRec = null;
    // Records are stored per office, so one id can exist at two offices after a move. The
    // copy at this save's office is the stored record; any other copy is removed below.
    let prevUnread = null, copies = [];
    try { copies = (await listAll(coll)).filter(d => d.id === doc.id); } catch (e) { prevUnread = e; }
    // without the stored record there is no stored pay, link or offer to keep, so no save goes through
    if (prevUnread) throw new Error('applicant read failed before a save: ' + prevUnread.message);
    prevRec = copies.find(d => d.office === doc.office) || copies[0] || null;
    if (!viewAll && copies.some(d => normLoc(d.office) !== myLoc)) {
      return { status: 403, body: { error: 'Applicant is outside your office' } };
    }
    if (!seesPay) doc = withStoredPay(doc, prevRec);
    doc = withStoredLink(doc, prevRec);

    // Both offer-flow transitions (submit-for-approval, approve-and-send) are tagged by the
    // client with _offerAction so we know to fire the matching Chat message. Approve is further
    // gated to the approver's identity, checked server-side; submit has no extra gate beyond
    // the normal recruiting-write check above. The tag itself is never persisted.
    const isApproveAction = doc._offerAction === 'approve';
    const isSubmitAction = doc._offerAction === 'submit';
    const isDeclineAction = doc._offerAction === 'declined';
    const approver = offerApprover(c);
    const isTheApprover = !!approver.email && identity.email === approver.email;
    if (isSubmitAction && !isActive(approver.emp)) {
      return { status: 409, body: { error: 'No approver is set for this yet. An admin sets it on the Organization page.' } };
    }
    if (isApproveAction && !isTheApprover) {
      return { status: 403, body: { error: `Only ${approver.name} can approve and send an offer` } };
    }
    if (isApproveAction && !(doc.offer && String(doc.offer.pay || '').trim())) {
      return { status: 400, body: { error: 'Add the pay before the offer goes out' } };
    }
    // Once an offer is sent, signed or declined, only the approver changes it. Anyone else's
    // save of the applicant (feedback, notes, stage) goes through with the stored offer kept.
    const storedOffer = (prevRec && prevRec.offer) || null;
    if (storedOffer && LOCKED.includes(storedOffer.status) && !isTheApprover) doc = { ...doc, offer: storedOffer };
    if (doc.offer && doc.offer.status === 'sent' && (!storedOffer || storedOffer.status !== 'sent') && !isApproveAction) {
      return { status: 400, body: { error: 'An offer is sent by approving it' } };
    }
    // Any transition of offer.status beyond draft/pending is the approver's alone — enforced
    // against the stored record, not the client's tag: if the incoming doc's offer.status
    // differs from what's on file and moves into sent/signed, only the approver may write it.
    if (doc.offer && ['sent', 'signed', 'declined'].includes(doc.offer.status) && !isTheApprover) {
      const prevStatus = prevRec && prevRec.offer ? prevRec.offer.status : null;
      if (prevStatus !== doc.offer.status) {
        return { status: 403, body: { error: `Only ${approver.name} can send, sign or decline an offer` } };
      }
    }
    // working interview hours go to HR and Accounting once, when the day is marked sent
    const wi = doc.workingInterview || null;
    const hoursSentNow = !!wi && wi.status === 'sent' && !(prevRec && prevRec.workingInterview && prevRec.workingInterview.status === 'sent');
    if (hoursSentNow && !(wi.date && Number(wi.hours) > 0)) {
      return { status: 400, body: { error: 'Enter the day and the hours worked first' } };
    }
    const { _offerAction, hirePending: _hp, employeeId: _eid, ...clean } = withoutPayMarker(doc);
    // once the signature made an employee, the applicant stays hired: a save from a browser that hasn't seen the hire can't move it back
    if (prevRec && prevRec.stage === 'hired' && (prevRec.employeeId || prevRec.hirePending)) {
      clean.stage = 'hired';
      for (const k of ['rejected', 'rejectedAt', 'rejectedFrom']) { if (k in prevRec) clean[k] = prevRec[k]; else delete clean[k]; }
    }
    // the hire marker and the employee link are the server's: a browser never sets or clears them
    const signedNow = !!(doc.offer && doc.offer.status === 'signed') && !(storedOffer && storedOffer.status === 'signed');
    const hireMarks = { ...((prevRec && prevRec.employeeId) ? { employeeId: prevRec.employeeId } : {}),
      ...((signedNow || (prevRec && prevRec.hirePending)) ? { hirePending: true } : {}) };
    const rec = { ...clean, ...hireMarks, updatedBy: identity.email, updatedAt: new Date().toISOString() };
    // Approve-and-send mints the candidate's one-time self-service token here, server-side
    // only — never accepted from the client — so the link mailed out always matches what's
    // actually stored. Valid 14 days; offersign.js clears it the moment it's used.
    if (isApproveAction && rec.offer) {
      rec.offer = { ...rec.offer, signToken: crypto.randomBytes(24).toString('hex'), signTokenExpires: Date.now() + 14 * 24 * 60 * 60 * 1000 };
    }
    const up = await cosmos({ verb: 'POST', resId: coll, path: `/${coll}/docs`, body: rec, partitionKey: rec.office, upsert: true });
    if (up.status !== 200 && up.status !== 201) throw new Error('applicant save failed: ' + up.status);
    for (const old of copies.filter(d => d.office !== rec.office)) {
      const dl = await cosmos({ verb: 'DELETE', resId: `${coll}/docs/${old.id}`, path: `/${coll}/docs/${old.id}`, partitionKey: old.office });
      if (dl.status !== 200 && dl.status !== 204 && dl.status !== 404) context.log.warn('old applicant copy not removed', old.id, old.office, dl.status);
    }
    // a Chat post or notice about an offer step goes out only when the offer really took that step
    const wasStatus = storedOffer ? storedOffer.status : null;
    const nowStatus = rec.offer ? rec.offer.status : null;
    const submitted = isSubmitAction && nowStatus === 'pending_approval' && wasStatus !== 'pending_approval';
    const declined = isDeclineAction && nowStatus === 'declined' && wasStatus !== 'declined';
    let notify, emailResult, textResult;
    if (isApproveAction) {
      notify = await notifyOfferEvent(rec, 'approved', approver.name);
      if (!siteOrigin(req)) emailResult = textResult = { sent: false, reason: 'no site address' };   // the link would not open
      else {
        emailResult = await emailOfferToCandidate(rec, req, approver);
        textResult = await textOfferToCandidate(rec, req);
      }
    }
    else if (submitted) {
      notify = await notifyOfferEvent(rec, 'submitted', approver.name);
      // the approver is told in the portal; a notice failure never fails the submission
      if (!isTheApprover) {
        try {
          await writeNotice(context, { to: approver.email, from: { email: identity.email, name: nameOf(me) }, recipient: approver.emp,
            title: 'Offer ready for approval — ' + (rec.name || 'Applicant'),
            body: `${rec.name || 'Applicant'} (${(rec.offer && rec.offer.role) || rec.role || 'role TBD'}, ${rec.office || 'office TBD'}) has an offer ready for your review.`,
            deepLink: { view: 'applicants', applicantId: rec.id } });
        } catch (e) { context.log.warn('offer notice failed', e); }
      }
    }
    else if (declined) notify = await notifyOfferEvent(rec, 'declined', approver.name);
    else notify = await notifyStageEvent(rec, prevRec);

    let hoursNotice;
    if (hoursSentNow) {
      const hours = Number(wi.hours);
      const to = c.employees.filter(e => isActive(e) && e.workEmail && accessFor(e, c).caps.payroll && e.workEmail.toLowerCase() !== identity.email);
      let sent = 0;
      for (const person of to) {
        try {
          await writeNotice(context, { to: person.workEmail, from: { email: identity.email, name: nameOf(me) }, recipient: person,
            title: 'Working interview hours — ' + (rec.name || 'Applicant'),
            body: `${rec.name || 'Applicant'} worked ${hours} hour${hours === 1 ? '' : 's'} on ${dayLabel(wi.date)} at ${rec.office || 'office TBD'}.`,
            deepLink: { view: 'applicants', applicantId: rec.id } });
          sent++;
        } catch (e) { context.log.warn('hours notice failed', e); }
      }
      hoursNotice = { sent };
    }

    // Audit trail: one entry per write, picking the most specific thing that changed.
    // Never includes the applicant's name — subjectId (the record id) is the only
    // reference, so this stays meaningful after the record is hard-deleted at 3 years.
    if (!prevRec) {
      await logAudit({ subjectType: 'applicant', subjectId: rec.id, action: 'created', actorEmail: identity.email, detail: 'Applicant record created' });
    } else if (rec.rejected && !prevRec.rejected) {
      await logAudit({ subjectType: 'applicant', subjectId: rec.id, action: 'rejected', actorEmail: identity.email, detail: 'Rejected from stage: ' + (rec.rejectedFrom || prevRec.stage || 'unknown') });
    } else if ((prevRec.stage || null) !== (rec.stage || null)) {
      await logAudit({ subjectType: 'applicant', subjectId: rec.id, action: 'statusChanged', actorEmail: identity.email, detail: (prevRec.stage || '?') + ' -> ' + (rec.stage || '?') });
    } else {
      await logAudit({ subjectType: 'applicant', subjectId: rec.id, action: 'edited', actorEmail: identity.email, detail: 'Record updated' });
    }

    // Strip the sign token out of what goes back to the browser — same reasoning as the
    // GET path above; the approver's own client doesn't need the bearer value either.
    // a signed offer with no employee yet: create the employee (also the retry after a failure)
    let stored = strip(up.body);
    if (stored.hirePending && !stored.employeeId) stored = await hireSigned(context, stored, identity.email);
    const outApplicant = withoutSignatureImage(seesPay ? stored : withoutPay(stored));
    if (outApplicant.offer && outApplicant.offer.signToken) outApplicant.offer = { ...outApplicant.offer, signToken: undefined, signTokenExpires: undefined };
    return { status: 200, body: { ok: true, applicant: outApplicant, notify, emailResult, textResult, hoursNotice } };
});
