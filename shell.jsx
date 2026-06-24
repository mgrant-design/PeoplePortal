/* shell.jsx — StepShell wrapper for all guided step screens + shared bits */

function StepShell({ icon, eyebrow, title, subtitle, onBack, children, aside, footer }) {
  return (
    <div className="fade-in">
      <button className="btn btn-quiet" onClick={onBack} style={{ marginBottom: 18, marginLeft: -10 }}>
        <Icon name="arrowLeft" /> Back to checklist
      </button>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 26 }}>
        <div style={{ width: 50, height: 50, borderRadius: 'var(--r-md)', flex: 'none', display: 'grid', placeItems: 'center', background: 'var(--accent-soft)', color: 'var(--accent-strong)' }}>
          <Icon name={icon} style={{ width: 26, height: 26 }} />
        </div>
        <div style={{ flex: 1 }}>
          {eyebrow && <div className="eyebrow" style={{ marginBottom: 6 }}>{eyebrow}</div>}
          <h1 style={{ fontSize: 'clamp(23px,3vw,30px)' }}>{title}</h1>
          {subtitle && <p style={{ color: 'var(--ink-2)', fontSize: 15.5, marginTop: 8, maxWidth: 620, lineHeight: 1.5 }}>{subtitle}</p>}
        </div>
        {aside}
      </div>
      {children}
      {footer}
    </div>
  );
}

/* Segmented progress dots */
function StepDots({ total, current }) {
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} style={{ height: 6, width: i === current ? 26 : 6, borderRadius: 99,
          background: i < current ? 'var(--accent)' : i === current ? 'var(--accent)' : 'var(--line)',
          transition: 'all .25s' }} />
      ))}
    </div>
  );
}

/* Toast / inline confirmation pill used across steps */
function Toast({ children, tone = 'ok' }) {
  const bg = tone === 'ok' ? 'var(--ok-soft)' : 'var(--accent-soft)';
  const fg = tone === 'ok' ? 'oklch(0.42 0.12 155)' : 'var(--accent-strong)';
  return (
    <div className="fade-in" style={{ display: 'inline-flex', alignItems: 'center', gap: 9, background: bg, color: fg, padding: '10px 16px', borderRadius: 'var(--r-pill)', fontWeight: 600, fontSize: 14 }}>
      <Icon name="check" style={{ width: 16, height: 16 }} /> {children}
    </div>
  );
}

Object.assign(window, { StepShell, StepDots, Toast });
