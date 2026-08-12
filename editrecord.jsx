/* editrecord.jsx — editing an employee record. Manager-and-above only.

   Edits POST to /api/roster and write the Cosmos roster directly — that roster is the
   source of truth, so there is no override layer and nothing to merge: the server
   returns the saved record and the caller renders it. The old localStorage-override
   model is gone rather than left alongside.

   Employees do NOT edit their own record; My profile is read-only and SELF_FIELDS is
   gone with it. Changes go through a manager. */

/* one employee record write. action 'update' patches by id; 'create' makes a new one. */
async function saveEmpRecord(body) {
  const res = await fetch('/api/roster', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Google-Token': (window.PD_GOOGLE_TOKEN || '') },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || ('save failed (' + res.status + ')'));
  return data.employee;
}

/* The server returns the raw Cosmos document. Everything on screen reads the DERIVED
   fields that rbac.jsx builds on top of it (name from first+last, loc via normLoc,
   emailLower) — hand a raw doc straight to a setState and the name and office go blank.
   Same derivation as buildFromHRDATA(), kept identical on purpose. */
function deriveEmp(doc) {
  return {
    ...doc,
    loc: typeof normLoc === 'function' ? normLoc(doc.location) : doc.location,
    name: `${doc.first || ''} ${doc.last || ''}`.trim(),
    emailLower: (doc.workEmail || '').toLowerCase(),
  };
}

/* Keep the in-memory roster in step, so the directory and every other view show the
   change without a reload. EMPLOYEES is repopulated in place by rbac.jsx, so patching
   the entry keeps the same array reference every module already holds. */
function applyEmpToRoster(emp) {
  if (typeof EMPLOYEES === 'undefined') return emp;
  const i = EMPLOYEES.findIndex(e => e.id === emp.id);
  if (i >= 0) EMPLOYEES[i] = { ...EMPLOYEES[i], ...emp };
  else EMPLOYEES.push(emp);
  return emp;
}

const ADMIN_FIELDS = [
  { k: 'jobTitle', label: 'Job title' },
  { k: 'department', label: 'Department' },
  { k: 'location', label: 'Office / location' },
  { k: 'manager', label: 'Manager' },
  { k: 'workEmail', label: 'Work email' },
  { k: 'mobile', label: 'Mobile phone' },
  { k: 'startDate', label: 'Start date' },
  { k: 'status', label: 'Status', options: ['Active', 'Suspended', 'Terminated'] },
];

function EditRecordModal({ emp, fields, title, onSaved, onClose }) {
  const [form, setForm] = useState(() => { const o = {}; fields.forEach(f => o[f.k] = emp[f.k] || ''); return o; });
  const set = (k, v) => setForm(s => ({ ...s, [k]: v }));
  const inp = { width: '100%', padding: '10px 12px', borderRadius: 'var(--r-md)', fontSize: 14, border: '1.5px solid var(--line)', background: 'var(--surface)', color: 'var(--ink)', outline: 'none', fontFamily: 'var(--font-body)' };
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  /* send only what actually changed, so a save never rewrites fields the form didn't touch */
  const save = async () => {
    if (saving) return;
    const patch = {};
    fields.forEach(f => { if ((form[f.k] || '') !== (emp[f.k] || '')) patch[f.k] = form[f.k]; });
    if (!Object.keys(patch).length) { onClose(); return; }
    setSaving(true); setErr('');
    try {
      const saved = await saveEmpRecord({ action: 'update', id: emp.id, patch });
      onSaved && onSaved(applyEmpToRoster(deriveEmp({ ...emp, ...saved })));
      onClose();
    } catch (e) { setErr(e.message); setSaving(false); }
  };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 90, background: 'oklch(0.3 0.03 250 / 0.45)', display: 'grid', placeItems: 'center', padding: 20 }}>
      <div className="card fade-in" onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 520, padding: 'clamp(20px,4vw,28px)', boxShadow: 'var(--shadow-lg)', maxHeight: '88vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <div style={{ width: 40, height: 40, borderRadius: 'var(--r-md)', background: 'var(--accent-soft)', color: 'var(--accent-strong)', display: 'grid', placeItems: 'center', flex: 'none' }}><Icon name="pen" style={{ width: 20, height: 20 }} /></div>
          <div style={{ flex: 1 }}><h2 style={{ fontSize: 19 }}>{title}</h2><p style={{ fontSize: 12.5, color: 'var(--ink-3)' }}>{emp.name}</p></div>
          <button className="btn btn-quiet" style={{ padding: 7 }} onClick={onClose}><Icon name="x" /></button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {fields.map(f => (
            <label key={f.k} style={{ display: 'block', gridColumn: f.k === 'address' ? '1 / -1' : 'auto' }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--ink-3)', marginBottom: 5 }}>{f.label}</div>
              {f.options
                ? <select value={form[f.k]} onChange={e => set(f.k, e.target.value)} style={{ ...inp, appearance: 'auto' }}>{f.options.map(o => <option key={o}>{o}</option>)}</select>
                : <input value={form[f.k]} onChange={e => set(f.k, e.target.value)} style={inp} />}
            </label>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 16, padding: '10px 12px', borderRadius: 'var(--r-md)', background: 'var(--accent-softer)', fontSize: 12.5, color: 'var(--ink-2)' }}>
          <Icon name="link" style={{ width: 15, height: 15, color: 'var(--accent)', flex: 'none' }} />
          Saves straight to the employee record. Everyone sees the change immediately.
        </div>
        {err && (
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: 10, padding: '10px 12px', borderRadius: 'var(--r-md)', border: '1.5px solid oklch(0.6 0.16 25)', background: 'color-mix(in oklab, oklch(0.6 0.19 25) 10%, var(--surface))', fontSize: 12.5, lineHeight: 1.5, color: 'oklch(0.45 0.16 25)' }}>
            <Icon name="bell" style={{ width: 15, height: 15, flex: 'none', marginTop: 1 }} /> {err}
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={saving} onClick={save}><Icon name="check" /> {saving ? 'Saving…' : 'Save changes'}</button>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { saveEmpRecord, deriveEmp, applyEmpToRoster, EditRecordModal, ADMIN_FIELDS });
