/* offices.jsx — view all offices + add a new one. Headcount per office from live data. */

function Offices({ access }) {
  const seed = useMemo(() => (window.HR.offices || []).map(o => ({ ...o })), []);
  const [offices, setOffices] = useState(seed);
  const [adding, setAdding] = useState(false);
  const counts = useMemo(() => { const m = {}; EMPLOYEES.forEach(e => { if (e.status === 'Active') m[e.loc] = (m[e.loc] || 0) + 1; }); return m; }, []);
  const canEdit = access.caps.manageUsers || access.caps.viewAll;

  const [nf, setNf] = useState({ name: '', address: '', city: '', state: 'NY', zip: '', phone: '', email: '' });
  const setF = (k, v) => setNf(s => ({ ...s, [k]: v }));
  const add = () => { setOffices(o => [...o, { id: 'new' + Date.now(), ...nf }]); setNf({ name: '', address: '', city: '', state: 'NY', zip: '', phone: '', email: '' }); setAdding(false); };

  const fld2 = { width: '100%', padding: '10px 12px', borderRadius: 'var(--r-md)', fontSize: 14, border: '1.5px solid var(--line)', background: 'var(--surface)', color: 'var(--ink)', outline: 'none', fontFamily: 'var(--font-body)' };

  return (
    <div className="fade-in">
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 18 }}>
        <div>
          <h1 style={{ fontSize: 'clamp(22px,3vw,28px)' }}>Offices</h1>
          <p style={{ color: 'var(--ink-2)', fontSize: 14.5, marginTop: 6 }}>{offices.length} locations · {Object.values(counts).reduce((a, b) => a + b, 0)} active staff across all offices</p>
        </div>
        {canEdit && <button className="btn btn-primary" onClick={() => setAdding(a => !a)}><Icon name="plus" /> Add office</button>}
      </div>

      {adding && (
        <div className="card fade-in" style={{ padding: 'var(--pad)', marginBottom: 'var(--gap)', borderColor: 'var(--accent)' }}>
          <h3 style={{ fontSize: 16, marginBottom: 14 }}>New office</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 12 }}>
            <input value={nf.name} onChange={e => setF('name', e.target.value)} placeholder="Office name" style={fld2} />
            <input value={nf.address} onChange={e => setF('address', e.target.value)} placeholder="Address" style={fld2} />
            <input value={nf.city} onChange={e => setF('city', e.target.value)} placeholder="City" style={fld2} />
            <input value={nf.state} onChange={e => setF('state', e.target.value)} placeholder="State" style={fld2} />
            <input value={nf.zip} onChange={e => setF('zip', e.target.value)} placeholder="ZIP" style={fld2} />
            <input value={nf.phone} onChange={e => setF('phone', e.target.value)} placeholder="Phone" style={fld2} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
            <button className="btn btn-ghost" onClick={() => setAdding(false)}>Cancel</button>
            <button className="btn btn-primary" disabled={!nf.name.trim()} onClick={add}><Icon name="check" /> Add office</button>
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 'var(--gap)' }}>
        {offices.map(o => {
          const n = counts[normLoc(o.name)] || counts[o.name] || 0;
          return (
            <div key={o.id} className="card" style={{ padding: 'var(--pad)' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <div style={{ width: 42, height: 42, borderRadius: 'var(--r-md)', flex: 'none', display: 'grid', placeItems: 'center', background: 'var(--accent-soft)', color: 'var(--accent-strong)' }}><Icon name="building" style={{ width: 22, height: 22 }} /></div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 16 }}>{o.name}</div>
                  <div style={{ fontSize: 12.5, color: 'var(--ink-3)', marginTop: 2 }}>{[o.city, o.state].filter(Boolean).join(', ') || o.address || '—'}</div>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginTop: 14, fontSize: 13, color: 'var(--ink-2)' }}>
                {o.address && <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><Icon name="pin" style={{ width: 14, height: 14, color: 'var(--ink-3)', flex: 'none' }} /> {o.address}{o.zip ? ` · ${o.zip}` : ''}</div>}
                {o.phone && <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><Icon name="phone" style={{ width: 14, height: 14, color: 'var(--ink-3)', flex: 'none' }} /> {o.phone}</div>}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--line-soft)' }}>
                <span className="badge badge-prog"><Icon name="users" /> {n} active</span>
                {canEdit && <button className="btn btn-quiet" style={{ padding: '6px 10px', fontSize: 12.5 }}><Icon name="pen" style={{ width: 14, height: 14 }} /> Edit</button>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

Object.assign(window, { Offices });
