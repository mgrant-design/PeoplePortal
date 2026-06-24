/* intake.jsx — "Your details": resume attach, DOB, SSN, and key employment dates. */

function Lbl({ label, children, hint, req }) {
  return (
    <label style={{ display: 'block' }}>
      <div style={{ fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--ink-3)', marginBottom: 6 }}>
        {label}{req && <span style={{ color: 'var(--accent)' }}> *</span>}
      </div>
      {children}
      {hint && <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 5 }}>{hint}</div>}
    </label>
  );
}
const inp = { width: '100%', padding: '11px 13px', borderRadius: 'var(--r-md)', fontSize: 14.5, fontFamily: 'var(--font-body)', border: '1.5px solid var(--line)', background: 'var(--surface)', color: 'var(--ink)', outline: 'none' };

function ResumeDrop({ file, onFile }) {
  const ref = useRef(null);
  const [over, setOver] = useState(false);
  const pick = (f) => { if (f) onFile({ name: f.name, size: Math.max(1, Math.round((f.size || 248000) / 1024)) }); };
  return (
    <div
      onClick={() => ref.current && ref.current.click()}
      onDragOver={e => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
      onDrop={e => { e.preventDefault(); setOver(false); pick(e.dataTransfer.files[0]); }}
      style={{ cursor: 'pointer', border: `1.5px dashed ${over ? 'var(--accent)' : 'var(--line)'}`, background: over ? 'var(--accent-softer)' : 'var(--surface)',
        borderRadius: 'var(--r-md)', padding: file ? '14px 16px' : '22px 16px', transition: 'all .15s' }}>
      <input ref={ref} type="file" accept=".pdf,.doc,.docx" style={{ display: 'none' }} onChange={e => pick(e.target.files[0])} />
      {file ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 38, height: 38, borderRadius: 9, background: 'var(--ok-soft)', color: 'var(--ok)', display: 'grid', placeItems: 'center', flex: 'none' }}><Icon name="check" style={{ width: 20, height: 20 }} /></div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</div>
            <div className="mono" style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>{file.size} KB · attached</div>
          </div>
          <span className="btn btn-quiet" style={{ padding: '6px 12px', fontSize: 13 }}><Icon name="refresh" style={{ width: 14, height: 14 }} /> Replace</span>
        </div>
      ) : (
        <div style={{ textAlign: 'center', color: 'var(--ink-3)' }}>
          <Icon name="upload" style={{ width: 24, height: 24, margin: '0 auto 6px', display: 'block', color: 'var(--accent)' }} />
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink-2)' }}>Drop your resume here or click to browse</div>
          <div className="mono" style={{ fontSize: 11.5, marginTop: 3 }}>PDF or Word · up to 10 MB</div>
        </div>
      )}
    </div>
  );
}

function SSNField({ value, onChange }) {
  const [show, setShow] = useState(false);
  const fmt = (v) => { const d = v.replace(/\D/g, '').slice(0, 9); return d.replace(/(\d{3})(\d{0,2})(\d{0,4})/, (m, a, b, c) => [a, b, c].filter(Boolean).join('-')); };
  const masked = value ? value.replace(/\d(?=.*\d{0,3}$)/g, '•').replace(/•(?=•{0,2}\d)/g, '•') : '';
  return (
    <div style={{ position: 'relative' }}>
      <input value={show ? value : (value ? '•••-••-' + value.replace(/\D/g, '').slice(-4) : '')}
        onChange={e => onChange(fmt(e.target.value))} placeholder="•••-••-••••" inputMode="numeric"
        className="mono" style={{ ...inp, letterSpacing: '.08em', paddingRight: 44 }} />
      <button onClick={() => setShow(s => !s)} type="button" style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'none', color: 'var(--ink-3)', fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: 6 }}>{show ? 'Hide' : 'Show'}</button>
    </div>
  );
}

function ProfileStep({ onBack, onComplete }) {
  const [resume, setResume] = useState(null);
  const [dob, setDob] = useState('');
  const [ssn, setSsn] = useState('');
  const [wi, setWi] = useState('2026-06-05');
  const [orient, setOrient] = useState('2026-06-19');
  const ssnOk = ssn.replace(/\D/g, '').length === 9;
  const ready = resume && dob && ssnOk;

  return (
    <StepShell icon="doc" eyebrow="Get started" title="Your details"
      subtitle="A few essentials for your employee file. Your personal information is encrypted and only visible to People Ops."
      onBack={onBack}
      aside={<div className="badge badge-prog" style={{ padding: '8px 14px' }}><Icon name="lock" /> Encrypted</div>}>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.3fr) minmax(0,1fr)', gap: 'var(--gap)', alignItems: 'start' }}>
        <div className="card" style={{ padding: 'var(--pad)' }}>
          <h3 style={{ fontSize: 16.5, marginBottom: 4 }}>Personal information</h3>
          <p style={{ color: 'var(--ink-3)', fontSize: 13, marginBottom: 18 }}>Used for payroll, benefits, and your I-9.</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Lbl label="Legal name"><input value={NEW_HIRE.name} readOnly style={{ ...inp, background: 'var(--surface-2)', color: 'var(--ink-2)' }} /></Lbl>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <Lbl label="Date of birth" req><input type="date" value={dob} onChange={e => setDob(e.target.value)} style={inp} /></Lbl>
              <Lbl label="Social Security #" req hint="Encrypted · used for tax & I-9"><SSNField value={ssn} onChange={setSsn} /></Lbl>
            </div>
            <Lbl label="Resume / CV" req>
              <ResumeDrop file={resume} onFile={setResume} />
            </Lbl>
          </div>
        </div>

        <div className="card" style={{ padding: 'var(--pad)' }}>
          <h3 style={{ fontSize: 16.5, marginBottom: 4 }}>Key dates</h3>
          <p style={{ color: 'var(--ink-3)', fontSize: 13, marginBottom: 18 }}>Set by your hiring team — confirm they’re right.</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Lbl label="Working interview" hint="Completed"><input type="date" value={wi} onChange={e => setWi(e.target.value)} style={inp} /></Lbl>
            <Lbl label="Orientation date"><input type="date" value={orient} onChange={e => setOrient(e.target.value)} style={inp} /></Lbl>
            <Lbl label="Start date">
              <div style={{ ...inp, display: 'flex', alignItems: 'center', gap: 9, background: 'var(--surface-2)' }}>
                <Icon name="calendar" style={{ width: 16, height: 16, color: 'var(--accent)' }} />
                <span style={{ fontWeight: 600 }}>Mon, Jun 22, 2026</span>
                <span className="badge badge-prog" style={{ marginLeft: 'auto' }}>HR-set</span>
              </div>
            </Lbl>
            <div style={{ display: 'flex', gap: 9, padding: '11px 13px', borderRadius: 'var(--r-md)', background: 'var(--accent-softer)', fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.45 }}>
              <Icon name="bolt" style={{ width: 15, height: 15, color: 'var(--accent)', flex: 'none', marginTop: 1 }} />
              These dates drive your first-week agenda, training due dates, and benefits enrollment window.
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 22, gap: 16, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, color: 'var(--ink-3)', display: 'flex', alignItems: 'center', gap: 7 }}>
          <Icon name="shield" style={{ width: 15, height: 15, color: 'var(--accent)' }} /> Stored encrypted · shared only with People Ops and payroll.
        </span>
        <button className="btn btn-primary btn-lg" disabled={!ready} onClick={onComplete}><Icon name="check" /> Save my details</button>
      </div>
    </StepShell>
  );
}

Object.assign(window, { ProfileStep });
