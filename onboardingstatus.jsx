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
/* The applicant the New hire form saves: at the Offer stage, with the offer already
   submitted to the offer approver. f: the form. at: the time in milliseconds. */
function newHireApplicant(f, me, at, id) {
  const name = String(f.name || '').trim().replace(/\s+/g, ' ');
  const cut = name.lastIndexOf(' ');
  const who = (me.first || '') + ' ' + ((me.last || '')[0] || '') + '.';
  const role = String(f.jobTitle || '').trim();
  return {
    id, name, first: cut > 0 ? name.slice(0, cut) : name, last: cut > 0 ? name.slice(cut + 1) : '',
    role, dept: f.dept || '', office: f.office || '', source: 'Submitted by ' + who,
    email: String(f.email || '').trim(), phone: String(f.phone || '').trim(), provider: false,
    stage: 'offer', rating: 0, applied: new Date(at).toISOString().slice(0, 10), feedback: [], notes: [],
    requestedByEmail: String(me.workEmail || '').toLowerCase(), requestedByName: who,
    offer: { status: 'pending_approval', role, employmentType: f.type === 'PT' ? 'Part-time' : 'Full-time', startDate: f.startDate || '',
      payType: f.payType || 'Hourly', pay: String(f.wage || '').trim(), jobDescription: '', extra: '', attachments: [],
      createdAt: at, submittedAt: at, submittedBy: who },
    _offerAction: 'submit',
  };
}
/* ---- end of Onboarding logic ---- */

function obDay(iso) {
  if (!iso) return '';
  const d = new Date(iso + 'T12:00:00Z');
  return isNaN(d) ? '' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

function OnboardingStatus({ me, access, employees, onApplicants, onNewHire, onOpenEmp }) {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  const list = useMemo(() => hiresInOnboarding(employees, today), [employees, today]);

  return (
    <div className="fade-in">
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 18 }}>
        <div>
          <h1 style={{ fontSize: 'clamp(22px,3vw,28px)' }}>Onboarding</h1>
          <p style={{ color: 'var(--ink-2)', fontSize: 14.5, marginTop: 6 }}>{list.length} new hire{list.length === 1 ? '' : 's'}</p>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {onApplicants && <button className="btn btn-ghost" onClick={onApplicants}><Icon name="users" /> Applicants</button>}
          {onNewHire && <button className="btn btn-primary" onClick={onNewHire}><Icon name="plus" /> New hire</button>}
        </div>
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

/* ---------- New hire: a manager sends a person's details to the offer approver ---------- */
const _pf = { width: '100%', padding: '10px 12px', borderRadius: 'var(--r-md)', fontSize: 14, fontFamily: 'var(--font-body)', border: '1.5px solid var(--line)', background: 'var(--surface)', color: 'var(--ink)', outline: 'none' };
function PF({ label, req, children }) {
  return <label style={{ display: 'block' }}><div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--ink-3)', marginBottom: 6 }}>{label}{req && <span style={{ color: 'var(--accent)' }}> *</span>}</div>{children}</label>;
}

function NewHireForm({ me, access, offices, onBack, onOpenApplicant }) {
  const depts = (typeof atsDepts === 'function') ? atsDepts() : [];
  const blank = () => ({ name: '', jobTitle: '', dept: depts[0] || '', type: 'FT', payType: 'Hourly', wage: '', office: (offices.includes(me.loc) ? me.loc : offices[0]) || '', phone: '', email: '', startDate: '' });
  const [f, setF] = useState(blank);
  const set = (k, v) => setF(s => ({ ...s, [k]: v }));
  const [sent, setSent] = useState(null);   // the saved applicant's { id, name }
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const ready = f.name.trim() && f.jobTitle.trim() && f.email.trim() && f.phone.trim() && f.startDate && f.office;

  const send = async () => {
    if (!ready || busy) return;
    setBusy(true); setErr('');
    const rec = newHireApplicant(f, me, Date.now(), 'ap' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6));
    try {
      await pdApi('/api/applicants', { method: 'POST', body: rec });
      setSent({ id: rec.id, name: rec.name });
    } catch (e) { setErr((e && e.message) || 'It could not be sent. Try again.'); }
    setBusy(false);
  };

  if (sent) {
    return (
      <div className="fade-in" style={{ maxWidth: 560, margin: '8px auto' }}>
        <div className="card" style={{ padding: 'clamp(26px,5vw,40px)', textAlign: 'center' }}>
          <div style={{ width: 64, height: 64, margin: '0 auto', borderRadius: '50%', background: 'var(--ok-soft)', color: 'var(--ok)', display: 'grid', placeItems: 'center' }}><Icon name="check" style={{ width: 34, height: 34 }} /></div>
          <h2 style={{ fontSize: 23, marginTop: 14 }}>Sent to HR</h2>
          <p style={{ color: 'var(--ink-2)', fontSize: 14.5, marginTop: 8 }}><b>{sent.name}</b></p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 22, flexWrap: 'wrap' }}>
            <button className="btn btn-ghost" onClick={() => { setSent(null); setF(blank()); }}>Add another</button>
            {onOpenApplicant && <button className="btn btn-ghost" onClick={() => onOpenApplicant(sent.id)}>View applicant</button>}
            <button className="btn btn-primary" onClick={onBack}>Done</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fade-in">
      <button className="btn btn-quiet" onClick={onBack} style={{ marginBottom: 14, marginLeft: -10 }}><Icon name="arrowLeft" /> Back</button>
      <h1 style={{ fontSize: 'clamp(22px,3vw,28px)', marginBottom: 18 }}>New hire</h1>
      <div className="card" style={{ padding: 'var(--pad)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14 }}>
          <PF label="Full name" req><input value={f.name} onChange={e => set('name', e.target.value)} style={_pf} /></PF>
          <PF label="Position" req><input value={f.jobTitle} onChange={e => set('jobTitle', e.target.value)} style={_pf} /></PF>
          <PF label="Department"><select value={f.dept} onChange={e => set('dept', e.target.value)} style={{ ..._pf, appearance: 'auto' }}>{depts.map(d => <option key={d}>{d}</option>)}</select></PF>
          <PF label="Employment type" req><select value={f.type} onChange={e => set('type', e.target.value)} style={{ ..._pf, appearance: 'auto' }}><option value="FT">Full-time</option><option value="PT">Part-time</option></select></PF>
          <PF label="Home office" req><select value={f.office} onChange={e => set('office', e.target.value)} style={{ ..._pf, appearance: 'auto' }}>{offices.map(o => <option key={o}>{o}</option>)}</select></PF>
          <PF label="Start date" req><input type="date" value={f.startDate} onChange={e => set('startDate', e.target.value)} style={_pf} /></PF>
          <PF label="Phone" req><input value={f.phone} onChange={e => set('phone', e.target.value)} style={_pf} /></PF>
          <PF label="Personal email" req><input value={f.email} onChange={e => set('email', e.target.value)} style={_pf} /></PF>
          <PF label="Pay type"><select value={f.payType} onChange={e => set('payType', e.target.value)} style={{ ..._pf, appearance: 'auto' }}><option>Hourly</option><option>Salary</option></select></PF>
          <PF label={f.payType === 'Salary' ? 'Annual salary' : 'Hourly rate'}><input value={f.wage} onChange={e => set('wage', e.target.value)} placeholder={f.payType === 'Salary' ? '$95,000' : '$38.00 / hr'} style={_pf} /></PF>
        </div>
        {err && <div style={{ fontSize: 13, color: 'var(--danger)', marginTop: 14 }}>{err}</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18 }}>
          <button className="btn btn-ghost" onClick={onBack}>Cancel</button>
          <button className="btn btn-primary btn-lg" disabled={!ready || busy} onClick={send}><Icon name="mail" /> {busy ? 'Sending…' : 'Send to HR'}</button>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { OnboardingStatus, NewHireForm, hiresInOnboarding, newHireApplicant });
