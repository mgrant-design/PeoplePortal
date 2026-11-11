const crypto = require('crypto');
const { handler, resolveCaller } = require('../_shared/caller');
const { cosmos, collPath } = require('../_shared/cosmos');
const { domainAllowed, deriveAccessCore, reportingTree: reportingTreeOf, offboardingInTree, seesAllOn, monthDay } = require('../_shared/access-rules');
const { broadcast } = require('../_shared/push');
const blobs = require('../_shared/blobs');

/* ---- roster writes (POST) ----
   The roster in Cosmos is the source of truth: nothing external regenerates it, so a
   record created here is permanent and its id is ours to mint. Manager-and-above only.

   PARTITION KEY, and why it looks odd: the container is partitioned on /office, but no
   existing document carries an `office` field, so all 184 live in Cosmos' "undefined"
   partition. On the wire that is [{}] — NOT [null], which is a different partition that
   reads cannot see. `cosmos()` sends JSON.stringify([partitionKey]), so passing {} is
   what puts a new record alongside the existing ones. Verified against the live
   container before this was written. Populating /office properly is a separate
   migration: a partition key value cannot be changed in place, so every document has to
   be deleted and re-inserted. Do not half-do it here. */
const ROSTER_PK = {};

/* fields a manager may set. Deliberately a whitelist: a roster document also carries
   provider/credential and system fields (npi, dea, license, paychexId, denticonId,
   windowsLogin) that must not be settable from a generic edit form. */
const WRITABLE = ['first', 'middle', 'last', 'jobTitle', 'department', 'location', 'manager',
  'managerEmail', 'workEmail', 'personalEmail', 'mobile', 'startDate', 'status', 'employmentType'];
const EMPLOYMENT_TYPES = ['', 'Full-time', 'Part-time', 'Per diem'];
const STATUSES = ['Active', 'Suspended', 'Terminated'];

const cleanStr = (v, n) => String(v == null ? '' : v).trim().slice(0, n || 120);
const emailOk = e => /^[^@\s]+@[^@\s]+$/.test(e) && domainAllowed(e);

/* fields only company-wide editors may change: they decide who someone reports to and what
   they can see. Managers may not change them until the owner names a manager's fields. */
const MANAGER_LOCKED = ['jobTitle', 'department', 'managerEmail', 'workEmail'];
const FIELD_NAMES = { jobTitle: 'job title', department: 'department', managerEmail: 'manager email', workEmail: 'work email' };

/* Compare two written names for equality without demanding an exact keystroke match.
   NFD splits an accented letter into base + combining mark, so stripping the marks folds
   Guzmán onto Guzman for COMPARISON only — nothing stored is ever altered, because the
   spelling of someone's name is theirs. Also ignores case, punctuation and spacing. */
const foldName = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

/* statuses that deactivate someone. Both need a permission AND a signature: the
   signature is friction, not proof — the Google token already establishes identity —
   so its job is to make the action deliberate and leave a record of who did it. */
const SIGNED_STATUSES = ['Terminated', 'Suspended'];

/* 8 hex chars — the same shape as the existing generated ids — retried on collision.
   Ids are opaque everywhere (shifts reference employees by id), so the only requirement
   is that one is never reused. */
function mintId(taken) {
  for (let i = 0; i < 50; i++) {
    const id = crypto.randomBytes(4).toString('hex');
    if (!taken.has(id)) return id;
  }
  return null;
}

function scopedEmployees(me, access, employees) {
  if (access.viewAll || access.seeAll) return employees;
  if (access.viewTeam) return reportingTreeOf(me, employees);
  return employees.filter(e => e.id === me.id);
}

const strip = ({ _rid, _self, _etag, _attachments, _ts, ...rest }) => rest;

/* the reporting tree only: See Everyone widens what a person sees, never what they may edit */
function reportingTree(me, access, employees) {
  return scopedEmployees(me, { ...access, viewAll: false, seeAll: false }, employees);
}

/* Which permissions a status change needs: the status being entered if it is signed, and
   the status being left if it is signed. Returns [] when no signature is needed. */
function statusGates(from, to) {
  if (!to || to === from) return [];
  return [...new Set([to, from].filter(s => SIGNED_STATUSES.includes(s)))];
}

function checkSignature(input, me, gates, verb) {
  const signature = cleanStr(input.signature, 120);
  const myName = `${me.first || ''} ${me.last || ''}`.trim();
  if (!signature) return { error: { status: 400, body: { error: 'A signature is required to ' + verb, needsSignature: true, signAs: myName } } };
  if (foldName(signature) !== foldName(myName)) return { error: { status: 400, body: { error: `The signature must match your own name (${myName}).`, needsSignature: true, signAs: myName } } };
  return { signature, myName };
}

module.exports = handler(['GET', 'POST'], async ({ context, req, body: input }) => {
  const c = await resolveCaller(req);
  const { identity, me } = c;
  const allEmployees = c.employees;
  const sup = c.support || {};
  const ref = { offices: sup.offices || [], departments: sup.departments || [], titles: sup.titles || [], managers: sup.managers || [], users: sup.users || [], offboarding: sup.offboarding || [], weekStart: Number.isFinite(sup.weekStart) ? sup.weekStart : 1, refLinks: sup.refLinks || [], flags: sup.flags || {}, approvers: { timeoffFinal: '', offboarding: [], offer: '', ...(sup.approvers || {}) } };
  const { flags, caps, seeAll } = c.access;
  const access = {
    viewAll: caps.viewAll, viewTeam: caps.viewTeam, seeAll: seeAll.on,
    canWrite: flags.isAdmin || flags.isHR || flags.isExec || flags.isManager,
    terminate: caps.terminate, suspend: caps.suspend,
  };
  const send = (status, body) => ({ status, body });
  /* outside HR, leadership and admins, other people's birthdays go out without the year */
  const shown = (e) => (caps.viewAll || e.id === me.id || !e.birthdate) ? e : { ...e, birthdate: monthDay(e.birthdate) };
  /* See Everyone for other pages sends everyone for those pages, but personal details only
     for the person's own reporting tree */
  const PERSONAL = ['mobile', 'personalEmail', 'birthdate', 'address', 'emergencyName', 'emergencyPhone'];
  const withoutPersonal = (e) => { const out = { ...e }; PERSONAL.forEach(k => delete out[k]); return out; };
    /* ================= WRITE ================= */
    if (req.method === 'POST') {
      /* managers and above; supervisors are excluded */
      if (!access.canWrite) return send(403, { error: 'Managers and above only' });
      if (!input) return send(400, { error: 'body required' });
      const action = String(input.action || '');

      /* whitelist + normalise an incoming patch; returns { patch } or { error } */
      const takePatch = (src, forCreate, selfId) => {
        const patch = {};
        for (const k of WRITABLE) if (Object.prototype.hasOwnProperty.call(src, k)) patch[k] = cleanStr(src[k], k === 'workEmail' || k === 'personalEmail' ? 160 : 120);
        if (patch.status && !STATUSES.includes(patch.status)) return { error: 'status must be one of ' + STATUSES.join(', ') };
        if (patch.employmentType && !EMPLOYMENT_TYPES.includes(patch.employmentType)) return { error: 'employmentType must be one of ' + EMPLOYMENT_TYPES.filter(Boolean).join(', ') };
        if (forCreate) {
          for (const k of ['first', 'last', 'workEmail', 'location']) {
            if (!patch[k]) return { error: k + ' is required' };
          }
        }
        if (patch.workEmail !== undefined) {
          /* the join key for the entire app — auth, scheduling, notices and regular-hours
             profiles all resolve people by it, so it must be present, valid and unique */
          const em = patch.workEmail.toLowerCase();
          if (!emailOk(em)) return { error: 'workEmail must be a company address' };
          const clash = allEmployees.find(e => (e.workEmail || '').toLowerCase() === em && e.id !== selfId);
          if (clash) return { error: 'Another roster record already uses ' + em };
          patch.workEmail = em;
        }
        if (patch.personalEmail && !/^[^@\s]+@[^@\s]+$/.test(patch.personalEmail)) return { error: 'personalEmail is not a valid address' };
        return { patch };
      };

      const stamp = { updatedBy: identity.email, updatedAt: new Date().toISOString() };

      if (action === 'create') {
        const { patch, error } = takePatch(input.employee || {}, true, null);
        if (error) return send(400, { error });
        if (!access.viewAll) {
          const would = deriveAccessCore({ me: patch, perms: {}, hasReports: false, isListedManager: false });
          if (would.caps.viewAll) return send(403, { error: 'Only HR, leadership or an admin can add someone with that title or department' });
        }
        const createGates = statusGates('Active', patch.status || 'Active');
        for (const g of createGates) {
          const need = g === 'Terminated' ? 'terminate' : 'suspend';
          if (!access[need]) return send(403, { error: `You don't have permission to add someone as ${g}.`, needsPermission: need });
        }
        if (createGates.length) { const sig = checkSignature(input, me, createGates, 'add someone as ' + patch.status); if (sig.error) return sig.error; }
        const id = mintId(new Set(allEmployees.map(e => e.id)));
        if (!id) return send(500, { error: 'could not allocate an id' });
        const doc = { id, status: 'Active', ...patch, createdBy: identity.email, createdAt: new Date().toISOString(), ...stamp };
        const r = await cosmos({ verb: 'POST', resId: collPath('roster'), path: `/${collPath('roster')}/docs`, body: doc, partitionKey: ROSTER_PK, upsert: false });
        if (r.status !== 200 && r.status !== 201) throw new Error('roster create failed: ' + r.status);
        broadcast(context, 'roster-changed', { id, action: 'create' });
        return send(200, { ok: true, employee: shown(strip(r.body)) });
      }

      if (action === 'update') {
        const id = cleanStr(input.id, 60);
        if (!id) return send(400, { error: 'id is required' });
        const existing = allEmployees.find(e => e.id === id);
        if (!existing) return send(404, { error: 'no roster record with that id' });
        if (!access.viewAll) {
          if (existing.id === me.id) return send(403, { error: "You can't edit your own record. Ask HR." });
          const team = new Set(reportingTree(me, access, allEmployees).map(e => e.id));
          if (!team.has(existing.id)) return send(403, { error: "That person isn't on your team" });
        }
        const { patch, error } = takePatch(input.patch || {}, false, id);
        if (error) return send(400, { error });
        if (!Object.keys(patch).length) return send(400, { error: 'nothing to update' });
        if (!access.viewAll) {
          const locked = MANAGER_LOCKED.filter(k => k in patch && patch[k] !== (existing[k] || ''));
          if (locked.length) return send(403, { error: 'Only HR, leadership or an admin can change the ' + locked.map(k => FIELD_NAMES[k]).join(', ') });
        }

        /* deactivating someone: separate permission, and a signature that must match
           the signer's own name. Checked here rather than trusted from the client. */
        let auditDoc = null;
        const to = patch.status;
        const from = existing.status || 'Active';
        const gates = statusGates(from, to);
        if (gates.length) {
          for (const g of gates) {
            const need = g === 'Terminated' ? 'terminate' : 'suspend';
            if (!access[need]) return send(403, { error: `You don't have permission to change someone ${g === to ? 'to' : 'from'} ${g}.`, needsPermission: need });
          }
          const sig = checkSignature(input, me, gates, 'change someone to ' + to);
          if (sig.error) return sig.error;
          const { signature, myName } = sig;
          const at = new Date().toISOString();
          const date = at.slice(0, 10);
          auditDoc = {
            id: 'aud-' + Date.now() + '-' + crypto.randomBytes(3).toString('hex'),
            date, kind: 'status-change',
            targetId: existing.id, targetName: `${existing.first || ''} ${existing.last || ''}`.trim(),
            targetEmail: (existing.workEmail || '').toLowerCase(),
            from: existing.status || '', to,
            reason: cleanStr(input.reason, 1000),
            signature, byEmail: identity.email, byName: myName, at,
          };
        }

        const doc = { ...existing, ...patch, ...stamp };
        const r = await cosmos({ verb: 'POST', resId: collPath('roster'), path: `/${collPath('roster')}/docs`, body: doc, partitionKey: ROSTER_PK, upsert: true });
        if (r.status !== 200 && r.status !== 201) throw new Error('roster update failed: ' + r.status);
        /* audit AFTER the record is safely written — a failed audit must not lose the
           change, but an unrecorded deactivation is worth surfacing, so it is reported */
        let audited = null;
        if (auditDoc) {
          try {
            const a = await cosmos({ verb: 'POST', resId: collPath('audit'), path: `/${collPath('audit')}/docs`, body: auditDoc, partitionKey: auditDoc.date, upsert: true });
            audited = (a.status === 200 || a.status === 201);
          } catch (e) { audited = false; }
        }
        // someone who has left keeps no profile photo; the nightly cleanup retries a failed delete
        if (to === 'Terminated' && from !== 'Terminated') {
          try { await blobs.containerClient('photos').getBlockBlobClient(existing.id).deleteIfExists(); }
          catch (e) { context.log.warn('photo delete failed', e); }
        }
        broadcast(context, 'roster-changed', { id, action: 'update' });
        return send(200, { ok: true, employee: shown(strip(r.body)), ...(auditDoc ? { audited } : {}) });
      }

      return send(400, { error: 'unknown action — expected create or update' });
    }

    let visible = scopedEmployees(me, access, allEmployees);
    if (!caps.viewAll && access.seeAll && !seesAllOn(c.access, 'emprecord')) {
      const tree = new Set([me.id, ...reportingTree(me, access, allEmployees).map(e => e.id)]);
      visible = visible.map(e => tree.has(e.id) ? e : withoutPersonal(e));
    }

    /* The Directory is company-wide for every access level. Anyone who is not already
       receiving the full roster gets this alongside it: every active employee, work
       contact only. Mobile numbers, personal email and date of birth are deliberately
       absent — those stay with the people the caller can actually see. */
    /* other people's permission grants and the offboarding records stay with those who need them */
    const myEmail = identity.email;
    const body = {
      employees: visible.map(shown), ...ref,
      users: access.viewAll ? ref.users : ref.users.filter(u => (u.email || '').toLowerCase() === myEmail),
      offboarding: !caps.offboardView ? [] : seesAllOn(c.access, 'offboarding') ? ref.offboarding : offboardingInTree(ref.offboarding, me, allEmployees),
    };
    if (visible.length !== allEmployees.length) {
      body.directory = allEmployees.filter(e => e.status === 'Active').map(e => ({
        id: e.id, first: e.first, last: e.last, jobTitle: e.jobTitle, department: e.department,
        location: e.location, workEmail: e.workEmail, phoneExt: e.phoneExt, provider: e.provider,
        providerType: e.providerType, manager: e.manager, startDate: e.startDate, status: e.status,
      }));
    }

    return send(200, body);
});
