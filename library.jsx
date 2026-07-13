/* library.jsx — Learning Library: catalog, add training (url/upload → Google Drive),
   required/recommended, due dates + reminders, assign per team/individual, toggle required.
   Plus clerical & clinical orientation timelines. Persists to localStorage. */

/* NO BACKEND. Learning library has no /api endpoint yet and no seed catalog — nothing
   is persisted. In-memory only: catalog + completion live for the session, gone on reload. */
let _lib = [];
let _libDone = {};
function loadLib() { return _lib; }
function persistLib(c) { _lib = c || []; }
function loadLibDone() { return _libDone; }
function persistLibDone(d) { _libDone = d || {}; }

const TYPE_ICON = { video: 'bolt', doc: 'doc', link: 'link', article: 'doc', webinar: 'calendar', course: 'book' };
const TYPE_LABEL = { video: 'Video', doc: 'Doc', link: 'Link', article: 'Article', webinar: 'Webinar', course: 'Course' };
const TEAMS = ['all', 'Management', 'Clinical Team', 'Front Desk', 'Insurance', 'Operations'];

function dueLabel(days) { if (days == null) return null; return `Due in ${days} day${days === 1 ? '' : 's'}`; }

/* ---- Add / edit training form ---- */
function LibForm({ draft, setDraft, cats, onAddCat, onSave, onCancel }) {
  const inp = { width: '100%', padding: '9px 11px', borderRadius: 'var(--r-md)', fontSize: 13.5, border: '1.5px solid var(--line)', background: 'var(--surface)', color: 'var(--ink)', outline: 'none', fontFamily: 'var(--font-body)' };
  const set = (k, v) => setDraft({ ...draft, [k]: v });
  const fileRef = useRef(null);
  return (
    <div className="card" style={{ padding: 'var(--pad)', marginBottom: 'var(--gap)', borderColor: 'var(--accent)' }}>
      <h3 style={{ fontSize: 15.5, marginBottom: 14 }}>Add training</h3>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <label style={{ gridColumn: '1 / -1' }}><div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--ink-3)', marginBottom: 5 }}>Title</div><input value={draft.title} onChange={e => set('title', e.target.value)} placeholder="e.g. Conflict Resolution Basics" style={inp} /></label>
        <label><div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--ink-3)', marginBottom: 5 }}>Category</div>
          <select value={draft.category} onChange={e => e.target.value === '__new' ? onAddCat() : set('category', e.target.value)} style={{ ...inp, appearance: 'auto' }}>
            {cats.map(c => <option key={c}>{c}</option>)}<option value="__new">+ Add category…</option>
          </select>
        </label>
        <label><div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--ink-3)', marginBottom: 5 }}>Assign to</div>
          <select value={draft.assign} onChange={e => set('assign', e.target.value)} style={{ ...inp, appearance: 'auto' }}>
            {TEAMS.map(t => <option key={t} value={t}>{t === 'all' ? 'All employees / new hires' : t}</option>)}
          </select>
        </label>
      </div>

      {/* source: url vs upload */}
      <div style={{ display: 'flex', gap: 8, margin: '14px 0 10px' }}>
        {['url', 'upload'].map(s => (
          <button key={s} onClick={() => set('mode', s)} style={{ flex: 1, border: '1.5px solid', borderColor: draft.mode === s ? 'var(--accent)' : 'var(--line)', background: draft.mode === s ? 'var(--accent-soft)' : 'var(--surface)', color: draft.mode === s ? 'var(--accent-strong)' : 'var(--ink-2)', borderRadius: 'var(--r-md)', padding: '10px', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
            <Icon name={s === 'url' ? 'link' : 'upload'} style={{ width: 15, height: 15 }} /> {s === 'url' ? 'Add by URL' : 'Upload file'}
          </button>
        ))}
      </div>
      {draft.mode === 'url' ? (
        <input value={draft.url || ''} onChange={e => set('url', e.target.value)} placeholder="https://… (video, doc, or intranet link)" className="mono" style={{ ...inp, fontSize: 12.5 }} />
      ) : (
        <div onClick={() => fileRef.current && fileRef.current.click()} style={{ cursor: 'pointer', border: '1.5px dashed var(--line)', borderRadius: 'var(--r-md)', padding: '16px', textAlign: 'center', background: 'var(--surface-2)' }}>
          <input ref={fileRef} type="file" accept=".pdf,.doc,.docx,.mp4" style={{ display: 'none' }} onChange={e => { const f = e.target.files[0]; if (f) set('file', { name: f.name, mp4: /\.mp4$/i.test(f.name) }); }} />
          {draft.file ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'center' }}><Icon name="check" style={{ width: 18, height: 18, color: 'var(--ok)' }} /><span style={{ fontWeight: 600, fontSize: 13.5 }}>{draft.file.name}</span></div>
          ) : (
            <div style={{ color: 'var(--ink-3)', fontSize: 13 }}><Icon name="upload" style={{ width: 22, height: 22, display: 'block', margin: '0 auto 6px', color: 'var(--accent)' }} />Drop or choose a doc or .mp4 video</div>
          )}
          <div style={{ fontSize: 11.5, color: 'var(--accent-strong)', marginTop: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}><Icon name="link" style={{ width: 13, height: 13 }} /> Stored in Google Shared Drive › Learning Library</div>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 18, marginTop: 14, flexWrap: 'wrap' }}>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13.5, fontWeight: 600, cursor: 'pointer' }}>
          <input type="checkbox" checked={draft.required} onChange={e => set('required', e.target.checked)} style={{ width: 17, height: 17, accentColor: 'var(--accent)' }} /> Required
        </label>
        {draft.required && (
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--ink-2)' }}>
            Due within <input type="number" min="1" value={draft.dueDays || 7} onChange={e => set('dueDays', +e.target.value)} style={{ ...inp, width: 64, padding: '6px 8px' }} /> days
          </label>
        )}
        <span style={{ fontSize: 12, color: 'var(--ink-3)', display: 'inline-flex', alignItems: 'center', gap: 6 }}><Icon name="bell" style={{ width: 13, height: 13 }} /> Reminders auto-send before the due date</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
        <button className="btn btn-quiet" onClick={onCancel}>Cancel</button>
        <button className="btn btn-primary" disabled={!draft.title.trim()} onClick={onSave}><Icon name="check" /> Add to library</button>
      </div>
    </div>
  );
}

/* ---- Orientation timeline viewer ---- */
function OrientationTimeline({ which, onBack }) {
  const data = which === 'clinical' ? CLINICAL_TIMELINE : CLERICAL_TIMELINE;
  const key = 'pd_orient_' + which;
  const [done, setDone] = useState({});   // NO BACKEND — orientation progress not persisted
  const toggle = (id) => setDone(d => ({ ...d, [id]: !d[id] }));
  const total = data.reduce((a, w) => a + w.items.length, 0);
  const completed = Object.values(done).filter(Boolean).length;
  const pct = Math.round(completed / total * 100);

  return (
    <div className="fade-in">
      <button className="btn btn-quiet" onClick={onBack} style={{ marginBottom: 14, marginLeft: -10 }}><Icon name="arrowLeft" /> Back to library</button>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 18, flexWrap: 'wrap' }}>
        <div style={{ width: 48, height: 48, borderRadius: 13, background: 'var(--accent-soft)', color: 'var(--accent-strong)', display: 'grid', placeItems: 'center', flex: 'none' }}><Icon name={which === 'clinical' ? 'tooth' : 'doc'} style={{ width: 25, height: 25 }} /></div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <h1 style={{ fontSize: 'clamp(20px,2.6vw,26px)' }}>{which === 'clinical' ? 'Clinical Staff' : 'Administrative / Front Desk'} orientation</h1>
          <p style={{ color: 'var(--ink-2)', fontSize: 14, marginTop: 3 }}>{which === 'clinical' ? 'Dental assistant 11-week training timeline' : 'Front desk 6-week orientation timeline'} · {completed}/{total} complete</p>
        </div>
        <ProgressRing value={pct} size={58} stroke={6}><span style={{ fontSize: 14 }}>{pct}%</span></ProgressRing>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--gap)' }}>
        {data.map((w, wi) => {
          const wkItems = w.items.map((_, ii) => `${wi}-${ii}`);
          const wkDone = wkItems.filter(id => done[id]).length;
          return (
            <div key={w.wk} className="card" style={{ padding: 'var(--pad)' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
                <span className="eyebrow">{w.wk}</span>
                <h3 style={{ fontSize: 16, flex: 1 }}>{w.focus}</h3>
                <span className="mono" style={{ fontSize: 11.5, color: wkDone === w.items.length ? 'var(--ok)' : 'var(--ink-3)' }}>{wkDone}/{w.items.length}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                {w.items.map((it, ii) => {
                  const id = `${wi}-${ii}`;
                  return (
                    <label key={id} style={{ display: 'flex', alignItems: 'flex-start', gap: 11, padding: '8px 10px', borderRadius: 'var(--r-md)', background: done[id] ? 'var(--ok-soft)' : 'var(--surface-2)', cursor: 'pointer' }}>
                      <input type="checkbox" checked={!!done[id]} onChange={() => toggle(id)} style={{ marginTop: 2, width: 16, height: 16, accentColor: 'var(--accent)', flex: 'none' }} />
                      <span style={{ fontSize: 13.5, lineHeight: 1.4, textDecoration: done[id] ? 'line-through' : 'none', color: done[id] ? 'var(--ink-3)' : 'var(--ink)' }}>{it}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---- Training source-finder bot ---- */
function SourceFinder({ onAdd, existingTitles, flash }) {
  const [topic, setTopic] = useState('');
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState(null);
  const [added, setAdded] = useState({});
  const [live, setLive] = useState(true);

  const run = async (text) => {
    const q = (text || topic).trim(); if (!q || busy) return;
    setTopic(q); setBusy(true); setResults(null); setAdded({});
    let out = null, usedLive = false;
    try {
      if (window.claude && typeof window.claude.complete === 'function') {
        const raw = await window.claude.complete(`${SOURCE_FINDER_PROMPT}\n\nTopic: ${q}`);
        const m = raw && raw.match(/\[[\s\S]*\]/);
        if (m) { const parsed = JSON.parse(m[0]); if (Array.isArray(parsed) && parsed.length) { out = parsed.filter(x => x && x.title && x.provider); usedLive = true; } }
      }
    } catch (e) { out = null; }
    if (!out || !out.length) out = trainingSourceFallback(q);
    setLive(usedLive); setResults(out); setBusy(false);
  };

  const fmtType = (f) => { const s = (f || '').toLowerCase(); return ['article', 'webinar', 'video', 'course'].includes(s) ? s : 'link'; };
  const add = (r, i) => {
    const dup = existingTitles.has((r.title || '').toLowerCase());
    onAdd({ id: 'lib' + Date.now() + i, title: r.title, category: 'Leadership & Management', type: fmtType(r.format), source: r.provider || 'Web', required: false, dueDays: null, assign: 'Management', url: r.url || '' });
    setAdded(a => ({ ...a, [i]: true }));
    flash && flash(dup ? `Added another copy of “${r.title}”` : `Added “${r.title}” to the library`);
  };

  const inp = { flex: 1, padding: '12px 15px', borderRadius: 'var(--r-pill)', fontSize: 14, border: '1.5px solid var(--line)', background: 'var(--surface)', color: 'var(--ink)', outline: 'none' };
  return (
    <div className="fade-in">
      <div className="card" style={{ padding: 'var(--pad)', marginBottom: 'var(--gap)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: '50%', flex: 'none', display: 'grid', placeItems: 'center', background: 'linear-gradient(150deg, var(--teal), var(--accent-strong))', color: '#fff' }}><Icon name="search" style={{ width: 19, height: 19 }} /></div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 15.5 }}>Training source finder</div>
            <div style={{ fontSize: 12.5, color: 'var(--ink-3)' }}>Name a topic — it suggests reputable articles, videos & webinars you can add in one click.</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input value={topic} onChange={e => setTopic(e.target.value)} onKeyDown={e => e.key === 'Enter' && run()} placeholder="e.g. coaching, difficult conversations, delegation…" disabled={busy} style={inp} />
          <button className="btn btn-primary" onClick={() => run()} disabled={busy} style={{ padding: '12px 17px' }}>{busy ? <Icon name="refresh" className="spin" /> : <Icon name="arrowRight" />}</button>
        </div>
        <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginTop: 12 }}>
          {MGMT_TOPICS.slice(0, 8).map(tp => (
            <button key={tp} onClick={() => run(tp)} disabled={busy} style={{ border: '1px solid var(--line)', background: 'var(--surface)', borderRadius: 'var(--r-pill)', padding: '5px 12px', fontSize: 12, color: 'var(--ink-2)', cursor: busy ? 'default' : 'pointer', fontWeight: 600 }}>{tp}</button>
          ))}
        </div>
      </div>

      {busy && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--ink-3)', fontSize: 13.5, padding: '10px 2px' }}>
          <Icon name="refresh" className="spin" style={{ width: 16, height: 16 }} /> Searching reputable training providers…
        </div>
      )}

      {results && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '4px 2px 12px', fontSize: 12.5, color: 'var(--ink-3)' }}>
            <span>{results.length} suggestions for “<b style={{ color: 'var(--ink-2)' }}>{topic}</b>”</span>
            {!live && <span className="badge badge-todo" style={{ fontSize: 9.5 }}>offline list</span>}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))', gap: 'var(--gap)' }}>
            {results.map((r, i) => (
              <div key={i} className="card" style={{ padding: 'var(--pad)', display: 'flex', flexDirection: 'column', gap: 9 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className="badge" style={{ fontSize: 9.5, padding: '1px 7px', background: 'var(--accent-soft)', color: 'var(--accent-strong)' }}><Icon name={TYPE_ICON[fmtType(r.format)]} style={{ width: 11, height: 11 }} /> {TYPE_LABEL[fmtType(r.format)]}</span>
                  <span style={{ fontSize: 11.5, color: 'var(--ink-3)', fontWeight: 600 }}>{r.provider}</span>
                </div>
                <div style={{ fontWeight: 700, fontSize: 14.5, lineHeight: 1.3 }}>{r.title}</div>
                <div style={{ fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.45, flex: 1 }}>{r.why}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
                  {added[i]
                    ? <span className="badge badge-ok" style={{ flex: 1, justifyContent: 'center' }}><Icon name="check" /> Added to library</span>
                    : <button className="btn btn-primary" style={{ flex: 1, padding: '8px 12px', fontSize: 13 }} onClick={() => add(r, i)}><Icon name="plus" /> Add to library</button>}
                  {r.url && <a href={r.url} target="_blank" rel="noopener noreferrer" className="btn btn-ghost" style={{ padding: '8px 11px', fontSize: 13 }} title="Preview source"><Icon name="link" /></a>}
                </div>
              </div>
            ))}
          </div>
          <p style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 14, display: 'flex', gap: 7, alignItems: 'center', lineHeight: 1.5 }}>
            <Icon name="shield" style={{ width: 14, height: 14, flex: 'none' }} /> Suggestions favor established providers. Confirm each link and licensing before assigning — added items land under <b>Leadership &amp; Management</b> as recommended.
          </p>
        </>
      )}
    </div>
  );
}

/* ---- main Learning Library ---- */
function LearningLibrary({ me, access, flash }) {
  const [courses, setCourses] = useState(loadLib);
  const [done, setDone] = useState(loadLibDone);
  const [cats, setCats] = useState(LIBRARY_CATEGORIES);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState(null);
  const [tab, setTab] = useState('Library');
  const [orient, setOrient] = useState(null);
  const [assignFor, setAssignFor] = useState(null);
  const canManage = access.caps.viewAll || access.caps.viewTeam;
  const teamList = (typeof scopedEmployees === 'function') ? scopedEmployees(me, access).filter(e => e.status === 'Active') : [];

  const saveCourses = (c) => { setCourses(c); persistLib(c); };
  const markDone = (id) => { const wasDone = done[id]; const n = { ...done, [id]: !done[id] }; setDone(n); persistLibDone(n); if (!wasDone && flash) { const c = courses.find(x => x.id === id); flash(`“${c ? c.title : 'Training'}” complete — onboarding chat notified.`); } };
  const toggleRequired = (id) => saveCourses(courses.map(c => c.id === id ? { ...c, required: !c.required, dueDays: !c.required ? (c.dueDays || 7) : c.dueDays } : c));
  const assignTo = (id, target) => { saveCourses(courses.map(c => c.id === id ? { ...c, assign: target } : c)); setAssignFor(null); flash && flash(`Assigned to ${target === 'all' ? 'all employees' : target}.`); };

  const startAdd = () => { setDraft({ title: '', category: cats[1], assign: 'all', mode: 'url', required: false, dueDays: 7 }); setAdding(true); };
  const addCat = () => { const name = prompt('New category name:'); if (name && name.trim()) { setCats(cs => [...cs, name.trim()]); setDraft(d => ({ ...d, category: name.trim() })); } };
  const saveNew = () => {
    const c = { id: 'lib' + Date.now(), title: draft.title.trim(), category: draft.category, type: draft.mode === 'upload' ? (draft.file && draft.file.mp4 ? 'video' : 'doc') : 'link', source: draft.mode === 'upload' ? 'Drive' : 'URL', required: draft.required, dueDays: draft.required ? draft.dueDays : null, assign: draft.assign };
    saveCourses([c, ...courses]); setAdding(false);
  };

  if (orient) return <OrientationTimeline which={orient} onBack={() => setOrient(null)} />;

  const visible = canManage ? courses : courses.filter(c => c.assign !== 'Management'); // hide mgmt dev from staff
  const byCat = {};
  visible.forEach(c => { (byCat[c.category] = byCat[c.category] || []).push(c); });
  const reqCount = visible.filter(c => c.required).length;
  const myDue = visible.filter(c => c.required && !done[c.id]).length;

  return (
    <div className="fade-in">
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: 'clamp(22px,3vw,28px)' }}>Learning Library</h1>
          <p style={{ color: 'var(--ink-2)', fontSize: 14.5, marginTop: 6 }}>{reqCount} required · {visible.length} total · {myDue} outstanding for you</p>
        </div>
        {canManage && <button className="btn btn-primary" onClick={startAdd}><Icon name="plus" /> Add training</button>}
      </div>

      <div style={{ display: 'flex', gap: 4, marginBottom: 'var(--gap)', borderBottom: '1px solid var(--line)', flexWrap: 'wrap' }}>
        {['Library', 'Orientation timelines', ...(canManage ? ['Find training'] : [])].map(tb => (
          <button key={tb} onClick={() => setTab(tb)} style={{ border: 'none', background: 'none', padding: '10px 16px', fontSize: 14, fontWeight: 600, cursor: 'pointer', color: tab === tb ? 'var(--accent-strong)' : 'var(--ink-3)', borderBottom: `2px solid ${tab === tb ? 'var(--accent)' : 'transparent'}`, marginBottom: -1, display: 'flex', alignItems: 'center', gap: 7 }}>{tb === 'Find training' && <Icon name="search" style={{ width: 15, height: 15 }} />}{tb}</button>
        ))}
      </div>

      {tab === 'Find training' ? (
        <SourceFinder onAdd={(c) => saveCourses([c, ...courses])} existingTitles={new Set(courses.map(x => (x.title || '').toLowerCase()))} flash={flash} />
      ) : tab === 'Orientation timelines' ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 'var(--gap)' }}>
          {[['clinical', 'Clinical Staff', 'tooth', 'Dental assistants · 11 weeks'], ['clerical', 'Administrative / Front Desk', 'doc', 'Front desk · 6 weeks']].map(([w, t, ic, s]) => (
            <button key={w} className="card" onClick={() => setOrient(w)} style={{ textAlign: 'left', padding: 'var(--pad)', cursor: 'pointer', border: '1px solid var(--line)' }} onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--accent)'} onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--line)'}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 44, height: 44, borderRadius: 'var(--r-md)', background: 'var(--accent-soft)', color: 'var(--accent-strong)', display: 'grid', placeItems: 'center', flex: 'none' }}><Icon name={ic} style={{ width: 22, height: 22 }} /></div>
                <div><div style={{ fontWeight: 600, fontSize: 16 }}>{t}</div><div style={{ fontSize: 12.5, color: 'var(--ink-3)', marginTop: 2 }}>{s}</div></div>
                <Icon name="arrowRight" style={{ width: 18, height: 18, color: 'var(--accent)', marginLeft: 'auto' }} />
              </div>
            </button>
          ))}
        </div>
      ) : (
        <>
          {adding && draft && <LibForm draft={draft} setDraft={setDraft} cats={cats} onAddCat={addCat} onSave={saveNew} onCancel={() => setAdding(false)} />}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'calc(var(--gap) + 4px)' }}>
            {Object.entries(byCat).map(([cat, list]) => (
              <section key={cat}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '0 2px 12px' }}>
                  <h3 style={{ fontSize: 14, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--ink-3)', fontFamily: 'var(--font-body)' }}>{cat}</h3>
                  <div style={{ flex: 1, height: 1, background: 'var(--line)' }} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {list.map(c => {
                    const isDone = !!done[c.id];
                    return (
                      <div key={c.id} className="card" style={{ padding: '12px var(--pad)', display: 'flex', alignItems: 'center', gap: 14, borderColor: isDone ? 'var(--ok)' : (c.required ? 'var(--accent)' : 'var(--line)'), position: 'relative' }}>
                        <div style={{ width: 38, height: 38, borderRadius: 'var(--r-md)', flex: 'none', display: 'grid', placeItems: 'center', background: isDone ? 'var(--ok-soft)' : 'var(--accent-soft)', color: isDone ? 'var(--ok)' : 'var(--accent-strong)' }}><Icon name={isDone ? 'check' : TYPE_ICON[c.type]} style={{ width: 19, height: 19 }} /></div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: 14.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.title}</div>
                          <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 2, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                            <span style={{ textTransform: 'capitalize' }}>{TYPE_LABEL[c.type] || c.type}</span> · <span>{c.source}</span>
                            {c.source === 'Drive' && <span className="badge badge-todo" style={{ fontSize: 9.5 }}><Icon name="link" /> Shared Drive</span>}
                            <span className="badge badge-todo" style={{ fontSize: 9.5 }}>{c.assign === 'all' ? 'All' : c.assign}</span>
                          </div>
                        </div>
                        {c.required ? <span className="badge badge-warn" style={{ flex: 'none' }}><Icon name="bell" /> Required</span> : <span className="badge badge-todo" style={{ flex: 'none' }}>Recommended</span>}
                        {c.required && c.dueDays != null && <span className="badge badge-prog" style={{ flex: 'none' }}>{dueLabel(c.dueDays)}</span>}
                        {canManage && (
                          <button className="btn btn-quiet" style={{ padding: '6px 10px', fontSize: 12, flex: 'none' }} onClick={() => setAssignFor(assignFor === c.id ? null : c.id)}><Icon name="users" style={{ width: 14, height: 14 }} /> Assign</button>
                        )}
                        {isDone
                          ? <span className="badge badge-ok" style={{ flex: 'none' }}><Icon name="check" /> Done</span>
                          : <button className="btn btn-ghost" style={{ padding: '7px 14px', fontSize: 13, flex: 'none' }} onClick={() => markDone(c.id)}>Start</button>}
                        {canManage && (
                          <button className="btn btn-quiet" style={{ padding: '6px 8px', fontSize: 11.5, flex: 'none' }} onClick={() => toggleRequired(c.id)} title="Toggle required"><Icon name={c.required ? 'x' : 'plus'} style={{ width: 13, height: 13 }} /></button>
                        )}
                        {assignFor === c.id && (
                          <>
                            <div onClick={() => setAssignFor(null)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
                            <div className="card fade-in" style={{ position: 'absolute', top: 'calc(100% - 4px)', right: 12, zIndex: 41, width: 240, padding: 6, boxShadow: 'var(--shadow-lg)', maxHeight: 280, overflowY: 'auto' }}>
                              <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--ink-3)', padding: '6px 9px' }}>Assign to team</div>
                              {TEAMS.map(t => <button key={t} className="copy-item" onClick={() => assignTo(c.id, t)} style={{ width: '100%', textAlign: 'left', border: 'none', background: 'none', padding: '8px 9px', borderRadius: 'var(--r-sm)', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>{t === 'all' ? 'All employees' : t}</button>)}
                              {teamList.length > 0 && <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--ink-3)', padding: '6px 9px', borderTop: '1px solid var(--line-soft)', marginTop: 4 }}>Individual</div>}
                              {teamList.slice(0, 12).map(emp => <button key={emp.id} className="copy-item" onClick={() => assignTo(c.id, emp.name)} style={{ width: '100%', textAlign: 'left', border: 'none', background: 'none', padding: '7px 9px', borderRadius: 'var(--r-sm)', cursor: 'pointer', fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 8 }}><Avatar name={emp.name} size={22} /> {emp.name}</button>)}
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
          {canManage && (
            <p style={{ fontSize: 12.5, color: 'var(--ink-3)', marginTop: 16, display: 'flex', gap: 7, alignItems: 'center', lineHeight: 1.5 }}>
              <Icon name="bolt" style={{ width: 14, height: 14, flex: 'none' }} /> Toggle <b>required</b> per team or individual, set due dates, and reminders send automatically. Uploaded docs & .mp4 videos are stored in the Google Shared Drive “Learning Library” folder.
            </p>
          )}
        </>
      )}
    </div>
  );
}

Object.assign(window, { LearningLibrary, OrientationTimeline });
