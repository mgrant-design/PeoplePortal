/* api/timeclock/index.js — clock in, breaks and clock out, kept on the server ("punches"
   container, partition key /empId). Every time is taken from the server's clock.
   GET                 → { open, punches, overtimeThreshold, weekStart, todayShift } for the caller
   GET ?empId=         → { punches } for someone the caller may see
   GET ?team=1         → { punches } for everyone the caller may see, themselves excepted
   POST { action: 'in', location } | { action: 'break' } | { action: 'out' }
   POST { action: 'approve', empId, id } → a manager, HR, leadership or an admin approves
        someone else's finished punch.
   A person has at most one open punch, stored as "open-<empId>"; clocking out writes the
   finished punch as "p-<empId>-<clock-in time>" and removes the open one. */

const { handler, resolveCaller, HttpError } = require('../_shared/caller');
const { cosmos, listAll, queryAll, strip, collPath } = require('../_shared/cosmos');
const { reportingTree, seesAllOn, normLoc } = require('../_shared/access-rules');

const PUNCHES = collPath('punches');
const DAY_MS = 864e5;
const dayAtOffices = (ms) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));
const addDays = (iso, n) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const toMin = (t) => { const [h, m] = String(t || '').split(':').map(Number); return h * 60 + (m || 0); };

async function readDoc(id, empId) {
  const r = await cosmos({ verb: 'GET', resId: `${PUNCHES}/docs/${id}`, path: `/${PUNCHES}/docs/${id}`, partitionKey: empId });
  if (r.status === 404) return null;
  if (r.status !== 200) throw new Error('punch read failed: ' + r.status);
  return r.body;
}
async function write(doc, { create = false, etag } = {}) {
  return cosmos({ verb: 'POST', resId: PUNCHES, path: `/${PUNCHES}/docs`, body: doc, partitionKey: doc.empId, upsert: !create, ifMatch: etag });
}

module.exports = handler(['GET', 'POST'], async ({ req, body }) => {
  const c = await resolveCaller(req);
  const { me, employees, access } = c;
  const now = Date.now();
  const weekStart = Number.isFinite((c.support || {}).weekStart) ? c.support.weekStart : 1;
  const everyone = access.caps.viewAll || seesAllOn(access, 'timeclock');
  const tree = new Set(reportingTree(me, employees).map(e => e.id));
  const maySee = (empId) => empId === me.id || everyone || tree.has(empId);
  const since = (q) => (q && /^\d{4}-\d{2}-\d{2}$/.test(q.from || '') ? Date.parse(q.from + 'T00:00:00Z') : now - 42 * DAY_MS);

  /* the caller's published shift today, at any office */
  const todayShift = async () => {
    const today = dayAtOffices(now);
    const dow = new Date(today + 'T12:00:00Z').getUTCDay();
    const weekKey = addDays(today, -((dow - weekStart + 7) % 7));
    const weeks = (await listAll(collPath('schedules'))).filter(d => !d.template && d.published && d.weekKey === weekKey);
    const mine = weeks.flatMap(d => (d.shifts || []).filter(s => s.empId === me.id && s.date === today).map(s => ({ start: s.start, end: s.end, office: d.office })));
    return mine.sort((a, b) => toMin(a.start) - toMin(b.start))[0] || null;
  };

  if (req.method === 'GET') {
    const q = req.query || {};
    const from = since(q);
    if (q.team) {
      const ids = employees.filter(e => e.id !== me.id && maySee(e.id)).map(e => e.id);
      if (!ids.length) return { status: 200, body: { punches: [] } };
      const rows = (await queryAll(PUNCHES, [['empId', 'in', ids], ['in', '>=', from]])).map(strip);
      return { status: 200, body: { punches: rows } };
    }
    const empId = q.empId ? String(q.empId) : me.id;
    if (!maySee(empId)) throw new HttpError(403, 'Not allowed to see that person’s hours');
    const rows = (await queryAll(PUNCHES, [['empId', '=', empId], ['in', '>=', from]])).map(strip);
    if (q.empId && empId !== me.id) return { status: 200, body: { punches: rows.filter(p => p.status !== 'open') } };
    let overtimeThreshold = 40;
    const rh = await cosmos({ verb: 'GET', resId: `${collPath('regularHours')}/docs/${(me.workEmail || '').toLowerCase()}`, path: `/${collPath('regularHours')}/docs/${(me.workEmail || '').toLowerCase()}`, partitionKey: (me.workEmail || '').toLowerCase() });
    if (rh.status === 200 && Number(rh.body.overtimeThreshold) > 0) overtimeThreshold = Number(rh.body.overtimeThreshold);
    return { status: 200, body: { open: rows.find(p => p.status === 'open') || null, punches: rows.filter(p => p.status !== 'open'), overtimeThreshold, weekStart, todayShift: await todayShift() } };
  }

  const input = body || {};
  const openId = `open-${me.id}`;

  if (input.action === 'in') {
    const offices = ((c.support || {}).offices || []).map(o => normLoc(o.name)).filter(Boolean);
    const location = normLoc(String(input.location || ''));
    if (!location || !(offices.includes(location) || location === normLoc(me.location))) throw new HttpError(400, 'Choose one of the offices');
    const shift = await todayShift();
    const doc = { id: openId, empId: me.id, email: (me.workEmail || '').toLowerCase(), status: 'open', location, in: now, date: dayAtOffices(now),
      onBreak: false, breakStart: 0, breakMs: 0, schedStartMin: shift ? toMin(shift.start) : null, schedLoc: shift ? shift.office : null };
    const r = await write(doc, { create: true });
    if (r.status === 409) throw new HttpError(409, 'You’re already clocked in');
    if (r.status !== 200 && r.status !== 201) throw new Error('clock-in failed: ' + r.status);
    return { status: 200, body: { open: strip(r.body) } };
  }

  if (input.action === 'break' || input.action === 'out') {
    const open = await readDoc(openId, me.id);
    if (!open) throw new HttpError(409, 'You’re not clocked in');
    if (input.action === 'break') {
      const next = { ...strip(open), ...(open.onBreak ? { onBreak: false, breakStart: 0, breakMs: (open.breakMs || 0) + (now - open.breakStart) } : { onBreak: true, breakStart: now }) };
      const r = await write(next, { etag: open._etag });
      if (r.status === 412) throw new HttpError(409, 'Your punch changed just now. Try again.');
      if (r.status !== 200 && r.status !== 201) throw new Error('break failed: ' + r.status);
      return { status: 200, body: { open: strip(r.body) } };
    }
    const breakMs = (open.breakMs || 0) + (open.onBreak ? now - open.breakStart : 0);
    const done = { id: `p-${me.id}-${open.in}`, empId: me.id, email: open.email, status: 'pending', location: open.location, date: open.date,
      in: open.in, out: now, breakMins: Math.round(breakMs / 60000), schedStartMin: open.schedStartMin, schedLoc: open.schedLoc,
      offLoc: !!open.schedLoc && open.schedLoc !== open.location };
    const r = await write(done, { create: true });
    if (r.status !== 200 && r.status !== 201 && r.status !== 409) throw new Error('clock-out failed: ' + r.status);
    const del = await cosmos({ verb: 'DELETE', resId: `${PUNCHES}/docs/${openId}`, path: `/${PUNCHES}/docs/${openId}`, partitionKey: me.id, ifMatch: open._etag });
    if (del.status !== 204 && del.status !== 404 && del.status !== 412) throw new Error('clock-out cleanup failed: ' + del.status);
    return { status: 200, body: { punch: r.status === 409 ? done : strip(r.body) } };
  }

  if (input.action === 'approve') {
    const empId = String(input.empId || ''), id = String(input.id || '');
    const leads = access.caps.viewAll || access.caps.viewTeam;
    if (!empId || !id || empId === me.id || !leads || !maySee(empId)) throw new HttpError(403, 'Not yours to approve');
    const p = await readDoc(id, empId);
    if (!p || p.empId !== empId || p.status === 'open') throw new HttpError(404, 'Punch not found');
    if (p.status !== 'pending') return { status: 200, body: { punch: strip(p) } };
    const r = await write({ ...strip(p), status: 'approved', approvedBy: c.identity.email, approvedAt: new Date(now).toISOString() }, { etag: p._etag });
    if (r.status === 412) throw new HttpError(409, 'That punch changed just now. Reload and try again.');
    if (r.status !== 200 && r.status !== 201) throw new Error('approve failed: ' + r.status);
    return { status: 200, body: { punch: strip(r.body) } };
  }

  throw new HttpError(400, "action must be 'in', 'break', 'out' or 'approve'");
});
