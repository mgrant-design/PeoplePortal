/* paperwork.jsx — e-signature flow: sign docs, deliver electronically, Paychex sync */

function SignaturePad({ onChange, fullName }) {
  const [mode, setMode] = useState('draw');
  const [typed, setTyped] = useState('');
  const [hasInk, setHasInk] = useState(false);
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const last = useRef(null);

  useEffect(() => {
    const c = canvasRef.current; if (!c) return;
    const ratio = window.devicePixelRatio || 1;
    const rect = c.getBoundingClientRect();
    c.width = rect.width * ratio; c.height = rect.height * ratio;
    const ctx = c.getContext('2d');
    ctx.scale(ratio, ratio);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = 2.4;
    ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--ink').trim() || '#222';
  }, []);

  const pos = (e) => {
    const r = canvasRef.current.getBoundingClientRect();
    const p = e.touches ? e.touches[0] : e;
    return { x: p.clientX - r.left, y: p.clientY - r.top };
  };
  const start = (e) => { e.preventDefault(); drawing.current = true; last.current = pos(e); };
  const move = (e) => {
    if (!drawing.current) return;
    e.preventDefault();
    const ctx = canvasRef.current.getContext('2d');
    const p = pos(e);
    ctx.beginPath(); ctx.moveTo(last.current.x, last.current.y); ctx.lineTo(p.x, p.y); ctx.stroke();
    last.current = p; if (!hasInk) { setHasInk(true); }
  };
  const end = () => { drawing.current = false; if (hasInk) onChange({ type: 'draw' }); };
  const clear = () => {
    const c = canvasRef.current; const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, c.width, c.height); setHasInk(false); onChange(null);
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: 4, marginBottom: 10, background: 'var(--surface-2)', padding: 4, borderRadius: 'var(--r-md)', width: 'fit-content' }}>
        {['draw', 'type'].map(m => (
          <button key={m} onClick={() => { setMode(m); onChange(null); setHasInk(false); setTyped(''); }}
            style={{ border: 'none', borderRadius: 'var(--r-sm)', padding: '7px 18px', fontSize: 13, fontWeight: 600, textTransform: 'capitalize',
              background: mode === m ? 'var(--surface)' : 'transparent', color: mode === m ? 'var(--ink)' : 'var(--ink-3)',
              boxShadow: mode === m ? 'var(--shadow-sm)' : 'none' }}>{m}</button>
        ))}
      </div>
      {mode === 'draw' ? (
        <div style={{ position: 'relative' }}>
          <canvas ref={canvasRef}
            onMouseDown={start} onMouseMove={move} onMouseUp={end} onMouseLeave={end}
            onTouchStart={start} onTouchMove={move} onTouchEnd={end}
            style={{ width: '100%', height: 150, background: 'var(--surface)', border: '1.5px dashed var(--line)', borderRadius: 'var(--r-md)', cursor: 'crosshair', display: 'block', touchAction: 'none' }} />
          {!hasInk && <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', pointerEvents: 'none', color: 'var(--ink-3)', fontSize: 14 }}>✍️ &nbsp;Draw your signature here</div>}
          <div style={{ position: 'absolute', bottom: 10, left: 16, right: 16, borderBottom: '1px solid var(--line)' }} />
        </div>
      ) : (
        <div>
          <input value={typed} onChange={e => { setTyped(e.target.value); onChange(e.target.value ? { type: 'type', value: e.target.value } : null); }}
            placeholder={fullName || 'Type your full legal name'}
            style={{ width: '100%', height: 150, border: '1.5px dashed var(--line)', borderRadius: 'var(--r-md)', background: 'var(--surface)',
              fontFamily: 'Bricolage Grotesque, cursive', fontSize: 40, textAlign: 'center', color: 'var(--ink)', outline: 'none', padding: '0 16px' }} />
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
        <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>Your e-signature is legally binding under the ESIGN Act.</span>
        <button className="btn btn-quiet" style={{ padding: '6px 12px', fontSize: 13 }} onClick={mode === 'draw' ? clear : () => { setTyped(''); onChange(null); }}>
          <Icon name="refresh" style={{ width: 14, height: 14 }} /> Clear
        </button>
      </div>
    </div>
  );
}

function DocPreview({ doc }) {
  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden', background: 'var(--surface)' }}>
      <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', gap: 10, background: 'var(--surface-2)' }}>
        <Icon name="doc" style={{ width: 18, height: 18, color: 'var(--accent)' }} />
        <span style={{ fontWeight: 600, fontSize: 14 }}>{doc.name}</span>
        <span className="badge badge-todo" style={{ marginLeft: 'auto' }}>{doc.agency} · {doc.pages}p</span>
      </div>
      <div style={{ padding: 24, fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.7 }}>
        <p style={{ marginBottom: 14, color: 'var(--ink)' }}>{doc.desc}</p>
        {/* skeleton document body */}
        {[100, 92, 96, 70].map((w, i) => <div key={i} style={{ height: 9, width: w + '%', background: 'var(--line-soft)', borderRadius: 4, marginBottom: 11 }} />)}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, margin: '18px 0' }}>
          {['Legal name', 'SSN', 'Address', 'Filing status'].map(f => (
            <div key={f}>
              <div style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--ink-3)', fontWeight: 600 }}>{f}</div>
              <div style={{ height: 8, width: '78%', background: 'var(--line-soft)', borderRadius: 4, marginTop: 6 }} />
            </div>
          ))}
        </div>
        {[88, 60].map((w, i) => <div key={i} style={{ height: 9, width: w + '%', background: 'var(--line-soft)', borderRadius: 4, marginBottom: 11 }} />)}
        <div style={{ marginTop: 18, padding: '12px 14px', borderRadius: 'var(--r-sm)', background: 'var(--accent-softer)', border: '1px dashed var(--accent)', display: 'flex', alignItems: 'center', gap: 8, color: 'var(--accent-strong)', fontWeight: 600, fontSize: 13 }}>
          <Icon name="pen" style={{ width: 15, height: 15 }} /> Signature required below
        </div>
      </div>
    </div>
  );
}

function SignDoc({ doc, onSigned, onCancel }) {
  const [sig, setSig] = useState(null);
  const [agree, setAgree] = useState(false);
  const ready = sig && agree;
  return (
    <div className="fade-in" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.05fr) minmax(0, 1fr)', gap: 22, alignItems: 'start' }}>
      <DocPreview doc={doc} />
      <div className="card" style={{ padding: 'var(--pad)' }}>
        <div className="eyebrow" style={{ marginBottom: 8 }}>Sign · {doc.agency}</div>
        <h3 style={{ fontSize: 19 }}>{doc.name}</h3>
        <p style={{ color: 'var(--ink-2)', fontSize: 13.5, margin: '8px 0 18px', lineHeight: 1.5 }}>{doc.desc}</p>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Your signature</div>
        <SignaturePad onChange={setSig} fullName={NEW_HIRE.name} />
        <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginTop: 18, cursor: 'pointer', fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.45 }}>
          <input type="checkbox" checked={agree} onChange={e => setAgree(e.target.checked)} style={{ marginTop: 2, width: 17, height: 17, accentColor: 'var(--accent)' }} />
          <span>I, <b style={{ color: 'var(--ink)' }}>{NEW_HIRE.name}</b>, agree to sign this document electronically and confirm the information is accurate.</span>
        </label>
        <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
          <button className="btn btn-ghost" onClick={onCancel}><Icon name="arrowLeft" /> Cancel</button>
          <button className="btn btn-primary" disabled={!ready} style={{ flex: 1 }} onClick={() => onSigned(doc.id)}>
            <Icon name="pen" /> Adopt & sign
          </button>
        </div>
      </div>
    </div>
  );
}

const DELIVERY_STEPS = [
  { label: 'Sealing your signed packet', icon: 'lock' },
  { label: 'Delivering to onboarding@puredental.com', icon: 'mail' },
  { label: 'Syncing employee record to Paychex Flex', icon: 'refresh' },
  { label: 'Notifying Tom Becker (People Ops)', icon: 'bell' },
];

function DeliveryScreen({ onDone }) {
  const [step, setStep] = useState(0);
  useEffect(() => {
    if (step < DELIVERY_STEPS.length) {
      const t = setTimeout(() => setStep(step + 1), 850);
      return () => clearTimeout(t);
    }
  }, [step]);
  const finished = step >= DELIVERY_STEPS.length;
  const ref = 'PD-' + new Date().getFullYear() + '-08842';
  return (
    <div className="fade-in" style={{ maxWidth: 560, margin: '10px auto' }}>
      <div className="card" style={{ padding: 'clamp(24px,4vw,38px)', textAlign: 'center' }}>
        {!finished ? (
          <>
            <div style={{ width: 60, height: 60, margin: '0 auto 8px', borderRadius: 16, background: 'var(--accent-soft)', display: 'grid', placeItems: 'center', color: 'var(--accent-strong)' }}>
              <Icon name="upload" style={{ width: 30, height: 30 }} />
            </div>
            <h2 style={{ fontSize: 22, marginTop: 10 }}>Delivering your documents…</h2>
            <p style={{ color: 'var(--ink-2)', fontSize: 14, marginTop: 6 }}>Securely transmitting to your onboarding team.</p>
          </>
        ) : (
          <>
            <div style={{ width: 64, height: 64, margin: '0 auto', borderRadius: '50%', background: 'var(--ok-soft)', display: 'grid', placeItems: 'center', color: 'var(--ok)' }} className="fade-in">
              <Icon name="check" style={{ width: 34, height: 34 }} />
            </div>
            <h2 style={{ fontSize: 24, marginTop: 14 }}>All signed & delivered</h2>
            <p style={{ color: 'var(--ink-2)', fontSize: 14.5, marginTop: 8, lineHeight: 1.5 }}>Your W-4, I-9, and direct deposit forms were received by the onboarding team and synced to payroll.</p>
          </>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, margin: '24px 0', textAlign: 'left' }}>
          {DELIVERY_STEPS.map((s, i) => {
            const state = i < step ? 'done' : i === step ? 'active' : 'wait';
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px', borderRadius: 'var(--r-md)',
                background: state === 'wait' ? 'transparent' : 'var(--surface-2)', opacity: state === 'wait' ? 0.45 : 1, transition: 'all .3s' }}>
                <div style={{ width: 30, height: 30, borderRadius: '50%', flex: 'none', display: 'grid', placeItems: 'center',
                  background: state === 'done' ? 'var(--ok)' : state === 'active' ? 'var(--accent)' : 'var(--line)', color: '#fff' }}>
                  {state === 'done' ? <Icon name="check" style={{ width: 16, height: 16 }} />
                    : state === 'active' ? <span className="spin" style={{ width: 15, height: 15, border: '2px solid #fff', borderTopColor: 'transparent', borderRadius: '50%', display: 'block' }} />
                    : <Icon name={s.icon} style={{ width: 15, height: 15, color: 'var(--ink-3)' }} />}
                </div>
                <span style={{ fontSize: 13.5, fontWeight: 500, color: state === 'wait' ? 'var(--ink-3)' : 'var(--ink)' }}>{s.label}</span>
              </div>
            );
          })}
        </div>

        {finished && (
          <div className="fade-in">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, background: 'var(--line)', borderRadius: 'var(--r-md)', overflow: 'hidden', border: '1px solid var(--line)', marginBottom: 20 }}>
              {[['Confirmation', ref], ['Synced to', 'Paychex Flex'], ['Delivered to', 'Onboarding team'], ['Copy emailed', NEW_HIRE.email]].map(([k, v]) => (
                <div key={k} style={{ background: 'var(--surface)', padding: '12px 14px', textAlign: 'left' }}>
                  <div style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--ink-3)', fontWeight: 600 }}>{k}</div>
                  <div className="mono" style={{ fontSize: 12.5, fontWeight: 600, marginTop: 3, wordBreak: 'break-all' }}>{v}</div>
                </div>
              ))}
            </div>
            <button className="btn btn-primary btn-lg" style={{ width: '100%', justifyContent: 'center' }} onClick={onDone}>
              <Icon name="check" /> Done — back to checklist
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Paperwork({ onBack, onComplete }) {
  const [docs, setDocs] = useState(() => PAPERWORK_DOCS.map(d => ({ ...d })));
  const [openId, setOpenId] = useState(null);
  const [phase, setPhase] = useState('list'); // list | sign | deliver
  const openDoc = docs.find(d => d.id === openId);
  const signedCount = docs.filter(d => d.status === 'signed').length;
  const allSigned = signedCount === docs.length;

  const sign = (id) => {
    setDocs(ds => ds.map(d => d.id === id ? { ...d, status: 'signed' } : d));
    setOpenId(null); setPhase('list');
  };

  if (phase === 'deliver') return (
    <StepShell icon="pen" eyebrow="Paperwork" title="Submitting your documents" onBack={onBack}>
      <DeliveryScreen onDone={onComplete} />
    </StepShell>
  );

  if (phase === 'sign' && openDoc) return (
    <StepShell icon="pen" eyebrow={`Document ${docs.findIndex(d=>d.id===openId)+1} of ${docs.length}`} title={`Sign: ${openDoc.name.split(' — ')[0]}`}
      subtitle="Review the document, then add your signature. Nothing is sent until you submit everything."
      onBack={() => { setPhase('list'); setOpenId(null); }}>
      <SignDoc doc={openDoc} onSigned={sign} onCancel={() => { setPhase('list'); setOpenId(null); }} />
    </StepShell>
  );

  return (
    <StepShell icon="pen" eyebrow="Get started" title="New-hire paperwork"
      subtitle="Three forms to sign before your first day. Everything is signed electronically and delivered straight to your onboarding team — no printing, no scanning."
      onBack={onBack}
      aside={<div className="badge badge-prog" style={{ padding: '8px 14px' }}>{signedCount} of {docs.length} signed</div>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {docs.map((d, i) => (
          <div key={d.id} className="card" style={{ padding: 'var(--pad)', display: 'flex', alignItems: 'center', gap: 16,
            borderColor: d.status === 'signed' ? 'var(--ok)' : 'var(--line)' }}>
            <div style={{ width: 44, height: 44, borderRadius: 'var(--r-md)', flex: 'none', display: 'grid', placeItems: 'center',
              background: d.status === 'signed' ? 'var(--ok-soft)' : 'var(--accent-soft)', color: d.status === 'signed' ? 'var(--ok)' : 'var(--accent-strong)' }}>
              <Icon name={d.status === 'signed' ? 'check' : 'doc'} style={{ width: 22, height: 22 }} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 15.5 }}>{d.name}</div>
              <p style={{ color: 'var(--ink-3)', fontSize: 13, marginTop: 3 }}>{d.desc}</p>
            </div>
            {d.status === 'signed'
              ? <span className="badge badge-ok"><Icon name="check" /> Signed</span>
              : <button className="btn btn-primary" onClick={() => { setOpenId(d.id); setPhase('sign'); }}><Icon name="pen" /> Review & sign</button>}
          </div>
        ))}
      </div>

      <div className="card" style={{ marginTop: 18, padding: 'var(--pad)', display: 'flex', alignItems: 'center', gap: 16, background: 'var(--surface-2)', borderStyle: 'dashed' }}>
        <Icon name="link" style={{ width: 22, height: 22, color: 'var(--accent)', flex: 'none' }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: 14 }}>Connected to Paychex Flex</div>
          <p style={{ color: 'var(--ink-3)', fontSize: 13, marginTop: 2 }}>Signed forms sync to payroll automatically and a copy is emailed to your onboarding team.</p>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 22 }}>
        <button className="btn btn-primary btn-lg" disabled={!allSigned} onClick={() => setPhase('deliver')}>
          <Icon name="upload" /> Submit all & deliver electronically
        </button>
      </div>
    </StepShell>
  );
}

Object.assign(window, { Paperwork, SignaturePad });
