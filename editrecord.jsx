/* editrecord.jsx — editable employee data. Self-edit (employee) + full edit (admin/hr/manager).
   Persists overrides to localStorage; in production these PATCH back to Paychex. */

function loadEmpOverrides() { try { return JSON.parse(localStorage.getItem('pd_emp_overrides')) || {}; } catch (e) { return {}; } }
function saveEmpOverride(id, patch) {
  const all = loadEmpOverrides(); all[id] = { ...(all[id] || {}), ...patch };
  try { localStorage.setItem('pd_emp_overrides', JSON.stringify(all)); } catch (e) {}
  return all[id];
}
function mergeEmp(emp) { const o = loadEmpOverrides()[emp.id]; return o ? { ...emp, ...o } : emp; }

const SELF_FIELDS = [
  { k: 'mobile', label: 'Mobile phone' },
  { k: 'personalEmail', label: 'Personal email' },
  { k: 'address', label: 'Home address' },
  { k: 'emergencyName', label: 'Emergency contact' },
  { k: 'emergencyPhone', label: 'Emergency phone' },
];
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

function EditRecordModal({ emp, fields, title, scope, onSaved, onClose }) {
  const [form, setForm] = useState(() => { const o = {}; fields.forEach(f => o[f.k] = emp[f.k] || ''); return o; });
  const set = (k, v) => setForm(s => ({ ...s, [k]: v }));
  const inp = { width: '100%', padding: '10px 12px', borderRadius: 'var(--r-md)', fontSize: 14, border: '1.5px solid var(--line)', background: 'var(--surface)', color: 'var(--ink)', outline: 'none', fontFamily: 'var(--font-body)' };
  const save = () => { const merged = saveEmpOverride(emp.id, form); onSaved && onSaved({ ...emp, ...merged }); onClose(); };

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
          {scope === 'self' ? 'Your changes sync to HR and to Paychex once the integration is connected.' : 'Changes are logged and will push to Paychex when the integration is live.'}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={save}><Icon name="check" /> Save changes</button>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { loadEmpOverrides, saveEmpOverride, mergeEmp, EditRecordModal, SELF_FIELDS, ADMIN_FIELDS });
