/* provisioning.jsx — "Accounts & access" onboarding step.
   Accounts are created by IT/HR directly in each system — there is no auto-provision
   (Denticon's API cannot create staff logins). This step lists the systems the role
   needs so the new hire knows what's coming and who sets them up. */

function AccountsStep({ me, role, credentialsDone, onBack, onComplete, onReady, onGoCredentials }) {
  const apps = useMemo(() => (role.apps || []).map(id => APP_CATALOG[id]).filter(Boolean), [role]);
  const isLocked = (app) => app.provider && role.clinical && !credentialsDone;
  const hasProvider = apps.some(a => a.provider);

  useEffect(() => { onReady && onReady(); }, []);

  return (
    <StepShell icon="key" eyebrow="Get set up" title="Accounts & access"
      subtitle={`Based on your role — ${role.label} — IT/HR sets up each system below directly in that system. You'll get your logins from them.`}
      onBack={onBack}
      aside={<div className="badge badge-prog" style={{ padding: '8px 14px' }}><Icon name="link" /> Set up by IT / HR</div>}>

      {role.clinical && !credentialsDone && hasProvider && (
        <div className="card" style={{ padding: '14px var(--pad)', display: 'flex', alignItems: 'center', gap: 14, marginBottom: 'var(--gap)', borderColor: 'var(--warn)', background: 'var(--warn-soft)' }}>
          <Icon name="bell" style={{ width: 22, height: 22, color: 'oklch(0.55 0.13 60)', flex: 'none' }} />
          <div style={{ flex: 1 }}><div style={{ fontWeight: 700, fontSize: 14, color: 'oklch(0.45 0.12 60)' }}>Provider accounts need your credentials first</div><p style={{ fontSize: 13, color: 'oklch(0.45 0.1 60)', marginTop: 2 }}>Verify your NPI, license and DEA so IT/HR can set up your provider accounts.</p></div>
          <button className="btn btn-ghost" onClick={onGoCredentials}>Verify now <Icon name="arrowRight" /></button>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {apps.map(app => {
          const locked = isLocked(app);
          return (
            <div key={app.id} className="card" style={{ padding: '14px var(--pad)', display: 'flex', alignItems: 'center', gap: 14, opacity: locked ? 0.7 : 1 }}>
              <div style={{ width: 42, height: 42, borderRadius: 'var(--r-md)', flex: 'none', display: 'grid', placeItems: 'center', background: 'var(--accent-soft)', color: 'var(--accent-strong)' }}>
                <Icon name={app.icon} style={{ width: 22, height: 22 }} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 600, fontSize: 15 }}>{app.name}</span>
                  {app.provider && <span className="badge badge-prog" style={{ fontSize: 10.5 }}>Provider</span>}
                </div>
                <div style={{ fontSize: 13, color: 'var(--ink-3)', marginTop: 2 }}>{app.detail}</div>
              </div>
              <div style={{ flex: 'none', textAlign: 'right' }}>
                {locked
                  ? <button onClick={onGoCredentials} className="badge badge-lock" style={{ border: 'none', cursor: 'pointer' }}><Icon name="lock" /> Needs credentials</button>
                  : <a href={'https://' + (app.url || '')} target="_blank" rel="noreferrer" className="mono" style={{ fontSize: 11.5, color: 'var(--accent-strong)', textDecoration: 'none' }}>{app.url} ↗</a>}
                <div className="mono" style={{ fontSize: 10.5, color: 'var(--ink-3)', marginTop: 5 }}>set up by IT / HR</div>
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 22, gap: 16, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, color: 'var(--ink-3)', display: 'flex', alignItems: 'center', gap: 7 }}>
          <Icon name="bolt" style={{ width: 15, height: 15, color: 'var(--accent)' }} /> IT/HR creates these in each system and shares your logins.
        </span>
        <button className="btn btn-primary btn-lg" onClick={onComplete}><Icon name="check" /> Done</button>
      </div>
    </StepShell>
  );
}

Object.assign(window, { AccountsStep });
