/* applicants.jsx — Applicant Tracking (ATS). Manager+ only.
   A hiring pipeline board (Applied → Screening → Interview → Offer → Hired),
   applicant detail, manual add + resume import (parsing behind an integration
   flag), and a one-click "Hire → start onboarding" that hands off to the
   onboarding agent.
*/

const ATS_STAGES = [
  { id: 'applied',   label: 'Applied',   badge: 'badge-todo' },
  { id: 'screening', label: 'Screening', badge: 'badge-prog' },
  { id: 'interview', label: 'Interview', badge: 'badge-prog' },
  { id: 'working',   label: 'Working interview', badge: 'badge-prog' },
  { id: 'offer',     label: 'Offer',     badge: 'badge-warn' },
  { id: 'hired',     label: 'Hired',     badge: 'badge-ok' },
];
const ATS_IDX = {}; ATS_STAGES.forEach((s, i) => ATS_IDX[s.id] = i);
const ATS_SOURCES = ['Indeed', 'LinkedIn', 'Referral', 'Careers page', 'ZipRecruiter', 'Walk-in', 'Other'];
const ATS_DEPTS = ['Front Desk', 'Clinical Team', 'Insurance', 'Operations', 'Management'];
const ATS_DISPOSITIONS = [
  { id: 'never_called', label: 'Never called', badge: 'badge-todo' },
  { id: 'on_file', label: 'On file', badge: 'badge-prog' },
];
const dispDef = (id) => ATS_DISPOSITIONS.find(d => d.id === id);
const dispLabel = (id) => (dispDef(id) || {}).label || '';
const dispBadge = (id) => (dispDef(id) || {}).badge || 'badge-todo';

function atsRoleKey({ provider, role, dept }) {
  if (/hygien|\bRDH\b/i.test(role || '')) return 'hygienist';
  if (provider) return /\b(dds|dmd|dentist|doctor|associate dentist|provider)\b/i.test(role || '') ? 'dentist' : 'hygienist';
  if (/insur|billing/i.test((dept || '') + (role || ''))) return 'insurance';
  return 'frontdesk';
}
function titleFromFile(fn) {
  return (fn || '').replace(/\.[a-z]+$/i, '').replace(/resume|cv|_|-/gi, ' ').replace(/\s+/g, ' ').trim()
    .split(' ').slice(0, 3).map(w => w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : '').join(' ').trim();
}
/* Send a raw résumé PDF to Blob Storage via /api/resumeupload; returns a pointer
   { name, blobPath, url, uploadedAt } to store in the applicant record. */
async function uploadResume(file, applicantId, token) {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let bin = ''; const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  const res = await fetch('/api/resumeupload', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Google-Token': token || '' },
    body: JSON.stringify({ applicantId, filename: file.name, contentBase64: btoa(bin) }),
  });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.json();
}
function atsFmt(d) {
  const p = (typeof pdParseDate === 'function') ? pdParseDate(d) : null;
  if (!p) return d || '—';
  return ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][p.mo - 1] + ' ' + p.d;
}
/* average of interviewer ratings, falling back to the single rating field */
function avgRating(a) {
  const f = (a.feedback || []).filter(x => x.rating);
  if (f.length) return Math.round(f.reduce((s, x) => s + x.rating, 0) / f.length);
  return a.rating || 0;
}

/* role-based job-description templates attached to the offer */
const JD_TEMPLATES = {
  hygienist: 'Registered Dental Hygienist — deliver prophylaxis, periodontal therapy, and patient education; take and interpret radiographs; chart findings in Open Dental / Denticon; uphold infection-control and OSHA standards; partner with the dentist on treatment plans.',
  dentist: 'Associate Dentist — provide comprehensive diagnostic, restorative, and surgical care; develop and present treatment plans; supervise and mentor clinical staff; maintain accurate records and EPCS e-prescribing; uphold quality, safety, and patient-experience standards.',
  frontdesk: 'Front Desk Coordinator — greet and check in patients, manage the provider schedule, verify insurance and eligibility, handle phones and recalls in NexHealth, collect payments, and keep the front office running smoothly.',
  insurance: 'Insurance & Billing Specialist — submit and follow up on claims, post payments, manage AR and appeals, verify eligibility and benefits, and resolve patient billing questions in Denticon.',
};
const OFFER_EXECUTOR = 'Amanda Vibert';   // HR & Payroll — reviews and sends offers
const OFFER_APPROVER_EMAIL = 'mgrant@puredental.com';   // TEMP: testing the pipeline before routing to HR — only this address may approve+send, enforced server-side too

/* Documents available to attach from Google Drive / Shared Drives (simulated until
   the Drive integration is connected). */
const DRIVE_FILES = [
  { name: 'Dental Hygienist — Job Description.pdf', drive: 'shared', loc: 'HR ▸ Job Descriptions' },
  { name: 'Associate Dentist — Job Description.pdf', drive: 'shared', loc: 'HR ▸ Job Descriptions' },
  { name: 'Front Desk Coordinator — Job Description.pdf', drive: 'shared', loc: 'HR ▸ Job Descriptions' },
  { name: 'Insurance & Billing Specialist — Job Description.pdf', drive: 'shared', loc: 'HR ▸ Job Descriptions' },
  { name: 'Dental Assistant — Job Description.pdf', drive: 'shared', loc: 'HR ▸ Job Descriptions' },
  { name: 'Pure Dental — Benefits Summary 2026.pdf', drive: 'shared', loc: 'HR ▸ Benefits' },
  { name: 'Offer Letter Template — Hourly.docx', drive: 'shared', loc: 'HR ▸ Templates' },
  { name: 'Offer Letter Template — Salary.docx', drive: 'shared', loc: 'HR ▸ Templates' },
  { name: 'Employee Handbook 2026.pdf', drive: 'shared', loc: 'HR ▸ Policies' },
  { name: 'At-Will Employment Agreement.pdf', drive: 'shared', loc: 'HR ▸ Legal' },
  { name: 'Working Interview Pay Policy.pdf', drive: 'shared', loc: 'HR ▸ Policies' },
  { name: 'Direct Deposit Authorization.pdf', drive: 'shared', loc: 'Payroll ▸ Forms' },
  { name: 'New Hire Checklist.pdf', drive: 'mydrive', loc: 'My Drive' },
  { name: 'Recruiting — Candidate Scorecard.pdf', drive: 'mydrive', loc: 'My Drive' },
];

function AttachPicker({ driveOn, onPick, onClose }) {
  const [tab, setTab] = useState('device');
  const [q, setQ] = useState('');
  const TABS = [['device', 'This device', 'upload'], ['mydrive', 'My Drive', 'doc'], ['shared', 'Shared Drives', 'users']];
  const onFile = (e) => { const f = e.target.files && e.target.files[0]; if (!f) return; onPick({ name: f.name, kind: 'file', source: 'Upload' }); };
  const pool = DRIVE_FILES.filter(d => tab === 'mydrive' ? d.drive === 'mydrive' : d.drive === 'shared');
  const results = pool.filter(d => !q || (d.name + ' ' + d.loc).toLowerCase().includes(q.toLowerCase()));

  return (
    <ModalShell onClose={onClose} width={520}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 'var(--pad)', borderBottom: '1px solid var(--line-soft)' }}>
        <h2 style={{ fontSize: 18 }}>Attach a document</h2>
        <button className="btn btn-quiet" style={{ padding: 8 }} onClick={onClose}><Icon name="x" /></button>
      </div>
      <div style={{ display: 'flex', gap: 4, padding: '10px var(--pad) 0', borderBottom: '1px solid var(--line)' }}>
        {TABS.map(([id, label, icon]) => (
          <button key={id} onClick={() => setTab(id)} style={{ border: 'none', background: 'none', padding: '8px 12px', fontSize: 13.5, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 7,
            color: tab === id ? 'var(--accent-strong)' : 'var(--ink-3)', borderBottom: `2px solid ${tab === id ? 'var(--accent)' : 'transparent'}`, marginBottom: -1 }}>
            <Icon name={icon} style={{ width: 15, height: 15 }} /> {label}
          </button>
        ))}
      </div>

      <div style={{ padding: 'var(--pad)' }}>
        {tab === 'device' ? (
          <label style={{ display: 'block', cursor: 'pointer' }}>
            <input type="file" accept=".pdf,.doc,.docx,.txt,.png,.jpg" onChange={onFile} style={{ display: 'none' }} />
            <div style={{ border: '1.5px dashed var(--line)', borderRadius: 'var(--r-md)', padding: '26px 18px', textAlign: 'center', background: 'var(--surface-2)' }}>
              <Icon name="upload" style={{ width: 24, height: 24, color: 'var(--accent)', margin: '0 auto 8px', display: 'block' }} />
              <div style={{ fontWeight: 600, fontSize: 14 }}>Drop a file or choose from this device</div>
              <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 3 }}>PDF, Word, or image</div>
            </div>
          </label>
        ) : !driveOn ? (
          <div style={{ textAlign: 'center', padding: '24px 16px' }}>
            <div style={{ width: 46, height: 46, borderRadius: 'var(--r-md)', margin: '0 auto 12px', background: 'var(--accent-soft)', color: 'var(--accent-strong)', display: 'grid', placeItems: 'center' }}><Icon name="link" style={{ width: 22, height: 22 }} /></div>
            <h3 style={{ fontSize: 15.5 }}>Google Drive isn’t connected yet</h3>
            <p style={{ color: 'var(--ink-2)', fontSize: 13, marginTop: 6, lineHeight: 1.5, maxWidth: 360, marginInline: 'auto' }}>Once an admin connects Google Drive in <b>Admin → Modules</b>, you can search {tab === 'shared' ? 'Shared Drives' : 'My Drive'} for job descriptions, offer templates and forms. For now, upload from this device.</p>
            <button className="btn btn-ghost" style={{ marginTop: 14 }} onClick={() => setTab('device')}><Icon name="upload" /> Upload from device</button>
          </div>
        ) : (
          <>
            <div style={{ position: 'relative', marginBottom: 12 }}>
              <Icon name="search" style={{ width: 15, height: 15, color: 'var(--ink-3)', position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)' }} />
              <input value={q} onChange={e => setQ(e.target.value)} autoFocus placeholder={`Search ${tab === 'shared' ? 'Shared Drives' : 'My Drive'}…`} style={{ ...atsFld, paddingLeft: 34 }} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: '46vh', overflowY: 'auto' }}>
              {results.length === 0 ? <div style={{ textAlign: 'center', color: 'var(--ink-3)', fontSize: 13, padding: '20px 0' }}>No documents match “{q}”.</div>
                : results.map((d, i) => (
                  <button key={i} onClick={() => onPick({ name: d.name, kind: 'file', source: tab === 'shared' ? 'Shared Drive' : 'Drive', loc: d.loc })}
                    style={{ display: 'flex', alignItems: 'center', gap: 11, textAlign: 'left', border: '1px solid var(--line)', background: 'var(--surface)', borderRadius: 'var(--r-md)', padding: '10px 12px', cursor: 'pointer' }}
                    onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--accent)'} onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--line)'}>
                    <Icon name="doc" style={{ width: 17, height: 17, color: 'var(--accent-strong)', flex: 'none' }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.name}</div>
                      <div style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>{d.loc}</div>
                    </div>
                    <Icon name="plus" style={{ width: 15, height: 15, color: 'var(--ink-3)', flex: 'none' }} />
                  </button>
                ))}
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 12, display: 'flex', gap: 6, alignItems: 'center' }}><Icon name="shield" style={{ width: 13, height: 13 }} /> Connected as Pure Dental Workspace · {tab === 'shared' ? 'Shared Drives' : 'My Drive'}</div>
          </>
        )}
      </div>
    </ModalShell>
  );
}
function draftOffer(a) {
  const start = new Date(Date.now() + 14 * 864e5).toISOString().slice(0, 10);
  return { status: 'draft', role: a.role, startDate: start, payType: atsRoleKey(a) === 'dentist' ? 'Salary' : 'Hourly', pay: '', jobDescription: JD_TEMPLATES[atsRoleKey(a)] || '', extra: '', attachments: [{ name: a.role + ' — Job Description.pdf', kind: 'jd' }], createdAt: Date.now() };
}

const ATS_SEED = [];

/* ------- small UI bits ------- */
function Stars({ value = 0, onChange }) {
  if (!onChange) {
    return (
      <span style={{ display: 'inline-flex', gap: 2 }}>
        {[1, 2, 3, 4, 5].map(n => (
          <span key={n} style={{ lineHeight: 0, color: n <= value ? 'var(--warn)' : 'var(--line)' }}>
            <Icon name="star" style={{ width: 16, height: 16 }} />
          </span>
        ))}
      </span>
    );
  }
  return (
    <div style={{ display: 'inline-flex', gap: 2 }}>
      {[1, 2, 3, 4, 5].map(n => (
        <button key={n} onClick={() => onChange(n === value ? 0 : n)}
          style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer', lineHeight: 0, color: n <= value ? 'var(--warn)' : 'var(--line)' }} title={`${n} / 5`}>
          <Icon name="star" style={{ width: 16, height: 16 }} />
        </button>
      ))}
    </div>
  );
}

const atsFld = { width: '100%', padding: '10px 12px', borderRadius: 'var(--r-md)', fontSize: 14, fontFamily: 'var(--font-body)', border: '1.5px solid var(--line)', background: 'var(--surface)', color: 'var(--ink)', outline: 'none' };
function AF({ label, req, children, hint }) {
  return <label style={{ display: 'block' }}><div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--ink-3)', marginBottom: 6 }}>{label}{req && <span style={{ color: 'var(--accent)' }}> *</span>}</div>{children}{hint && <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 5 }}>{hint}</div>}</label>;
}

function ModalShell({ onClose, width = 560, children }) {
  return ReactDOM.createPortal((
    <div className="fade-in" onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 90, background: 'oklch(0.2 0.03 250 / 0.45)', display: 'grid', placeItems: 'center', padding: '4vh 16px' }}>
      <div onClick={e => e.stopPropagation()} className="card" style={{ width: `min(${width}px, 96vw)`, maxHeight: '92vh', overflowY: 'auto', padding: 0, boxShadow: 'var(--shadow-lg)' }}>
        {children}
      </div>
    </div>
  ), document.body);
}

/* ------- Add / Import applicant ------- */
const blankDraft = (offices) => ({ _id: 'd' + Math.random().toString(36).slice(2, 8), id: 'ap' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), _file: null, first: '', last: '', role: '', dept: 'Front Desk', office: offices[0] || 'Manorville', source: 'Indeed', email: '', phone: '', address: '', years: '', provider: false, resumeText: '', fileName: '', parsing: false, parsed: false, noText: false });
const draftReady = (d) => d.first.trim() && d.last.trim() && d.email.trim() && d.role.trim();

function DraftCard({ d, offices, onChange, onRemove }) {
  const [showText, setShowText] = useState(false);
  const set = (k, v) => onChange(d._id, { [k]: v });
  return (
    <div className="card" style={{ padding: 0, border: '1px solid var(--line)', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'var(--surface-2)', borderBottom: '1px solid var(--line-soft)' }}>
        <Icon name="doc" style={{ width: 15, height: 15, color: 'var(--accent-strong)', flex: 'none' }} />
        <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.parsing ? 'Parsing résumé…' : (d.fileName || 'Manual entry')}</span>
        {d.parsing && <span className="spin" style={{ width: 15, height: 15, border: '2px solid var(--line)', borderTopColor: 'var(--accent)', borderRadius: '50%', display: 'block', flex: 'none' }} />}
        {d.parsed && !d.parsing && <span className="badge badge-ok" style={{ fontSize: 9.5, flex: 'none' }}><Icon name="sparkle" /> Parsed</span>}
        {d.noText && !d.parsing && <span className="badge badge-warn" style={{ fontSize: 9.5, flex: 'none' }}>No text — enter manually</span>}
        {!d.parsing && !draftReady(d) && !d.noText && <span className="badge badge-todo" style={{ fontSize: 9.5, flex: 'none' }}>Needs review</span>}
        <button className="btn btn-quiet" style={{ padding: 6, flex: 'none' }} onClick={() => onRemove(d._id)} title="Remove"><Icon name="x" style={{ width: 14, height: 14 }} /></button>
      </div>
      <div style={{ padding: 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <AF label="First name" req><input value={d.first} onChange={e => set('first', e.target.value)} placeholder="e.g. Jordan" style={atsFld} /></AF>
          <AF label="Last name" req><input value={d.last} onChange={e => set('last', e.target.value)} placeholder="e.g. Avery" style={atsFld} /></AF>
          <AF label="Email" req><input value={d.email} onChange={e => set('email', e.target.value)} placeholder="name@email.com" style={atsFld} /></AF>
          <AF label="Cell phone"><input value={d.phone} onChange={e => set('phone', e.target.value)} placeholder="(631) 555-0123" style={atsFld} /></AF>
        </div>
        <div style={{ marginTop: 12 }}><AF label="Address"><input value={d.address} onChange={e => set('address', e.target.value)} placeholder="Street, City, ST ZIP" style={atsFld} /></AF></div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
          <AF label="Role applied for" req hint="You set this"><input value={d.role} onChange={e => set('role', e.target.value)} placeholder="e.g. Dental Hygienist" style={atsFld} /></AF>
          <AF label="Department"><select value={d.dept} onChange={e => set('dept', e.target.value)} style={{ ...atsFld, appearance: 'auto' }}>{ATS_DEPTS.map(x => <option key={x}>{x}</option>)}</select></AF>
          <AF label="Office"><select value={d.office} onChange={e => set('office', e.target.value)} style={{ ...atsFld, appearance: 'auto' }}>{offices.map(o => <option key={o}>{o}</option>)}</select></AF>
          <AF label="Source"><select value={d.source} onChange={e => set('source', e.target.value)} style={{ ...atsFld, appearance: 'auto' }}>{ATS_SOURCES.map(s => <option key={s}>{s}</option>)}</select></AF>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12, cursor: 'pointer', fontSize: 13.5, fontWeight: 600 }}>
          <input type="checkbox" checked={d.provider} onChange={e => set('provider', e.target.checked)} style={{ width: 16, height: 16, accentColor: 'var(--accent)' }} /> Clinical provider (needs NPI / license)
        </label>
        {d.resumeText && (
          <div style={{ marginTop: 12 }}>
            <button className="btn btn-quiet" style={{ fontSize: 12.5, padding: '4px 0', color: 'var(--accent-strong)' }} onClick={() => setShowText(v => !v)}><Icon name="chevron" style={{ width: 13, height: 13, transform: showText ? 'rotate(90deg)' : 'none', transition: 'transform .2s' }} /> {showText ? 'Hide' : 'Show'} extracted text — {d.resumeText.length.toLocaleString()} chars kept on file</button>
            {showText && <pre style={{ marginTop: 8, maxHeight: 200, overflow: 'auto', background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 'var(--r-md)', padding: '10px 12px', fontSize: 11.5, lineHeight: 1.5, whiteSpace: 'pre-wrap', fontFamily: 'var(--font-mono)', color: 'var(--ink-2)', margin: '8px 0 0' }}>{d.resumeText}</pre>}
          </div>
        )}
      </div>
    </div>
  );
}

function AddApplicant({ offices, parseOn, onSave, onClose, flash }) {
  const [drafts, setDrafts] = useState([]);
  const [drag, setDrag] = useState(false);
  const [manual, setManual] = useState(false);
  const update = (id, patch) => setDrafts(ds => ds.map(d => d._id === id ? { ...d, ...patch } : d));
  const remove = (id) => setDrafts(ds => { const next = ds.filter(d => d._id !== id); if (next.length === 0) setManual(false); return next; });
  const addManual = () => { setManual(true); setDrafts(ds => [...ds, blankDraft(offices)]); };

  const ingest = (fileList) => {
    const files = Array.from(fileList || []).filter(f => /\.pdf$/i.test(f.name) || f.type === 'application/pdf');
    if (!files.length) { if (flash) flash('Drop PDF résumés to parse'); return; }
    files.forEach(file => {
      const base = blankDraft(offices);
      base.fileName = file.name;
      base._file = file;
      if (!window.PD_RESUME) { setDrafts(ds => [...ds, base]); return; }
      base.parsing = true;
      setDrafts(ds => [...ds, base]);
      window.PD_RESUME.parseFile(file).then(res => {
        const f = res.fields || {};
        update(base._id, { first: f.first || '', last: f.last || '', email: f.email || '', phone: f.phone || '', address: f.address || '', resumeText: res.text || '', parsing: false, parsed: !res.empty, noText: !!res.empty });
      }).catch(() => update(base._id, { parsing: false, noText: true }));
    });
  };
  const onFile = (e) => { ingest(e.target.files); e.target.value = ''; };
  const onDrop = (e) => { e.preventDefault(); setDrag(false); ingest(e.dataTransfer.files); };

  const parsingCount = drafts.filter(d => d.parsing).length;
  const ready = drafts.length > 0 && parsingCount === 0 && drafts.every(draftReady);

  return (
    <ModalShell onClose={onClose} width={720}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 'var(--pad)', borderBottom: '1px solid var(--line-soft)' }}>
        <div>
          <h2 style={{ fontSize: 19 }}>Add applicants</h2>
          <p style={{ fontSize: 12.5, color: 'var(--ink-3)', marginTop: 3 }}>Drop résumé PDFs to parse contact details, or add someone manually.</p>
        </div>
        <button className="btn btn-quiet" style={{ padding: 8 }} onClick={onClose}><Icon name="x" /></button>
      </div>
      <div style={{ padding: 'var(--pad)' }}>
        {!manual && (
          <label onDragOver={e => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={onDrop} style={{ display: 'block', cursor: 'pointer', marginBottom: drafts.length ? 16 : 0 }}>
            <input type="file" accept=".pdf" multiple onChange={onFile} style={{ display: 'none' }} />
            <div style={{ border: `1.5px dashed ${drag ? 'var(--accent)' : 'var(--line)'}`, borderRadius: 'var(--r-md)', padding: '26px 18px', textAlign: 'center', background: drag ? 'var(--accent-soft)' : 'var(--surface-2)', transition: '.15s' }}>
              <Icon name="upload" style={{ width: 26, height: 26, color: 'var(--accent)', margin: '0 auto 10px', display: 'block' }} />
              <div style={{ fontWeight: 600, fontSize: 14.5 }}>Drop résumé PDFs here to build the pool</div>
              <div style={{ fontSize: 12.5, color: 'var(--ink-3)', marginTop: 4, maxWidth: 460, marginInline: 'auto', lineHeight: 1.5 }}>We pull first & last name, email, cell phone and address from each PDF — you set the role & department. Drop several at once.</div>
            </div>
          </label>
        )}

        {drafts.length > 0 && (
          <>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink-2)', margin: '4px 0 10px' }}>{drafts.length} applicant{drafts.length === 1 ? '' : 's'} to review{parsingCount ? ` · parsing ${parsingCount}…` : ''}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {drafts.map(d => <DraftCard key={d._id} d={d} offices={offices} onChange={update} onRemove={remove} />)}
            </div>
          </>
        )}
        <button className="btn btn-ghost" style={{ marginTop: 14 }} onClick={addManual}><Icon name="plus" /> Add someone manually</button>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: 'var(--pad)', borderTop: '1px solid var(--line-soft)' }}>
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" disabled={!ready} onClick={() => onSave(drafts)}><Icon name="plus" /> Add {drafts.length > 1 ? drafts.length + ' ' : ''}to pipeline</button>
      </div>
    </ModalShell>
  );
}

/* ------- Working interview panel ------- */
function WorkingInterview({ a, canPay, paychexOn, onWI, onScheduleWI, onRemoveWI, flash }) {
  const wi = a.workingInterview;
  const sent = wi && wi.status === 'sent';
  const completed = wi && wi.status === 'completed';
  const payText = paychexOn ? 'Accounting will post it to Paychex for the next pay run.' : 'Accounting will process the day’s pay manually.';

  const markComplete = () => {
    if (!wi.hours) { if (flash) flash('Enter hours worked first'); return; }
    if (wi.autoSend) { onWI(a.id, { status: 'sent', completedAt: Date.now(), sentAt: Date.now() }); if (flash) flash(`${wi.hours}h sent to Accounting for ${a.name.split(' ')[0]}`); }
    else onWI(a.id, { status: 'completed', completedAt: Date.now() });
  };
  const sendNow = () => { onWI(a.id, { status: 'sent', sentAt: Date.now() }); if (flash) flash(`${wi.hours}h sent to Accounting for ${a.name.split(' ')[0]}`); };

  return (
    <div style={{ borderRadius: 'var(--r-md)', border: '1px solid var(--line)', background: 'var(--surface-2)', padding: '14px var(--pad)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: wi ? 12 : 8 }}>
        <Icon name="clock" style={{ width: 15, height: 15, color: 'var(--accent-strong)' }} />
        <span style={{ fontSize: 12.5, fontWeight: 700 }}>Working interview</span>
        {sent && <span className="badge badge-ok" style={{ fontSize: 9.5 }}><Icon name="check" /> Hours sent</span>}
        {completed && <span className="badge badge-warn" style={{ fontSize: 9.5 }}>Day complete</span>}
        {wi && wi.status === 'scheduled' && <span className="badge badge-prog" style={{ fontSize: 9.5 }}>Scheduled</span>}
      </div>

      {!wi ? (
        <div>
          <p style={{ fontSize: 12.5, color: 'var(--ink-3)', marginBottom: 10, lineHeight: 1.5 }}>Common for clinical roles — the candidate works a paid trial day. Schedule it here, then send the hours to Accounting for payment.</p>
          <button className="btn btn-ghost" onClick={() => onScheduleWI(a.id)}><Icon name="plus" /> Schedule working interview</button>
        </div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: canPay ? '1fr 1fr 1fr' : '1fr 1fr', gap: 12 }}>
            <AF label="Day"><input type="date" disabled={sent} value={wi.date || ''} onChange={e => onWI(a.id, { date: e.target.value })} style={atsFld} /></AF>
            <AF label="Hours worked"><input disabled={sent} value={wi.hours || ''} onChange={e => onWI(a.id, { hours: e.target.value.replace(/[^0-9.]/g, '') })} placeholder="e.g. 6" inputMode="decimal" style={atsFld} /></AF>
            {canPay && <AF label="Rate / hr" hint="Payroll only"><input disabled={sent} value={wi.rate || ''} onChange={e => onWI(a.id, { rate: e.target.value })} placeholder="$38.00" style={atsFld} /></AF>}
          </div>

          {!sent && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 12, cursor: 'pointer', fontSize: 13 }}>
              <input type="checkbox" checked={wi.autoSend !== false} onChange={e => onWI(a.id, { autoSend: e.target.checked })} style={{ width: 16, height: 16, accentColor: 'var(--accent)' }} />
              <span><b>Auto-send</b> hours to Accounting when the day is marked complete</span>
            </label>
          )}

          {sent ? (
            <div className="fade-in" style={{ marginTop: 12, display: 'flex', alignItems: 'flex-start', gap: 10, padding: '11px 14px', borderRadius: 'var(--r-md)', background: 'var(--ok-soft)' }}>
              <Icon name="check" style={{ width: 18, height: 18, color: 'var(--ok)', flex: 'none', marginTop: 1 }} />
              <div style={{ fontSize: 13, color: 'oklch(0.4 0.12 155)', lineHeight: 1.5 }}>
                <b>{wi.hours}h on {atsFmt(wi.date)}{canPay && wi.rate ? ` · ${wi.rate}/hr` : ''}</b> sent to Accounting for payment. {payText}
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
              {completed
                ? <button className="btn btn-primary" onClick={sendNow}><Icon name="mail" /> Send {wi.hours || '—'}h to Accounting</button>
                : <button className="btn btn-primary" onClick={markComplete}><Icon name="check" /> Mark day complete{wi.autoSend !== false ? ' & send hours' : ''}</button>}
              <button className="btn btn-quiet" style={{ fontSize: 12.5, color: 'var(--ink-3)' }} onClick={() => onRemoveWI(a.id)}>Remove</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ------- Offer letter ------- */
function OfferLetter({ a, canPay, canExecute, isApprover, driveOn, onOffer, onDraftOffer, onSubmit, onApprove, onSendBack, onSign, flash }) {
  const o = a.offer;
  const [sig, setSig] = useState('');
  const [picker, setPicker] = useState(false);
  const fmtStart = (d) => atsFmt(d);

  if (!o) {
    return (
      <div style={{ borderRadius: 'var(--r-md)', border: '1px solid var(--line)', background: 'var(--surface-2)', padding: '14px var(--pad)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <Icon name="doc" style={{ width: 15, height: 15, color: 'var(--accent-strong)' }} /><span style={{ fontSize: 12.5, fontWeight: 700 }}>Offer letter</span>
        </div>
        <p style={{ fontSize: 12.5, color: 'var(--ink-3)', marginBottom: 10, lineHeight: 1.5 }}>Draft an offer with the role, job description, and pay for {OFFER_EXECUTOR} (HR &amp; Payroll) to review and send.</p>
        <button className="btn btn-ghost" onClick={() => onDraftOffer(a.id)}><Icon name="plus" /> Draft offer letter</button>
      </div>
    );
  }

  const setO = (patch) => onOffer(a.id, patch);
  const addAttach = (att) => setO({ attachments: [...(o.attachments || []), att] });
  const rmAttach = (i) => setO({ attachments: (o.attachments || []).filter((_, j) => j !== i) });
  const editable = o.status === 'draft';
  const pending = o.status === 'pending_approval';
  const summaryBlock = (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--r-md)', padding: '14px 16px', fontSize: 13, lineHeight: 1.6 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '5px 14px' }}>
        <span style={{ color: 'var(--ink-3)' }}>Role</span><b>{o.role}</b>
        <span style={{ color: 'var(--ink-3)' }}>Start date</span><span>{fmtStart(o.startDate)}</span>
        {canPay && o.pay && <><span style={{ color: 'var(--ink-3)' }}>Pay</span><span>{o.pay} <span className="badge badge-todo" style={{ fontSize: 9 }}>protected</span></span></>}
      </div>
      {o.jobDescription && <p style={{ marginTop: 10, color: 'var(--ink-2)' }}>{o.jobDescription}</p>}
      {o.extra && <p style={{ marginTop: 8, color: 'var(--ink-2)' }}>{o.extra}</p>}
      {(o.attachments || []).length > 0 && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>{o.attachments.map((at, i) => <span key={i} className="badge badge-todo" style={{ fontSize: 10.5 }}><Icon name="doc" style={{ width: 11, height: 11 }} /> {at.name}</span>)}</div>}
    </div>
  );

  return (
    <div style={{ borderRadius: 'var(--r-md)', border: '1px solid var(--line)', background: 'var(--surface-2)', padding: '14px var(--pad)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <Icon name="doc" style={{ width: 15, height: 15, color: 'var(--accent-strong)' }} />
        <span style={{ fontSize: 12.5, fontWeight: 700 }}>Offer letter</span>
        {o.status === 'draft' && <span className="badge badge-todo" style={{ fontSize: 9.5 }}>Draft</span>}
        {o.status === 'pending_approval' && <span className="badge badge-warn" style={{ fontSize: 9.5 }}>Awaiting {OFFER_EXECUTOR}'s approval</span>}
        {o.status === 'sent' && <span className="badge badge-prog" style={{ fontSize: 9.5 }}>Sent · awaiting signature</span>}
        {o.status === 'signed' && <span className="badge badge-ok" style={{ fontSize: 9.5 }}><Icon name="check" /> Accepted &amp; signed</span>}
      </div>

      {editable ? (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <AF label="Role / title"><input value={o.role || ''} onChange={e => setO({ role: e.target.value })} style={atsFld} /></AF>
            <AF label="Start date"><input type="date" value={o.startDate || ''} onChange={e => setO({ startDate: e.target.value })} style={atsFld} /></AF>
          </div>
          {/* pay — protected */}
          <div style={{ marginTop: 12, padding: '12px 14px', borderRadius: 'var(--r-md)', background: 'var(--surface)', border: '1px solid var(--line)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: canPay ? 10 : 0 }}>
              <Icon name="lock" style={{ width: 13, height: 13, color: 'var(--accent)' }} />
              <span style={{ fontSize: 11.5, fontWeight: 700 }}>Pay</span>
              <span className="badge badge-todo" style={{ fontSize: 9.5 }}>HR &amp; Leadership only</span>
            </div>
            {canPay ? (
              <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr', gap: 12 }}>
                <AF label="Type"><select value={o.payType || 'Hourly'} onChange={e => setO({ payType: e.target.value })} style={{ ...atsFld, appearance: 'auto' }}><option>Hourly</option><option>Salary</option></select></AF>
                <AF label={o.payType === 'Salary' ? 'Annual salary' : 'Hourly rate'}><input value={o.pay || ''} onChange={e => setO({ pay: e.target.value })} placeholder={o.payType === 'Salary' ? '$95,000' : '$32.00 / hr'} style={atsFld} /></AF>
              </div>
            ) : <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 6 }}>Compensation is entered and visible only to HR &amp; Leadership.</div>}
          </div>
          <div style={{ marginTop: 12 }}><AF label="Job description (attached to the offer)"><textarea value={o.jobDescription || ''} onChange={e => setO({ jobDescription: e.target.value })} rows={3} style={{ ...atsFld, resize: 'vertical', lineHeight: 1.5 }} /></AF></div>
          <div style={{ marginTop: 12 }}><AF label="Additional details" hint="Anything else to include in the letter"><textarea value={o.extra || ''} onChange={e => setO({ extra: e.target.value })} rows={2} placeholder="e.g. sign-on bonus, schedule, reports-to, contingencies…" style={{ ...atsFld, resize: 'vertical', lineHeight: 1.5 }} /></AF></div>
          {/* attachments */}
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--ink-3)', marginBottom: 6 }}>Attachments</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {(o.attachments || []).map((at, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 13, background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--r-sm)', padding: '8px 11px' }}>
                  <Icon name="doc" style={{ width: 14, height: 14, color: 'var(--ink-3)', flex: 'none' }} />
                  <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{at.name}</span>
                  {at.source && at.source !== 'Upload' && <span className="badge badge-todo" style={{ fontSize: 9.5, flex: 'none' }}><Icon name="link" style={{ width: 10, height: 10 }} /> {at.source}</span>}
                  <button className="btn btn-quiet" style={{ padding: 5, flex: 'none' }} onClick={() => rmAttach(i)} title="Remove"><Icon name="x" style={{ width: 13, height: 13 }} /></button>
                </div>
              ))}
            </div>
            <button className="btn btn-ghost" style={{ marginTop: 8, padding: '7px 12px', fontSize: 13 }} onClick={() => setPicker(true)}><Icon name="plus" style={{ width: 14, height: 14 }} /> Add attachment</button>
            <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 6 }}>Search this device, My Drive or Shared Drives.</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
            {canExecute
              ? <button className="btn btn-primary" disabled={canPay && !o.pay} onClick={() => onSubmit(a.id)}><Icon name="mail" /> Submit to {OFFER_EXECUTOR} for approval</button>
              : <span style={{ fontSize: 12.5, color: 'var(--ink-2)', display: 'inline-flex', alignItems: 'center', gap: 7 }}><Icon name="lock" style={{ width: 14, height: 14 }} /> Draft ready — {OFFER_EXECUTOR} (HR) will review &amp; send.</span>}
            {canExecute && canPay && !o.pay && <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>Add pay to send</span>}
          </div>
          {picker && <AttachPicker driveOn={driveOn} onPick={(att) => { addAttach(att); setPicker(false); }} onClose={() => setPicker(false)} />}
        </>
      ) : pending ? (
        <>
          {summaryBlock}
          {isApprover ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
              <button className="btn btn-primary" onClick={() => onApprove(a.id)}><Icon name="check" /> Approve &amp; send to {a.name.split(' ')[0]}</button>
              <button className="btn btn-ghost" onClick={() => onSendBack(a.id)}>Send back to draft</button>
            </div>
          ) : (
            <div style={{ fontSize: 12.5, color: 'var(--ink-2)', marginTop: 12, display: 'flex', alignItems: 'center', gap: 7 }}><Icon name="clock" style={{ width: 14, height: 14 }} /> Submitted by {o.submittedBy || 'recruiter'} — awaiting {OFFER_EXECUTOR}'s approval before it reaches the candidate.</div>
          )}
        </>
      ) : (
        <>
          {/* read-only letter summary */}
          {summaryBlock}

          {o.status === 'signed' ? (
            <div className="fade-in" style={{ marginTop: 12, display: 'flex', alignItems: 'flex-start', gap: 10, padding: '12px 14px', borderRadius: 'var(--r-md)', background: 'var(--ok-soft)' }}>
              <Icon name="check" style={{ width: 18, height: 18, color: 'var(--ok)', flex: 'none', marginTop: 1 }} />
              <div style={{ fontSize: 13, color: 'oklch(0.4 0.12 155)', lineHeight: 1.5 }}>Accepted &amp; e-signed by <b>{o.signature}</b> on {atsFmt(new Date(o.signedAt).toISOString().slice(0, 10))}. The onboarding team was notified and onboarding has started.</div>
            </div>
          ) : (
            <>
              <div style={{ fontSize: 12.5, color: 'var(--ink-2)', marginTop: 10, display: 'flex', alignItems: 'center', gap: 7 }}><Icon name="mail" style={{ width: 14, height: 14 }} /> Sent by {o.sentBy || OFFER_EXECUTOR} — awaiting the candidate’s signature.</div>
              {/* candidate acceptance (simulated) */}
              <div style={{ marginTop: 12, border: '1.5px dashed var(--line)', borderRadius: 'var(--r-md)', padding: '13px 15px' }}>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--ink-3)', marginBottom: 8 }}>Candidate acceptance (preview)</div>
                <p style={{ fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.5, marginBottom: 10 }}>This is what {a.name.split(' ')[0]} sees in their secure link. Typing their name and signing accepts the offer and notifies the onboarding team.</p>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <input value={sig} onChange={e => setSig(e.target.value)} placeholder="Type full legal name to e-sign" style={{ ...atsFld, flex: 1, minWidth: 180, fontFamily: 'var(--font-display)' }} />
                  <button className="btn btn-primary" disabled={!sig.trim()} onClick={() => onSign(a.id, sig.trim())}><Icon name="pen" /> Accept &amp; sign</button>
                </div>
                {canExecute && <button className="btn btn-quiet" style={{ fontSize: 12, marginTop: 8, color: 'var(--ink-3)' }} onClick={() => onOffer(a.id, { status: 'draft' })}>Edit / revise offer</button>}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

/* ------- Applicant detail ------- */
function ApplicantDetail({ a, access, me, paychexOn, driveOn, onClose, onStage, onFeedback, onNote, onWI, onScheduleWI, onRemoveWI, onOffer, onDraftOffer, onSubmitOffer, onApproveOffer, onSendBackOffer, onSignOffer, onHire, onReject, onDisposition, flash }) {
  const myFb = (a.feedback || []).find(f => f.byId === me.id);
  const [note, setNote] = useState('');
  const [showFull, setShowFull] = useState(false);
  const [myRating, setMyRating] = useState(myFb ? myFb.rating : 0);
  const [myComment, setMyComment] = useState(myFb ? myFb.comment : '');
  const idx = ATS_IDX[a.stage] != null ? ATS_IDX[a.stage] : 0;
  const rejected = a.stage === 'rejected';
  const stageDef = ATS_STAGES[idx] || ATS_STAGES[0];
  const canPay = access.caps.payroll || access.flags.isExec;
  const canExecute = access.flags.isHR || access.flags.isAdmin || access.flags.isExec || access.caps.payroll;
  const isApprover = (me.workEmail || '').toLowerCase() === OFFER_APPROVER_EMAIL;
  const avg = avgRating(a);
  const fb = a.feedback || [];
  const showWI = !rejected && (a.workingInterview || a.provider || idx >= ATS_IDX.interview);
  const showOffer = !rejected && (a.offer || idx >= ATS_IDX.offer);

  const addNote = () => { if (!note.trim()) return; onNote(a.id, note.trim()); setNote(''); };
  const postFb = () => { if (!myRating && !myComment.trim()) return; onFeedback(a.id, myRating, myComment.trim()); if (flash) flash('Your feedback was posted'); };

  return (
    <ModalShell onClose={onClose} width={600}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: 'var(--pad)', borderBottom: '1px solid var(--line-soft)' }}>
        <PhotoAvatar emp={{ id: a.id, name: a.name }} size={48} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <h2 style={{ fontSize: 19 }}>{a.name}</h2>
            {a.provider && <Icon name="star" style={{ width: 14, height: 14, color: 'var(--accent)' }} />}
          </div>
          <div style={{ fontSize: 13, color: 'var(--ink-3)' }}>{a.role} · {a.office}</div>
        </div>
        <span className={`badge ${rejected ? 'badge-todo' : stageDef.badge}`} style={{ flex: 'none' }}>{rejected ? 'Archived' : stageDef.label}</span>
        <button className="btn btn-quiet" style={{ padding: 8, flex: 'none' }} onClick={onClose}><Icon name="x" /></button>
      </div>

      <div style={{ padding: 'var(--pad)', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* pipeline tracker — click a stage to move there */}
        {!rejected && (
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 0 }}>
            {ATS_STAGES.map((s, i) => (
              <React.Fragment key={s.id}>
                <button onClick={() => onStage(a.id, s.id)} title={`Move to ${s.label}`}
                  style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, flex: 'none', border: 'none', background: 'none', cursor: 'pointer', padding: 0, width: 64 }}>
                  <div style={{ width: 26, height: 26, borderRadius: '50%', display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 700,
                    background: i < idx ? 'var(--ok)' : i === idx ? 'var(--accent)' : 'var(--surface-2)', color: i <= idx ? '#fff' : 'var(--ink-3)', border: i > idx ? '1px solid var(--line)' : 'none' }}>
                    {i < idx ? <Icon name="check" style={{ width: 14, height: 14 }} /> : i + 1}
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 600, color: i === idx ? 'var(--accent-strong)' : 'var(--ink-3)', textAlign: 'center', lineHeight: 1.2 }}>{s.label}</span>
                </button>
                {i < ATS_STAGES.length - 1 && <div style={{ flex: 1, height: 2, background: i < idx ? 'var(--ok)' : 'var(--line)', marginTop: 12 }} />}
              </React.Fragment>
            ))}
          </div>
        )}

        {!rejected && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--ink-3)' }}>Status</span>
            {ATS_DISPOSITIONS.map(d => {
              const on = a.disposition === d.id;
              return <button key={d.id} onClick={() => onDisposition(a.id, d.id)} className={on ? 'btn btn-primary' : 'btn btn-ghost'} style={{ fontSize: 12.5, padding: '6px 12px' }}>{on && <Icon name="check" style={{ width: 13, height: 13 }} />} {d.label}</button>;
            })}
          </div>
        )}

        {/* contact */}
        <div style={{ borderRadius: 'var(--r-md)', background: 'var(--surface-2)', border: '1px solid var(--line)', padding: '14px var(--pad)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 }}>
            <span style={{ fontSize: 11.5, fontWeight: 700 }}>Contact</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '7px 16px', fontSize: 13 }}>
            <span style={{ color: 'var(--ink-3)' }}>Email</span><a href={'mailto:' + a.email} style={{ color: 'var(--accent-strong)', fontWeight: 600 }}>{a.email}</a>
            <span style={{ color: 'var(--ink-3)' }}>Phone</span><span style={{ fontWeight: 600 }}>{a.phone || '—'}</span>
            {a.address && <><span style={{ color: 'var(--ink-3)' }}>Address</span><span>{a.address}</span></>}
            <span style={{ color: 'var(--ink-3)' }}>Source</span><span>{a.source}{a.years ? ` · ${a.years} yr${a.years === 1 ? '' : 's'} exp.` : ''}</span>
            <span style={{ color: 'var(--ink-3)' }}>Applied</span><span>{atsFmt(a.applied)}</span>
          </div>
        </div>

        {/* working interview */}
        {showWI && <WorkingInterview a={a} canPay={canPay} paychexOn={paychexOn} onWI={onWI} onScheduleWI={onScheduleWI} onRemoveWI={onRemoveWI} flash={flash} />}

        {/* offer letter */}
        {showOffer && <OfferLetter a={a} canPay={canPay} canExecute={canExecute} isApprover={isApprover} driveOn={driveOn} onOffer={onOffer} onDraftOffer={onDraftOffer} onSubmit={onSubmitOffer} onApprove={onApproveOffer} onSendBack={onSendBackOffer} onSign={onSignOffer} flash={flash} />}

        {/* resume summary + full extracted text on file + raw PDF pointers */}
        {(a.resume || a.resumeText || (a.resumes || []).length > 0) && (
          <div>
            <div style={{ fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--ink-3)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}><Icon name="doc" style={{ width: 13, height: 13 }} /> Résumé{a.resumeText ? ' · on file' : ''}</div>
            {a.resume && <p style={{ fontSize: 13.5, color: 'var(--ink-2)', lineHeight: 1.55 }}>{a.resume}</p>}
            {(a.resumes || []).length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, margin: '2px 0 4px' }}>
                {a.resumes.map((r, i) => (
                  <a key={i} href={r.url || '#'} target="_blank" rel="noreferrer" className="badge badge-todo" style={{ fontSize: 10.5, textDecoration: 'none' }}><Icon name="doc" style={{ width: 11, height: 11 }} /> {r.name || 'Résumé PDF'}</a>
                ))}
              </div>
            )}
            {a.resumeText && (
              <>
                <button className="btn btn-quiet" style={{ fontSize: 12.5, padding: '4px 0', color: 'var(--accent-strong)' }} onClick={() => setShowFull(v => !v)}><Icon name="chevron" style={{ width: 13, height: 13, transform: showFull ? 'rotate(90deg)' : 'none', transition: 'transform .2s' }} /> {showFull ? 'Hide' : 'Show'} full extracted text</button>
                {showFull && <pre style={{ marginTop: 8, maxHeight: 260, overflow: 'auto', background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 'var(--r-md)', padding: '10px 12px', fontSize: 11.5, lineHeight: 1.5, whiteSpace: 'pre-wrap', fontFamily: 'var(--font-mono)', color: 'var(--ink-2)', margin: '8px 0 0' }}>{a.resumeText}</pre>}
              </>
            )}
          </div>
        )}

        {/* interviewer feedback */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <span style={{ fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--ink-3)' }}>Interview feedback</span>
            {fb.length > 0 && <><Stars value={avg} /><span style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>{avg}.0 avg · {fb.length} interviewer{fb.length === 1 ? '' : 's'}</span></>}
          </div>
          {fb.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
              {fb.map((f, i) => (
                <div key={i} style={{ background: 'var(--surface-2)', borderRadius: 'var(--r-md)', padding: '11px 13px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: f.comment ? 6 : 0 }}>
                    <Avatar name={f.by} size={26} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 12.5 }}>{f.by}{f.byId === me.id ? ' · you' : ''}</div>
                      {f.role && <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>{f.role}</div>}
                    </div>
                    {f.rating ? <Stars value={f.rating} /> : null}
                    <span className="mono" style={{ fontSize: 10.5, color: 'var(--ink-3)', flex: 'none' }}>{f.at}</span>
                  </div>
                  {f.comment && <p style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.5, margin: 0 }}>{f.comment}</p>}
                </div>
              ))}
            </div>
          )}
          {/* your feedback */}
          <div style={{ border: '1px solid var(--line)', borderRadius: 'var(--r-md)', padding: '12px 13px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 9, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12.5, fontWeight: 700 }}>{myFb ? 'Update your feedback' : 'Add your feedback'}</span>
              <Stars value={myRating} onChange={setMyRating} />
            </div>
            <textarea value={myComment} onChange={e => setMyComment(e.target.value)} rows={2} placeholder="Your comments on this candidate…" style={{ ...atsFld, resize: 'vertical', lineHeight: 1.5 }} />
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 9 }}>
              <button className="btn btn-primary" style={{ padding: '8px 14px', fontSize: 13 }} disabled={!myRating && !myComment.trim()} onClick={postFb}>{myFb ? 'Update' : 'Post'} feedback</button>
            </div>
          </div>
        </div>

        {/* notes */}
        <div>
          <div style={{ fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--ink-3)', marginBottom: 8 }}>Notes</div>
          {(a.notes || []).length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 10 }}>
              {a.notes.map((n, i) => (
                <div key={i} style={{ fontSize: 13, lineHeight: 1.5, background: 'var(--surface-2)', borderRadius: 'var(--r-sm)', padding: '9px 12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}><b style={{ fontSize: 12 }}>{n.by}</b><span className="mono" style={{ fontSize: 10.5, color: 'var(--ink-3)' }}>{n.at}</span></div>
                  <span style={{ color: 'var(--ink-2)' }}>{n.text}</span>
                </div>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <input value={note} onChange={e => setNote(e.target.value)} onKeyDown={e => e.key === 'Enter' && addNote()} placeholder="Add a note…" style={{ ...atsFld, flex: 1 }} />
            <button className="btn btn-ghost" onClick={addNote} disabled={!note.trim()}>Add</button>
          </div>
        </div>
      </div>

      {/* actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 'var(--pad)', borderTop: '1px solid var(--line-soft)', flexWrap: 'wrap' }}>
        {rejected ? (
          <button className="btn btn-ghost" onClick={() => onStage(a.id, 'applied')}><Icon name="refresh" /> Reopen</button>
        ) : (
          <>
            <button className="btn btn-quiet" disabled={idx <= 0} onClick={() => onStage(a.id, ATS_STAGES[Math.max(0, idx - 1)].id)} title="Move back"><Icon name="arrowLeft" /></button>
            <button className="btn btn-ghost" onClick={() => onReject(a.id)} style={{ color: 'var(--ink-2)' }}>Reject</button>
            <div style={{ flex: 1 }} />
            {a.stage === 'hired' ? (
              <span className="badge badge-ok"><Icon name="check" /> Hired · in onboarding</span>
            ) : a.stage === 'offer' ? null : (
              <button className="btn btn-primary" onClick={() => onStage(a.id, ATS_STAGES[Math.min(ATS_STAGES.length - 1, idx + 1)].id)}>Advance to {ATS_STAGES[Math.min(ATS_STAGES.length - 1, idx + 1)].label} <Icon name="arrowRight" /></button>
            )}
          </>
        )}
      </div>
    </ModalShell>
  );
}

/* ------- Applicant card ------- */
function ApplicantCard({ a, onOpen }) {
  return (
    <button onClick={() => onOpen(a.id)} className="card" style={{ textAlign: 'left', padding: '12px 13px', display: 'flex', flexDirection: 'column', gap: 9, cursor: 'pointer', border: '1px solid var(--line)' }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.boxShadow = 'var(--shadow-sm)'; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--line)'; e.currentTarget.style.boxShadow = ''; }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <PhotoAvatar emp={{ id: a.id, name: a.name }} size={34} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontWeight: 600, fontSize: 13.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.name}</span>
            {a.provider && <Icon name="star" style={{ width: 11, height: 11, color: 'var(--accent)', flex: 'none' }} />}
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--ink-3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.role}</div>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
          {a.disposition && <span className={`badge ${dispBadge(a.disposition)}`} style={{ fontSize: 9, flex: 'none' }}>{dispLabel(a.disposition)}</span>}
          <span style={{ fontSize: 11, color: 'var(--ink-3)', display: 'inline-flex', alignItems: 'center', gap: 4 }}><Icon name="pin" style={{ width: 11, height: 11 }} /> {a.office}</span>
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          {a.offer && a.offer.status === 'sent' && <Icon name="mail" style={{ width: 12, height: 12, color: 'var(--accent)' }} title="Offer sent" />}
          {a.offer && a.offer.status === 'signed' && <Icon name="check" style={{ width: 12, height: 12, color: 'var(--ok)' }} title="Offer signed" />}
          {a.workingInterview && <Icon name="clock" style={{ width: 12, height: 12, color: a.workingInterview.status === 'sent' ? 'var(--ok)' : 'var(--accent)' }} title="Working interview" />}
          {avgRating(a) ? <Stars value={avgRating(a)} /> : <span className="mono" style={{ fontSize: 10, color: 'var(--ink-3)' }}>{atsFmt(a.applied)}</span>}
        </span>
      </div>
    </button>
  );
}

/* ------- Main board ------- */
function Applicants({ me, access, parseOn, paychexOn, driveOn, onHire, flash, openApplicantId, onOpenedApplicant }) {
  const offices = useMemo(() => Array.from(new Set([...(window.HR.offices || []).map(o => o.name), me.loc].filter(Boolean))), [me]);
  const [list, setList] = useState(null);
  const [sel, setSel] = useState(null);
  const [adding, setAdding] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  const token = () => (typeof window !== 'undefined' && window.PD_GOOGLE_TOKEN) || '';

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch('/api/applicants', { headers: { 'X-Google-Token': token() } });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data = await res.json();
        if (alive) setList(Array.isArray(data.applicants) ? data.applicants : []);
      } catch (e) {
        if (alive) setList([]);
      }
    })();
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (openApplicantId && list) { setSel(openApplicantId); if (onOpenedApplicant) onOpenedApplicant(); }
  }, [openApplicantId, list]);

  const saveApplicant = (rec) => fetch('/api/applicants', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Google-Token': token() }, body: JSON.stringify(rec),
  }).then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); }).catch(e => { if (flash) flash('Couldn’t save to the server (' + ((e && e.message) || 'error') + ')'); });

  const commitOne = (next) => { setList(cur => (cur || []).map(a => a.id === next.id ? next : a)); saveApplicant(next); };
  const update = (id, patch) => { const r = list.find(a => a.id === id); if (r) commitOne({ ...r, ...patch }); };
  const setStage = (id, stage) => { const r = list.find(a => a.id === id); if (!r) return; const next = { ...r, stage }; if (stage === 'offer' && !r.offer) next.offer = draftOffer(r); commitOne(next); };
  const addNote = (id, text) => { const r = list.find(a => a.id === id); if (!r) return; commitOne({ ...r, notes: [...(r.notes || []), { by: me.first + ' ' + (me.last || '')[0] + '.', at: atsFmt(new Date().toISOString().slice(0, 10)), text }] }); };
  const postFeedback = (id, rating, comment) => {
    const r = list.find(a => a.id === id); if (!r) return;
    const who = me.first + ' ' + ((me.last || '')[0] || '') + '.';
    const entry = { byId: me.id, by: who, role: me.jobTitle, rating, comment, at: atsFmt(new Date().toISOString().slice(0, 10)) };
    const arr = (r.feedback || []).slice(); const i = arr.findIndex(x => x.byId === me.id);
    if (i >= 0) arr[i] = entry; else arr.push(entry);
    commitOne({ ...r, feedback: arr });
  };
  const setWI = (id, patch) => { const r = list.find(a => a.id === id); if (!r) return; commitOne({ ...r, workingInterview: { ...(r.workingInterview || {}), ...patch } }); };
  const scheduleWI = (id) => setWI(id, { status: 'scheduled', date: '', hours: '', rate: '', autoSend: true });
  const removeWI = (id) => { const r = list.find(a => a.id === id); if (!r) return; commitOne({ ...r, workingInterview: null }); };
  const setOffer = (id, patch) => { const r = list.find(a => a.id === id); if (!r) return; commitOne({ ...r, offer: { ...(r.offer || {}), ...patch } }); };
  const initOffer = (id) => { const r = list.find(a => a.id === id); if (!r) return; commitOne({ ...r, offer: draftOffer(r) }); };
  const submitOfferForApproval = async (id) => {
    const r = list.find(a => a.id === id); if (!r) return;
    const who = me.first + ' ' + ((me.last || '')[0] || '') + '.';
    const next = { ...r, offer: { ...r.offer, status: 'pending_approval', submittedAt: Date.now(), submittedBy: who } };
    setList(cur => cur.map(x => x.id === next.id ? next : x));
    if (typeof sendNotice === 'function') sendNotice({ toEmail: OFFER_APPROVER_EMAIL, title: 'Offer ready for approval — ' + r.name, body: r.name + ' (' + (r.offer.role || r.role) + ', ' + (r.office || 'office TBD') + ') has an offer ready for your review.', deepLink: { view: 'applicants', applicantId: r.id } }).catch(() => {});
    try {
      const res = await fetch('/api/applicants', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Google-Token': token() }, body: JSON.stringify({ ...next, _offerAction: 'submit' }) });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      const n = data.notify;
      if (flash) flash(n && n.gchat ? 'Sent to ' + OFFER_EXECUTOR + ' for approval — onboarding team notified in Chat' : 'Sent to ' + OFFER_EXECUTOR + ' for approval');
    } catch (e) {
      if (flash) flash('Couldn’t save the submission (' + ((e && e.message) || 'error') + ')');
    }
  };
  const sendBackOffer = (id) => { setOffer(id, { status: 'draft' }); if (flash) flash('Sent back to draft'); };
  const approveOffer = async (id) => {
    const r = list.find(a => a.id === id); if (!r) return;
    const next = { ...r, offer: { ...r.offer, status: 'sent', approvedAt: Date.now(), approvedBy: OFFER_EXECUTOR, sentAt: Date.now(), sentBy: OFFER_EXECUTOR } };
    setList(cur => cur.map(x => x.id === next.id ? next : x));
    try {
      const res = await fetch('/api/applicants', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Google-Token': token() }, body: JSON.stringify({ ...next, _offerAction: 'approve' }) });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      const n = data.notify;
      if (flash) flash(n && n.gchat ? 'Offer approved — sent to candidate, onboarding team notified in Chat' : n && !n.simulated ? 'Offer approved and sent to candidate (Chat notice failed)' : 'Offer approved and sent to candidate');
    } catch (e) {
      if (flash) flash('Couldn’t save the approval (' + ((e && e.message) || 'error') + ')');
    }
  };
  const signOffer = (id, signature) => {
    const app = list.find(a => a.id === id); if (!app) return;
    commitOne({ ...app, offer: { ...(app.offer || {}), status: 'signed', signedAt: Date.now(), signature }, stage: 'hired', hiredAt: Date.now() });
    if (onHire) onHire(app);
    setSel(null);
    if (flash) flash('Offer signed — onboarding team notified, onboarding started');
  };
  const reject = (id) => { update(id, { stage: 'rejected' }); setSel(null); };
  const setDisposition = (id, d) => { const r = list.find(a => a.id === id); if (!r) return; commitOne({ ...r, disposition: r.disposition === d ? '' : d }); };
  const addApplicant = async (drafts) => {
    const arr = Array.isArray(drafts) ? drafts : [drafts];
    const today = new Date().toISOString().slice(0, 10);
    setAdding(false);
    const built = [];
    for (const f of arr) {
      const name = (f.first + ' ' + f.last).trim();
      const id = f.id || ('ap' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6));
      let resumes = [];
      if (f._file) {
        try { const ref = await uploadResume(f._file, id, token()); resumes = [ref]; }
        catch (e) { if (flash) flash('Résumé PDF didn’t upload for ' + (name || 'applicant') + ' (' + ((e && e.message) || 'error') + ')'); }
      }
      built.push({
        id, first: f.first, last: f.last, name, address: f.address || '',
        role: f.role, dept: f.dept, office: f.office, source: f.source,
        email: f.email, phone: f.phone,
        years: f.years ? parseInt(f.years, 10) || undefined : undefined,
        provider: !!f.provider,
        resume: (f.resumeText || '').replace(/\s+/g, ' ').trim().slice(0, 240),
        resumeText: f.resumeText || '', resumes,
        stage: 'applied', rating: 0, applied: today, feedback: [], notes: [],
      });
    }
    setList(cur => [...built, ...(cur || [])]);
    built.forEach(saveApplicant);
    if (flash) flash(built.length > 1 ? built.length + ' applicants added to the pipeline' : (built[0] ? built[0].name + ' added to the pipeline' : 'Applicant added'));
  };
  const hire = (a) => { update(a.id, { stage: 'hired', hiredAt: Date.now() }); onHire && onHire(a); setSel(null); };

  if (list === null) return <div className="fade-in" style={{ display: 'grid', placeItems: 'center', minHeight: '40vh', color: 'var(--ink-3)' }}><span className="spin" style={{ width: 22, height: 22, border: '2px solid var(--line)', borderTopColor: 'var(--accent)', borderRadius: '50%', display: 'block' }} /></div>;

  const scoped = access.caps.viewAll ? list : list.filter(a => normLoc(a.office) === me.loc);
  const active = scoped.filter(a => a.stage !== 'rejected');
  const archived = scoped.filter(a => a.stage === 'rejected');
  const byStage = {}; ATS_STAGES.forEach(s => byStage[s.id] = active.filter(a => a.stage === s.id));
  const count = (id) => byStage[id].length;
  const selApp = sel ? list.find(a => a.id === sel) : null;
  const isApprover = (me.workEmail || '').toLowerCase() === OFFER_APPROVER_EMAIL;
  const pendingApprovals = scoped.filter(a => a.offer && a.offer.status === 'pending_approval');

  const stat = (icon, label, value, tone) => (
    <div className="card" style={{ padding: '14px var(--pad)', display: 'flex', alignItems: 'center', gap: 12 }}>
      <div style={{ width: 36, height: 36, borderRadius: 'var(--r-md)', flex: 'none', display: 'grid', placeItems: 'center', background: tone === 'ok' ? 'var(--ok-soft)' : tone === 'warn' ? 'var(--warn-soft)' : 'var(--accent-soft)', color: tone === 'ok' ? 'oklch(0.45 0.12 155)' : tone === 'warn' ? 'oklch(0.5 0.13 60)' : 'var(--accent-strong)' }}><Icon name={icon} style={{ width: 19, height: 19 }} /></div>
      <div><div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 24, lineHeight: 1 }}>{value}</div><div style={{ fontSize: 12.5, color: 'var(--ink-3)', marginTop: 3 }}>{label}</div></div>
    </div>
  );

  return (
    <div className="fade-in">
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 16 }}>
        <div>
          <div className="eyebrow" style={{ marginBottom: 8 }}>Hiring</div>
          <h1 style={{ fontSize: 'clamp(22px,3vw,28px)' }}>Applicants</h1>
          <p style={{ color: 'var(--ink-2)', fontSize: 14.5, marginTop: 6, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {access.caps.viewAll ? 'All open roles' : `Candidates for ${me.loc}`} · {active.length} in pipeline
          </p>
        </div>
        <button className="btn btn-primary btn-lg" onClick={() => setAdding(true)}><Icon name="plus" /> Add applicant</button>
      </div>

      {isApprover && pendingApprovals.length > 0 && (
        <div className="card" style={{ padding: '14px var(--pad)', marginBottom: 'var(--gap)', border: '1px solid var(--warn)', background: 'var(--warn-soft)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <Icon name="mail" style={{ width: 16, height: 16, color: 'oklch(0.5 0.13 60)' }} />
            <span style={{ fontWeight: 700, fontSize: 13.5 }}>{pendingApprovals.length} offer{pendingApprovals.length === 1 ? '' : 's'} awaiting your approval</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {pendingApprovals.map(a => (
              <button key={a.id} onClick={() => setSel(a.id)} className="btn btn-ghost" style={{ justifyContent: 'space-between', textAlign: 'left', width: '100%' }}>
                <span>{a.name}</span>
                <span style={{ display: 'flex', gap: 10, color: 'var(--ink-3)', fontSize: 12.5 }}><span>{(a.offer && a.offer.role) || a.role}</span><span>{a.office}</span></span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 'var(--gap)', marginBottom: 'var(--gap)' }}>
        {stat('users', 'In pipeline', active.length)}
        {stat('phone', 'Interviewing', count('interview'))}
        {stat('clock', 'Working interview', count('working'))}
        {stat('mail', 'Offers out', count('offer'), 'warn')}
        {stat('check', 'Hired', count('hired'), 'ok')}
      </div>

      {/* board */}
      <div style={{ overflowX: 'auto', paddingBottom: 6, margin: '0 -4px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${ATS_STAGES.length}, minmax(208px, 1fr))`, gap: 12, padding: '0 4px', minWidth: 'min-content' }}>
          {ATS_STAGES.map(s => (
            <div key={s.id} style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 4px' }}>
                <span style={{ fontWeight: 700, fontSize: 13 }}>{s.label}</span>
                <span className={`badge ${s.badge}`} style={{ fontSize: 10.5 }}>{count(s.id)}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 9, background: 'var(--surface-2)', borderRadius: 'var(--r-md)', padding: 9, minHeight: 90, flex: 1 }}>
                {byStage[s.id].length === 0
                  ? <div style={{ fontSize: 12, color: 'var(--ink-3)', textAlign: 'center', padding: '18px 6px' }}>—</div>
                  : byStage[s.id].sort((a, b) => avgRating(b) - avgRating(a)).map(a => <ApplicantCard key={a.id} a={a} onOpen={setSel} />)}
              </div>
            </div>
          ))}
        </div>
      </div>

      {archived.length > 0 && (
        <div style={{ marginTop: 'var(--gap)' }}>
          <button className="btn btn-quiet" style={{ fontSize: 13 }} onClick={() => setShowArchived(v => !v)}><Icon name="chevron" style={{ width: 14, height: 14, transform: showArchived ? 'rotate(90deg)' : 'none', transition: 'transform .2s' }} /> Archived ({archived.length})</button>
          {showArchived && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: 10, marginTop: 10 }}>
              {archived.map(a => <ApplicantCard key={a.id} a={a} onOpen={setSel} />)}
            </div>
          )}
        </div>
      )}

      <p style={{ fontSize: 12.5, color: 'var(--ink-3)', marginTop: 16, display: 'flex', gap: 7, alignItems: 'center' }}>
        <Icon name="bolt" style={{ width: 14, height: 14 }} /> Hiring an applicant from the Offer stage hands them straight to the onboarding agent — no re-entry of their details.
      </p>

      {adding && <AddApplicant offices={offices} parseOn={parseOn} onSave={addApplicant} onClose={() => setAdding(false)} flash={flash} />}
      {selApp && <ApplicantDetail a={selApp} access={access} me={me} paychexOn={paychexOn} driveOn={driveOn} onClose={() => setSel(null)} onStage={setStage} onFeedback={postFeedback} onNote={addNote} onWI={setWI} onScheduleWI={scheduleWI} onRemoveWI={removeWI} onOffer={setOffer} onDraftOffer={initOffer} onSubmitOffer={submitOfferForApproval} onApproveOffer={approveOffer} onSendBackOffer={sendBackOffer} onSignOffer={signOffer} onHire={hire} onReject={reject} onDisposition={setDisposition} flash={flash} />}
    </div>
  );
}

Object.assign(window, { Applicants, ATS_STAGES, atsRoleKey });
