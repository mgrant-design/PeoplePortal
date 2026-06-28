/* feedback.jsx — Feature requests + visual roadmap.
   Everyone can submit & view; admin sets status / approves / adds planned features. */

const FB_STATUSES = ['Submitted', 'Under review', 'Planned', 'In progress', 'Complete', 'Declined'];
const FB_TONE = { 'Submitted': 'badge-todo', 'Under review': 'badge-prog', 'Planned': 'badge-prog', 'In progress': 'badge-warn', 'Complete': 'badge-ok', 'Declined': 'badge-todo' };
const FB_CATS = ['Scheduling', 'Onboarding', 'Time clock', 'Reports', 'Learning', 'Mobile', 'Other'];

const FB_SEED = [];

function loadFB() { try { const s = JSON.parse(localStorage.getItem('pd_feedback')); return s && s.length ? s : FB_SEED; } catch (e) { return FB_SEED; } }
function persistFB(x) { try { localStorage.setItem('pd_feedback', JSON.stringify(x)); } catch (e) {} }
function loadVotes() { try { return JSON.parse(localStorage.getItem('pd_fb_votes')) || {}; } catch (e) { return {}; } }

const ROADMAP_COLS = [['Planned', 'Planned'], ['In progress', 'In progress'], ['Complete', 'Shipped']];

function Feedback({ me, access, flash }) {
  const [items, setItems] = useState(loadFB);
  const [votes, setVotes] = useState(loadVotes);
  const [tab, setTab] = useState('Requests');
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ title: '', desc: '', cat: 'Other' });
  const [plan, setPlan] = useState({ title: '', desc: '', cat: 'Scheduling', eta: '' });
  const [planning, setPlanning] = useState(false);
  const isAdmin = access.caps.manageUsers;
  const save = (x) => { setItems(x); persistFB(x); };

  const submit = () => { if (!draft.title.trim()) return; const it = { id: 'fr' + Date.now(), title: draft.title.trim(), desc: draft.desc.trim(), cat: draft.cat, by: me.name, status: 'Submitted', votes: 1, eta: '', ts: Date.now() }; save([it, ...items]); setVotes(v => { const n = { ...v, [it.id]: 1 }; try { localStorage.setItem('pd_fb_votes', JSON.stringify(n)); } catch (e) {} return n; }); setAdding(false); setDraft({ title: '', desc: '', cat: 'Other' }); flash && flash('Feature request submitted — thanks!'); };
  const addPlanned = () => { if (!plan.title.trim()) return; const it = { id: 'fr' + Date.now(), title: plan.title.trim(), desc: plan.desc.trim(), cat: plan.cat, by: 'Product', status: 'Planned', votes: 0, eta: plan.eta, ts: Date.now(), planned: true }; save([it, ...items]); setPlanning(false); setPlan({ title: '', desc: '', cat: 'Scheduling', eta: '' }); flash && flash('Planned feature added to the roadmap.'); };
  const setStatus = (id, status) => save(items.map(i => i.id === id ? { ...i, status } : i));
  const setEta = (id, eta) => save(items.map(i => i.id === id ? { ...i, eta } : i));
  const vote = (id) => { if (votes[id]) return; const n = { ...votes, [id]: 1 }; setVotes(n); try { localStorage.setItem('pd_fb_votes', JSON.stringify(n)); } catch (e) {} save(items.map(i => i.id === id ? { ...i, votes: (i.votes || 0) + 1 } : i)); };

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
        {['Requests', 'Roadmap'].map(tb => <button key={tb} onClick={() => setTab(tb)} style={{ border: 'none', background: 'none', padding: '10px 16px', fontSize: 14, fontWeight: 600, cursor: 'pointer', color: tab === tb ? 'var(--accent-strong)' : 'var(--ink-3)', borderBottom: `2px solid ${tab === tb ? 'var(--accent)' : 'transparent'}`, marginBottom: -1 }}>{tb}</button>)}
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {sorted.map(it => (
              <div key={it.id} className="card" style={{ padding: 'var(--pad)', display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                <button onClick={() => vote(it.id)} disabled={!!votes[it.id]} style={{ flex: 'none', width: 50, padding: '8px 0', borderRadius: 'var(--r-md)', border: '1px solid', borderColor: votes[it.id] ? 'var(--accent)' : 'var(--line)', background: votes[it.id] ? 'var(--accent-soft)' : 'var(--surface)', color: votes[it.id] ? 'var(--accent-strong)' : 'var(--ink-2)', cursor: votes[it.id] ? 'default' : 'pointer', textAlign: 'center' }}>
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
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

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
                          {!it.planned && <span className="mono" style={{ fontSize: 10.5, color: 'var(--ink-3)', marginLeft: 'auto' }}>▲ {it.votes}</span>}
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
