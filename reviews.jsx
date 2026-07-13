/* reviews.jsx — performance reviews. HR/exec upload questions; employee self-review +
   manager review; results gated by role. Persists to localStorage (pd_reviews). */

/* NO BACKEND. Reviews have no /api endpoint yet — nothing is persisted. In-memory
   only: results live for the session and are gone on reload. No localStorage. */
function loadReviews() { return {}; }
function persistReviews(r) {}
function blankSide() { return { ratings: {}, comments: {}, overall: '', done: false }; }
function reviewStatus(rec) {
  if (!rec) return 'Not started';
  if (rec.shared) return 'Shared';
  if (rec.manager && rec.manager.done) return 'Manager done';
  if (rec.self && rec.self.done) return 'Self-review done';
  return 'In progress';
}
const RSTATUS_TONE = { 'Not started': 'badge-todo', 'In progress': 'badge-prog', 'Self-review done': 'badge-prog', 'Manager done': 'badge-warn', 'Shared': 'badge-ok' };

/* rating 1–5 */
function RatingPicker({ value, onChange, disabled }) {
  return (
    <div style={{ display: 'flex', gap: 5 }}>
      {REVIEW_SCALE.map(s => (
        <button key={s.v} disabled={disabled} title={s.label} onClick={() => onChange(s.v)}
          style={{ width: 30, height: 30, borderRadius: 8, flex: 'none', fontWeight: 700, fontSize: 13, cursor: disabled ? 'default' : 'pointer',
            border: '1.5px solid', borderColor: value === s.v ? 'var(--accent)' : 'var(--line)',
            background: value === s.v ? 'var(--accent)' : 'var(--surface)', color: value === s.v ? '#fff' : 'var(--ink-3)' }}>{s.v}</button>
      ))}
    </div>
  );
}

/* ---- Questions editor (HR/exec) ---- */
function ReviewQuestionsEditor({ questions, onChange }) {
  const [edit, setEdit] = useState(null);
  const [draft, setDraft] = useState({ category: '', text: '' });
  const inp = { width: '100%', padding: '9px 11px', borderRadius: 'var(--r-md)', fontSize: 13.5, border: '1.5px solid var(--line)', background: 'var(--surface)', color: 'var(--ink)', outline: 'none', fontFamily: 'var(--font-body)' };
  const start = (i) => { setEdit(i); setDraft(i === 'new' ? { category: '', text: '' } : { ...questions[i] }); };
  const save = () => {
    if (!draft.text.trim()) return;
    const item = { id: draft.id || 'q' + Date.now(), category: draft.category.trim() || 'General', text: draft.text.trim() };
    onChange(edit === 'new' ? [...questions, item] : questions.map((q, i) => i === edit ? item : q));
    setEdit(null);
  };
  const del = (i) => onChange(questions.filter((_, j) => j !== i));
  const Form = () => (
    <div className="card" style={{ padding: 12, marginBottom: 10, borderColor: 'var(--accent)', background: 'var(--accent-softer)' }}>
      <input value={draft.category} onChange={e => setDraft({ ...draft, category: e.target.value })} placeholder="Category (e.g. Teamwork)" style={{ ...inp, marginBottom: 8, fontWeight: 600 }} />
      <textarea value={draft.text} onChange={e => setDraft({ ...draft, text: e.target.value })} rows={2} placeholder="Question / competency to rate…" style={{ ...inp, resize: 'vertical', lineHeight: 1.45 }} />
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
        <button className="btn btn-quiet" style={{ padding: '6px 12px', fontSize: 13 }} onClick={() => setEdit(null)}>Cancel</button>
        <button className="btn btn-primary" style={{ padding: '6px 14px', fontSize: 13 }} onClick={save}><Icon name="check" /> Save</button>
      </div>
    </div>
  );
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <p style={{ fontSize: 13.5, color: 'var(--ink-2)' }}>These questions appear on every self-review and manager review. Edit anytime.</p>
        <button className="btn btn-ghost" onClick={() => start('new')}><Icon name="plus" /> Add question</button>
      </div>
      {edit === 'new' && <Form />}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {questions.map((q, i) => edit === i ? <Form key={q.id} /> : (
          <div key={q.id} className="card" style={{ padding: '12px 14px', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <span className="badge badge-prog" style={{ marginBottom: 6 }}>{q.category}</span>
              <div style={{ fontSize: 14, fontWeight: 500 }}>{q.text}</div>
            </div>
            <button onClick={() => start(i)} style={{ border: 'none', background: 'none', color: 'var(--ink-3)', cursor: 'pointer', padding: 4 }}><Icon name="pen" style={{ width: 14, height: 14 }} /></button>
            <button onClick={() => del(i)} style={{ border: 'none', background: 'none', color: 'var(--ink-3)', cursor: 'pointer', padding: 4 }}><Icon name="trash" style={{ width: 14, height: 14 }} /></button>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---- Review detail (fill self or manager side) ---- */
function ReviewDetail({ emp, me, access, questions, rec, onSave, onShare, onBack }) {
  const isSelf = me.id === emp.id;
  const isMgr = access.caps.viewAll || access.caps.viewTeam;
  const editable = isSelf ? 'self' : (isMgr ? 'manager' : null);
  const [self, setSelf] = useState(() => rec && rec.self ? { ...blankSide(), ...rec.self } : blankSide());
  const [mgr, setMgr] = useState(() => rec && rec.manager ? { ...blankSide(), ...rec.manager } : blankSide());
  const side = editable === 'self' ? self : mgr;
  const setSide = editable === 'self' ? setSelf : setMgr;
  const seeManager = isMgr || access.caps.viewAll || (rec && rec.shared);

  const setRating = (qid, v) => setSide(s => ({ ...s, ratings: { ...s.ratings, [qid]: v } }));
  const setComment = (qid, v) => setSide(s => ({ ...s, comments: { ...s.comments, [qid]: v } }));
  const submit = (markDone) => {
    const next = { self, manager: mgr };
    next[editable] = { ...side, done: markDone };
    onSave(emp.id, next);
  };

  const cats = [...new Set(questions.map(q => q.category))];
  const avg = (s) => { const vals = questions.map(q => s.ratings[q.id]).filter(Boolean); return vals.length ? (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1) : '—'; };

  return (
    <div className="fade-in">
      <button className="btn btn-quiet" onClick={onBack} style={{ marginBottom: 14, marginLeft: -10 }}><Icon name="arrowLeft" /> Back to reviews</button>
      <div className="card" style={{ padding: 'clamp(18px,3vw,24px)', marginBottom: 'var(--gap)', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <PhotoAvatar emp={emp} size={52} />
        <div style={{ flex: 1, minWidth: 180 }}>
          <h1 style={{ fontSize: 'clamp(19px,2.4vw,24px)' }}>{isSelf ? 'My performance review' : emp.name}</h1>
          <p style={{ color: 'var(--ink-2)', fontSize: 13.5, marginTop: 3 }}>{emp.jobTitle} · {emp.loc} · Review cycle 2026</p>
        </div>
        <div style={{ display: 'flex', gap: 18 }}>
          <div style={{ textAlign: 'center' }}><div style={{ fontSize: 11, color: 'var(--ink-3)', fontWeight: 700, textTransform: 'uppercase' }}>Self</div><div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 22 }}>{avg(self)}</div></div>
          {seeManager && <div style={{ textAlign: 'center' }}><div style={{ fontSize: 11, color: 'var(--ink-3)', fontWeight: 700, textTransform: 'uppercase' }}>Manager</div><div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 22 }}>{avg(mgr)}</div></div>}
        </div>
      </div>

      {editable && <div className="card" style={{ padding: '12px 16px', marginBottom: 'var(--gap)', display: 'flex', alignItems: 'center', gap: 10, background: 'var(--accent-softer)' }}>
        <Icon name="pen" style={{ width: 16, height: 16, color: 'var(--accent-strong)', flex: 'none' }} />
        <span style={{ fontSize: 13.5, fontWeight: 600 }}>You’re completing the {editable === 'self' ? 'self-assessment' : 'manager review'}.</span>
      </div>}

      {cats.map(cat => (
        <div key={cat} style={{ marginBottom: 'var(--gap)' }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--ink-3)', margin: '0 2px 10px' }}>{cat}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {questions.filter(q => q.category === cat).map(q => (
              <div key={q.id} className="card" style={{ padding: 'var(--pad)' }}>
                <div style={{ fontSize: 14.5, fontWeight: 500, marginBottom: 12 }}>{q.text}</div>
                <div style={{ display: 'grid', gridTemplateColumns: seeManager ? 'repeat(auto-fit,minmax(240px,1fr))' : '1fr', gap: 16 }}>
                  {/* self */}
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--ink-3)', marginBottom: 7 }}>Self-assessment</div>
                    <RatingPicker value={self.ratings[q.id]} onChange={editable === 'self' ? v => setRating(q.id, v) : () => {}} disabled={editable !== 'self'} />
                    {editable === 'self'
                      ? <input value={self.comments[q.id] || ''} onChange={e => setComment(q.id, e.target.value)} placeholder="Add a comment…" style={{ width: '100%', marginTop: 8, padding: '8px 10px', borderRadius: 'var(--r-sm)', border: '1px solid var(--line)', fontSize: 13, background: 'var(--surface)', color: 'var(--ink)', outline: 'none' }} />
                      : self.comments[q.id] && <p style={{ fontSize: 13, color: 'var(--ink-2)', marginTop: 7 }}>{self.comments[q.id]}</p>}
                  </div>
                  {/* manager */}
                  {seeManager && (
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--ink-3)', marginBottom: 7 }}>Manager</div>
                      <RatingPicker value={mgr.ratings[q.id]} onChange={editable === 'manager' ? v => setRating(q.id, v) : () => {}} disabled={editable !== 'manager'} />
                      {editable === 'manager'
                        ? <input value={mgr.comments[q.id] || ''} onChange={e => setComment(q.id, e.target.value)} placeholder="Add a comment…" style={{ width: '100%', marginTop: 8, padding: '8px 10px', borderRadius: 'var(--r-sm)', border: '1px solid var(--line)', fontSize: 13, background: 'var(--surface)', color: 'var(--ink)', outline: 'none' }} />
                        : mgr.comments[q.id] && <p style={{ fontSize: 13, color: 'var(--ink-2)', marginTop: 7 }}>{mgr.comments[q.id]}</p>}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {editable && (
        <div className="card" style={{ padding: 'var(--pad)', marginBottom: 'var(--gap)' }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Overall {editable === 'self' ? 'self-' : ''}summary</div>
          <textarea value={side.overall} onChange={e => setSide(s => ({ ...s, overall: e.target.value }))} rows={3} placeholder="Highlights, goals, and development areas…" style={{ width: '100%', padding: '10px 12px', borderRadius: 'var(--r-md)', border: '1.5px solid var(--line)', fontSize: 14, background: 'var(--surface)', color: 'var(--ink)', outline: 'none', resize: 'vertical', lineHeight: 1.5 }} />
        </div>
      )}

      {editable && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
          <button className="btn btn-ghost" onClick={() => submit(false)}><Icon name="check" /> Save draft</button>
          <button className="btn btn-primary" onClick={() => submit(true)}><Icon name="check" /> Submit {editable === 'self' ? 'self-review' : 'review'}</button>
          {editable === 'manager' && (rec && rec.manager && rec.manager.done) && !(rec && rec.shared) && <button className="btn btn-primary" onClick={() => onShare(emp.id)}><Icon name="mail" /> Share with employee</button>}
        </div>
      )}
      {!editable && <p style={{ fontSize: 12.5, color: 'var(--ink-3)', textAlign: 'center' }}>You have view access to this review.</p>}
    </div>
  );
}

/* ---- Reviews home (role-aware) ---- */
function Reviews({ me, access, questions, onQuestions, list }) {
  const [reviews, setReviews] = useState(loadReviews);
  const [sel, setSel] = useState(null);
  const isHR = access.caps.viewAll;
  const isMgr = access.caps.viewTeam;
  const isLeader = isHR || isMgr;
  const [tab, setTab] = useState('Reviews');

  const save = (empId, data) => { const next = { ...reviews, [empId]: { ...reviews[empId], ...data } }; setReviews(next); persistReviews(next); };
  const share = (empId) => { const next = { ...reviews, [empId]: { ...reviews[empId], shared: true } }; setReviews(next); persistReviews(next); };

  // employee with no team view → straight to own review
  if (!isLeader) {
    return <ReviewDetail emp={me} me={me} access={access} questions={questions} rec={reviews[me.id]} onSave={save} onShare={share} onBack={() => {}} />;
  }
  if (sel) {
    const emp = list.find(e => e.id === sel) || me;
    return <ReviewDetail emp={emp} me={me} access={access} questions={questions} rec={reviews[sel]} onSave={save} onShare={share} onBack={() => { setReviews(loadReviews()); setSel(null); }} />;
  }

  return (
    <div className="fade-in">
      <div style={{ marginBottom: 18 }}>
        <h1 style={{ fontSize: 'clamp(22px,3vw,28px)' }}>Performance reviews</h1>
        <p style={{ color: 'var(--ink-2)', fontSize: 14.5, marginTop: 6 }}>{isHR ? 'Company-wide review cycle 2026 · manage questions and track completion' : 'Your team’s reviews · cycle 2026'}</p>
      </div>

      {isHR && (
        <div style={{ display: 'flex', gap: 4, marginBottom: 'var(--gap)', borderBottom: '1px solid var(--line)' }}>
          {['Reviews', 'Questions'].map(tb => (
            <button key={tb} onClick={() => setTab(tb)} style={{ border: 'none', background: 'none', padding: '10px 16px', fontSize: 14, fontWeight: 600, cursor: 'pointer', color: tab === tb ? 'var(--accent-strong)' : 'var(--ink-3)', borderBottom: `2px solid ${tab === tb ? 'var(--accent)' : 'transparent'}`, marginBottom: -1 }}>{tb}</button>
          ))}
        </div>
      )}

      {isHR && tab === 'Questions'
        ? <ReviewQuestionsEditor questions={questions} onChange={onQuestions} />
        : (
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div className="card" style={{ border: 'none', borderRadius: 0, padding: '11px var(--pad)', background: 'var(--surface-2)', display: 'flex', alignItems: 'center', gap: 12, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--ink-3)' }}>
              <span style={{ flex: 1 }}>Employee</span><span style={{ flex: 'none', width: 130 }} className="dir-loc">Status</span><span style={{ flex: 'none', width: 20 }}></span>
            </div>
            {list.map((e, i) => {
              const st = reviewStatus(reviews[e.id]);
              return (
                <button key={e.id} onClick={() => setSel(e.id)} style={{ width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 14, padding: '11px var(--pad)', border: 'none', borderTop: '1px solid var(--line-soft)', background: 'var(--surface)', cursor: 'pointer' }}
                  onMouseEnter={ev => ev.currentTarget.style.background = 'var(--surface-2)'} onMouseLeave={ev => ev.currentTarget.style.background = 'var(--surface)'}>
                  <PhotoAvatar emp={e} size={38} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 14.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.name}</div>
                    <div style={{ fontSize: 12.5, color: 'var(--ink-3)' }}>{e.jobTitle}</div>
                  </div>
                  <span className={`badge ${RSTATUS_TONE[st]}`} style={{ flex: 'none' }}>{st}</span>
                  <Icon name="chevron" style={{ width: 16, height: 16, color: 'var(--ink-3)', flex: 'none' }} />
                </button>
              );
            })}
            {list.length === 0 && <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink-3)' }}>No team members to review.</div>}
          </div>
        )}
    </div>
  );
}

Object.assign(window, { Reviews, reviewStatus, loadReviews });
