/* api/schedule/index.js — schedules, per-office/per-week publishing & locking,
   and taking back an offered shift. Time off, shift offers and claims, and a supervisor's
   changes to a published week go through api/approvals.

   GET  /api/schedule?office=&offices=a|b&weekKey=   → week docs, scoped per caller
   GET  /api/schedule?templates=Office               → saved week templates for an office
   POST /api/schedule { action: save | publish | retract | template_save | template_delete, ... }

   Every decision is made on the server from the live roster and each person's Schedules
   setting (Permissions page): the offices they schedule (['*'] = all; with none set a
   manager or supervisor schedules their own office; an admin schedules every office) and
   the teams (departments) they may put on a shift. HR and leadership read every office.
   Anyone else still gets their OWN shifts plus open/offered ones from published weeks.

   Week docs (container `schedules`, partition /office):
     { id: `${weekKey}__${office}`, office, weekKey, shifts: [ { id, empId, date, start,
       end, open?, offered?, offeredBy? } ], published, publishedBy, publishedAt,
       updatedBy, updatedAt }
   Older prototype docs in this container use a `cells` map; they carry no `shifts` array
   and read as empty weeks. Templates live in the same container as
   { id: 'template__...', template: true, office, name, shifts: [{empId,dow,start,end}] }. */

const https = require('https');
const { handler, resolveCaller } = require('../_shared/caller');
const { cosmos, listAll, queryAll, strip, collPath } = require('../_shared/cosmos');
const { scheduleLevel, canScheduleTeam } = require('../_shared/access-rules');
const { broadcast } = require('../_shared/push');
const { writeNotice } = require('../_shared/notices');
const { mergeWeek } = require('../_shared/weekmerge');
const weeks = require('../_shared/weeks');
const { cleanShift } = weeks;
const { sendSms, smsConfigured, normPhone } = require('../_shared/sms');

const SCHEDULES = collPath('schedules');

const officeOf = e => e.loc || e.location || 'Unassigned';
const nameOf = e => e.name || `${e.first || ''} ${e.last || ''}`.trim();

/* ---- generic HTTPS POST (Google Chat webhook) ---- */
function httpPost(urlStr, { headers = {}, body = '' } = {}) {
  return new Promise((resolve, reject) => {
    let url;
    try { url = new URL(urlStr); } catch (e) { return reject(new Error('bad url')); }
    const payload = typeof body === 'string' ? body : JSON.stringify(body);
    const opts = { hostname: url.hostname, path: url.pathname + url.search, method: 'POST', headers: { 'Content-Length': Buffer.byteLength(payload), ...headers } };
    const rq = https.request(opts, (res) => { let d = ''; res.on('data', c => d += c); res.on('end', () => resolve({ status: res.statusCode, body: d })); });
    rq.on('error', reject);
    rq.write(payload); rq.end();
  });
}

/* ---- publish notifications: Google Chat and, when set up, a text to each person ---- */
async function sendPublishNotifications({ office, weekKey, publishedBy, shiftCount, hours, recipients }) {
  const summary = { gchat: false, sms: 0, simulated: true, errors: [] };
  const webhook = process.env.SCHEDULE_GCHAT_WEBHOOK || '';
  if (!(webhook || smsConfigured())) return summary;
  summary.simulated = false;
  const human = `${office} — week of ${weekKey}: ${shiftCount} shift${shiftCount === 1 ? '' : 's'} (${hours} hrs) published by ${publishedBy}. View it under Schedule.`;
  if (webhook) {
    try {
      const r = await httpPost(webhook, { headers: { 'Content-Type': 'application/json' }, body: { text: `📅 *Schedule published* — ${human}` } });
      summary.gchat = r.status >= 200 && r.status < 300;
      if (!summary.gchat) summary.errors.push('gchat ' + r.status);
    } catch (e) { summary.errors.push('gchat ' + e.message); }
  }
  if (smsConfigured() && Array.isArray(recipients) && recipients.length) {
    const text = `Your ${office} schedule for the week of ${weekKey} is published. Open the portal → Schedule.`;
    for (const to of recipients) {
      const r = await sendSms({ to, body: text });
      if (r.sent) summary.sms++; else summary.errors.push('sms ' + r.reason);
    }
  }
  return summary;
}


const send = (status, body) => ({ status, body });

module.exports = handler(['GET', 'POST'], async ({ context, req, body }) => {
  const c = await resolveCaller(req);
  const { identity, me, employees } = c;
  /* the caller's role flags and settings, as the level rule and the team limit read them */
  const access = { ...c.access.flags, viewAll: c.access.caps.viewAll, caps: c.access.caps, perms: c.access.perms || {} };
  const myOffice = officeOf(me);
  const levelOf = (emp, a, office) => scheduleLevel({ me: emp, perms: a.perms, flags: a, caps: a.caps, office });
  const lvl = office => levelOf(me, access, office);
  /* shifts for people outside the caller's teams are refused */
  const teamRefusal = (shiftList) => {
    for (const s of shiftList) {
      const emp = s.empId && employees.find(e => e.id === s.empId);
      if (emp && !canScheduleTeam({ perms: access.perms, flags: access }, emp.department)) return `You can’t schedule ${nameOf(emp)}: ${emp.department || 'their team'} is not one of your teams`;
    }
    return '';
  };

  /* in-portal notice to one person. Never throws — a notice failure must not fail the
     write it announces. */
  async function notice(toEmail, title, body, deepLink) {
    try {
      if (!toEmail || toEmail === identity.email) return;
      const recip = employees.find(e => (e.workEmail || '').toLowerCase() === toEmail);
      await writeNotice(context, { to: toEmail, from: { email: identity.email, name: nameOf(me) }, recipient: recip, title, body, deepLink });
    } catch (e) { context.log.warn('schedule notice failed', e); }
  }

  const getWeekRaw = weeks.getWeekRaw;
  const putWeek = (doc, etag) => weeks.putWeek(doc, etag, identity.email);
  /* ================= READ ================= */
  if (req.method === 'GET') {
    const q = req.query || {};

    if (q.templates) {
      const office = String(q.templates);
      if (lvl(office) === 'none') return send(403, { error: 'No access to ' + office });
      const docs = (await listAll(SCHEDULES)).map(strip).filter(d => d.template && d.office === office);
      return send(200, { templates: docs });
    }

    let docs = (await listAll(SCHEDULES)).map(strip).filter(d => !d.template);
    const wanted = q.offices ? String(q.offices).split('|') : (q.office ? [String(q.office)] : null);
    if (wanted) docs = docs.filter(d => wanted.includes(d.office));
    if (q.weekKey) docs = docs.filter(d => d.weekKey === q.weekKey);
    /* scope: edit/view get the full doc, published or not. Everyone else gets PUBLISHED
       weeks whole — a posted schedule shows the office, names and hours, the way it does
       on the wall. The free-text note on a shift stays personal: it is between that
       person and whoever schedules them, so it is removed from everybody else's. Drafts
       are never sent. */
    docs = docs.map(d => {
      if (lvl(d.office) !== 'none') return d;
      if (!d.published) return null;
      return { ...d, shifts: (d.shifts || []).map(s => (s.empId === me.id || !s.note) ? s : { ...s, note: undefined }) };
    }).filter(Boolean);
    /* a claim or an offer waiting for a manager is shown on its shift to everyone reading
       the week (marked here, never stored), so nobody presses Claim or Withdraw on it */
    if (docs.some(d => d.published)) {
      const waiting = {};
      (await queryAll(collPath('approvals'), [['status', '=', 'pending'], ['kind', 'in', ['swapAccept', 'swapOffer']]])).map(strip).forEach(r => {
        if (!r.payload) return;
        waiting[`${r.payload.office}|${r.payload.weekKey}|${r.payload.shiftId}`] = r.kind === 'swapAccept' ? 'claimPending' : 'offerPending';
      });
      docs = docs.map(d => d.published ? { ...d, shifts: (d.shifts || []).map(sh => { const k = waiting[`${d.office}|${d.weekKey}|${sh.id}`]; return k ? { ...sh, [k]: true } : sh; }) } : d);
    }
    return send(200, { schedules: docs });
  }

  /* ================= WRITE ================= */
  const input = body;
  if (!input) return send(400, { error: 'body required' });
  /* legacy prototype publish (cells map, no action) is gone — everything is an action */
  const action = String(input.action || '');
  if (!action) return send(400, { error: 'action is required' });
  const office = String(input.office || '');
  const weekKey = String(input.weekKey || '');
  const okWeek = /^\d{4}-\d{2}-\d{2}$/.test(weekKey);

  /* ---- save: add a manager's changes to a week (managers & unpublished-week supervisors).
          The changes are what the manager added, changed and removed since opening the week;
          they are added to the week as it is now, so an offer or swap made meanwhile
          survives. A shift someone else changed meanwhile, or a week written to meanwhile,
          answers 409 and nothing is written. ---- */
  if (action === 'save') {
    if (!office || !okWeek) return send(400, { error: 'office and weekKey are required' });
    if (lvl(office) !== 'edit') return send(403, { error: 'No edit access to ' + office });
    const ch = input.changes;
    if (!ch || typeof ch !== 'object' || Array.isArray(ch)) return send(400, { error: 'changes {add, update, remove} are required' });
    const LIMIT = 2000;
    if (['add', 'update', 'remove'].some(k => Array.isArray(ch[k]) && ch[k].length > LIMIT)) return send(400, { error: 'Too many changes in one save' });
    const clean = (list, fn) => (Array.isArray(list) ? list : []).map(fn);
    const add = clean(ch.add, cleanShift), update = clean(ch.update, u => ({ shift: cleanShift(u && u.shift), was: cleanShift(u && u.was) })),
      remove = clean(ch.remove, r => ({ id: String((r && r.id) || '').slice(0, 60), was: cleanShift(r && r.was) }));
    if (add.some(s => !s) || update.some(u => !u.shift || !u.was) || remove.some(r => !r.id || !r.was)) return send(400, { error: 'a change holds a shift that is not valid' });
    const raw = await getWeekRaw(office, weekKey);
    const existing = raw ? strip(raw) : null;
    if (existing && existing.published && access.isSupervisor && !access.isAdmin && !access.isManager) {
      return send(409, { error: 'Week is published — supervisor changes go through per-change approval', pendingRequired: true });
    }
    // every shift the changes touch — new, changed (before and after) or removed — must be in the person's teams
    const refusal = teamRefusal([...add, ...update.flatMap(u => [u.shift, u.was]), ...remove.map(r => r.was)]);
    if (refusal) return send(403, { error: refusal });
    const week = existing || { id: `${weekKey}__${office}`, office, weekKey, published: false, shifts: [] };
    let merged;
    try { merged = mergeWeek(week, { add, update, remove }); }
    catch (e) { if (e.status === 409) return send(409, { error: 'Someone changed this week since you opened it. Your changes are kept — review the week and publish again.', conflict: true, conflicts: e.conflicts }); throw e; }
    const saved = await putWeek(merged, raw && raw._etag);
    if (!saved) return send(409, { error: 'Someone changed this week since you opened it. Your changes are kept — review the week and publish again.', conflict: true });
    broadcast(context, 'schedule-changed', { office, weekKey });
    return send(200, { ok: true, schedule: saved });
  }

  /* ---- publish: lock this office's week (D5) & notify ---- */
  if (action === 'publish') {
    if (!office || !okWeek) return send(400, { error: 'office and weekKey are required' });
    if (lvl(office) !== 'edit') return send(403, { error: 'No edit access to ' + office });
    const rawWeek = await getWeekRaw(office, weekKey);
    const doc = rawWeek && strip(rawWeek);
    if (!doc) return send(404, { error: 'nothing saved for that week yet' });

    /* Who to tell. 'all' = everyone with a shift this week (the default, and what this
       always did). 'updates' = only people whose week actually changed, which is three
       groups: a shift that is not yet stamped `pub` (added or edited — edits clear the
       stamp), and anyone who WAS published last time but has no shift now (their shift
       was deleted). That last group is why the published id list is stored on the doc:
       a removed shift leaves no trace in the document to compare against. */
    const onlyUpdates = String(input.notify || 'all') === 'updates';
    const before = new Set(doc.pubEmpIds || []);
    const nowIds = new Set((doc.shifts || []).filter(s => s.empId).map(s => s.empId));
    const changedIds = new Set();
    (doc.shifts || []).forEach(s => { if (s.empId && !s.pub) changedIds.add(s.empId); });
    before.forEach(id => { if (!nowIds.has(id)) changedIds.add(id); });

    const saved = await putWeek({ ...doc, shifts: (doc.shifts || []).map(s => ({ ...s, pub: true })), published: true, pubEmpIds: [...nowIds], publishedBy: identity.email, publishedAt: new Date().toISOString() }, rawWeek._etag);
    if (!saved) return send(409, { error: 'The week changed just now. Review it and publish again.' });
    const shifts = saved.shifts || [];
    const ids = onlyUpdates ? changedIds : new Set(shifts.filter(s => s.empId).map(s => s.empId));
    /* paid hours: elapsed minus each shift's unpaid break (same rule as shiftHrs) */
    const hours = Math.round(shifts.reduce((a, s) => {
      const mins = (parseInt(s.end, 10) * 60 + Number(s.end.split(':')[1])) - (parseInt(s.start, 10) * 60 + Number(s.start.split(':')[1])) - (Number(s.breakMins) || 0);
      return a + Math.max(0, mins) / 60;
    }, 0));
    /* filter the roster, not the shift list — someone whose only shift was deleted has
       no shift to filter by, and they are exactly who needs telling */
    const scheduled = employees.filter(e => ids.has(e.id));
    const recipients = scheduled.map(e => normPhone(e.mobile || e.personalPhone || e.phone || e.cell)).filter(Boolean);
    let notify = { gchat: false, sms: 0, simulated: true, errors: [] };
    if (scheduled.length) {
      try { notify = await sendPublishNotifications({ office, weekKey, publishedBy: identity.email, shiftCount: shifts.length, hours, recipients }); }
      catch (e) { notify.errors = [e.message]; }
    }
    for (const e of scheduled) {
      const gone = !nowIds.has(e.id);
      await notice((e.workEmail || '').toLowerCase(),
        gone ? 'Your shifts changed' : 'Your schedule is published',
        gone
          ? `You are no longer scheduled at ${office} for the week of ${weekKey}. Check the Schedule.`
          : `The ${office} schedule for the week of ${weekKey} is published. See your shifts under Schedule.`,
        { view: 'myschedule' });
    }
    broadcast(context, 'schedule-changed', { office, weekKey });
    return send(200, { ok: true, schedule: saved, notify, notified: scheduled.length, mode: onlyUpdates ? 'updates' : 'all' });
  }

  /* ---- retract: the owner takes back a shift they offered (an offer needs the manager's
          approval to start — api/approvals swapOffer — but taking it back doesn't) ---- */
  if (action === 'retract') {
    if (!office || !okWeek || !input.shiftId) return send(400, { error: 'office, weekKey and shiftId are required' });
    const raw = await getWeekRaw(office, weekKey);
    const doc = raw && strip(raw);
    if (!doc || !doc.published) return send(404, { error: 'no published week found' });
    const shift = (doc.shifts || []).find(s => s.id === String(input.shiftId));
    if (!shift) return send(404, { error: 'shift not found' });
    if (shift.empId !== me.id) return send(403, { error: 'You can only withdraw your own offers' });
    const claimed = (await queryAll(collPath('approvals'), [['kind', '=', 'swapAccept'], ['status', '=', 'pending'], ['payload.shiftId', '=', shift.id]])).length > 0;
    if (claimed) return send(409, { error: 'A claim on this shift is awaiting manager approval' });
    delete shift.offered; delete shift.offeredBy;
    const saved = await putWeek(doc, raw._etag);
    if (!saved) return send(409, { error: 'The week changed just now. Try again.' });
    broadcast(context, 'schedule-changed', { office, weekKey });
    return send(200, { ok: true, schedule: saved });
  }

  /* ---- templates: save / delete a named reusable week (§3.3) ---- */
  if (action === 'template_save') {
    if (!office) return send(400, { error: 'office is required' });
    if (lvl(office) !== 'edit') return send(403, { error: 'No edit access to ' + office });
    const name = String(input.name || '').slice(0, 80).trim();
    if (!name) return send(400, { error: 'name is required' });
    const shifts = (Array.isArray(input.shifts) ? input.shifts : []).map(s => ({
      empId: String(s.empId || '').slice(0, 60), dow: Math.min(6, Math.max(0, Number(s.dow) || 0)),
      start: /^\d{1,2}:\d{2}$/.test(String(s.start)) ? String(s.start) : '09:00',
      end: /^\d{1,2}:\d{2}$/.test(String(s.end)) ? String(s.end) : '17:00',
      open: !!s.open,
      breakMins: Math.min(480, Math.max(0, Math.round(Number(s.breakMins) || 0))),
    })).filter(s => s.empId || s.open).slice(0, 400);
    const doc = { id: 'template__' + office.replace(/[^\w-]/g, '_') + '__' + name.toLowerCase().replace(/[^\w-]/g, '_'), template: true, office, name, shifts, savedBy: identity.email, savedAt: new Date().toISOString() };
    const r = await cosmos({ verb: 'POST', resId: SCHEDULES, path: `/${SCHEDULES}/docs`, body: doc, partitionKey: office, upsert: true });
    if (r.status !== 200 && r.status !== 201) throw new Error('template write failed: ' + r.status);
    return send(200, { ok: true, template: strip(r.body) });
  }
  if (action === 'template_delete') {
    if (!office || !input.id) return send(400, { error: 'office and id are required' });
    if (lvl(office) !== 'edit') return send(403, { error: 'No edit access to ' + office });
    const id = String(input.id);
    if (!id.startsWith('template__')) return send(400, { error: 'not a template id' });
    const r = await cosmos({ verb: 'DELETE', resId: `${SCHEDULES}/docs/${id}`, path: `/${SCHEDULES}/docs/${id}`, partitionKey: office });
    if (r.status !== 204 && r.status !== 404) throw new Error('template delete failed: ' + r.status);
    return send(200, { ok: true });
  }

  return send(400, { error: 'unknown action' });
});
