/* api/reghours/index.js — per-person regular working hours + overtime threshold.
   GET  /api/reghours  → profiles the caller may see (own always; all for viewAll/team)
   POST /api/reghours  → { action: 'save' | 'delete', profile | id }

   Its own endpoint, not folded into api/schedule, because this data has its own
   lifecycle: it is edited outside the weekly grid and is deliberately separate from
   BOTH the roster (permanent) and the week docs (change weekly). Same security shape
   as api/schedule & api/timeoff: valid Google token, domain lock, roles derived
   server-side from the live roster. No wage data (SCHEDULER.md D2).

   Doc (container `regularHours`, partition /id), one per employee:
     { id:'jdoe@puredental.com', empId, office, role, periodType:'weekly',
       overtimeThreshold:40,
       days:{ mon:{start:'07:00',end:'17:00',breakMins:30}, tue:null, ... },
       updatedBy, updatedAt } */

const { verifyGoogleToken, tokenFromReq } = require('../_shared/auth');
const { cosmos, listAll, strip, collPath, cosmosConfigured, loadAccessControl, applyAccessControl } = require('../_shared/cosmos');

const ALLOWED = ['puredental.com', 'foureversmile.com', 'puredentallab.com'];
const REGHOURS = collPath('regularHours');
const DOW = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

/* role derivation — same compact port used by api/schedule and api/timeoff */
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

/* sanitize a client-supplied profile into the canonical record */
function cleanProfile(p) {
  if (!p || typeof p !== 'object') return null;
  const t = (v, n) => String(v == null ? '' : v).slice(0, n || 60);
  const time = v => /^\d{1,2}:\d{2}$/.test(String(v || '')) ? String(v) : null;
  const id = t(p.id, 120).toLowerCase();
  if (!id) return null;
  const days = {};
  DOW.forEach(d => {
    const src = p.days && p.days[d];
    if (!src) { days[d] = null; return; }
    const start = time(src.start), end = time(src.end);
    if (!start || !end) { days[d] = null; return; }
    let br = Number(src.breakMins);
    if (!isFinite(br) || br < 0) br = 0;
    days[d] = { start, end, breakMins: Math.min(480, Math.round(br)) };
  });
  let ot = Number(p.overtimeThreshold);
  if (!isFinite(ot) || ot <= 0) ot = 40;
  return {
    id, empId: t(p.empId), office: t(p.office), role: t(p.role),
    periodType: 'weekly', overtimeThreshold: Math.min(168, ot), days,
  };
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

  try {
    /* resolve the caller and their roles from the live roster, every call */
    const employees = (await listAll(collPath('roster'))).map(strip);
    let ref = { users: [], managers: [] };
    try {
      const sup = (await listAll(collPath('appState'))).find(d => d.id === 'roster-support');
      if (sup) ref = { users: sup.users || [], managers: sup.managers || [] };
    } catch (e) {}
    const me = employees.find(e => (e.workEmail || '').toLowerCase() === identity.email);
    if (!me) return send(403, { error: 'No roster account for ' + identity.email });
    const usersByEmail = {}; (ref.users || []).forEach(u => { if (u.email) usersByEmail[u.email.toLowerCase()] = u; });
    try { applyAccessControl(usersByEmail, await loadAccessControl()); } catch (e) {}
    const managerEmails = new Set((ref.managers || []).map(m => (m.email || '').toLowerCase()).filter(Boolean));
    const access = perms(me, usersByEmail, managerEmails, employees);
    const myOffice = me.loc || me.location || 'Unassigned';
    const canEdit = access.isAdmin || access.isManager || access.isHR;

    /* ---------- READ ---------- */
    if (req.method === 'GET') {
      let docs = [];
      try { docs = (await listAll(REGHOURS)).map(strip); } catch (e) { docs = []; }
      if (!access.viewAll && !access.isManager && !access.isSupervisor) {
        docs = docs.filter(d => d.id === identity.email);
      } else if (!access.viewAll) {
        docs = docs.filter(d => d.office === myOffice || d.id === identity.email);
      }
      return send(200, { profiles: docs, canEdit });
    }

    /* ---------- WRITE ---------- */
    let input = req.body;
    if (typeof input === 'string') { try { input = JSON.parse(input); } catch (e) { input = null; } }
    if (!input || !input.action) return send(400, { error: 'action is required' });
    if (!canEdit) return send(403, { error: 'Managers, HR and admins set regular hours' });

    if (input.action === 'save') {
      const doc = cleanProfile(input.profile);
      if (!doc) return send(400, { error: 'a valid profile is required' });
      if (!access.viewAll && doc.office && doc.office !== myOffice) {
        return send(403, { error: 'You can only set regular hours for ' + myOffice });
      }
      doc.updatedBy = identity.email;
      doc.updatedAt = new Date().toISOString();
      const up = await cosmos({ verb: 'POST', resId: REGHOURS, path: `/${REGHOURS}/docs`, body: doc, partitionKey: doc.id, upsert: true });
      if (up.status !== 200 && up.status !== 201) return send(500, { error: 'save failed', status: up.status, detail: up.body });
      return send(200, { ok: true, profile: strip(up.body) });
    }

    if (input.action === 'delete') {
      const id = String(input.id || '').toLowerCase();
      if (!id) return send(400, { error: 'id is required' });
      const del = await cosmos({ verb: 'DELETE', resId: `${REGHOURS}/docs/${id}`, path: `/${REGHOURS}/docs/${id}`, partitionKey: id });
      if (del.status !== 204 && del.status !== 404) return send(500, { error: 'delete failed', status: del.status });
      return send(200, { ok: true });
    }

    return send(400, { error: 'unknown action' });
  } catch (err) {
    context.res = { status: 500, headers, body: JSON.stringify({ error: err.message || 'error' }) };
  }
};
