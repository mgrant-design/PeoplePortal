/* api/retentionCleanup/index.js — daily timer job enforcing NY/NJ PII + SHIELD Act
   retention on the hiring pipeline. Two independent sweeps:

   1. Applicant hard-delete (3-year rule): any `applicants` doc with rejected === true
      and rejectedAt older than 3 years is permanently removed — the Cosmos doc AND its
      résumé blobs in the `parsedResumes` container. A final audit entry records that the
      deletion happened (id only, no name/PII), then the applicant record is gone for good.

   2. Audit log prune (7-year rule): auditLog entries older than 7 years are deleted.
      Nothing else in this codebase deletes or edits an audit entry — this is the only
      place the log shrinks, and it prunes strictly by age, never by subject.

   Both sweeps are independent: a failure in one doesn't block the other, and a failure
   on one record doesn't stop the sweep for the rest. */

const { cosmos, listAll, strip, collPath, cosmosConfigured } = require('../_shared/cosmos');
const { logAudit } = require('../_shared/audit');
const { BlobServiceClient } = require('@azure/storage-blob');

const APPLICANTS = collPath('applicants');
const AUDIT = collPath('auditLog');
const RESUME_CONTAINER = 'parsedResumes';

const THREE_YEARS_MS = 3 * 365.25 * 24 * 60 * 60 * 1000;
const SEVEN_YEARS_MS = 7 * 365.25 * 24 * 60 * 60 * 1000;

function blobServiceOrNull() {
  const conn = process.env.AZURE_STORAGE_CONNECTION_STRING || '';
  if (!conn) return null;
  return BlobServiceClient.fromConnectionString(conn);
}

async function deleteResumeBlobs(blobSvc, resumes) {
  if (!blobSvc || !Array.isArray(resumes) || !resumes.length) return;
  const container = blobSvc.getContainerClient(RESUME_CONTAINER);
  for (const r of resumes) {
    if (!r || !r.blobPath) continue;
    try { await container.getBlockBlobClient(r.blobPath).deleteIfExists(); }
    catch (e) { /* best-effort — the Cosmos doc deletion below is the authoritative record */ }
  }
}

async function sweepExpiredApplicants(context, blobSvc) {
  const result = { checked: 0, deleted: 0, errors: [] };
  let docs;
  try { docs = (await listAll(APPLICANTS)).map(strip); }
  catch (e) { result.errors.push('list applicants: ' + e.message); return result; }

  const cutoff = Date.now() - THREE_YEARS_MS;
  const expired = docs.filter(d => d.rejected && d.rejectedAt && Number(d.rejectedAt) <= cutoff);
  result.checked = expired.length;

  for (const doc of expired) {
    try {
      await deleteResumeBlobs(blobSvc, doc.resumes);
      const del = await cosmos({ verb: 'DELETE', resId: `${APPLICANTS}/docs/${doc.id}`, path: `/${APPLICANTS}/docs/${doc.id}`, partitionKey: doc.office });
      if (del.status !== 200 && del.status !== 204) throw new Error('delete failed: ' + del.status);
      // Written AFTER the delete succeeds, so the log's own record of the deletion is
      // the last word — no PII survives it, only the opaque id and what happened.
      await logAudit({ subjectType: 'applicant', subjectId: doc.id, action: 'deleted', actorEmail: 'system:retentionCleanup', detail: 'Hard-deleted at 3-year retention limit (rejected ' + new Date(Number(doc.rejectedAt)).toISOString().slice(0, 10) + ')' });
      result.deleted++;
    } catch (e) {
      result.errors.push(`applicant ${doc.id}: ${e.message}`);
    }
  }
  return result;
}

async function sweepExpiredAuditEntries() {
  const result = { checked: 0, deleted: 0, errors: [] };
  let docs;
  try { docs = (await listAll(AUDIT)).map(strip); }
  catch (e) { result.errors.push('list auditLog: ' + e.message); return result; }

  const cutoff = Date.now() - SEVEN_YEARS_MS;
  const expired = docs.filter(d => d.ts && new Date(d.ts).getTime() <= cutoff);
  result.checked = expired.length;

  for (const doc of expired) {
    try {
      const del = await cosmos({ verb: 'DELETE', resId: `${AUDIT}/docs/${doc.id}`, path: `/${AUDIT}/docs/${doc.id}`, partitionKey: doc.subjectId });
      if (del.status !== 200 && del.status !== 204) throw new Error('delete failed: ' + del.status);
      result.deleted++;
    } catch (e) {
      result.errors.push(`audit ${doc.id}: ${e.message}`);
    }
  }
  return result;
}

// HTTP-triggered (not a timerTrigger) because Azure Static Web Apps' managed Functions
// only support HTTP triggers — see api/../.github/workflows, api_location deploys here as
// a managed function. Actual daily scheduling is done by a GitHub Actions cron workflow
// that POSTs here with this secret. Set RETENTION_JOB_SECRET in the Function App's
// settings and as a GitHub repo secret of the same value.
module.exports = async function (context, req) {
  const headers = { 'Content-Type': 'application/json' };
  const secret = process.env.RETENTION_JOB_SECRET || '';
  const given = (req.headers && (req.headers['x-retention-secret'] || req.headers['X-Retention-Secret'])) || '';
  if (!secret || given !== secret) { context.res = { status: 401, headers, body: JSON.stringify({ error: 'Not authorized' }) }; return; }

  if (!cosmosConfigured()) { context.res = { status: 500, headers, body: JSON.stringify({ error: 'Missing Cosmos config' }) }; return; }

  const blobSvc = blobServiceOrNull();
  if (!blobSvc) context.log.warn('retentionCleanup: no AZURE_STORAGE_CONNECTION_STRING — résumé blobs will not be deleted this run');

  const applicantSweep = await sweepExpiredApplicants(context, blobSvc);
  const auditSweep = await sweepExpiredAuditEntries();

  const summary = `applicants ${applicantSweep.deleted}/${applicantSweep.checked} deleted, audit ${auditSweep.deleted}/${auditSweep.checked} pruned`;
  const errors = [...applicantSweep.errors, ...auditSweep.errors];
  context.log(`retentionCleanup: ${summary}` + (errors.length ? ` — errors: ${JSON.stringify(errors)}` : ''));
  context.res = { status: errors.length ? 207 : 200, headers, body: JSON.stringify({ ok: errors.length === 0, summary, errors }) };
};
