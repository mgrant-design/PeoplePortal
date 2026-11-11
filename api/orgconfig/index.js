/* api/orgconfig/index.js — the shared organization settings (appState doc "roster-support").
   GET  → offices, departments, titles, managers, weekStart, refLinks, flags, approvers;
          permission grants and offboarding records only for those who may see them.
   POST { section, value } → replaces one section. Admins, HR and leadership may save;
        flags (feature switches) and approvers are admin only (permission grants are saved through
        api/accesscontrol). Saves carry the doc's _etag,
        so a stale save answers 409 instead of overwriting someone else's change. */

const { handler, resolveCaller, HttpError } = require('../_shared/caller');
const { cosmos, queryAll, strip, collPath, loadSupportForWrite } = require('../_shared/cosmos');
const { currentStep, whoFor } = require('../_shared/approval-flow');
const { writeNotice } = require('../_shared/notices');
const { broadcast } = require('../_shared/push');
const { describeApproval, KIND_LABEL } = require('../_shared/approvals-text');
const { FEATURE_DEFAULTS, isActive, offboardingInTree, seesAllOn } = require('../_shared/access-rules');

// permission grants are saved through api/accesscontrol only
const SECTIONS = ['offices', 'departments', 'titles', 'managers', 'offboarding', 'refLinks'];
const WEEK_STARTS = [0, 1, 2];
const APP = collPath('appState');
const NO_APPROVERS = { timeoffFinal: '', offboarding: [], offer: '' };
const APPROVALS = collPath('approvals');

/* requests with a step still to be decided whose approvers come from a setting that just
   changed go to the new approvers; those on the step it waits on now are told */
async function rerouteWaiting(context, c, before, after) {
  const changed = Object.keys(after).filter(k => JSON.stringify(before[k] || '') !== JSON.stringify(after[k] || ''));
  if (!changed.length) return;
  const from = { email: c.identity.email, name: c.me.name || `${c.me.first || ''} ${c.me.last || ''}`.trim() };
  let moved = false;
  for (const r of await queryAll(APPROVALS, [['status', '=', 'pending']])) {
    const i = currentStep(r);
    // every step still to be decided whose approvers come from a changed setting, not only the current one
    let touched = false;
    const steps = r.steps.map((s) => {
      const source = String(s.source || '');
      if (s.status !== 'pending' || !source.startsWith('setting:') || !changed.includes(source.slice('setting:'.length))) return s;
      let who;
      try { who = whoFor(source, null, after, c.employees); } catch (e) { return s; }   // nobody set now: stays with whoever it waits on
      if (JSON.stringify(who) === JSON.stringify(s.who)) return s;
      touched = true;
      return { ...s, who };
    });
    if (!touched) continue;
    const next = { ...strip(r), steps, waitingOn: i >= 0 ? steps[i].who : [] };
    const up = await cosmos({ verb: 'POST', resId: APPROVALS, path: `/${APPROVALS}/docs`, body: next, partitionKey: next.id, upsert: true, ifMatch: r._etag });
    if (up.status === 412) continue;   // decided meanwhile
    if (up.status !== 200 && up.status !== 201) { context.log.warn('approval not moved to the new approver', next.id, up.status); continue; }
    moved = true;
    if (i < 0 || steps[i] === r.steps[i]) continue;   // the step it waits on now did not change: nobody new to tell
    const d = describeApproval(next);
    for (const to of steps[i].who.filter(e => !r.steps[i].who.includes(e))) {
      try {
        await writeNotice(context, { to, from, recipient: c.employees.find(e => (e.workEmail || '').toLowerCase() === to), title: `${KIND_LABEL[next.kind] || 'Request'} needs your approval`,
          body: [d.who, d.what, d.when].filter(Boolean).join(' · '), category: 'action', deepLink: { view: 'approvals', approvalId: next.id } });
      } catch (e) { context.log.warn('approval notice failed', e); }
    }
  }
  if (moved) broadcast(context, 'approvals-changed', {});
}

/* approvers: { timeoffFinal: email, offboarding: email[], offer: email }, each an active roster person */
function cleanApprovers(v, employees) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new HttpError(400, 'approvers must be an object');
  const roster = new Set(employees.filter(isActive).map(e => (e.workEmail || '').toLowerCase()).filter(Boolean));
  const one = (x) => {
    const e = String(x || '').trim().toLowerCase();
    if (e && !roster.has(e)) throw new HttpError(400, 'Not an active person on the roster: ' + e);
    return e;
  };
  if (v.offboarding !== undefined && !Array.isArray(v.offboarding)) throw new HttpError(400, 'offboarding approvers must be a list');
  return { timeoffFinal: one(v.timeoffFinal), offboarding: [...new Set((v.offboarding || []).map(one).filter(Boolean))], offer: one(v.offer) };
}

module.exports = handler(['GET', 'POST'], async ({ context, req, body }) => {
  const c = await resolveCaller(req);
  const { caps, flags } = c.access;

  if (req.method === 'GET') {
    const s = c.support || {};
    const users = s.users || [];
    return { status: 200, body: {
      offices: s.offices || [], departments: s.departments || [], titles: s.titles || [], managers: s.managers || [],
      users: caps.viewAll ? users : users.filter(u => (u.email || '').toLowerCase() === c.identity.email),
      offboarding: !caps.offboardView ? [] : seesAllOn(c.access, 'offboarding') ? (s.offboarding || []) : offboardingInTree(s.offboarding || [], c.me, c.employees),
      weekStart: Number.isFinite(s.weekStart) ? s.weekStart : 1,
      refLinks: s.refLinks || [],
      flags: s.flags || {},
      approvers: { ...NO_APPROVERS, ...(s.approvers || {}) },
    } };
  }

  if (!caps.viewAll) throw new HttpError(403, 'Not allowed to edit org config');
  const input = body || {};
  const isWeekStart = input.section === 'weekStart';
  const isFlags = input.section === 'flags';
  const isApprovers = input.section === 'approvers';
  if (isApprovers) {
    if (!flags.isAdmin) throw new HttpError(403, 'Only an administrator can set approvers');
    input.value = cleanApprovers(input.value, c.employees);
  }
  if (isFlags) {
    if (!flags.isAdmin) throw new HttpError(403, 'Only an administrator can turn modules on or off');
    const v = input.value;
    if (!v || typeof v !== 'object' || Array.isArray(v)) throw new HttpError(400, 'flags must be an object of module switches');
    const bad = Object.keys(v).filter(k => !Object.prototype.hasOwnProperty.call(FEATURE_DEFAULTS, k) || typeof v[k] !== 'boolean');
    if (bad.length) throw new HttpError(400, 'Unknown module or not true/false: ' + bad.join(', '));
  }
  if (isWeekStart && !WEEK_STARTS.includes(Number(input.value))) throw new HttpError(400, 'weekStart must be 0 (Sunday), 1 (Monday) or 2 (Tuesday)');
  if (!isWeekStart && !isFlags && !isApprovers && (!SECTIONS.includes(input.section) || !Array.isArray(input.value))) {
    throw new HttpError(400, 'Body must be { section: one of ' + SECTIONS.join('|') + '|flags|approvers|weekStart, value }');
  }

  // appState is partitioned by /type
  const raw = await loadSupportForWrite();
  // the screen sends the section as it last saw it; a different stored value means someone else saved first
  if (Object.prototype.hasOwnProperty.call(input, 'previous')) {
    const norm = (v) => (isWeekStart ? (Number.isFinite(Number(v)) ? Number(v) : 1)
      : isFlags ? { ...FEATURE_DEFAULTS, ...(v && typeof v === 'object' ? v : {}) }
      : isApprovers ? { ...NO_APPROVERS, ...(v && typeof v === 'object' ? v : {}) }
      : (Array.isArray(v) ? v : []));
    const stored = raw ? raw[input.section] : undefined;
    if (JSON.stringify(norm(stored)) !== JSON.stringify(norm(input.previous))) throw new HttpError(409, 'Someone else just saved. Reload and try again.');
  }
  const base = raw ? strip(raw) : { id: 'roster-support', type: 'roster-support' };
  const next = { ...base, type: base.type || 'roster-support', [input.section]: isWeekStart ? Number(input.value) : input.value, updatedBy: c.identity.email, updatedAt: new Date().toISOString() };
  const up = await cosmos({ verb: 'POST', resId: APP, path: `/${APP}/docs`, body: next, partitionKey: next.type, upsert: true, ifMatch: raw ? raw._etag : undefined });
  if (up.status === 412) throw new HttpError(409, 'Someone else just saved. Reload and try again.');
  if (up.status !== 200 && up.status !== 201) throw new Error('org config write failed: ' + up.status);
  // the setting is saved; a failure moving the waiting requests is logged and does not undo that
  if (isApprovers) {
    try { await rerouteWaiting(context, c, { ...NO_APPROVERS, ...((raw && raw.approvers) || {}) }, input.value); }
    catch (e) { context.log.error('moving waiting requests to the new approver failed', e); }
  }
  return { status: 200, body: { ok: true, [input.section]: input.value } };
});
