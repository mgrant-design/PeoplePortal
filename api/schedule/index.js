/* api/schedule/index.js — schedules, per-office/per-week publishing & locking,
   per-person-per-office access grants, supervisor edit approvals, the shift-swap
   offer/claim board, and blackout-date requests.

   GET  /api/schedule?office=&offices=a|b&weekKey=   → week docs, scoped per caller
   GET  /api/schedule?requests=1                     → edit/swap/blackout requests, scoped
   GET  /api/schedule?access=1                       → access grants (admin: all, else own)
   GET  /api/schedule?templates=Office               → saved week templates for an office
   POST /api/schedule { action: save | publish | edit | edit_decide | offer | retract |
                        claim | swap_decide | blackout_submit | blackout_hr | blackout_mgr |
                        access_set | template_save | template_delete, ... }

   Security mirrors api/roster: valid Google token, domain lock, and every decision made
   server-side from the live roster + the schedAccess grants — never trusted from the
   client. The Cosmos master key lives only in env vars.

   Access model (§4 of the plan): per person, per office — edit | view | none — stored in
   the `schedAccess` container (one doc per email). An explicit grant wins; without one the
   default is derived from role: admin → edit everywhere; manager/supervisor → edit at
   their own office; HR/leadership → view everywhere; everyone else → none. `none` still
   returns the caller's OWN shifts plus open/offered ones from published weeks.

   Week docs (container `schedules`, partition /office):
     { id: `${weekKey}__${office}`, office, weekKey, shifts: [ { id, empId, date, start,
       end, open?, offered?, offeredBy? } ], published, publishedBy, publishedAt,
       updatedBy, updatedAt }
   Older prototype docs in this container use a `cells` map; they carry no `shifts` array
   and read as empty weeks. Templates live in the same container as
   { id: 'template__...', template: true, office, name, shifts: [{empId,dow,start,end}] }.

   Requests (container `schedRequests`, partition /office):
     edit     — a supervisor's change to a published week: pending → applied | rejected
     swap     — a claim on an offered shift:               pending → approved | rejected
     blackout — dates an employee can't work:  hr_review → mgr_review → approved | denied
   Blackouts reuse the api/applicants single-named-approver pattern: Amanda Vibert
   (HR & Payroll) confirms PTO coverage first, identity-checked server-side. */

const https = require('https');
const { verifyGoogleToken, tokenFromReq } = require('../_shared/auth');
const { cosmos, listAll, strip, collPath, cosmosConfigured, loadAccessControl, applyAccessControl } = require('../_shared/cosmos');

const ALLOWED = ['puredental.com', 'foureversmile.com', 'puredentallab.com'];
const SCHEDULES = collPath('schedules');
const REQUESTS = collPath('schedRequests');
const ACCESS = collPath('schedAccess');
const NOTICES = collPath('notices');

/* Blackout HR approver — same single-named-approver convention as api/applicants
   (OFFER_APPROVER_*): the production approver is Amanda Vibert; the email is TEMP
   pointed at a test account until the pipeline is verified end-to-end. */
const BLACKOUT_HR_APPROVER_NAME = 'Amanda Vibert';
const BLACKOUT_HR_APPROVER_EMAIL = 'mgrant@puredental.com'; // TEMP — swap to Amanda's address to go live

const officeOf = e => e.loc || e.location || 'Unassigned';
const nameOf = e => e.name || `${e.first || ''} ${e.last || ''}`.trim();

/* ---- generic HTTPS POST (Google Chat webhook & Twilio, unchanged) ---- */
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

/* ---- publish notifications: Google Chat + optional Twilio SMS (kept as-is) ---- */
async function sendPublishNotifications({ office, weekKey, publishedBy, shiftCount, hours, recipients }) {
  const summary = { gchat: false, sms: 0, simulated: true, errors: [] };
  const webhook = process.env.SCHEDULE_GCHAT_WEBHOOK || '';
  const sid = process.env.TWILIO_ACCOUNT_SID || '';
  const tok = process.env.TWILIO_AUTH_TOKEN || '';
  const from = process.env.TWILIO_FROM || '';
  if (!(webhook || (sid && tok && from))) return summary;
  summary.simulated = false;
  const human = `${office} — week of ${weekKey}: ${shiftCount} shift${shiftCount === 1 ? '' : 's'} (${hours} hrs) published by ${publishedBy}. View it under My schedule.`;
  if (webhook) {
    try {
      const r = await httpPost(webhook, { headers: { 'Content-Type': 'application/json' }, body: { text: `📅 *Schedule published* — ${human}` } });
      summary.gchat = r.status >= 200 && r.status < 300;
      if (!summary.gchat) summary.errors.push('gchat ' + r.status);
    } catch (e) { summary.errors.push('gchat ' + e.message); }
  }
  if (sid && tok && from && Array.isArray(recipients) && recipients.length) {
    const auth = 'Basic ' + Buffer.from(`${sid}:${tok}`).toString('base64');
    const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`;
    const text = `Your ${office} schedule for the week of ${weekKey} is published. Open the portal → My schedule.`;
    for (const to of recipients) {
      try {
        const form = new URLSearchParams({ To: to, From: from, Body: text }).toString();
        const r = await httpPost(url, { headers: { 'Authorization': auth, 'Content-Type': 'application/x-www-form-urlencoded' }, body: form });
        if (r.status >= 200 && r.status < 300) summary.sms++; else summary.errors.push('sms ' + r.status);
      } catch (e) { summary.errors.push('sms ' + e.message); }
    }
  }
  return summary;
}

function normPhone(p) {
  const raw = String(p || '').trim();
  if (!raw) return '';
  if (raw.startsWith('+')) { const d = raw.replace(/[^\d]/g, ''); return d.length >= 10 ? '+' + d : ''; }
  const d = raw.replace(/[^\d]/g, '');
  if (d.length === 10) return '+1' + d;
  if (d.length === 11 && d[0] === '1') return '+' + d;
  return '';
}

/* ---- role derivation (compact port of rbac.jsx, same as api/timeoff) ---- */
function perms(me, usersByEmail, managerEmails, employees) {
  const p = usersByEmail[(me.workEmail || '').toLowerCase()] || {};
  const dept = (me.department || '').toLowerCase();
  const title = (me.jobTitle || '').toLowerCase();
  const meEmail = (me.workEmail || '').toLowerCase();
  const isExec = /\b(ceo|chief|coo|cfo|president|owner|principal)\b/.test(title) || ['leadership', 'management team', 'management', 'pure management'].includes(dept);
  const isHR = /human resources|payroll/.test(dept) || /\b(human resources|payroll|people ops)\b/.test(title);
  const hasReports = employees.some(e => e.managerEmail && e.managerEmail.toLowerCase() === meEmail);
  const isSupervisor = (!!p.supervisor || /\b(supervisor|team lead|lead)\b/.test(title)) && !/\b(manager|director)\b/.test(title) && !hasReports;
  const isManager = (!!p.manager || me.isManager || managerEmails.has(meEmail) || hasReports || /\b(manager|director)\b/.test(title)) && !isSupervisor;
  const isAdmin = !!p.admin;
  return { isAdmin, isHR, isExec, isManager, isSupervisor, viewAll: isAdmin || isHR || isExec };
}

/* effective scheduling level for one office: explicit grant wins, else role default */
function levelFor(office, grants, access, myOffice) {
  const g = grants && grants[office];
  if (g === 'edit' || g === 'view' || g === 'none') return g;
  if (access.isAdmin) return 'edit';
  if ((access.isManager || access.isSupervisor) && office === myOffice) return 'edit';
  if (access.viewAll) return 'view';
  return 'none';
}

/* sanitize one client-supplied shift into the canonical record */
function cleanShift(s) {
  if (!s || typeof s !== 'object') return null;
  const t = v => String(v || '').slice(0, 60);
  const time = v => /^\d{1,2}:\d{2}$/.test(String(v || '')) ? String(v) : null;
  const date = v => /^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : null;
  const out = { id: t(s.id), empId: t(s.empId), date: date(s.date), start: time(s.start), end: time(s.end) };
  if (!out.id || !out.date || !out.start || !out.end || (!out.empId && !s.open)) return null;
  if (s.open) out.open = true; /* open = flagged up-for-grabs; it keeps its row's empId as the anchor */
  if (s.pub) out.pub = true; /* stamped at publish; cleared by edits so the Publish button can count unpublished changes */
  if (s.offered) { out.offered = true; out.offeredBy = t(s.offeredBy); }
  return out;
}

module.exports = async function (context, req) {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Google-Token',
  };
  const send = (status, body) => { context.res = { status, headers, body: JSON.stringify(body) }; };
  if (req.method === 'OPTIONS') { context.res = { status: 204, headers }; return; }

  let identity;
  try { identity = await verifyGoogleToken(tokenFromReq(req)); }
  catch (e) { return send(401, { error: 'Not authenticated', detail: e.message }); }
  if (!ALLOWED.includes(identity.email.split('@')[1] || '')) return send(403, { error: 'Domain not allowed' });
  if (!cosmosConfigured()) return send(500, { error: 'Missing Cosmos config' });

  /* resolve caller, roles and grants from the live roster (server-side, every call) */
  const employees = (await listAll(collPath('roster'))).map(strip);
  let ref = { users: [], managers: [] };
  try {
    const sup = (await listAll(collPath('appState'))).find(d => d.id === 'roster-support');
    if (sup) ref = { users: sup.users || [], managers: sup.managers || [] };
  } catch (e) {}
  const me = employees.find(e => (e.workEmail || '').toLowerCase() === identity.email);
  if (!me) return send(403, { error: 'No roster account for ' + identity.email });
  const usersByEmail = {};
  (ref.users || []).forEach(u => { if (u.email) usersByEmail[u.email.toLowerCase()] = u; });
  try { applyAccessControl(usersByEmail, await loadAccessControl()); } catch (e) {}
  const managerEmails = new Set((ref.managers || []).map(m => (m.email || '').toLowerCase()).filter(Boolean));
  const access = perms(me, usersByEmail, managerEmails, employees);
  const myOffice = officeOf(me);

  let grantDocs = [];
  try { grantDocs = (await listAll(ACCESS)).map(strip); } catch (e) { /* container may not exist yet */ }
  const myGrants = (grantDocs.find(g => g.id === identity.email) || {}).grants || {};
  const lvl = office => levelFor(office, myGrants, access, myOffice);
  /* a MANAGER-level decision for an office: edit access that isn't the supervisor default */
  const canDecide = office => (access.isAdmin || access.isManager) && lvl(office) === 'edit';

  const accessOf = (emp) => {
    const em = (emp.workEmail || '').toLowerCase();
    const ub = usersByEmail[em] || {};
    return perms(emp, usersByEmail, managerEmails, employees);
  };
  /* manager-level people for an office (for routing approval notices) */
  const officeManagers = (office) => employees.filter(e => {
    if ((e.status || 'Active') !== 'Active') return false;
    const em = (e.workEmail || '').toLowerCase();
    if (!em) return false;
    const a = accessOf(e);
    const g = (grantDocs.find(x => x.id === em) || {}).grants || {};
    return (a.isManager || a.isAdmin) && levelFor(office, g, a, officeOf(e)) === 'edit';
  });

  /* in-portal notice: persist to the notices container + instant SignalR push.
     Never throws — a notice failure must not fail the write it announces. */
  const pushes = [];
  async function notice(toEmail, title, body, deepLink) {
    try {
      if (!toEmail || toEmail === identity.email) return;
      const doc = {
        id: 'nt-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
        kind: 'notice', category: 'action',
        fromEmail: identity.email, fromName: nameOf(me),
        toEmail, toName: '', office: '',
        title: String(title).slice(0, 200), body: String(body || '').slice(0, 2000),
        urgent: false, read: false, createdAt: new Date().toISOString(),
      };
      const recip = employees.find(e => (e.workEmail || '').toLowerCase() === toEmail);
      if (recip) { doc.toName = nameOf(recip); doc.office = officeOf(recip); }
      if (deepLink && deepLink.view) doc.deepLink = { view: String(deepLink.view).slice(0, 40) };
      await cosmos({ verb: 'POST', resId: NOTICES, path: `/${NOTICES}/docs`, body: doc, partitionKey: toEmail, upsert: true });
      pushes.push({ userId: toEmail, target: 'notify', arguments: [doc] });
    } catch (e) { /* best-effort */ }
  }
  const flushPushes = () => { if (pushes.length) context.bindings.signalRMessages = pushes; };

  const getWeek = async (office, weekKey) => {
    const id = `${weekKey}__${office}`;
    const r = await cosmos({ verb: 'GET', resId: `${SCHEDULES}/docs/${id}`, path: `/${SCHEDULES}/docs/${id}`, partitionKey: office });
    return r.status === 200 ? strip(r.body) : null;
  };
  const putWeek = async (doc) => {
    doc.updatedBy = identity.email; doc.updatedAt = new Date().toISOString();
    const r = await cosmos({ verb: 'POST', resId: SCHEDULES, path: `/${SCHEDULES}/docs`, body: doc, partitionKey: doc.office, upsert: true });
    if (r.status !== 200 && r.status !== 201) throw new Error('schedule write failed (' + r.status + ')');
    return strip(r.body);
  };
  const putRequest = async (doc) => {
    const r = await cosmos({ verb: 'POST', resId: REQUESTS, path: `/${REQUESTS}/docs`, body: doc, partitionKey: doc.office, upsert: true });
    if (r.status !== 200 && r.status !== 201) throw new Error('request write failed (' + r.status + ')');
    return strip(r.body);
  };
  const getRequest = async (id, office) => {
    const r = await cosmos({ verb: 'GET', resId: `${REQUESTS}/docs/${id}`, path: `/${REQUESTS}/docs/${id}`, partitionKey: office });
    return r.status === 200 ? strip(r.body) : null;
  };

  try {
    /* ================= READ ================= */
    if (req.method === 'GET') {
      const q = req.query || {};

      if (q.access) {
        if (access.isAdmin) return send(200, { access: grantDocs });
        return send(200, { access: grantDocs.filter(g => g.id === identity.email) });
      }

      if (q.templates) {
        const office = String(q.templates);
        if (lvl(office) === 'none') return send(403, { error: 'No access to ' + office });
        const docs = (await listAll(SCHEDULES)).map(strip).filter(d => d.template && d.office === office);
        return send(200, { templates: docs });
      }

      if (q.requests) {
        let docs = (await listAll(REQUESTS)).map(strip);
        docs = docs.filter(d => {
          if (access.isAdmin || access.viewAll) return true;
          if (d.createdBy === identity.email || d.empId === me.id) return true;
          if (d.type === 'blackout' && identity.email === BLACKOUT_HR_APPROVER_EMAIL.toLowerCase()) return true;
          return lvl(d.office) === 'edit';
        });
        return send(200, { requests: docs });
      }

      let docs = (await listAll(SCHEDULES)).map(strip).filter(d => !d.template);
      const wanted = q.offices ? String(q.offices).split('|') : (q.office ? [String(q.office)] : null);
      if (wanted) docs = docs.filter(d => wanted.includes(d.office));
      if (q.weekKey) docs = docs.filter(d => d.weekKey === q.weekKey);
      /* scope: edit/view get the full doc; everyone else gets published weeks only,
         stripped to their own + open + offered shifts (§2.4, §2.6) */
      docs = docs.map(d => {
        if (lvl(d.office) !== 'none') return d;
        if (!d.published) return null;
        return { ...d, shifts: (d.shifts || []).filter(s => s.empId === me.id || s.open || s.offered), scopedToSelf: true };
      }).filter(Boolean);
      return send(200, { schedules: docs });
    }

    /* ================= WRITE ================= */
    let input = req.body;
    if (typeof input === 'string') { try { input = JSON.parse(input); } catch (e) { input = null; } }
    if (!input) return send(400, { error: 'body required' });
    /* legacy prototype publish (cells map, no action) is gone — everything is an action */
    const action = String(input.action || '');
    if (!action) return send(400, { error: 'action is required' });
    const office = String(input.office || '');
    const weekKey = String(input.weekKey || '');
    const okWeek = /^\d{4}-\d{2}-\d{2}$/.test(weekKey);

    /* ---- save: upsert a week's full shift list (managers & unpublished-week supervisors) ---- */
    if (action === 'save') {
      if (!office || !okWeek) return send(400, { error: 'office and weekKey are required' });
      if (lvl(office) !== 'edit') return send(403, { error: 'No edit access to ' + office });
      const existing = await getWeek(office, weekKey);
      if (existing && existing.published && access.isSupervisor && !access.isAdmin && !access.isManager) {
        return send(409, { error: 'Week is published — supervisor changes go through per-change approval', pendingRequired: true });
      }
      const shifts = (Array.isArray(input.shifts) ? input.shifts : []).map(cleanShift).filter(Boolean);
      const doc = { ...(existing || { id: `${weekKey}__${office}`, office, weekKey, published: false }), shifts };
      const saved = await putWeek(doc);
      return send(200, { ok: true, schedule: saved });
    }

    /* ---- edit: one change; queues for approval when a supervisor edits a published week ---- */
    if (action === 'edit') {
      if (!office || !okWeek) return send(400, { error: 'office and weekKey are required' });
      if (lvl(office) !== 'edit') return send(403, { error: 'No edit access to ' + office });
      const ch = input.change || {};
      const op = ['add', 'update', 'remove'].includes(ch.op) ? ch.op : null;
      const shift = op === 'remove' ? { id: String(ch.shiftId || '') } : cleanShift(ch.shift);
      if (!op || !shift || (op === 'remove' && !shift.id)) return send(400, { error: 'change {op, shift} is required' });
      const doc = (await getWeek(office, weekKey)) || { id: `${weekKey}__${office}`, office, weekKey, published: false, shifts: [] };

      const queue = doc.published && access.isSupervisor && !access.isAdmin && !access.isManager;
      if (queue) {
        const reqDoc = await putRequest({
          id: 'se-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
          type: 'edit', office, weekKey, op, shift,
          createdBy: identity.email, createdByName: nameOf(me),
          status: 'pending', createdAt: new Date().toISOString(),
        });
        for (const m of officeManagers(office)) await notice((m.workEmail || '').toLowerCase(), 'Schedule change needs your approval', `${nameOf(me)} ${op === 'remove' ? 'removed a shift' : op === 'add' ? 'added a shift' : 'changed a shift'} on the published ${office} week of ${weekKey}. Approve or reject it from Scheduling.`, { view: 'scheduler' });
        flushPushes();
        return send(200, { ok: true, pending: true, request: reqDoc });
      }
      const shifts = (doc.shifts || []).filter(s => s.id !== shift.id);
      if (op !== 'remove') shifts.push(shift);
      const saved = await putWeek({ ...doc, shifts });
      return send(200, { ok: true, schedule: saved });
    }

    /* ---- edit_decide: manager approves/rejects a queued supervisor change ---- */
    if (action === 'edit_decide') {
      if (!input.id || !office) return send(400, { error: 'id and office are required' });
      if (!canDecide(office)) return send(403, { error: 'Manager approval only' });
      const reqDoc = await getRequest(String(input.id), office);
      if (!reqDoc || reqDoc.type !== 'edit') return send(404, { error: 'request not found' });
      if (reqDoc.status !== 'pending') return send(409, { error: 'already decided' });
      const approve = !!input.approve;
      if (approve) {
        const doc = (await getWeek(office, reqDoc.weekKey)) || { id: `${reqDoc.weekKey}__${office}`, office, weekKey: reqDoc.weekKey, published: true, shifts: [] };
        const shifts = (doc.shifts || []).filter(s => s.id !== reqDoc.shift.id);
        if (reqDoc.op !== 'remove') shifts.push(reqDoc.shift);
        await putWeek({ ...doc, shifts });
      }
      const decided = await putRequest({ ...reqDoc, status: approve ? 'applied' : 'rejected', decidedBy: identity.email, decidedAt: new Date().toISOString() });
      await notice(reqDoc.createdBy, `Schedule change ${approve ? 'approved' : 'rejected'}`, `Your change to the ${office} week of ${reqDoc.weekKey} was ${approve ? 'approved and applied' : 'rejected — the schedule is unchanged'}.`, { view: 'scheduler' });
      flushPushes();
      return send(200, { ok: true, request: decided });
    }

    /* ---- publish: lock this office's week (D5) & notify ---- */
    if (action === 'publish') {
      if (!office || !okWeek) return send(400, { error: 'office and weekKey are required' });
      if (lvl(office) !== 'edit') return send(403, { error: 'No edit access to ' + office });
      const doc = await getWeek(office, weekKey);
      if (!doc) return send(404, { error: 'nothing saved for that week yet' });
      const saved = await putWeek({ ...doc, shifts: (doc.shifts || []).map(s => ({ ...s, pub: true })), published: true, publishedBy: identity.email, publishedAt: new Date().toISOString() });
      const shifts = saved.shifts || [];
      const ids = new Set(shifts.filter(s => s.empId).map(s => s.empId));
      const hours = Math.round(shifts.reduce((a, s) => a + Math.max(0, (parseInt(s.end, 10) * 60 + Number(s.end.split(':')[1]) - parseInt(s.start, 10) * 60 - Number(s.start.split(':')[1]))) / 60, 0));
      const scheduled = employees.filter(e => ids.has(e.id));
      const recipients = scheduled.map(e => normPhone(e.mobile || e.personalPhone || e.phone || e.cell)).filter(Boolean);
      let notify = { gchat: false, sms: 0, simulated: true, errors: [] };
      try { notify = await sendPublishNotifications({ office, weekKey, publishedBy: identity.email, shiftCount: shifts.length, hours, recipients }); }
      catch (e) { notify.errors = [e.message]; }
      for (const e of scheduled) await notice((e.workEmail || '').toLowerCase(), 'Your schedule is published', `The ${office} schedule for the week of ${weekKey} is published. See your shifts under My schedule.`, { view: 'myschedule' });
      flushPushes();
      return send(200, { ok: true, schedule: saved, notify });
    }

    /* ---- offer / retract: employee flags their own published shift (§2.6 step 1) ---- */
    if (action === 'offer' || action === 'retract') {
      if (!office || !okWeek || !input.shiftId) return send(400, { error: 'office, weekKey and shiftId are required' });
      const doc = await getWeek(office, weekKey);
      if (!doc || !doc.published) return send(404, { error: 'no published week found' });
      const shift = (doc.shifts || []).find(s => s.id === String(input.shiftId));
      if (!shift) return send(404, { error: 'shift not found' });
      if (shift.empId !== me.id) return send(403, { error: 'You can only offer your own shifts' });
      if (action === 'offer') { shift.offered = true; shift.offeredBy = me.id; }
      else {
        const open = (await listAll(REQUESTS)).map(strip).some(r => r.type === 'swap' && r.status === 'pending' && r.shiftId === shift.id);
        if (open) return send(409, { error: 'A claim on this shift is awaiting manager approval' });
        delete shift.offered; delete shift.offeredBy;
      }
      const saved = await putWeek(doc);
      return send(200, { ok: true, schedule: saved });
    }

    /* ---- claim: another employee claims an offered shift → manager approval (§2.6) ---- */
    if (action === 'claim') {
      if (!office || !okWeek || !input.shiftId) return send(400, { error: 'office, weekKey and shiftId are required' });
      const doc = await getWeek(office, weekKey);
      if (!doc || !doc.published) return send(404, { error: 'no published week found' });
      const shift = (doc.shifts || []).find(s => s.id === String(input.shiftId));
      if (!shift || (!shift.offered && !shift.open)) return send(404, { error: 'shift is not offered or open' });
      if (shift.empId === me.id) return send(400, { error: 'That is already your shift' });
      const dup = (await listAll(REQUESTS)).map(strip).some(r => r.type === 'swap' && r.status === 'pending' && r.shiftId === shift.id);
      if (dup) return send(409, { error: 'Someone already claimed this shift — awaiting manager approval' });
      const fromEmp = employees.find(e => e.id === shift.empId);
      const reqDoc = await putRequest({
        id: 'sw-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
        type: 'swap', office, weekKey, shiftId: shift.id,
        date: shift.date, start: shift.start, end: shift.end,
        fromEmpId: shift.empId, fromName: fromEmp ? nameOf(fromEmp) : '',
        toEmpId: me.id, toName: nameOf(me),
        createdBy: identity.email, status: 'pending', createdAt: new Date().toISOString(),
      });
      for (const m of officeManagers(office)) await notice((m.workEmail || '').toLowerCase(), 'Shift swap needs your approval', `${nameOf(me)} wants to take ${reqDoc.fromName || 'a teammate'}'s ${shift.date} ${shift.start}–${shift.end} shift at ${office}. Approve or reject it from Scheduling.`, { view: 'scheduler' });
      flushPushes();
      return send(200, { ok: true, request: reqDoc });
    }

    /* ---- swap_decide: manager approves/rejects a claim (§2.6 step 4) ---- */
    if (action === 'swap_decide') {
      if (!input.id || !office) return send(400, { error: 'id and office are required' });
      if (!canDecide(office)) return send(403, { error: 'Manager approval only' });
      const reqDoc = await getRequest(String(input.id), office);
      if (!reqDoc || reqDoc.type !== 'swap') return send(404, { error: 'request not found' });
      if (reqDoc.status !== 'pending') return send(409, { error: 'already decided' });
      const approve = !!input.approve;
      if (approve) {
        const doc = await getWeek(office, reqDoc.weekKey);
        const shift = doc && (doc.shifts || []).find(s => s.id === reqDoc.shiftId);
        if (!shift) return send(404, { error: 'shift no longer exists' });
        shift.empId = reqDoc.toEmpId;
        delete shift.offered; delete shift.offeredBy; delete shift.open;
        await putWeek(doc);
      }
      const decided = await putRequest({ ...reqDoc, status: approve ? 'approved' : 'rejected', decidedBy: identity.email, decidedAt: new Date().toISOString() });
      const fromEmp = employees.find(e => e.id === reqDoc.fromEmpId);
      const toEmp = employees.find(e => e.id === reqDoc.toEmpId);
      if (toEmp) await notice((toEmp.workEmail || '').toLowerCase(), `Shift claim ${approve ? 'approved' : 'rejected'}`, approve ? `The ${reqDoc.date} ${reqDoc.start}–${reqDoc.end} shift at ${office} is now yours.` : `Your claim on the ${reqDoc.date} shift was rejected — it stays with ${reqDoc.fromName || 'the original owner'} and remains open.`, { view: 'myschedule' });
      if (approve && fromEmp) await notice((fromEmp.workEmail || '').toLowerCase(), 'Your offered shift was taken', `${reqDoc.toName} now covers your ${reqDoc.date} ${reqDoc.start}–${reqDoc.end} shift at ${office}.`, { view: 'myschedule' });
      flushPushes();
      return send(200, { ok: true, request: decided });
    }

    /* ---- blackout_submit: employee's can't-work dates → HR first (§2.5) ---- */
    if (action === 'blackout_submit') {
      const dates = (Array.isArray(input.dates) ? input.dates : []).map(d => String(d)).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d)).slice(0, 60);
      if (!dates.length) return send(400, { error: 'at least one date is required' });
      const reqDoc = await putRequest({
        id: 'bo-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
        type: 'blackout', office: myOffice, empId: me.id, name: nameOf(me),
        dates: dates.sort(), reason: String(input.reason || '').slice(0, 500),
        createdBy: identity.email, status: 'hr_review', createdAt: new Date().toISOString(),
      });
      await notice(BLACKOUT_HR_APPROVER_EMAIL.toLowerCase(), 'Blackout dates need PTO confirmation', `${nameOf(me)} (${myOffice}) requested ${dates.length} blackout date${dates.length === 1 ? '' : 's'} starting ${dates[0]}. Confirm PTO coverage to send it to their manager.`, { view: 'scheduler' });
      flushPushes();
      return send(200, { ok: true, request: reqDoc });
    }

    /* ---- blackout_hr: Amanda (identity-checked) confirms PTO coverage ---- */
    if (action === 'blackout_hr') {
      if (!input.id || !office) return send(400, { error: 'id and office are required' });
      if (identity.email !== BLACKOUT_HR_APPROVER_EMAIL.toLowerCase()) return send(403, { error: 'Only ' + BLACKOUT_HR_APPROVER_NAME + ' can confirm PTO coverage' });
      const reqDoc = await getRequest(String(input.id), office);
      if (!reqDoc || reqDoc.type !== 'blackout') return send(404, { error: 'request not found' });
      if (reqDoc.status !== 'hr_review') return send(409, { error: 'not awaiting HR' });
      const approve = !!input.approve;
      const decided = await putRequest({ ...reqDoc, status: approve ? 'mgr_review' : 'denied', hrDecidedBy: identity.email, hrDecidedAt: new Date().toISOString() });
      if (approve) {
        for (const m of officeManagers(reqDoc.office)) await notice((m.workEmail || '').toLowerCase(), 'Blackout dates need your approval', `${reqDoc.name}'s blackout dates (${reqDoc.dates.length}, starting ${reqDoc.dates[0]}) passed the PTO check. Approve or reject them from Scheduling.`, { view: 'scheduler' });
      } else {
        await notice(reqDoc.createdBy, 'Blackout dates declined', 'HR could not confirm enough PTO to cover the dates you requested.', { view: 'myschedule' });
      }
      flushPushes();
      return send(200, { ok: true, request: decided });
    }

    /* ---- blackout_mgr: second approval — only now does it take effect ---- */
    if (action === 'blackout_mgr') {
      if (!input.id || !office) return send(400, { error: 'id and office are required' });
      if (!canDecide(office)) return send(403, { error: 'Manager approval only' });
      const reqDoc = await getRequest(String(input.id), office);
      if (!reqDoc || reqDoc.type !== 'blackout') return send(404, { error: 'request not found' });
      if (reqDoc.status !== 'mgr_review') return send(409, { error: 'not awaiting a manager' });
      const approve = !!input.approve;
      const decided = await putRequest({ ...reqDoc, status: approve ? 'approved' : 'denied', decidedBy: identity.email, decidedAt: new Date().toISOString() });
      await notice(reqDoc.createdBy, `Blackout dates ${approve ? 'approved' : 'denied'}`, approve ? `Your ${reqDoc.dates.length} blackout date${reqDoc.dates.length === 1 ? '' : 's'} are approved and now flag conflicts on the schedule.` : 'Your manager denied the blackout dates.', { view: 'myschedule' });
      flushPushes();
      return send(200, { ok: true, request: decided });
    }

    /* ---- access_set: admin assigns per-person-per-office levels (§4) ---- */
    if (action === 'access_set') {
      if (!access.isAdmin) return send(403, { error: 'Admin only' });
      const email = String(input.email || '').toLowerCase();
      const level = String(input.level || '');
      if (!email || !office || !['edit', 'view', 'none'].includes(level)) return send(400, { error: 'email, office and level (edit|view|none) are required' });
      const existing = grantDocs.find(g => g.id === email) || { id: email, grants: {} };
      const doc = { ...existing, grants: { ...(existing.grants || {}), [office]: level }, updatedBy: identity.email, updatedAt: new Date().toISOString() };
      const r = await cosmos({ verb: 'POST', resId: ACCESS, path: `/${ACCESS}/docs`, body: doc, partitionKey: doc.id, upsert: true });
      if (r.status !== 200 && r.status !== 201) return send(500, { error: 'grant write failed', status: r.status });
      return send(200, { ok: true, access: strip(r.body) });
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
      })).filter(s => s.empId || s.open).slice(0, 400);
      const doc = { id: 'template__' + office.replace(/[^\w-]/g, '_') + '__' + name.toLowerCase().replace(/[^\w-]/g, '_'), template: true, office, name, shifts, savedBy: identity.email, savedAt: new Date().toISOString() };
      const r = await cosmos({ verb: 'POST', resId: SCHEDULES, path: `/${SCHEDULES}/docs`, body: doc, partitionKey: office, upsert: true });
      if (r.status !== 200 && r.status !== 201) return send(500, { error: 'template write failed', status: r.status });
      return send(200, { ok: true, template: strip(r.body) });
    }
    if (action === 'template_delete') {
      if (!office || !input.id) return send(400, { error: 'office and id are required' });
      if (lvl(office) !== 'edit') return send(403, { error: 'No edit access to ' + office });
      const id = String(input.id);
      if (!id.startsWith('template__')) return send(400, { error: 'not a template id' });
      const r = await cosmos({ verb: 'DELETE', resId: `${SCHEDULES}/docs/${id}`, path: `/${SCHEDULES}/docs/${id}`, partitionKey: office });
      if (r.status !== 204 && r.status !== 404) return send(500, { error: 'template delete failed', status: r.status });
      return send(200, { ok: true });
    }

    return send(400, { error: 'unknown action' });
  } catch (err) {
    return send(500, { error: err.message || 'error' });
  }
};
