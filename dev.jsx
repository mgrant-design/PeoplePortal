/* dev.jsx — developer preview tools: switch the viewing role + mobile preview.
   Hidden inside the mobile iframe to avoid recursion. */

const IS_MOBILE_PREVIEW = (() => { try { return new URL(window.location.href).searchParams.has('mp'); } catch (e) { return false; } })();

function devRoles() {
  // Roster-agnostic: reuse the role-spanning accounts derived in rbac.jsx (works on real
  // OR synthetic data). DEV TOOL ONLY — gate/hide in production.
  return (typeof DEMO_ACCOUNTS !== 'undefined' ? DEMO_ACCOUNTS : []).map(emp => ({ label: deriveAccess(emp).label, emp }));
}

function mobileSrc() { try { const u = new URL(window.location.href); u.searchParams.set('mp', '1'); return u.toString(); } catch (e) { return window.location.href; } }

function MobilePreview({ onClose, roleKey }) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 90, background: 'oklch(0.25 0.02 250 / 0.55)', display: 'grid', placeItems: 'center', padding: 20 }}>
      <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#fff' }}>
          <Icon name="phone" style={{ width: 16, height: 16 }} />
          <span style={{ fontWeight: 600, fontSize: 14 }}>Mobile preview</span>
          <button className="btn" onClick={onClose} style={{ background: 'oklch(1 0 0 / 0.15)', color: '#fff', padding: '5px 12px', fontSize: 13 }}><Icon name="x" /> Close</button>
        </div>
        <div style={{ width: 390, maxWidth: '92vw', height: 'min(800px, 82vh)', borderRadius: 38, background: '#0b0b0f', padding: 12, boxShadow: '0 30px 80px oklch(0 0 0 / 0.5)', border: '1px solid oklch(1 0 0 / 0.1)' }}>
          <div style={{ position: 'relative', width: '100%', height: '100%', borderRadius: 28, overflow: 'hidden', background: '#fff' }}>
            <div style={{ position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)', width: 120, height: 26, background: '#0b0b0f', borderBottomLeftRadius: 14, borderBottomRightRadius: 14, zIndex: 2 }} />
            <iframe key={roleKey} src={mobileSrc()} title="Mobile preview" style={{ width: '100%', height: '100%', border: 'none', display: 'block' }} />
          </div>
        </div>
      </div>
    </div>
  );
}

function DevBar({ current, onPreview }) {
  const [open, setOpen] = useState(true);
  const [mobile, setMobile] = useState(false);
  const roles = useMemo(devRoles, []);
  if (IS_MOBILE_PREVIEW) return null;

  return (
    <>
      {mobile && <MobilePreview onClose={() => setMobile(false)} roleKey={current.id} />}
      <div style={{ position: 'fixed', left: 14, bottom: 14, zIndex: 70, fontFamily: 'var(--font-body)' }}>
        {open ? (
          <div className="card" style={{ padding: 8, boxShadow: 'var(--shadow-lg)', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', maxWidth: 'min(92vw, 620px)' }}>
            <span style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--ink-3)', padding: '0 4px', display: 'inline-flex', alignItems: 'center', gap: 5 }}><Icon name="bolt" style={{ width: 12, height: 12, color: 'var(--accent)' }} /> View as</span>
            {roles.map(r => {
              const isCur = current && current.id === r.emp.id;
              return (
                <button key={r.label} onClick={() => onPreview(r.emp)} style={{ border: '1px solid', borderColor: isCur ? 'var(--accent)' : 'var(--line)', background: isCur ? 'var(--accent)' : 'var(--surface)', color: isCur ? '#fff' : 'var(--ink-2)', borderRadius: 'var(--r-pill)', padding: '5px 11px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>{r.label}</button>
              );
            })}
            <div style={{ width: 1, height: 20, background: 'var(--line)' }} />
            <button onClick={() => setMobile(true)} style={{ border: '1px solid var(--line)', background: 'var(--surface)', color: 'var(--ink-2)', borderRadius: 'var(--r-pill)', padding: '5px 11px', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5 }}><Icon name="phone" style={{ width: 13, height: 13 }} /> Mobile</button>
            <button onClick={() => setOpen(false)} title="Hide" style={{ border: 'none', background: 'none', color: 'var(--ink-3)', cursor: 'pointer', padding: 4 }}><Icon name="x" style={{ width: 14, height: 14 }} /></button>
          </div>
        ) : (
          <button onClick={() => setOpen(true)} className="card" style={{ padding: '8px 12px', boxShadow: 'var(--shadow-lg)', display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, fontWeight: 600, color: 'var(--ink-2)', cursor: 'pointer', border: '1px solid var(--line)' }}><Icon name="bolt" style={{ width: 13, height: 13, color: 'var(--accent)' }} /> Preview</button>
        )}
      </div>
    </>
  );
}

Object.assign(window, { DevBar, IS_MOBILE_PREVIEW });
