/* api/approvals/index.js — one approval process for every kind of request ("approvals"
   container, partition key /id).
   GET  → { toApprove: records waiting on the caller, mine: records the caller submitted }.
   GET ?kind=timeoff&status=approved&from=&to= → { timeOff: [{ email, start, end }] } for the
        people whose schedule the caller sees: everyone with company-wide view; the offices
        they edit for schedulers; otherwise only themselves.
   POST { action: 'submit', kind, payload } → creates a record (rules in _shared/approval-flow).
   POST { action: 'decide', id, decision, note, option } → decides the current step.
   Every change notifies the next approvers, or the submitter when the flow ends, and
   broadcasts approvals-changed. A finished flow runs EFFECTS[kind] once. */

const { handler, resolveCaller, HttpError } = require('../_shared/caller');
const { cosmos, queryAll, strip, collPath } = require('../_shared/cosmos');
const { createRecord, decide, currentStep } = require('../_shared/approval-flow');
const { writeNotice } = require('../_shared/notices');
const { broadcast } = require('../_shared/push');
const weeks = require('../_shared/weeks');
const { cleanShift } = weeks;
const { reportingTree, offboardingInTree, seesAllOn, scheduleLevel, canScheduleTeam } = require('../_shared/access-rules');
const { describeApproval, KIND_LABEL, dayLabel, time12 } = require('../_shared/approvals-text');
/* "Nov 17 8a–4p" */
const shiftWhen = (s) => `${dayLabel(s.date)} ${time12(s.start)}–${time12(s.end)}`;

const COLL = collPath('approvals');

const nameOfPerson = (e) => e.name || `${e.first || ''} ${e.last || ''}`.trim();
const isDay = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || ''));

/* the published week and the shift a swap or change is about */
async function shiftOf(p) {
  const office = String(p.office || '').slice(0, 60), weekKey = String(p.weekKey || '');
  if (!office || !isDay(weekKey) || !p.shiftId) throw new HttpError(400, 'office, weekKey and shiftId are required');
  const raw = await weeks.getWeekRaw(office, weekKey);
  if (!raw || !raw.published) throw new HttpError(404, 'no published week found');
  const shift = (raw.shifts || []).find(s => s.id === String(p.shiftId));
  if (!shift) throw new HttpError(404, 'shift not found');
  return { office, weekKey, shift };
}
/* the parts of a shift a change can be about; the publish stamp is not one of them */
const SHIFT_KEYS = ['id', 'empId', 'date', 'start', 'end', 'breakMins', 'note', 'open', 'offered', 'offeredBy'];
const sameShift = (a, b) => !!a && !!b && SHIFT_KEYS.every(k => (a[k] || '') === (b[k] || ''));
/* the week was changed by someone else since the request was made; the approval cannot be applied */
class StaleWeek extends Error {}
const snapshot = (office, s) => ({ date: s.date, start: s.start, end: s.end, office });
const waiting = (all, kind, shiftId) => all.some(r => r.kind === kind && r.status === 'pending' && r.payload && r.payload.shiftId === shiftId);

/* kind → async (c, payload, all approvals) checked before a request is saved; returns the
   payload to store. Kinds with no entry take the payload as the rules in approval-flow shape it. */
const SUBMIT_CHECKS = {
  async swapOffer(c, p, all) {
    const { office, weekKey, shift } = await shiftOf(p);
    if (shift.empId !== c.me.id) throw new HttpError(403, 'You can only offer your own shifts');
    if (shift.offered) throw new HttpError(409, 'That shift is already offered');
    if (waiting(all, 'swapOffer', shift.id)) throw new HttpError(409, 'Your offer is already waiting for approval');
    return { office, weekKey, shiftId: shift.id, shift: snapshot(office, shift), fromName: nameOfPerson(c.me) };
  },
  async swapAccept(c, p, all) {
    const { office, weekKey, shift } = await shiftOf(p);
    if (!shift.offered && !shift.open) throw new HttpError(409, 'That shift is not offered or open yet');
    if (shift.empId === c.me.id) throw new HttpError(400, 'That is already your shift');
    if (waiting(all, 'swapAccept', shift.id)) throw new HttpError(409, 'Someone already claimed this shift — awaiting manager approval');
    const from = c.employees.find(e => e.id === shift.empId);
    return { office, weekKey, shiftId: shift.id, shift: snapshot(office, shift), fromEmpId: shift.empId || '', fromName: from ? nameOfPerson(from) : '', offered: !!shift.offered };
  },
  async schedEdit(c, p) {
    const office = String(p.office || '').slice(0, 60), weekKey = String(p.weekKey || '');
    if (!office || !isDay(weekKey)) throw new HttpError(400, 'office and weekKey are required');
    if (scheduleLevel({ me: c.me, perms: c.access.perms, flags: c.access.flags, caps: c.access.caps, office }) !== 'edit') throw new HttpError(403, 'No edit access to ' + office);
    if (c.access.flags.isAdmin || c.access.flags.isManager) throw new HttpError(400, 'You can change this week directly');
    const raw = await weeks.getWeekRaw(office, weekKey);
    if (!raw || !raw.published) throw new HttpError(400, 'This week is not published. Save it in the Builder.');
    const ch = p.change || {};
    const op = ['add', 'update', 'remove'].includes(ch.op) ? ch.op : null;
    const incoming = op === 'remove' ? null : cleanShift(ch.shift);
    const id = op === 'remove' ? String(ch.shiftId || '') : (incoming && incoming.id);
    const stored = (raw.shifts || []).find(s => s.id === id) || null;
    if (!op || !id || (op !== 'remove' && !incoming)) throw new HttpError(400, 'change {op, shift} is required');
    // the people on both sides of the change — the shift as it is now and as it would become — must be on the supervisor's teams
    const refuse = (empId) => {
      const emp = c.employees.find(e => e.id === empId);
      if (emp && !canScheduleTeam({ perms: c.access.perms, flags: c.access.flags }, emp.department)) throw new HttpError(403, `You can’t schedule ${nameOfPerson(emp)}: ${emp.department || 'their team'} is not one of your teams`);
    };
    if (stored) refuse(stored.empId);
    if (incoming) refuse(incoming.empId);
    if (op === 'add' && stored) throw new HttpError(409, 'A shift with that id already exists');
    if (op !== 'add' && !stored) throw new HttpError(404, 'shift not found');
    // the change was made against the shift as the sender's screen had it; if it has changed since, it is not theirs to overwrite
    if (stored && ch.was && !sameShift(stored, cleanShift(ch.was))) throw new HttpError(409, 'That shift changed since you opened the week. Reload and make the change again.');
    const shown = incoming || stored;
    const weekEnd = new Date(Date.parse(weekKey + 'T00:00:00Z') + 6 * 864e5).toISOString().slice(0, 10);
    if (shown.date < weekKey || shown.date > weekEnd) throw new HttpError(400, 'That shift’s date is not in this week');
    return { office, weekKey, shiftId: id, change: op === 'remove' ? { op, shiftId: id } : { op, shift: incoming }, before: stored ? { ...stored } : null, shift: snapshot(office, shown) };
  },
};

/* a swap or change needs the week as it is now; with a newer version in the way it fails and is flagged */
async function editWeek(record, by, context, edit) {
  const p = record.payload;
  const raw = await weeks.getWeekRaw(p.office, p.weekKey);
  if (!raw) throw new StaleWeek('the week is gone');
  const doc = { ...raw }; delete doc._etag;
  doc.shifts = (doc.shifts || []).map(s => ({ ...s }));
  edit(doc);
  const saved = await weeks.putWeek(doc, raw._etag, by);
  if (!saved) throw new StaleWeek('the week changed during the approval');
  broadcast(context, 'schedule-changed', { office: p.office, weekKey: p.weekKey });
}

/* kind → async (record, ctx) run once when a flow is approved; may return
   { patch: fields to store on the record, body: the submitter's notice text } */
const EFFECTS = {
  async swapOffer(record, { context, caller: c }) {
    const p = record.payload;
    const owner = c.employees.find(e => (e.workEmail || '').toLowerCase() === record.submittedBy);
    await editWeek(record, c.identity.email, context, (doc) => {
      const s = doc.shifts.find(x => x.id === p.shiftId);
      if (!s || !owner || s.empId !== owner.id) throw new StaleWeek('the shift changed before the approval');
      s.offered = true; s.offeredBy = owner.id;
    });
    return { body: `Your offer of the ${shiftWhen(p.shift)} shift at ${p.office} is approved. Teammates can now claim it.` };
  },
  async swapAccept(record, { context, caller: c }) {
    const p = record.payload;
    const claimer = c.employees.find(e => (e.workEmail || '').toLowerCase() === record.submittedBy);
    await editWeek(record, c.identity.email, context, (doc) => {
      const s = doc.shifts.find(x => x.id === p.shiftId);
      if (!s || !claimer || (!s.offered && !s.open) || (s.empId || '') !== p.fromEmpId) throw new StaleWeek('the shift changed before the approval');
      s.empId = claimer.id; delete s.offered; delete s.offeredBy; delete s.open;
    });
    const from = c.employees.find(e => e.id === p.fromEmpId);
    if (from && from.workEmail) {
      try {
        await writeNotice(context, { to: from.workEmail, from: { email: c.identity.email, name: nameOfPerson(c.me) }, recipient: from, category: 'message',
          ...(p.offered
            ? { title: 'Your offered shift was taken', body: `${record.submittedName} now covers your ${shiftWhen(p.shift)} shift at ${p.office}.` }
            : { title: 'Your shift was reassigned', body: `Your ${shiftWhen(p.shift)} shift at ${p.office} was up for grabs, and ${record.submittedName} now covers it.` }),
          deepLink: { view: 'myschedule' } });
      } catch (e) { context.log.warn('swap notice failed', e); }
    }
    return { body: `The ${shiftWhen(p.shift)} shift at ${p.office} is now yours.` };
  },
  async schedEdit(record, { context, caller: c }) {
    const p = record.payload;
    await editWeek(record, c.identity.email, context, (doc) => {
      const at = doc.shifts.findIndex(s => s.id === p.shiftId);
      const op = p.change.op;
      if (op === 'add') {
        if (at >= 0) throw new StaleWeek('the shift changed before the approval');
        doc.shifts.push(p.change.shift);
        return;
      }
      // a change to a shift applies only to the shift as it was when the change was sent
      if (at < 0 || !sameShift(doc.shifts[at], p.before)) throw new StaleWeek('the shift changed before the approval');
      if (op === 'remove') { doc.shifts.splice(at, 1); return; }
      const next = { ...p.change.shift };
      // a new time or note does not take back an offer, unless the shift is handed to someone else
      if (doc.shifts[at].offered && next.empId === doc.shifts[at].empId) { next.offered = true; next.offeredBy = doc.shifts[at].offeredBy; }
      doc.shifts[at] = next;
    });
    return { body: `Your change to the ${p.office} week of ${dayLabel(p.weekKey)} was approved and applied.` };
  },
  async offboarding(record) {
    const p = record.payload;
    return { body: `The offboarding notice for ${p.first} ${p.last} (last day ${dayLabel(p.effective)}) is approved.` };
  },
  async timeoff(record) {
    const paid = (record.steps.find(s => s.options) || {}).option === 'paid';
    const p = record.payload;
    const span = p.start === p.end ? `on ${dayLabel(p.start)}` : `from ${dayLabel(p.start)} to ${dayLabel(p.end)}`;
    const reason = p.type === 'Unpaid' ? '' : ", because there isn't enough paid time off";   // no reason when they asked for unpaid
    return { patch: { paid }, body: paid ? `Your time off ${span} is approved.` : `Your time off ${span} is approved as unpaid${reason}.` };
  },
};

/* one request at a time per shift: an offer or a claim gets an id made from its shift and how
   many came before it, written create-only, so two sent in the same moment cannot both be saved */
const ONE_PER_SHIFT = { swapOffer: 'Your offer is already waiting for approval', swapAccept: 'Someone already claimed this shift — awaiting manager approval' };
const perShiftId = (kind, p, all) => {
  const n = all.filter(r => r.kind === kind && r.payload && r.payload.office === p.office && r.payload.weekKey === p.weekKey && r.payload.shiftId === p.shiftId).length;
  return `${kind}-${p.office}-${p.weekKey}-${p.shiftId}-${n}`.replace(/[\/\\?#]/g, '_');
};

async function save(doc, etag) {
  const r = await cosmos({ verb: 'POST', resId: COLL, path: `/${COLL}/docs`, body: doc, partitionKey: doc.id, upsert: true, ifMatch: etag });
  if (r.status === 412) throw new HttpError(409, 'This was already decided.');
  if (r.status !== 200 && r.status !== 201) throw new Error('approval write failed: ' + r.status);
  return strip(r.body);
}

const fn = handler(['GET', 'POST'], async ({ context, req, body }) => {
  const c = await resolveCaller(req);
  const email = c.identity.email;
  const nameOf = (e) => e.name || `${e.first || ''} ${e.last || ''}`.trim();
  const from = { email, name: nameOf(c.me) };
  const person = (addr) => c.employees.find(e => (e.workEmail || '').toLowerCase() === addr);
  /* 'action' asks someone to decide; 'message' reports a result */
  const tell = async (to, title, text, record, category = 'action') => {
    if (to === email) return;
    try { await writeNotice(context, { to, from, recipient: person(to), title, body: text, category, deepLink: { view: 'approvals', approvalId: record.id } }); }
    catch (e) { context.log.warn('approval notice failed', e); }
  };
  const label = (r) => KIND_LABEL[r.kind] || 'Request';
  const summary = (r) => { const d = describeApproval(r); return [d.who, d.what, d.when].filter(Boolean).join(' · '); };

  if (req.method === 'GET') {
    const q = req.query || {};
    if (q.kind === 'offboarding') {
      const all = (await queryAll(COLL, [['kind', '=', 'offboarding']])).map(strip);
      // offboarding notices for the Offboarding page, scoped like its imported records
      if (!c.access.caps.offboardView) throw new HttpError(403, 'Not allowed to view offboarding');
      const notices = all.filter(r => r.kind === 'offboarding' && r.payload);
      const shown = seesAllOn(c.access, 'offboarding') ? notices : notices.filter(r => offboardingInTree([r.payload], c.me, c.employees).length || r.submittedBy === email);
      return { status: 200, body: { offboarding: shown.map(r => ({ ...r.payload, id: r.id, approval: r.status, createdAt: r.createdAt, submittedName: r.submittedName })) } };
    }
    if (q.kind === 'timeoff' && q.status === 'approved') {
      const from = String(q.from || ''), to = String(q.to || '9999-12-31');
      const all = (await queryAll(COLL, [['kind', '=', 'timeoff'], ['status', '=', 'approved'], ['payload.start', '<=', to], ['payload.end', '>=', from]])).map(strip);
      let sees = () => true;
      if (!c.access.caps.viewAll) {
        const editsOffice = (office) => scheduleLevel({ me: c.me, perms: c.access.perms, flags: c.access.flags, caps: c.access.caps, office }) === 'edit';
        const visible = new Set(c.employees.filter(e => editsOffice(e.location)).map(e => (e.workEmail || '').toLowerCase()));
        visible.add(email);
        sees = (who) => visible.has(who);
      }
      const timeOff = all.filter(r => r.kind === 'timeoff' && r.status === 'approved' && sees(r.submittedBy)
        && r.payload && r.payload.start <= to && r.payload.end >= from)
        .map(r => ({ email: r.submittedBy, start: r.payload.start, end: r.payload.end }));
      return { status: 200, body: { timeOff } };
    }
    const all = (await queryAll(COLL, [{ or: [['waitingOn', 'contains', email], ['submittedBy', '=', email]] }])).map(strip);
    const toApprove = all.filter(r => r.status === 'pending' && (r.steps[currentStep(r)] || { who: [] }).who.includes(email));
    const mine = all.filter(r => r.submittedBy === email);
    const newest = (a, b) => (b.createdAt || '').localeCompare(a.createdAt || '');
    return { status: 200, body: { toApprove: toApprove.sort(newest), mine: mine.sort(newest) } };
  }

  const input = body || {};
  if (input.action === 'submit') {
    if (input.kind === 'offboarding') {
      // admins and HR for anyone; managers for their own team, never themselves
      if (!c.access.caps.offboard) throw new HttpError(403, 'Only managers, HR and admins can start an offboarding notice');
      const p = input.payload || {};
      if (p.empId === c.me.id) throw new HttpError(403, 'You can’t start an offboarding notice for yourself');
      if (!c.access.caps.viewAll && !reportingTree(c.me, c.employees).some(e => e.id === p.empId)) {
        throw new HttpError(403, 'You can start a notice only for someone on your team');
      }
      const open = (await queryAll(COLL, [['kind', '=', 'offboarding'], ['payload.empId', '=', String(p.empId || '')]])).map(strip).find(r => r.status !== 'denied');
      if (open) throw new HttpError(409, 'A notice for this person is already open');
    }
    const check = Object.prototype.hasOwnProperty.call(SUBMIT_CHECKS, input.kind) ? SUBMIT_CHECKS[input.kind] : null;
    // the offers and claims already made on this shift (the only requests the checks look at)
    const all = check ? (await queryAll(COLL, [['kind', 'in', ['swapOffer', 'swapAccept']], ['payload.shiftId', '=', String((input.payload || {}).shiftId || '')]])).map(strip) : [];
    const payload = check ? await check(c, input.payload || {}, all) : input.payload;
    let fresh = createRecord({ kind: input.kind, payload, submitter: c.me, employees: c.employees, approvers: (c.support || {}).approvers, now: Date.now() });
    let record;
    if (ONE_PER_SHIFT[input.kind]) {
      fresh = { ...fresh, id: perShiftId(input.kind, payload, all) };
      const r = await cosmos({ verb: 'POST', resId: COLL, path: `/${COLL}/docs`, body: fresh, partitionKey: fresh.id, upsert: false });
      if (r.status === 409) throw new HttpError(409, ONE_PER_SHIFT[input.kind]);
      if (r.status !== 200 && r.status !== 201) throw new Error('approval write failed: ' + r.status);
      record = strip(r.body);
    } else record = await save(fresh);
    for (const to of record.steps[0].who) await tell(to, `${label(record)} needs your approval`, summary(record), record);
    broadcast(context, 'approvals-changed', { id: record.id });
    return { status: 200, body: { record } };
  }

  if (input.action === 'decide') {
    if (!input.id) throw new HttpError(400, 'id is required');
    const got = await cosmos({ verb: 'GET', resId: `${COLL}/docs/${input.id}`, path: `/${COLL}/docs/${input.id}`, partitionKey: input.id });
    if (got.status !== 200) throw new HttpError(404, 'Request not found');
    const out = decide(strip(got.body), { by: email, decision: input.decision, note: input.note, option: input.option }, Date.now());
    const hasEffect = out.outcome === 'approved' && Object.prototype.hasOwnProperty.call(EFFECTS, out.record.kind);
    // 'pending' is saved with the decision, so a crash before the effect finishes is findable
    let record = await save(hasEffect ? { ...out.record, effect: 'pending' } : out.record, got.body._etag);
    if (out.finished) {
      let finalText = `${summary(record)} — ${out.outcome}.`;
      if (hasEffect) {
        let effect = 'done', patch = {};
        try { const res = (await EFFECTS[record.kind](record, { context, caller: c })) || {}; patch = res.patch || {}; if (res.body) finalText = res.body; }
        catch (e) {
          effect = 'failed'; context.log.error('approval effect failed', e);
          finalText = e instanceof StaleWeek
            ? `${summary(record)} — approved, but nothing was changed because the schedule changed after it was sent. It needs to be sent again.`
            : `${summary(record)} — approved, but it could not be applied because of a system error. It needs to be sent again.`;
        }
        try { record = await save({ ...record, ...patch, effect }); }
        catch (e) { record = { ...record, ...patch, effect }; context.log.error('approval effect status not saved', e); }
      }
      await tell(record.submittedBy, `${label(record)} ${record.effect === 'failed' ? 'approved, not applied' : out.outcome}`, finalText + (input.note ? ' Note: ' + String(input.note).slice(0, 300) : ''), record, 'message');
    } else {
      for (const to of record.steps[currentStep(record)].who) await tell(to, `${label(record)} needs your approval`, summary(record), record);
    }
    broadcast(context, 'approvals-changed', { id: record.id });
    return { status: 200, body: { record } };
  }

  throw new HttpError(400, "action must be 'submit' or 'decide'");
});

fn.EFFECTS = EFFECTS;
module.exports = fn;
