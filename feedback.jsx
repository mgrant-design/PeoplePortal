/* feedback.jsx — Feature requests + visual roadmap.
   Everyone can submit & view; admin sets status / approves / adds planned features.
   Persisted in Cosmos via /api/feedback (see data.jsx: fetchFeedback/feedbackAction). */

const FB_STATUSES = ['Submitted', 'Under review', 'Planned', 'In progress', 'Complete', 'Declined'];
const FB_TONE = { 'Submitted': 'badge-todo', 'Under review': 'badge-prog', 'Planned': 'badge-prog', 'In progress': 'badge-warn', 'Complete': 'badge-ok', 'Declined': 'badge-todo' };
const FB_CATS = ['Scheduling', 'Onboarding', 'Time clock', 'Reports', 'Learning', 'Mobile', 'Other'];

const ROADMAP_COLS = [['Planned', 'Planned'], ['In progress', 'In progress'], ['Complete', 'Shipped']];

function Feedback({ me, access, flash }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState(null);
  const [myVotes, setMyVotes] = useState({});
  const [tab, setTab] = useState('Requests');
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ title: '', desc: '', cat: 'Other' });
  const [plan, setPlan] = useState({ title: '', desc: '', cat: 'Scheduling', eta: '' });
  const [planning, setPlanning] = useState(false);
  const isAdmin = access.caps.manageUsers;
  const myEmail = (me.workEmail || me.email || '').toLowerCase();

  // window.fetchFeedback comes from data.jsx, loaded well before this module — but if a
  // slow/dropped network delayed that critical script, wait briefly instead of failing
  // outright so a load-order hiccup doesn't get misread as a real backend error.
  const waitForFetchFeedback = (msLeft = 4000) => new Promise((resolve, reject) => {
    if (window.fetchFeedback) return resolve();
    if (msLeft <= 0) return reject(new Error('Could not load — a required module failed to load. Refresh the page.'));
    setTimeout(() => waitForFetchFeedback(msLeft - 200).then(resolve, reject), 200);
  });
  const load = () => {
    setLoading(true);
    waitForFetchFeedback()
      .then(() => window.fetchFeedback())
      .then(list => {
        setItems(list);
        setLoadErr(null);
        // Restore "already voted" from the server (voters stays server-only, but each
        // item now carries a per-caller `voted` flag) — otherwise this resets to {} on
        // every refresh and a returning voter could re-click and desync the local count.
        setMyVotes(Object.fromEntries(list.filter(i => i.voted).map(i => [i.id, 1])));
      })
      .catch(e => setLoadErr(e.message || 'Could not load feature requests.'))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const submit = () => {
    if (!draft.title.trim()) return;
    window.feedbackAction({ action: 'submit', title: draft.title.trim(), desc: draft.desc.trim(), cat: draft.cat })
      .then(({ item }) => { setItems(list => [item, ...list]); setAdding(false); setDraft({ title: '', desc: '', cat: 'Other' }); flash && flash('Feature request submitted — thanks!'); })
      .catch(e => flash && flash('Couldn’t submit (' + e.message + ')'));
  };
  const addPlanned = () => {
    if (!plan.title.trim()) return;
    window.feedbackAction({ action: 'addPlanned', title: plan.title.trim(), desc: plan.desc.trim(), cat: plan.cat, eta: plan.eta })
      .then(({ item }) => { setItems(list => [item, ...list]); setPlanning(false); setPlan({ title: '', desc: '', cat: 'Scheduling', eta: '' }); flash && flash('Planned feature added to the roadmap.'); })
      .catch(e => flash && flash('Couldn’t add (' + e.message + ')'));
  };
  const setStatus = (id, status) => {
    setItems(list => list.map(i => i.id === id ? { ...i, status } : i));
    window.feedbackAction({ action: 'update', id, status }).catch(e => { flash && flash('Couldn’t update status (' + e.message + ')'); load(); });
  };
  const setEta = (id, eta) => {
    setItems(list => list.map(i => i.id === id ? { ...i, eta } : i));
    window.feedbackAction({ action: 'update', id, eta }).catch(e => { flash && flash('Couldn’t update ETA (' + e.message + ')'); load(); });
  };
  const removeItem = (id) => {
    if (!window.confirm('Delete this permanently? This can’t be undone.')) return;
    setItems(list => list.filter(i => i.id !== id));
    window.feedbackAction({ action: 'delete', id }).catch(e => { flash && flash('Couldn’t delete (' + e.message + ')'); load(); });
  };
  const vote = (id) => {
    if (myVotes[id]) return;
    setMyVotes(v => ({ ...v, [id]: 1 }));
    setItems(list => list.map(i => i.id === id ? { ...i, votes: (i.votes || 0) + 1 } : i));
    window.feedbackAction({ action: 'vote', id })
      // Reconcile with the server's real count instead of trusting the optimistic +1 —
      // covers the case where this vote was already recorded in an earlier session.
      .then(({ item }) => item && setItems(list => list.map(i => i.id === id ? { ...i, votes: item.votes } : i)))
      .catch(e => {
        setMyVotes(v => { const n = { ...v }; delete n[id]; return n; });
        setItems(list => list.map(i => i.id === id ? { ...i, votes: Math.max(0, (i.votes || 1) - 1) } : i));
        flash && flash('Couldn’t record vote (' + e.message + ')');
      });
  };

  const inp = { width: '100%', padding: '10px 12px', borderRadius: 'var(--r-md)', fontSize: 14, border: '1.5px solid var(--line)', background: 'var(--surface)', color: 'var(--ink)', outline: 'none', fontFamily: 'var(--font-body)' };
  const sorted = items.slice().sort((a, b) => (b.votes || 0) - (a.votes || 0));

  return (
    <div className="fade-in">
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: 'clamp(22px,3vw,28px)' }}>Feature requests & roadmap</h1>
          <p style={{ color: 'var(--ink-2)', fontSize: 14.5, marginTop: 6 }}>Suggest improvements and see what’s coming next.</p>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {isAdmin && tab === 'Roadmap' && <button className="btn btn-ghost" onClick={() => setPlanning(p => !p)}><Icon name="plus" /> Add planned feature</button>}
          <button className="btn btn-primary" onClick={() => { setTab('Requests'); setAdding(a => !a); }}><Icon name="plus" /> Submit a request</button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 4, marginBottom: 'var(--gap)', borderBottom: '1px solid var(--line)' }}>
        {['Requests', 'Roadmap', 'History'].map(tb => <button key={tb} onClick={() => setTab(tb)} style={{ border: 'none', background: 'none', padding: '10px 16px', fontSize: 14, fontWeight: 600, cursor: 'pointer', color: tab === tb ? 'var(--accent-strong)' : 'var(--ink-3)', borderBottom: `2px solid ${tab === tb ? 'var(--accent)' : 'transparent'}`, marginBottom: -1 }}>{tb}</button>)}
      </div>

      {tab === 'Requests' && (
        <>
          {adding && (
            <div className="card" style={{ padding: 'var(--pad)', marginBottom: 'var(--gap)', borderColor: 'var(--accent)' }}>
              <h3 style={{ fontSize: 15.5, marginBottom: 12 }}>Suggest an update</h3>
              <input value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })} placeholder="Short title" style={{ ...inp, marginBottom: 10, fontWeight: 600 }} />
              <textarea value={draft.desc} onChange={e => setDraft({ ...draft, desc: e.target.value })} rows={3} placeholder="What would you like to see, and why?" style={{ ...inp, resize: 'vertical', lineHeight: 1.5, marginBottom: 10 }} />
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <select value={draft.cat} onChange={e => setDraft({ ...draft, cat: e.target.value })} style={{ ...inp, width: 'auto', appearance: 'auto' }}>{FB_CATS.map(c => <option key={c}>{c}</option>)}</select>
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                  <button className="btn btn-quiet" onClick={() => setAdding(false)}>Cancel</button>
                  <button className="btn btn-primary" disabled={!draft.title.trim()} onClick={submit}><Icon name="check" /> Submit</button>
                </div>
              </div>
            </div>
          )}
          {loading && <div style={{ padding: 24, textAlign: 'center', color: 'var(--ink-3)', fontSize: 13.5 }}>Loading…</div>}
          {!loading && loadErr && <div className="card" style={{ padding: 'var(--pad)', color: 'var(--ink-2)', fontSize: 13.5 }}>{loadErr}</div>}
          {!loading && !loadErr && sorted.length === 0 && <div style={{ padding: 24, textAlign: 'center', color: 'var(--ink-3)', fontSize: 13.5 }}>No requests yet — be the first to suggest something.</div>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {!loading && !loadErr && sorted.map(it => (
              <div key={it.id} className="card" style={{ padding: 'var(--pad)', display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                <button onClick={() => vote(it.id)} disabled={!!myVotes[it.id]} style={{ flex: 'none', width: 50, padding: '8px 0', borderRadius: 'var(--r-md)', border: '1px solid', borderColor: myVotes[it.id] ? 'var(--accent)' : 'var(--line)', background: myVotes[it.id] ? 'var(--accent-soft)' : 'var(--surface)', color: myVotes[it.id] ? 'var(--accent-strong)' : 'var(--ink-2)', cursor: myVotes[it.id] ? 'default' : 'pointer', textAlign: 'center' }}>
                  <Icon name="chevron" style={{ width: 14, height: 14, transform: 'rotate(-90deg)' }} />
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{it.votes || 0}</div>
                </button>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 600, fontSize: 15 }}>{it.title}</span>
                    <span className={`badge ${FB_TONE[it.status]}`}>{it.status}</span>
                    {it.eta && <span className="badge badge-prog"><Icon name="calendar" /> {it.eta}</span>}
                  </div>
                  <p style={{ fontSize: 13.5, color: 'var(--ink-2)', marginTop: 4, lineHeight: 1.45 }}>{it.desc}</p>
                  <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 6 }}>{it.cat} · suggested by {it.by}</div>
                  {isAdmin && (
                    <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                      <select value={it.status} onChange={e => setStatus(it.id, e.target.value)} style={{ ...inp, width: 'auto', padding: '6px 10px', fontSize: 12.5 }}>{FB_STATUSES.map(s => <option key={s}>{s}</option>)}</select>
                      <input value={it.eta || ''} onChange={e => setEta(it.id, e.target.value)} placeholder="ETA (e.g. Q4 2026)" style={{ ...inp, width: 150, padding: '6px 10px', fontSize: 12.5 }} />
                      <button className="btn btn-quiet" style={{ marginLeft: 'auto', color: 'oklch(0.55 0.16 25)', fontSize: 12.5 }} onClick={() => removeItem(it.id)}><Icon name="trash" style={{ width: 13, height: 13 }} /> Delete</button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {tab === 'History' && (() => {
        const done = items.filter(i => i.status === 'Complete').sort((a, b) => new Date(b.completedAt || b.createdAt || 0) - new Date(a.completedAt || a.createdAt || 0));
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {done.length === 0 && <div style={{ padding: 24, textAlign: 'center', color: 'var(--ink-3)', fontSize: 13.5 }}>Nothing shipped yet.</div>}
            {done.map(it => (
              <div key={it.id} className="card" style={{ padding: 'var(--pad)', display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                <Icon name="check" style={{ width: 18, height: 18, color: 'var(--ok)', flex: 'none', marginTop: 2 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 600, fontSize: 15 }}>{it.title}</span>
                    <span className="badge badge-ok">Shipped</span>
                  </div>
                  <p style={{ fontSize: 13.5, color: 'var(--ink-2)', marginTop: 4, lineHeight: 1.45 }}>{it.desc}</p>
                  <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 6 }}>{it.cat} · suggested by {it.by}{it.completedAt ? ' · completed ' + new Date(it.completedAt).toLocaleDateString() : ''}</div>
                </div>
                {isAdmin && <button className="btn btn-quiet" style={{ color: 'oklch(0.55 0.16 25)', fontSize: 12.5, flex: 'none' }} onClick={() => removeItem(it.id)}><Icon name="trash" style={{ width: 13, height: 13 }} /> Delete</button>}
              </div>
            ))}
          </div>
        );
      })()}

      {tab === 'Roadmap' && (
        <>
          {planning && isAdmin && (
            <div className="card" style={{ padding: 'var(--pad)', marginBottom: 'var(--gap)', borderColor: 'var(--accent)' }}>
              <h3 style={{ fontSize: 15.5, marginBottom: 12 }}>Add a planned feature</h3>
              <input value={plan.title} onChange={e => setPlan({ ...plan, title: e.target.value })} placeholder="Feature name" style={{ ...inp, marginBottom: 10, fontWeight: 600 }} />
              <textarea value={plan.desc} onChange={e => setPlan({ ...plan, desc: e.target.value })} rows={2} placeholder="Description" style={{ ...inp, resize: 'vertical', marginBottom: 10 }} />
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                <select value={plan.cat} onChange={e => setPlan({ ...plan, cat: e.target.value })} style={{ ...inp, width: 'auto', appearance: 'auto' }}>{FB_CATS.map(c => <option key={c}>{c}</option>)}</select>
                <input value={plan.eta} onChange={e => setPlan({ ...plan, eta: e.target.value })} placeholder="Est. timeline" style={{ ...inp, width: 160 }} />
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}><button className="btn btn-quiet" onClick={() => setPlanning(false)}>Cancel</button><button className="btn btn-primary" disabled={!plan.title.trim()} onClick={addPlanned}><Icon name="check" /> Add</button></div>
              </div>
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 'var(--gap)' }}>
            {ROADMAP_COLS.map(([status, label]) => {
              const col = items.filter(i => i.status === status).sort((a, b) => (b.votes || 0) - (a.votes || 0));
              return (
                <div key={status}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '0 2px 12px' }}>
                    <span style={{ width: 9, height: 9, borderRadius: '50%', background: status === 'Complete' ? 'var(--ok)' : status === 'In progress' ? 'var(--warn)' : 'var(--accent)' }} />
                    <h3 style={{ fontSize: 14, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--ink-3)', fontFamily: 'var(--font-body)' }}>{label}</h3>
                    <span className="mono" style={{ fontSize: 11, color: 'var(--ink-3)' }}>{col.length}</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {col.length === 0 && <div style={{ fontSize: 12.5, color: 'var(--ink-3)', padding: '14px', textAlign: 'center', border: '1px dashed var(--line)', borderRadius: 'var(--r-md)' }}>Nothing here yet</div>}
                    {col.map(it => (
                      <div key={it.id} className="card" style={{ padding: '14px var(--pad)' }}>
                        <div style={{ fontWeight: 600, fontSize: 14 }}>{it.title}</div>
                        <p style={{ fontSize: 12.5, color: 'var(--ink-2)', marginTop: 4, lineHeight: 1.4 }}>{it.desc}</p>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                          <span className="badge badge-todo" style={{ fontSize: 10.5 }}>{it.cat}</span>
                          {it.eta && <span className="badge badge-prog" style={{ fontSize: 10.5 }}><Icon name="calendar" /> {it.eta}</span>}
                          {!it.planned && <span className="mono" style={{ fontSize: 10.5, color: 'var(--ink-3)', marginLeft: !isAdmin ? 'auto' : 0 }}>▲ {it.votes}</span>}
                          {isAdmin && <button onClick={() => removeItem(it.id)} title="Delete" style={{ border: 'none', background: 'none', color: 'oklch(0.55 0.16 25)', cursor: 'pointer', padding: 0, marginLeft: 'auto' }}><Icon name="trash" style={{ width: 13, height: 13 }} /></button>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

Object.assign(window, { Feedback });
