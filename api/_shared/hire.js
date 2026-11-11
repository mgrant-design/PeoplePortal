/* api/_shared/hire.js — a signed offer becomes an employee record. One applicant makes
   one employee: the record's id comes from the applicant's id and it carries
   hiredFromApplicantId, so a second create meets a conflict and reads the first. */

const crypto = require('crypto');
const db = require('./cosmos');
const { workEmailFor } = require('./access-rules');
const { broadcast } = require('./push');

const ROSTER = db.collPath('roster');
const lower = (v) => String(v || '').trim().toLowerCase();
const EMPLOYMENT_TYPES = ['Full-time', 'Part-time', 'Per diem'];

/* a stable id per applicant */
const employeeIdFor = (applicantId) => crypto.createHash('sha1').update('hire:' + applicantId).digest('hex').slice(0, 8);

/* rec: the applicant with its signed offer. → { employee, created }. Throws when the
   roster can't be read or written, or no work email can be made from the name. Pay never
   goes onto the employee record. Someone already on the roster with the same personal
   email or mobile number is linked, not added again; someone who left comes back on their
   old record, active again with the new offer's terms. */
async function employeeFromApplicant(rec, by) {
  const roster = async () => (await db.listAll(ROSTER)).map(db.strip);
  let people = await roster();
  const already = people.find(e => e.hiredFromApplicantId === rec.id);
  if (already) return { employee: already, created: false };
  // someone already on the roster, or who worked here before, by personal email or mobile number
  const personal = lower(rec.email);
  const digits = (v) => String(v || '').replace(/\D/g, '').slice(-10);
  const phone = digits(rec.phone);
  // a mobile number alone is not a person (a household can share one): it counts only with the same name
  const fold = (v) => lower(v).replace(/[^a-z0-9]/g, '');
  const sameName = (e) => fold(`${e.first || ''}${e.last || ''}`) === fold(rec.first || rec.last ? `${rec.first || ''}${rec.last || ''}` : rec.name);
  const known = (personal && people.find(e => lower(e.personalEmail) === personal)) || (phone.length === 10 && people.find(e => digits(e.mobile) === phone && sameName(e))) || null;
  const offer = rec.offer || {};
  const role = offer.role || rec.role || '';
  const manager = people.find(e => lower(e.workEmail) && lower(e.workEmail) === lower(rec.requestedByEmail));
  const employmentType = EMPLOYMENT_TYPES.includes(offer.employmentType) ? offer.employmentType : '';
  if (known && known.status !== 'Terminated') return { employee: known, created: false };
  if (known) {
    // a rehire comes back on their old record, active again, with the new offer's terms
    const back = {
      ...known, status: 'Active', startDate: offer.startDate || '', jobTitle: role || known.jobTitle || '',
      department: rec.dept || rec.department || known.department || '', location: rec.office || known.location || '',
      ...(manager ? { manager: `${manager.first || ''} ${manager.last || ''}`.trim(), managerEmail: lower(manager.workEmail) } : {}),
      ...(employmentType ? { employmentType } : {}), personalEmail: rec.email || known.personalEmail || '', mobile: rec.phone || known.mobile || '',
      hiredFromApplicantId: rec.id, rehiredAt: new Date().toISOString(), updatedBy: by,
    };
    const r = await db.cosmos({ verb: 'POST', resId: ROSTER, path: `/${ROSTER}/docs`, body: back, partitionKey: {}, upsert: true });
    if (r.status !== 200 && r.status !== 201) throw new Error('roster rehire failed: ' + r.status);
    // the same audit entry a reactivation made by hand writes; written after the record, and a failure does not undo the rehire
    const at = new Date().toISOString();
    const audit = {
      id: 'aud-' + Date.now() + '-' + crypto.randomBytes(3).toString('hex'), date: at.slice(0, 10), kind: 'status-change',
      targetId: known.id, targetName: `${known.first || ''} ${known.last || ''}`.trim(), targetEmail: lower(known.workEmail),
      from: 'Terminated', to: 'Active', reason: 'Rehired: signed offer for ' + (role || 'a new role'), byEmail: by, at,
    };
    let audited = false;
    try {
      const AUDIT = db.collPath('audit');
      const a = await db.cosmos({ verb: 'POST', resId: AUDIT, path: `/${AUDIT}/docs`, body: audit, partitionKey: audit.date, upsert: true });
      audited = a.status === 200 || a.status === 201;
    } catch (e) { audited = false; }
    return { employee: db.strip(r.body), created: false, rehired: true, audited };
  }

  const whole = String(rec.name || '').trim();
  const cut = whole.lastIndexOf(' ');
  const first = String(rec.first || (cut > 0 ? whole.slice(0, cut) : whole)).trim();
  const last = String(rec.last || (cut > 0 ? whole.slice(cut + 1) : '')).trim();
  const workEmail = workEmailFor(first, last, rec.office, people.map(e => e.workEmail));
  if (workEmail.startsWith('@')) throw new Error('no work email can be made from the name; add this person by hand');

  const doc = {
    id: employeeIdFor(rec.id), status: 'Active', first, last,
    jobTitle: role, department: rec.dept || rec.department || '', location: rec.office || '',
    manager: manager ? `${manager.first || ''} ${manager.last || ''}`.trim() : '', managerEmail: manager ? lower(manager.workEmail) : '',
    workEmail, personalEmail: rec.email || '', mobile: rec.phone || '', startDate: offer.startDate || '', ...(employmentType ? { employmentType } : {}),
    ...(rec.provider ? { provider: true, providerType: /dent|dds|dmd/i.test(role) ? 'Dentist' : 'Hygienist' } : {}),
    hiredFromApplicantId: rec.id, createdBy: by, createdAt: new Date().toISOString(),
  };
  const r = await db.cosmos({ verb: 'POST', resId: ROSTER, path: `/${ROSTER}/docs`, body: doc, partitionKey: {}, upsert: false });
  if (r.status === 409) {
    people = await roster();
    const won = people.find(e => e.hiredFromApplicantId === rec.id);
    if (won) return { employee: won, created: false };
  }
  if (r.status !== 200 && r.status !== 201) throw new Error('roster create failed: ' + r.status);
  return { employee: db.strip(r.body), created: true };
}

/* Creates the employee for a signed applicant and writes the employee's id onto the
   applicant, as it is now, so an edit saved meanwhile is kept. Never throws: a failure is
   logged, the signature stands, and the next save of the applicant tries again (the
   applicant keeps hirePending). → the applicant record, with employeeId when linked. */
async function hireSigned(context, rec, by) {
  try {
    const { employee, created, rehired, audited } = await employeeFromApplicant(rec, by);
    if (rehired && !audited) context.log.error('a rehire was not written to the audit log', employee.id);
    if (rehired) broadcast(context, 'roster-changed', { id: employee.id, action: 'update' });
    if (created) broadcast(context, 'roster-changed', { id: employee.id, action: 'create' });
    const coll = db.collPath('applicants');
    const fresh = (await db.listAll(coll)).map(db.strip).find(d => d.id === rec.id && d.office === rec.office) || rec;
    const linked = { ...fresh, employeeId: employee.id, hirePending: false };
    const up = await db.cosmos({ verb: 'POST', resId: coll, path: `/${coll}/docs`, body: linked, partitionKey: linked.office, upsert: true });
    if (up.status !== 200 && up.status !== 201) throw new Error('applicant link save failed: ' + up.status);
    return linked;
  } catch (e) {
    context.log.error('creating the employee for a signed offer failed', e);
    return rec;
  }
}

module.exports = { employeeFromApplicant, hireSigned };
