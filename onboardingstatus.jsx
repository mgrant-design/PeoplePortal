/* onboardingstatus.jsx — the people hired through a signed offer, from their saved staff
   records. A hire appears when the candidate signs and stays until 30 days after starting. */

/* ---- Onboarding logic with no screen parts ---- */
/* employees: the staff records this person may see. today: 'YYYY-MM-DD'. */
function hiresInOnboarding(employees, today) {
  const cutoff = new Date(today + 'T12:00:00Z'); cutoff.setUTCDate(cutoff.getUTCDate() - 30);
  const oldest = cutoff.toISOString().slice(0, 10);
  return (employees || [])
    .filter(e => e.hiredFromApplicantId && e.status !== 'Terminated' && (!e.startDate || e.startDate >= oldest))
    .map(e => ({
      id: e.id, name: e.name, jobTitle: e.jobTitle || '', loc: e.loc || '', workEmail: e.workEmail || '', provider: !!e.provider,
      employmentType: e.employmentType || '', startDate: e.startDate || '',
      hiredOn: String(e.rehiredAt || e.createdAt || '').slice(0, 10),
      started: !!e.startDate && e.startDate <= today,
    }))
    .sort((a, b) => (a.startDate || '9999').localeCompare(b.startDate || '9999') || a.name.localeCompare(b.name));
}
/* ---- end of Onboarding logic ---- */

function obDay(iso) {
  if (!iso) return '';
  const d = new Date(iso + 'T12:00:00Z');
  return isNaN(d) ? '' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

function OnboardingStatus({ me, access, employees, onApplicants, onOpenEmp }) {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  const list = useMemo(() => hiresInOnboarding(employees, today), [employees, today]);

  return (
    <div className="fade-in">
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 18 }}>
        <div>
          <h1 style={{ fontSize: 'clamp(22px,3vw,28px)' }}>Onboarding</h1>
          <p style={{ color: 'var(--ink-2)', fontSize: 14.5, marginTop: 6 }}>{list.length} new hire{list.length === 1 ? '' : 's'}</p>
        </div>
        {onApplicants && <button className="btn btn-primary" onClick={onApplicants}><Icon name="users" /> Applicants</button>}
      </div>

      {list.length === 0 ? (
        <div className="card" style={{ padding: 'clamp(28px,5vw,44px)', textAlign: 'center' }}>
          <h3 style={{ fontSize: 17 }}>No new hires</h3>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {list.map(h => {
            const emp = (employees || []).find(e => e.id === h.id);
            return (
              <button key={h.id} className="card" onClick={() => onOpenEmp && emp && onOpenEmp(emp)}
                style={{ padding: 'var(--pad)', display: 'flex', alignItems: 'center', gap: 16, textAlign: 'left', cursor: 'pointer', border: '1px solid var(--line)', flexWrap: 'wrap' }}>
                <PhotoAvatar emp={{ id: h.id, name: h.name }} size={42} />
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 600, fontSize: 15 }}>{h.name}</span>
                    {h.provider && <Icon name="star" style={{ width: 13, height: 13, color: 'var(--accent)' }} />}
                    {h.employmentType && <span className="badge badge-todo" style={{ fontSize: 10.5 }}>{h.employmentType}</span>}
                  </div>
                  <div style={{ fontSize: 12.5, color: 'var(--ink-3)' }}>{[h.jobTitle, h.loc].filter(Boolean).join(' · ')}</div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'auto auto', gap: '3px 14px', fontSize: 12.5, flex: 'none' }}>
                  <span style={{ color: 'var(--ink-3)' }}>Offer signed</span><span>{obDay(h.hiredOn) || '—'}</span>
                  <span style={{ color: 'var(--ink-3)' }}>Work email</span><span>{h.workEmail || '—'}</span>
                </div>
                <span className={`badge ${h.started ? 'badge-ok' : 'badge-prog'}`} style={{ flex: 'none' }}>
                  {h.startDate ? (h.started ? 'Started ' : 'Starts ') + obDay(h.startDate) : 'No start date'}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

Object.assign(window, { OnboardingStatus, hiresInOnboarding });
