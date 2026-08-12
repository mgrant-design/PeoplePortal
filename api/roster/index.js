const https = require('https');
const crypto = require('crypto');
const { verifyGoogleToken, tokenFromReq } = require('../_shared/auth');
const { loadAccessControl, cosmos, collPath } = require('../_shared/cosmos');

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
const WRITE_DOMAINS = ['puredental.com', 'foureversmile.com', 'puredentallab.com'];

const cleanStr = (v, n) => String(v == null ? '' : v).trim().slice(0, n || 120);
const emailOk = e => /^[^@\s]+@[^@\s]+$/.test(e) && WRITE_DOMAINS.includes(e.split('@')[1].toLowerCase());

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

function getAuthHeader(verb, resourceType, resourceId, date, key) {
  const text = `${verb.toLowerCase()}\n${resourceType.toLowerCase()}\n${resourceId}\n${date.toLowerCase()}\n\n`;
  const sig = crypto.createHmac('sha256', Buffer.from(key, 'base64')).update(text).digest('base64');
  return encodeURIComponent(`type=master&ver=1.0&sig=${sig}`);
}

function cosmosGet(endpoint, key, resourceId, continuation) {
  return new Promise((resolve, reject) => {
    const date = new Date().toUTCString();
    const auth = getAuthHeader('get', 'docs', resourceId, date, key);
    const url = new URL('/' + resourceId + '/docs', endpoint);
    const headers = {
      'Authorization': auth, 'x-ms-date': date, 'x-ms-version': '2018-12-31',
      'Accept': 'application/json', 'Content-Type': 'application/json',
    };
    if (continuation) headers['x-ms-continuation'] = continuation;
    const options = { hostname: url.hostname, path: url.pathname, method: 'GET', headers };
    const req = https.request(options, (res) => {
      let data = ''; res.on('data', c => data += c);
      res.on('end', () => { try { resolve({ status: res.statusCode, body: JSON.parse(data), continuation: res.headers['x-ms-continuation'] }); } catch (e) { reject(new Error('parse: ' + data)); } });
    });
    req.on('error', reject); req.end();
  });
}

/* A plain feed GET only returns ONE PAGE of documents. Without following the
   continuation token, any container past the page limit silently drops the rest —
   e.g. an employee added after the roster grew past ~100 docs would never be found. */
async function cosmosGetAll(endpoint, key, resourceId) {
  let docs = [], continuation;
  do {
    const res = await cosmosGet(endpoint, key, resourceId, continuation);
    if (res.status !== 200) return res;
    docs = docs.concat(res.body.Documents || []);
    continuation = res.continuation;
  } while (continuation);
  return { status: 200, body: { Documents: docs } };
}

// ---- scoping logic, ported from rbac.jsx (deriveAccess + scopedEmployees) ----
function normLoc(l) {
  const s = (l || '').toLowerCase();
  if (!s) return 'Unassigned';
  if (s.includes('remote')) return 'Remote';
  if (s.includes('hauppauge')) return 'Hauppauge';
  if (s.includes('garden')) return 'Garden City';
  if (s.includes('manorville')) return 'Manorville';
  if (s.includes('wading')) return 'Wading River';
  if (s.includes('islandia')) return 'Islandia';
  if (s.includes('jersey')) return 'New Jersey';
  if (s.includes('buffalo')) return 'Buffalo';
  return l;
}

function deriveAccess(me, usersByEmail, managerEmails, employees) {
  const perms = usersByEmail[(me.workEmail || '').toLowerCase()] || {};
  const dept = (me.department || '').toLowerCase();
  const title = (me.jobTitle || '').toLowerCase();
  const meEmail = (me.workEmail || '').toLowerCase();

  const isExec = /\b(ceo|chief|coo|cfo|president|owner|principal)\b/.test(title) || ['leadership', 'management team', 'management', 'pure management'].includes(dept);
  const isHR = /human resources|payroll/.test(dept) || /\b(human resources|payroll|people ops)\b/.test(title);
  const isAccounting = /accounting/.test(dept) || /\b(controller|accountant|bookkeeper)\b/.test(title);
  const hasReports = employees.some(e => e.managerEmail && e.managerEmail.toLowerCase() === meEmail);
  const isSupervisor = (!!perms.supervisor || /\b(supervisor|team lead|lead)\b/.test(title)) && !/\b(manager|director)\b/.test(title) && !hasReports;
  const isManager = (!!perms.manager || me.isManager || managerEmails.has(meEmail) || hasReports || /\b(manager|director)\b/.test(title)) && !isSupervisor;
  const isAdmin = !!perms.admin;

  const viewAll = isAdmin || isHR || isExec;
  const viewTeam = isManager || isSupervisor;
  /* canWrite / terminate / suspend mirror rbac.jsx:99-101 exactly, so the server enforces
     the same permissions the HR Admin screen hands out. They are returned alongside the
     view flags rather than recomputed by callers. */
  return {
    viewAll, viewTeam, isAdmin, isHR, isExec, isManager, isSupervisor, isAccounting,
    canWrite: isAdmin || isHR || isExec || isManager,
    terminate: !!perms.canTerminate || isAdmin || isHR,
    suspend: !!perms.canSuspend || isAdmin || isHR,
  };
}

function scopedEmployees(me, access, employees) {
  if (access.viewAll) return employees;
  const meEmail = (me.workEmail || '').toLowerCase();
  if (access.viewTeam) {
    const set = new Set([me.id]);
    const myEmails = new Set([meEmail]);
    let changed = true;
    while (changed) {
      changed = false;
      employees.forEach(e => {
        if (!set.has(e.id) && e.managerEmail && myEmails.has(e.managerEmail.toLowerCase())) {
          set.add(e.id); myEmails.add((e.workEmail || '').toLowerCase()); changed = true;
        }
      });
    }
    return employees.filter(e => set.has(e.id));
  }
  return employees.filter(e => e.id === me.id);
}

module.exports = async function (context, req) {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Google-Token',
  };
  if (req.method === 'OPTIONS') { context.res = { status: 204, headers }; return; }

  // --- identity: require a valid Google token ---
  let identity;
  try {
    identity = await verifyGoogleToken(tokenFromReq(req));
  } catch (e) {
    context.res = { status: 401, headers, body: JSON.stringify({ error: 'Not authenticated', detail: e.message }) };
    return;
  }
  // domain lock, server-side
  const allowedDomains = ['puredental.com', 'foureversmile.com', 'puredentallab.com'];
  const domain = identity.email.split('@')[1] || '';
  if (!allowedDomains.includes(domain)) {
    context.res = { status: 403, headers, body: JSON.stringify({ error: 'Domain not allowed' }) };
    return;
  }

  const endpoint = (process.env.COSMOS_ENDPOINT || '').replace(/\/$/, '');
  const key = process.env.COSMOS_KEY || '';
  const db = process.env.COSMOS_DB || 'portal';
  if (!endpoint || !key) { context.res = { status: 500, headers, body: JSON.stringify({ error: 'Missing Cosmos config' }) }; return; }

  const strip = ({ _rid, _self, _etag, _attachments, _ts, ...rest }) => rest;

  try {
    const rosterRes = await cosmosGetAll(endpoint, key, `dbs/${db}/colls/roster`);
    if (rosterRes.status !== 200) { context.res = { status: 500, headers, body: JSON.stringify({ error: 'roster read failed', status: rosterRes.status }) }; return; }
    const allEmployees = (rosterRes.body.Documents || []).map(strip);

    // reference data (optional)
    let ref = { offices: [], departments: [], titles: [], managers: [], users: [], offboarding: [], weekStart: 1 };
    try {
      const appRes = await cosmosGetAll(endpoint, key, `dbs/${db}/colls/appState`);
      if (appRes.status === 200) {
        const sup = (appRes.body.Documents || []).find(d => d.id === 'roster-support');
        if (sup) ref = { offices: sup.offices||[], departments: sup.departments||[], titles: sup.titles||[], managers: sup.managers||[], users: sup.users||[], offboarding: sup.offboarding||[], weekStart: Number.isFinite(sup.weekStart) ? sup.weekStart : 1 };
      }
    } catch (e) {}

    // Fold the dedicated accessControl store into the users list (authoritative for
    // permission grants) so server scoping and the client both see final permissions.
    try {
      const acc = await loadAccessControl();
      if (acc.length) {
        const idx = {}; ref.users.forEach((u, i) => { if (u && u.email) idx[u.email.toLowerCase()] = i; });
        acc.forEach(a => { if (!a || !a.email) return; const k = a.email.toLowerCase(); if (idx[k] != null) ref.users[idx[k]] = { ...ref.users[idx[k]], ...a }; else ref.users.push(a); });
      }
    } catch (e) {}

    // find the caller in the roster
    const me = allEmployees.find(e => (e.workEmail || '').toLowerCase() === identity.email);
    if (!me) { context.res = { status: 403, headers, body: JSON.stringify({ error: 'No roster account for ' + identity.email }) }; return; }

    // build lookups for scoping
    const usersByEmail = {};
    (ref.users || []).forEach(u => { if (u.email) usersByEmail[u.email.toLowerCase()] = u; });
    const managerEmails = new Set((ref.managers || []).map(m => (m.email || '').toLowerCase()).filter(Boolean));

    const access = deriveAccess(me, usersByEmail, managerEmails, allEmployees);

    /* ================= WRITE ================= */
    if (req.method === 'POST') {
      const send = (status, body) => { context.res = { status, headers, body: JSON.stringify(body) }; };
      /* "managers or above" — supervisors are deliberately excluded; deriveAccess()
         already treats isManager and isSupervisor as mutually exclusive. */
      if (!access.canWrite) return send(403, { error: 'Managers and above only' });

      let input = req.body;
      if (typeof input === 'string') { try { input = JSON.parse(input); } catch (e) { input = null; } }
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
          if (!emailOk(em)) return { error: 'workEmail must be a company address (' + WRITE_DOMAINS.join(', ') + ')' };
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
        const id = mintId(new Set(allEmployees.map(e => e.id)));
        if (!id) return send(500, { error: 'could not allocate an id' });
        const doc = { id, status: 'Active', ...patch, createdBy: identity.email, createdAt: new Date().toISOString(), ...stamp };
        const r = await cosmos({ verb: 'POST', resId: collPath('roster'), path: `/${collPath('roster')}/docs`, body: doc, partitionKey: ROSTER_PK, upsert: false });
        if (r.status !== 200 && r.status !== 201) return send(500, { error: 'roster write failed', status: r.status });
        return send(200, { ok: true, employee: strip(r.body) });
      }

      if (action === 'update') {
        const id = cleanStr(input.id, 60);
        if (!id) return send(400, { error: 'id is required' });
        const existing = allEmployees.find(e => e.id === id);
        if (!existing) return send(404, { error: 'no roster record with that id' });
        const { patch, error } = takePatch(input.patch || {}, false, id);
        if (error) return send(400, { error });
        if (!Object.keys(patch).length) return send(400, { error: 'nothing to update' });

        /* deactivating someone: separate permission, and a signature that must match
           the signer's own name. Checked here rather than trusted from the client. */
        let auditDoc = null;
        const to = patch.status;
        if (to && SIGNED_STATUSES.includes(to) && to !== existing.status) {
          const need = to === 'Terminated' ? 'terminate' : 'suspend';
          if (!access[need]) return send(403, { error: `You don't have permission to set someone to ${to}.`, needsPermission: need });
          const signature = cleanStr(input.signature, 120);
          const myName = `${me.first || ''} ${me.last || ''}`.trim();
          if (!signature) return send(400, { error: 'A signature is required to set someone to ' + to, needsSignature: true, signAs: myName });
          if (foldName(signature) !== foldName(myName)) {
            return send(400, { error: `The signature must match your own name (${myName}).`, needsSignature: true, signAs: myName });
          }
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
        if (r.status !== 200 && r.status !== 201) return send(500, { error: 'roster write failed', status: r.status });
        /* audit AFTER the record is safely written — a failed audit must not lose the
           change, but an unrecorded deactivation is worth surfacing, so it is reported */
        let audited = null;
        if (auditDoc) {
          try {
            const a = await cosmos({ verb: 'POST', resId: collPath('audit'), path: `/${collPath('audit')}/docs`, body: auditDoc, partitionKey: auditDoc.date, upsert: true });
            audited = (a.status === 200 || a.status === 201);
          } catch (e) { audited = false; }
        }
        return send(200, { ok: true, employee: strip(r.body), ...(auditDoc ? { audited } : {}) });
      }

      return send(400, { error: 'unknown action — expected create or update' });
    }

    const visible = scopedEmployees(me, access, allEmployees);

    context.res = { status: 200, headers, body: JSON.stringify({ employees: visible, ...ref }) };
  } catch (err) {
    context.res = { status: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
