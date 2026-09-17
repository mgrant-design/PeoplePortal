/* api/_shared/audit.js — append-only audit trail for the hiring pipeline.

   Entries reference the subject by id only — never name, email, or other PII — so the
   log stays meaningful (and compliant) after the subject record is hard-deleted per the
   3-year applicant retention rule (see api/retentionCleanup). Nothing in this codebase
   updates or deletes an audit entry once written; retentionCleanup prunes entries only
   by age (7 years), never by subject.

   Container: auditLog, partition key /subjectId (kept separate from `applicants` so its
   retention and access rules are independent). */

const { cosmos, collPath } = require('./cosmos');

const AUDIT = collPath('auditLog');

/* action: 'created' | 'statusChanged' | 'edited' | 'rejected' | 'hired' | 'deleted' | ...
   subjectId   — the applicant/employee id (opaque, never a name)
   actorEmail  — who did it
   detail      — short plain-text note (e.g. "applied -> offer"); must never carry the
                 subject's name or other PII beyond what's already in subjectId/actorEmail */
async function logAudit({ subjectType, subjectId, action, actorEmail, detail }) {
  if (!subjectId || !action) return;
  const entry = {
    id: 'al-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
    subjectType: subjectType || 'applicant',
    subjectId: String(subjectId),
    action,
    actorEmail: (actorEmail || '').toLowerCase(),
    detail: String(detail || '').slice(0, 500),
    ts: new Date().toISOString(),
  };
  try {
    await cosmos({ verb: 'POST', resId: AUDIT, path: `/${AUDIT}/docs`, body: entry, partitionKey: entry.subjectId, upsert: false });
  } catch (e) { /* audit logging must never block the primary write */ }
}

module.exports = { logAudit, AUDIT };
