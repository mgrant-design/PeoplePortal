/* api/_shared/approval-flow.js — the approval rules: who approves each step of each kind
   of request, and what a decision does to the record. Pure; no database. */

const { HttpError } = require('./errors');
const { isActive } = require('./access-rules');

/* 'manager' = the submitter's manager; 'setting:x' = the approvers.x setting (any one
   person on it decides) */
const FLOWS = {
  timeoff:     ['manager', 'setting:timeoffFinal'],
  offboarding: ['setting:offboarding'],
  schedEdit:   ['manager'],
  swapOffer:   ['manager'],
  swapAccept:  ['manager'],
  uniform:     ['manager'],
  offer:       ['setting:offer'],
};

const lower = (v) => String(v || '').trim().toLowerCase();
const nameOf = (e) => e.name || `${e.first || ''} ${e.last || ''}`.trim();

/* only people on the roster who can sign in can decide a step */
function whoFor(step, submitter, approvers, employees) {
  const canDecide = (email) => isActive(employees.find(e => lower(e.workEmail) === email));
  if (step === 'manager') {
    const m = lower(submitter.managerEmail);
    if (!m || !canDecide(m)) throw new HttpError(409, 'No manager is on file for you. Ask HR to add one.');
    return [m];
  }
  const setting = (approvers || {})[step.slice('setting:'.length)];
  const who = (Array.isArray(setting) ? setting : [setting]).map(lower).filter(Boolean).filter(canDecide);
  if (!who.length) throw new HttpError(409, 'No approver is set for this yet. An admin sets it on the Organization page.');
  return who;
}

function buildRecord({ kind, payload, submitter, employees, approvers, now }) {
  const flow = Object.prototype.hasOwnProperty.call(FLOWS, kind) ? FLOWS[kind] : null;
  if (!flow) throw new HttpError(400, 'Unknown request kind: ' + kind);
  return {
    id: 'ap-' + now + '-' + Math.random().toString(36).slice(2, 7),
    kind, payload: PAYLOADS[kind] ? PAYLOADS[kind](payload || {}, { employees: employees || [], submitter }) : (payload || {}),
    submittedBy: lower(submitter.workEmail), submittedName: nameOf(submitter),
    status: 'pending',
    // each step keeps where its approvers came from, and the choices its approval must make
    steps: flow.map((step, i) => ({ who: whoFor(step, submitter, approvers, employees || []), source: step, status: 'pending', ...(stepOptions(kind, i) ? { options: stepOptions(kind, i) } : {}) })),
    createdAt: new Date(now).toISOString(),
  };
}
/* who a request waits on now: the current step's approvers, or nobody once it is finished */
const waitingOn = (record) => { const i = currentStep(record); return record.status === 'pending' && i >= 0 ? record.steps[i].who.slice() : []; };
function createRecord(args) { const r = buildRecord(args); return { ...r, waitingOn: waitingOn(r) }; }

/* each kind's payload, checked and trimmed to the fields it uses */
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const OFFBOARD_TYPES = ['Resigned', 'Terminated'];
const PAYLOADS = {
  timeoff(p) {
    if (!ISO_DAY.test(p.start || '') || !ISO_DAY.test(p.end || '')) throw new HttpError(400, 'Time off needs a start and end date');
    if (p.end < p.start) throw new HttpError(400, 'The end date is before the start date');
    const hours = Number(p.hours);
    if (!Number.isFinite(hours) || hours <= 0 || hours > 2000) throw new HttpError(400, 'Hours must be a number above 0');
    return { start: p.start, end: p.end, hours, type: String(p.type || '').slice(0, 40), reason: String(p.reason || '').slice(0, 1000) };
  },
  /* same field names as the imported roster-support.offboarding records; the person's
     details come from the roster, not the request */
  offboarding(p, { employees, submitter }) {
    const emp = employees.find(e => e.id === p.empId);
    if (!emp) throw new HttpError(400, 'Choose the person who is leaving');
    if (!isActive(emp)) throw new HttpError(400, 'That person has already left');
    if (!OFFBOARD_TYPES.includes(p.termStatus)) throw new HttpError(400, 'Choose Resigned or Terminated');
    if (!ISO_DAY.test(p.effective || '')) throw new HttpError(400, 'The last day is required');
    const mgr = employees.find(e => lower(e.workEmail) === lower(emp.managerEmail));
    return {
      empId: emp.id, first: emp.first || '', last: emp.last || '', department: emp.department || '', jobTitle: emp.jobTitle || '',
      location: emp.location || '', manager: mgr ? nameOf(mgr) : '', requestedBy: nameOf(submitter),
      termStatus: p.termStatus, effective: p.effective, notes: String(p.notes || '').slice(0, 2000),
    };
  },
};

/* the options a step's approval must choose between, by kind: [step index, options] */
const STEP_OPTIONS = { timeoff: [1, ['paid', 'unpaid']] };
const stepOptions = (kind, i) => (STEP_OPTIONS[kind] && STEP_OPTIONS[kind][0] === i ? STEP_OPTIONS[kind][1].slice() : null);

const currentStep = (record) => record.steps.findIndex(s => s.status === 'pending');

function decide(record, { by, decision, note, option }, now) {
  if (record.status !== 'pending') throw new HttpError(409, 'This was already decided.');
  if (decision !== 'approve' && decision !== 'deny') throw new HttpError(400, "decision must be 'approve' or 'deny'");
  const i = currentStep(record);
  const who = lower(by);
  if (i < 0 || !record.steps[i].who.includes(who)) throw new HttpError(403, 'This is not yours to decide.');
  const opts = record.steps[i].options;
  if (decision === 'approve' && opts && !opts.includes(option)) throw new HttpError(400, 'Choose one of: ' + opts.join(', '));
  const steps = record.steps.map((s, j) => (j !== i ? s : {
    ...s, status: decision === 'approve' ? 'approved' : 'denied', decidedBy: who, decidedAt: new Date(now).toISOString(),
    ...(note ? { note: String(note).slice(0, 1000) } : {}), ...(option !== undefined ? { option } : {}),
  }));
  const denied = decision === 'deny';
  const finished = denied || steps.every(s => s.status === 'approved');
  const outcome = finished ? (denied ? 'denied' : 'approved') : null;
  const next = { ...record, steps, status: outcome || 'pending' };
  return { record: { ...next, waitingOn: waitingOn(next) }, finished, outcome };
}

module.exports = { FLOWS, createRecord, decide, currentStep, waitingOn, whoFor };
