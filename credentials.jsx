/* credentials.jsx — Provider credentials capture, verify-first (NPI / license / DEA).
   Simplifies intake: the hire types an ID, we "look it up" and auto-fill the rest. */

const US_STATES = ['CA','AZ','NV','OR','WA','TX','FL','NY','CO','IL'];

function Field({ label, children, hint }) {
  return (
    <label style={{ display: 'block' }}>
      <div style={{ fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--ink-3)', marginBottom: 6 }}>{label}</div>
      {children}
      {hint && <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 5 }}>{hint}</div>}
    </label>
  );
}
const inputStyle = (ok) => ({
  width: '100%', padding: '11px 13px', borderRadius: 'var(--r-md)', fontSize: 14.5, fontFamily: 'var(--font-body)',
  border: `1.5px solid ${ok === false ? 'oklch(0.6 0.18 25)' : 'var(--line)'}`, background: 'var(--surface)', color: 'var(--ink)', outline: 'none',
});

/* A credential card with an ID field, a Verify button, and an auto-filled result panel */
function VerifyCard({ icon, title, subtitle, idLabel, idHint, placeholder, validate, mask, lookup, onVerified, embedded }) {
  const [val, setVal] = useState('');
  const [status, setStatus] = useState('idle'); // idle | verifying | verified | error
  const [data, setData] = useState(null);
  const valid = validate(val);

  const run = () => {
    if (!valid) { setStatus('error'); return; }
    setStatus('verifying');
    setTimeout(() => { setData(lookup(val)); setStatus('verified'); onVerified && onVerified(); }, 1100);
  };

  const Wrap = embedded ? 'div' : 'div';
  return (
    <Wrap className={embedded ? '' : 'card'} style={{ padding: embedded ? 0 : 'var(--pad)', borderColor: status === 'verified' ? 'var(--ok)' : 'var(--line)' }}>
      {title !== '' && (
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 13 }}>
        <div style={{ width: 40, height: 40, borderRadius: 'var(--r-md)', flex: 'none', display: 'grid', placeItems: 'center',
          background: status === 'verified' ? 'var(--ok-soft)' : 'var(--accent-soft)', color: status === 'verified' ? 'var(--ok)' : 'var(--accent-strong)' }}>
          <Icon name={status === 'verified' ? 'check' : icon} style={{ width: 21, height: 21 }} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <h3 style={{ fontSize: 16.5 }}>{title}</h3>
            {status === 'verified' && <span className="badge badge-ok"><Icon name="check" /> Verified</span>}
          </div>
          <p style={{ color: 'var(--ink-2)', fontSize: 13, marginTop: 3, lineHeight: 1.45 }}>{subtitle}</p>
        </div>
      </div>
      )}

      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', marginTop: 16 }}>
        <div style={{ flex: 1 }}>
          <Field label={idLabel} hint={status === 'error' ? '' : idHint}>
            <input value={val} disabled={status === 'verified'}
              onChange={e => { setVal(mask ? mask(e.target.value) : e.target.value); if (status === 'error') setStatus('idle'); }}
              placeholder={placeholder} className="mono" style={{ ...inputStyle(status === 'error' ? false : undefined), letterSpacing: '.04em' }} />
          </Field>
        </div>
        {status !== 'verified' && (
          <button className="btn btn-primary" style={{ height: 44 }} disabled={status === 'verifying'} onClick={run}>
            {status === 'verifying'
              ? <><span className="spin" style={{ width: 14, height: 14, border: '2px solid #fff', borderTopColor: 'transparent', borderRadius: '50%', display: 'block' }} /> Checking…</>
              : <><Icon name="refresh" /> Verify</>}
          </button>
        )}
      </div>
      {status === 'error' && <div style={{ fontSize: 12.5, color: 'oklch(0.55 0.18 25)', marginTop: 7, display: 'flex', alignItems: 'center', gap: 6 }}><Icon name="bell" style={{ width: 14, height: 14 }} /> That doesn’t look right — {idHint}</div>}

      {status === 'verified' && data && (
        <div className="fade-in" style={{ marginTop: 14, borderRadius: 'var(--r-md)', border: '1px solid var(--line)', overflow: 'hidden' }}>
          <div style={{ padding: '8px 14px', background: 'var(--ok-soft)', fontSize: 12, fontWeight: 700, color: 'oklch(0.4 0.12 155)', display: 'flex', alignItems: 'center', gap: 7 }}>
            <Icon name="check" style={{ width: 14, height: 14 }} /> Auto-filled from {data.source}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, background: 'var(--line-soft)' }}>
            {data.rows.map(([k, v]) => (
              <div key={k} style={{ background: 'var(--surface)', padding: '10px 14px' }}>
                <div style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--ink-3)', fontWeight: 600 }}>{k}</div>
                <div style={{ fontSize: 13.5, fontWeight: 600, marginTop: 2 }}>{v}</div>
              </div>
            ))}
          </div>
          {data.expires && (
            <div style={{ padding: '9px 14px', fontSize: 12, color: 'var(--ink-2)', display: 'flex', alignItems: 'center', gap: 7, borderTop: '1px solid var(--line-soft)' }}>
              <Icon name="bell" style={{ width: 14, height: 14, color: 'var(--accent)' }} /> We’ll remind you 60 days before this expires ({data.expires}).
            </div>
          )}
        </div>
      )}
    </Wrap>
  );
}

function CredentialsStep({ me, onBack, onComplete, role }) {
  const nh = newHireProfile(me);
  const rp = role || { short: 'RDH', taxonomy: 'Dental Hygienist · 124Q00000X', dea: false };
  const [hasDEA, setHasDEA] = useState(!!rp.dea);
  const [licState, setLicState] = useState('CA');
  const [verified, setVerified] = useState({});
  const mark = (k, v) => setVerified(s => ({ ...s, [k]: v }));

  // track verification by listening to card state via callback isn't wired; use a simpler readiness:
  const [npiOk, setNpiOk] = useState(false);
  const [licOk, setLicOk] = useState(false);
  const [deaOk, setDeaOk] = useState(false);
  const ready = npiOk && licOk && (!hasDEA || deaOk);

  return (
    <StepShell icon="star" eyebrow="Provider onboarding" title="License & credentials"
      subtitle="You’re joining as a clinical provider, so we need a few license details for credentialing. Just enter each ID — we verify it against the registry and fill in the rest. No forms, no uploads."
      onBack={onBack}
      aside={<div className="badge badge-prog" style={{ padding: '8px 14px' }}><Icon name="shield" /> Encrypted · credentialing only</div>}>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--gap)', maxWidth: 760 }}>
        <VerifyCard icon="key" title="National Provider Identifier (NPI)" subtitle="Your unique 10-digit provider ID from the NPPES registry."
          idLabel="NPI number" idHint="Must be 10 digits" placeholder="10-digit NPI"
          mask={v => v.replace(/\D/g, '').slice(0, 10)} validate={v => /^\d{10}$/.test(v)}
          onVerified={() => setNpiOk(true)}
            lookup={() => ({ source: 'NPPES NPI Registry', rows: [['Provider', nh.name], ['Credential', rp.short], ['Primary taxonomy', rp.taxonomy], ['Enumeration', 'Active']] })} />

        <div className="card" style={{ padding: 'var(--pad)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
              <div style={{ width: 40, height: 40, borderRadius: 'var(--r-md)', flex: 'none', display: 'grid', placeItems: 'center', background: 'var(--accent-soft)', color: 'var(--accent-strong)' }}><Icon name="doc" style={{ width: 21, height: 21 }} /></div>
              <div><h3 style={{ fontSize: 16.5 }}>State professional license</h3><p style={{ color: 'var(--ink-2)', fontSize: 13, marginTop: 2 }}>Dental Hygiene license — we verify status with the state board.</p></div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 10, marginBottom: 12 }}>
              <Field label="State"><select value={licState} onChange={e => setLicState(e.target.value)} style={{ ...inputStyle(), appearance: 'auto' }}>{US_STATES.map(s => <option key={s}>{s}</option>)}</select></Field>
              <LicenseVerify state={licState} onVerified={() => setLicOk(true)} />
            </div>
          </div>

        <div className="card" style={{ padding: 'var(--pad)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: 'var(--r-md)', flex: 'none', display: 'grid', placeItems: 'center', background: hasDEA ? 'var(--accent-soft)' : 'var(--surface-2)', color: hasDEA ? 'var(--accent-strong)' : 'var(--ink-3)' }}><Icon name="shield" style={{ width: 21, height: 21 }} /></div>
            <div style={{ flex: 1 }}>
              <h3 style={{ fontSize: 16.5 }}>DEA registration</h3>
              <p style={{ color: 'var(--ink-2)', fontSize: 13, marginTop: 2 }}>Only required if you prescribe or administer controlled substances.</p>
            </div>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, color: 'var(--ink-2)', cursor: 'pointer' }}>
              <input type="checkbox" checked={hasDEA} onChange={e => setHasDEA(e.target.checked)} style={{ width: 17, height: 17, accentColor: 'var(--accent)' }} /> I have a DEA number
            </label>
          </div>
          {hasDEA ? (
            <div style={{ marginTop: 16 }}>
              <VerifyCard icon="shield" title="" subtitle="" idLabel="DEA number" idHint="Format: 2 letters + 7 digits (e.g. AR1234563)" placeholder="AR1234563"
                mask={v => v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 9)} validate={v => /^[A-Z]{2}\d{7}$/.test(v)}
                lookup={() => ({ source: 'DEA Diversion Control', expires: 'Mar 31, 2027', rows: [['Registrant', nh.name], ['Schedules', 'II–V'], ['Status', 'Active'], ['Business address', nh.location || '—']] })}
                onVerified={() => setDeaOk(true)} embedded />
            </div>
          ) : (
            <div style={{ marginTop: 12, fontSize: 13, color: 'var(--ink-3)', display: 'flex', alignItems: 'center', gap: 8, padding: '10px 0' }}>
              <Icon name="check" style={{ width: 15, height: 15, color: 'var(--ok)' }} /> No DEA needed for your role — we’ll skip this.
            </div>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 22, maxWidth: 760, gap: 16, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, color: 'var(--ink-3)', display: 'flex', alignItems: 'center', gap: 7 }}>
          <Icon name="link" style={{ width: 15, height: 15, color: 'var(--accent)' }} /> Verified credentials route straight to your credentialing file — no PDFs to chase.
        </span>
        <button className="btn btn-primary btn-lg" disabled={!ready} onClick={onComplete}><Icon name="check" /> Save credentials</button>
      </div>
    </StepShell>
  );
}

/* state license verify — own ID + verify button, reports up */
function LicenseVerify({ state, onVerified }) {
  const [num, setNum] = useState('');
  const [status, setStatus] = useState('idle');
  const valid = /^[A-Za-z0-9]{5,}$/.test(num);
  const run = () => { if (!valid) { setStatus('error'); return; } setStatus('verifying'); setTimeout(() => { setStatus('verified'); onVerified && onVerified(); }, 1100); };
  return (
    <div>
      <Field label="License number" hint={status === 'verified' ? '' : 'We check it against the board in real time'}>
        <div style={{ display: 'flex', gap: 10 }}>
          <input value={num} disabled={status === 'verified'} onChange={e => { setNum(e.target.value.toUpperCase()); if (status === 'error') setStatus('idle'); }}
            placeholder="e.g. RDH84021" className="mono" style={{ ...inputStyle(status === 'error' ? false : undefined), letterSpacing: '.04em', flex: 1 }} />
          {status === 'verified'
            ? <span className="badge badge-ok" style={{ alignSelf: 'center', padding: '8px 12px' }}><Icon name="check" /> Active</span>
            : <button className="btn btn-primary" style={{ height: 44 }} disabled={status === 'verifying'} onClick={run}>{status === 'verifying' ? <span className="spin" style={{ width: 14, height: 14, border: '2px solid #fff', borderTopColor: 'transparent', borderRadius: '50%', display: 'block' }} /> : <><Icon name="refresh" /> Verify</>}</button>}
        </div>
      </Field>
      {status === 'verified' && <div className="fade-in" style={{ marginTop: 8, fontSize: 12.5, color: 'var(--ink-2)', display: 'flex', alignItems: 'center', gap: 7 }}><Icon name="bell" style={{ width: 14, height: 14, color: 'var(--accent)' }} /> {state} board: license <b style={{ color: 'var(--ink)' }}>active</b>, expires Jun 30, 2027. Reminder set.</div>}
      {status === 'error' && <div style={{ fontSize: 12.5, color: 'oklch(0.55 0.18 25)', marginTop: 6 }}>Enter a valid license number.</div>}
    </div>
  );
}

Object.assign(window, { CredentialsStep });
