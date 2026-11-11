/* approvals.jsx — approval requests on screen: the server calls, one row to decide a
   request, and one row for a request the person sent. Text comes from approvals-text.js. */

function fetchApprovals() { return pdApi('/api/approvals'); }
function submitApproval(kind, payload) { return pdApi('/api/approvals', { method: 'POST', body: { action: 'submit', kind, payload } }); }
function decideApproval(id, decision, note, option) { return pdApi('/api/approvals', { method: 'POST', body: { action: 'decide', id, decision, note, option } }); }

const approvalStep = (r) => (r.steps || []).findIndex(s => s.status === 'pending');
const approverName = (email) => { const e = (typeof findByEmail === 'function') && findByEmail(email); return e ? e.name : email; };

/* onDecide(record, decision, note, option) returns a promise; the row stays busy until it settles */
function ApprovalRow({ record, onDecide }) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const d = describeApproval(record);
  const step = approvalStep(record);
  // the step whose approval chooses paid or unpaid says so on the record
  const choosesPay = ((record.steps[step] && record.steps[step].options) || []).includes('paid');
  const reason = record.payload && record.payload.reason;
  const go = (decision, option) => {
    setBusy(true);
    Promise.resolve(onDecide(record, decision, note.trim(), option)).finally(() => setBusy(false));
  };
  const btn = { padding: '6px 12px', fontSize: 12.5, justifyContent: 'center' };
  return (
    <div className="card" style={{ padding: 12, borderColor: 'var(--accent)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <PhotoAvatar emp={(typeof findByEmail === 'function' && findByEmail(record.submittedBy)) || { name: d.who }} size={32} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 13.5 }}>{d.who}</div>
          <div style={{ fontSize: 12, color: 'var(--ink-2)' }}>{d.what}{d.when ? ' · ' + d.when : ''}</div>
          {d.detail && <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>{d.detail}</div>}
        </div>
      </div>
      {reason && <p style={{ fontSize: 12.5, color: 'var(--ink-2)', marginTop: 7 }}>{reason}</p>}
      {step > 0 && <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 6 }}>Approved by {approverName(record.steps[step - 1].decidedBy)}</div>}
      <textarea value={note} onChange={e => setNote(e.target.value)} rows={1} placeholder="Note (optional)"
        style={{ width: '100%', marginTop: 9, padding: '7px 10px', borderRadius: 'var(--r-md)', border: '1.5px solid var(--line)', fontSize: 12.5, background: 'var(--surface)', color: 'var(--ink)', outline: 'none', fontFamily: 'var(--font-body)', resize: 'vertical' }} />
      <div style={{ display: 'flex', gap: 7, marginTop: 8, flexWrap: 'wrap' }}>
        {choosesPay ? <>
          <button className="btn btn-primary" style={{ ...btn, flex: 1 }} disabled={busy} onClick={() => go('approve', 'paid')}><Icon name="check" /> Approve as paid</button>
          <button className="btn btn-ghost" style={{ ...btn, flex: 1 }} disabled={busy} onClick={() => go('approve', 'unpaid')}>Approve as unpaid</button>
        </> : <button className="btn btn-primary" style={{ ...btn, flex: 1 }} disabled={busy} onClick={() => go('approve')}><Icon name="check" /> Approve</button>}
        <button className="btn btn-quiet" style={btn} disabled={busy} onClick={() => go('deny')}>Deny</button>
      </div>
    </div>
  );
}

const APPROVAL_STATUS = { approved: ['badge-ok', 'Approved'], denied: ['badge-todo', 'Denied'] };

function MyRequestRow({ record }) {
  const d = describeApproval(record);
  const step = approvalStep(record);
  const st = APPROVAL_STATUS[record.status];
  const waitingOn = step >= 0 ? record.steps[step].who.map(approverName).join(' or ') : '';
  const lastNote = (record.steps || []).map(s => s.note).filter(Boolean).pop();
  return (
    <div className="card" style={{ padding: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 13.5 }}>{d.what}</div>
          <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>{[d.when, d.detail].filter(Boolean).join(' · ')}</div>
        </div>
        {record.status === 'approved' && record.effect === 'failed' ? <span className="badge badge-warn">Approved, not applied</span>
          : st ? <span className={`badge ${st[0]}`}>{st[1]}{record.kind === 'timeoff' && record.status === 'approved' && record.paid === false ? ' · Unpaid' : ''}</span>
          : <span className="badge badge-warn">Waiting on {waitingOn}</span>}
      </div>
      {lastNote && <p style={{ fontSize: 12.5, color: 'var(--ink-2)', marginTop: 7 }}>“{lastNote}”</p>}
    </div>
  );
}

Object.assign(window, { fetchApprovals, submitApproval, decideApproval, ApprovalRow, MyRequestRow });
