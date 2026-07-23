/* feedback.jsx — Feature requests + visual roadmap.
   Everyone can submit & view; admin sets status / approves / adds planned features.
   Persisted in Cosmos via /api/feedback (see data.jsx: fetchFeedback/feedbackAction). */

const FB_STATUSES = ['Submitted', 'Under review', 'Planned', 'In progress', 'Complete', 'Declined'];
const FB_TONE = { 'Submitted': 'badge-todo', 'Under review': 'badge-prog', 'Planned': 'badge-prog', 'In progress': 'badge-warn', 'Complete': 'badge-ok', 'Declined': 'badge-todo' };
const FB_CATS = ['Scheduling', 'Onboarding', 'Time clock', 'Reports', 'Learning', 'Mobile', 'Other'];

const ROADMAP_COLS = [['Submitted', 'Submitted'], ['Planned', 'Planned'], ['In progress', 'In progress'], ['Complete', 'Shipped']];

/* Up/down vote control. A person's ballot is one signed value: up moves +1 (cap +2), down
   moves −1 (floor −1). Net score in the middle; hovering an arrow shows that side's count. */
function VoteBox({ value, mine, up, down, onUp, onDown, readOnly }) {
  const [hover, setHover] = useState(null);
  const dn = 'oklch(0.55 0.16 25)';
  const arrow = (dir) => {
    const active = dir === 'up' ? mine > 0 : mine < 0;
    const disabled = dir === 'up' ? mine === 2 : mine === -1;
    return (
      <button onClick={dir === 'up' ? onUp : onDown} disabled={disabled} onMouseEnter={() => setHover(dir)} onMouseLeave={() => setHover(null)} aria-label={dir === 'up' ? 'Upvote' : 'Downvote'}
        style={{ border: 'none', background: 'none', cursor: disabled ? 'default' : 'pointer', color: active ? (dir === 'up' ? 'var(--accent-strong)' : dn) : 'var(--ink-3)', opacity: disabled ? 0.4 : 1, padding: 2, display: 'inline-flex', lineHeight: 0 }}>
        <Icon name="chevron" style={{ width: 16, height: 16, transform: dir === 'up' ? 'rotate(-90deg)' : 'rotate(90deg)' }} />
      </button>
    );
  };
  return (
    <div style={{ position: 'relative', flex: 'none', width: 50, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, padding: '6px 0', borderRadius: 'var(--r-md)', border: '1px solid var(--line)', background: 'var(--surface)' }}>
      {!readOnly && arrow('up')}
      <div style={{ fontWeight: 700, fontSize: 14, color: value > 0 ? 'var(--accent-strong)' : value < 0 ? dn : 'var(--ink-2)' }}>{value}</div>
      {!readOnly && arrow('down')}
      {hover && (
        <div style={{ position: 'absolute', left: '100%', top: hover === 'up' ? 4 : 'auto', bottom: hover === 'down' ? 4 : 'auto', marginLeft: 8, whiteSpace: 'nowrap', background: 'var(--ink)', color: 'var(--surface)', fontSize: 11.5, fontWeight: 600, padding: '4px 8px', borderRadius: 6, zIndex: 5, pointerEvents: 'none' }}>
          {hover === 'up' ? `${up} upvote${up === 1 ? '' : 's'}` : `${down} downvote${down === 1 ? '' : 's'}`}
        </div>
      )}
    </div>
  );
}

function Feedback({ me, access, flash }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState(null);
  const [myVote, setMyVote] = useState({});
  const [sortMode, setSortMode] = useState('top');
  const [tab, setTab] = useState('Requests');
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ title: '', desc: '', cat: 'Other' });
  const [attachFiles, setAttachFiles] = useState([]);
  const [attachErr, setAttachErr] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [gif, setGif] = useState(null);
  const [gifOpen, setGifOpen] = useState(false);
  const [gifTarget, setGifTarget] = useState('draft');
  const [commentGif, setCommentGif] = useState(null);
  const [openComments, setOpenComments] = useState(null);
  const [commentsById, setCommentsById] = useState({});
  const [commentLoading, setCommentLoading] = useState(false);
  const [commentDraft, setCommentDraft] = useState('');
  const [commentBusy, setCommentBusy] = useState(false);
  const [reactFor, setReactFor] = useState(null);
  const [replyTo, setReplyTo] = useState(null);
  const pressTimer = React.useRef(null);
  const [plan, setPlan] = useState({ title: '', desc: '', cat: 'Scheduling', eta: '' });
  const [planning, setPlanning] = useState(false);
  const [detail, setDetail] = useState(null);
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
        setMyVote(Object.fromEntries(list.map(i => [i.id, i.myVote || 0])));
      })
      .catch(e => setLoadErr(e.message || 'Could not load feature requests.'))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const submit = () => {
    if (!draft.title.trim() || submitting) return;
    setSubmitting(true);
    const send = (attachments) => {
      window.feedbackAction({ action: 'submit', title: draft.title.trim(), desc: draft.desc.trim(), cat: draft.cat, ...(attachments.length ? { attachments } : {}), ...(gif ? { gif } : {}) })
        .then(({ item }) => { setItems(list => [item, ...list]); setAdding(false); setDraft({ title: '', desc: '', cat: 'Other' }); setAttachFiles([]); setAttachErr(''); setGif(null); flash && flash('Feature request submitted — thanks!'); })
        .catch(e => flash && flash('Couldn’t submit (' + e.message + ')'))
        .finally(() => setSubmitting(false));
    };
    if (!attachFiles.length) return send([]);
    const readOne = (f) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res({ name: f.name, size: f.size, type: f.type || 'application/octet-stream', contentBase64: String(r.result).split(',')[1] || '' }); r.onerror = rej; r.readAsDataURL(f); });
    Promise.all(attachFiles.map(readOne)).then(send).catch(() => { setSubmitting(false); flash && flash('Couldn’t read an attachment.'); });
  };

  // ~1.4 MB raw ceiling per file: base64 inflates ~37% and a Cosmos doc caps at 2 MB. Up to 5
  // files per request (silently capped — the add control just stops appearing).
  const MAX_ATTACH = 1.4 * 1024 * 1024;
  const addFiles = (fileList) => {
    const incoming = Array.from(fileList || []);
    if (!incoming.length) return;
    setAttachErr('');
    setAttachFiles(cur => {
      let next = cur.slice();
      for (const f of incoming) {
        if (next.length >= 5) break;
        if (f.size > MAX_ATTACH) { setAttachErr('“' + f.name + '” is too large — max 1.4 MB.'); continue; }
        if (next.some(x => x.name === f.name && x.size === f.size)) continue;
        next = [...next, f];
      }
      return next;
    });
  };
  const removeFile = (idx) => setAttachFiles(cur => cur.filter((_, i) => i !== idx));
  const fmtSize = (n) => n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(0) + ' KB' : (n / 1048576).toFixed(1) + ' MB';
  // Secret gif picker: typing "/gif" anywhere in the description strips the token and opens
  // the Giphy search. Not surfaced in the UI — for those in the know.
  const onDescChange = (val) => {
    const m = val.match(/\/gif\b/i);
    if (m) { setDraft({ ...draft, desc: val.replace(/\/gif\b/i, '').replace(/\s{2,}/g, ' ').trimStart() }); setGifTarget('draft'); setGifOpen(true); return; }
    setDraft({ ...draft, desc: val });
  };
  // Same secret trigger inside a comment box.
  const onCommentChange = (val) => {
    const m = val.match(/\/gif\b/i);
    if (m) { setCommentDraft(val.replace(/\/gif\b/i, '').replace(/\s{2,}/g, ' ').trimStart()); setGifTarget('comment'); setGifOpen(true); return; }
    setCommentDraft(val);
  };

  const toggleComments = (id) => {
    if (openComments === id) { setOpenComments(null); return; }
    setOpenComments(id); setCommentDraft('');
    if (commentsById[id]) return; // already loaded this session
    setCommentLoading(true);
    window.feedbackAction({ action: 'getComments', id })
      .then(({ comments }) => setCommentsById(m => ({ ...m, [id]: comments || [] })))
      .catch(e => { flash && flash('Couldn’t load comments (' + e.message + ')'); setCommentsById(m => ({ ...m, [id]: [] })); })
      .finally(() => setCommentLoading(false));
  };
  const postComment = (id) => {
    if (!isAdmin) return;
    const text = commentDraft.trim();
    if ((!text && !commentGif) || commentBusy) return;
    setCommentBusy(true);
    const parentId = (replyTo && replyTo.id === id) ? replyTo.commentId : undefined;
    window.feedbackAction({ action: 'addComment', id, text, ...(parentId ? { parentId } : {}), ...(commentGif ? { gif: commentGif } : {}) })
      .then(({ comments }) => {
        setCommentsById(m => ({ ...m, [id]: comments || [] }));
        setItems(list => list.map(i => i.id === id ? { ...i, commentCount: (comments || []).length } : i));
        setCommentDraft(''); setCommentGif(null); setReplyTo(null);
      })
      .catch(e => flash && flash('Couldn’t post comment (' + e.message + ')'))
      .finally(() => setCommentBusy(false));
  };
  const deleteComment = (id, commentId) => {
    window.feedbackAction({ action: 'deleteComment', id, commentId })
      .then(({ comments }) => {
        setCommentsById(m => ({ ...m, [id]: comments || [] }));
        setItems(list => list.map(i => i.id === id ? { ...i, commentCount: (comments || []).length } : i));
      })
      .catch(e => flash && flash('Couldn’t delete comment (' + e.message + ')'));
  };
  const fmtWhen = (iso) => { try { return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); } catch (e) { return ''; } };
  // Reactions: one per person per comment (server-enforced), stored on the comment inside the
  // one comments doc — no new container. Long-press / sustained click (or right-click) opens the bar.
  const REACTION_DEFS = [['heart', '❤️'], ['up', '👍'], ['down', '👎'], ['laugh', '😂'], ['fire', '🔥']];
  const reactComment = (id, commentId, emoji) => {
    if (!isAdmin) return;
    setReactFor(null);
    window.feedbackAction({ action: 'reactComment', id, commentId, emoji })
      .then(({ comments }) => setCommentsById(m => ({ ...m, [id]: comments || [] })))
      .catch(e => flash && flash('Couldn’t react (' + e.message + ')'));
  };
  const renderComment = (postId, c, isReply) => {
    const mine = (c.byEmail || '').toLowerCase() === myEmail;
    const reactions = c.reactions || {};
    const has = (k) => (reactions[k] || []).some(e => (e || '').toLowerCase() === myEmail);
    const startPress = () => { if (pressTimer.current) clearTimeout(pressTimer.current); pressTimer.current = setTimeout(() => setReactFor(c.id), 450); };
    const endPress = () => { if (pressTimer.current) { clearTimeout(pressTimer.current); pressTimer.current = null; } };
    return (
      <div style={{ position: 'relative' }}>
        <div onPointerDown={isAdmin ? startPress : undefined} onPointerUp={isAdmin ? endPress : undefined} onPointerLeave={isAdmin ? endPress : undefined} onContextMenu={isAdmin ? (e => { e.preventDefault(); setReactFor(c.id); }) : undefined}
          style={{ display: 'flex', gap: 8, alignItems: 'flex-start', touchAction: 'pan-y' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, color: 'var(--ink-3)' }}><span style={{ fontWeight: 600, color: 'var(--ink-2)' }}>{c.by}</span> · {fmtWhen(c.createdAt)}</div>
            <p style={{ fontSize: 13.5, color: 'var(--ink)', marginTop: 2, lineHeight: 1.45, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{c.text}</p>
            {c.gif && c.gif.url && <img src={c.gif.url} alt={c.gif.title || 'gif'} style={{ maxWidth: 220, maxHeight: 170, borderRadius: 'var(--r-md)', display: 'block', marginTop: 6, border: '1px solid var(--line)' }} />}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
              {REACTION_DEFS.filter(([k]) => (reactions[k] || []).length).map(([k, e]) => (
                <button key={k} onClick={isAdmin ? () => reactComment(postId, c.id, k) : undefined}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 3, border: '1px solid', borderColor: has(k) ? 'var(--accent)' : 'var(--line)', background: has(k) ? 'var(--accent-soft)' : 'var(--surface)', color: 'var(--ink-2)', borderRadius: 999, padding: '1px 8px', fontSize: 12, cursor: isAdmin ? 'pointer' : 'default', lineHeight: 1.7 }}>
                  <span>{e}</span><span className="mono">{(reactions[k] || []).length}</span>
                </button>
              ))}
              {!isReply && isAdmin && <button onClick={() => setReplyTo({ id: postId, commentId: c.id, name: c.by })} style={{ border: 'none', background: 'none', color: 'var(--ink-3)', cursor: 'pointer', fontSize: 12, fontWeight: 600, padding: 0 }}>Reply</button>}
            </div>
          </div>
          {mine && isAdmin && <button onClick={() => deleteComment(postId, c.id)} title="Delete" style={{ flex: 'none', border: 'none', background: 'none', color: 'var(--ink-3)', cursor: 'pointer', padding: 2, display: 'inline-flex' }}><Icon name="x" style={{ width: 12, height: 12 }} /></button>}
        </div>
        {reactFor === c.id && (<>
          {ReactDOM.createPortal(<div onClick={() => setReactFor(null)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />, document.body)}
          <div style={{ position: 'relative', zIndex: 41, display: 'inline-flex', gap: 2, marginTop: 6, padding: '4px 6px', border: '1px solid var(--line)', borderRadius: 999, background: 'var(--surface)', boxShadow: 'var(--shadow-md)' }}>
            {REACTION_DEFS.map(([k, e]) => (
              <button key={k} onClick={() => reactComment(postId, c.id, k)} title={k}
                style={{ border: 'none', background: has(k) ? 'var(--accent-soft)' : 'none', borderRadius: 8, cursor: 'pointer', fontSize: 19, padding: '3px 6px', lineHeight: 1 }}>{e}</button>
            ))}
          </div>
        </>)}
      </div>
    );
  };
  const downloadAttachment = (it, file) => {
    window.feedbackAction({ action: 'getAttachment', ...(file && file.fileId ? { fileId: file.fileId } : { id: it.id }) })
      .then(r => {
        const bin = atob(r.contentBase64 || '');
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        const url = URL.createObjectURL(new Blob([bytes], { type: r.type || 'application/octet-stream' }));
        const a = document.createElement('a'); a.href = url; a.download = r.name || (file && file.name) || (it.attachment && it.attachment.name) || 'attachment'; a.click();
        setTimeout(() => URL.revokeObjectURL(url), 4000);
      })
      .catch(e => flash && flash('Couldn’t download (' + e.message + ')'));
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
  const vote = (id, dir) => {
    if (!isAdmin) return;
    const cur = myVote[id] || 0;
    const nv = dir === 'up' ? Math.min(cur + 1, 2) : Math.max(cur - 1, -1);
    if (nv === cur) return;
    const delta = nv - cur;
    const upDelta = (nv > 0 ? nv : 0) - (cur > 0 ? cur : 0);
    const dnDelta = (nv < 0 ? -nv : 0) - (cur < 0 ? -cur : 0);
    setMyVote(v => ({ ...v, [id]: nv }));
    setItems(list => list.map(i => i.id === id ? { ...i, votes: (i.votes || 0) + delta, upCount: Math.max(0, (i.upCount || 0) + upDelta), downCount: Math.max(0, (i.downCount || 0) + dnDelta) } : i));
    window.feedbackAction({ action: 'vote', id, dir })
      .then(({ item }) => { if (item) { setItems(list => list.map(i => i.id === id ? { ...i, votes: item.votes, upCount: item.upCount, downCount: item.downCount } : i)); setMyVote(v => ({ ...v, [id]: item.myVote })); } })
      .catch(e => {
        setMyVote(v => ({ ...v, [id]: cur }));
        setItems(list => list.map(i => i.id === id ? { ...i, votes: (i.votes || 0) - delta, upCount: Math.max(0, (i.upCount || 0) - upDelta), downCount: Math.max(0, (i.downCount || 0) - dnDelta) } : i));
        flash && flash('Couldn’t record vote (' + e.message + ')');
      });
  };

  const inp = { width: '100%', padding: '10px 12px', borderRadius: 'var(--r-md)', fontSize: 14, border: '1.5px solid var(--line)', background: 'var(--surface)', color: 'var(--ink)', outline: 'none', fontFamily: 'var(--font-body)' };
  // Requests = pending only. Completed/Declined move to History.
  const sorted = items.slice().filter(i => i.status !== 'Complete' && i.status !== 'Declined').sort((a, b) => sortMode === 'new' ? (new Date(b.createdAt || 0) - new Date(a.createdAt || 0)) : ((b.votes || 0) - (a.votes || 0)));

  return (
    <div className="fade-in">
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: 'clamp(22px,3vw,28px)' }}>Feature requests & roadmap</h1>
          <p style={{ color: 'var(--ink-2)', fontSize: 14.5, marginTop: 6 }}>Suggest improvements and see what’s coming next.</p>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {isAdmin && tab === 'Roadmap' && <button className="btn btn-ghost" onClick={() => setPlanning(p => !p)}><Icon name="plus" /> Add planned feature</button>}
          {isAdmin && <button className="btn btn-primary" onClick={() => { setTab('Requests'); setAdding(a => !a); }}><Icon name="plus" /> Submit a request</button>}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 4, marginBottom: 'var(--gap)', borderBottom: '1px solid var(--line)' }}>
        {['Requests', 'Roadmap', 'History'].map(tb => <button key={tb} onClick={() => setTab(tb)} style={{ border: 'none', background: 'none', padding: '10px 16px', fontSize: 14, fontWeight: 600, cursor: 'pointer', color: tab === tb ? 'var(--accent-strong)' : 'var(--ink-3)', borderBottom: `2px solid ${tab === tb ? 'var(--accent)' : 'transparent'}`, marginBottom: -1 }}>{tb}</button>)}
      </div>

      {tab === 'Requests' && (
        <>
          {isAdmin && adding && (
            <div className="card" style={{ padding: 'var(--pad)', marginBottom: 'var(--gap)', borderColor: 'var(--accent)' }}>
              <h3 style={{ fontSize: 15.5, marginBottom: 12 }}>Suggest an update</h3>
              <input value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })} placeholder="Short title" style={{ ...inp, marginBottom: 10, fontWeight: 600 }} />
              <textarea value={draft.desc} onChange={e => onDescChange(e.target.value)} rows={3} placeholder="What would you like to see, and why?" style={{ ...inp, resize: 'vertical', lineHeight: 1.5, marginBottom: 10 }} />
              {gif && (
                <div style={{ position: 'relative', display: 'inline-block', marginBottom: 10 }}>
                  <img src={gif.url} alt={gif.title} style={{ maxWidth: 260, maxHeight: 200, borderRadius: 'var(--r-md)', display: 'block', border: '1px solid var(--line)' }} />
                  <button onClick={() => setGif(null)} title="Remove gif" style={{ position: 'absolute', top: 6, right: 6, width: 24, height: 24, borderRadius: '50%', border: 'none', background: 'rgba(0,0,0,.6)', color: '#fff', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="x" style={{ width: 13, height: 13 }} /></button>
                </div>
              )}
              <div style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                  {attachFiles.map((f, i) => (
                    <div key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 10px', border: '1px solid var(--line)', borderRadius: 'var(--r-md)', fontSize: 12.5, color: 'var(--ink-2)' }}>
                      <Icon name="doc" style={{ width: 13, height: 13 }} />
                      <span style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                      <span className="mono" style={{ color: 'var(--ink-3)' }}>{fmtSize(f.size)}</span>
                      <button onClick={() => removeFile(i)} title="Remove" style={{ border: 'none', background: 'none', color: 'var(--ink-3)', cursor: 'pointer', padding: 0, display: 'inline-flex' }}><Icon name="x" style={{ width: 13, height: 13 }} /></button>
                    </div>
                  ))}
                  {attachFiles.length < 5 && (
                    <label className="btn btn-quiet" style={{ cursor: 'pointer', display: 'inline-flex' }}>
                      <Icon name="plus" style={{ width: 13, height: 13 }} /> Attach {attachFiles.length ? 'another' : 'a file'}
                      <input type="file" multiple onChange={e => { addFiles(e.target.files); e.target.value = ''; }} style={{ display: 'none' }} accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.png,.jpg,.jpeg" />
                    </label>
                  )}
                </div>
                {attachErr && <div style={{ fontSize: 12, color: 'oklch(0.55 0.16 25)', marginTop: 6 }}>{attachErr}</div>}
              </div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <select value={draft.cat} onChange={e => setDraft({ ...draft, cat: e.target.value })} style={{ ...inp, width: 'auto', appearance: 'auto' }}>{FB_CATS.map(c => <option key={c}>{c}</option>)}</select>
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                  <button className="btn btn-quiet" onClick={() => { setAdding(false); setAttachFiles([]); setAttachErr(''); setGif(null); }}>Cancel</button>
                  <button className="btn btn-primary" disabled={!draft.title.trim() || submitting} onClick={submit}><Icon name="check" /> {submitting ? 'Submitting…' : 'Submit'}</button>
                </div>
              </div>
            </div>
          )}
          {!loading && !loadErr && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 'var(--gap)' }}>
              <button onClick={() => setSortMode(m => m === 'top' ? 'new' : 'top')} title={sortMode === 'new' ? 'Sorted by newest — tap for top voted' : 'Sorted by top voted — tap for newest'}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '5px 12px', borderRadius: 999, cursor: 'pointer', fontSize: 12.5, fontWeight: 600, fontFamily: 'var(--font-body)', border: '1px solid', borderColor: sortMode === 'new' ? 'var(--accent)' : 'var(--line)', background: sortMode === 'new' ? 'var(--accent-soft)' : 'var(--surface)', color: sortMode === 'new' ? 'var(--accent-strong)' : 'var(--ink-2)' }}>
                <Icon name={sortMode === 'new' ? 'clock' : 'chevron'} style={{ width: 14, height: 14, transform: sortMode === 'new' ? 'none' : 'rotate(-90deg)' }} />
                {sortMode === 'new' ? 'Newest' : 'Top voted'}
              </button>
            </div>
          )}
          {loading && <div style={{ padding: 24, textAlign: 'center', color: 'var(--ink-3)', fontSize: 13.5 }}>Loading…</div>}
          {!loading && loadErr && <div className="card" style={{ padding: 'var(--pad)', color: 'var(--ink-2)', fontSize: 13.5 }}>{loadErr}</div>}
          {!loading && !loadErr && sorted.length === 0 && <div style={{ padding: 24, textAlign: 'center', color: 'var(--ink-3)', fontSize: 13.5 }}>No requests yet — be the first to suggest something.</div>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {!loading && !loadErr && sorted.map(it => (
              <div key={it.id} className="card" style={{ padding: 'var(--pad)', display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                <VoteBox value={it.votes || 0} mine={myVote[it.id] || 0} up={it.upCount || 0} down={it.downCount || 0} onUp={() => vote(it.id, 'up')} onDown={() => vote(it.id, 'down')} readOnly={!isAdmin} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 600, fontSize: 15 }}>{it.title}</span>
                    <span className={`badge ${FB_TONE[it.status]}`}>{it.status}</span>
                    {it.eta && <span className="badge badge-prog"><Icon name="calendar" /> {it.eta}</span>}
                  </div>
                  <p style={{ fontSize: 13.5, color: 'var(--ink-2)', marginTop: 4, lineHeight: 1.45 }}>{it.desc}</p>
                  {it.gif && it.gif.url && <img src={it.gif.url} alt={it.gif.title || 'gif'} style={{ maxWidth: 300, maxHeight: 220, borderRadius: 'var(--r-md)', display: 'block', marginTop: 8, border: '1px solid var(--line)' }} />}
                  <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 6 }}>{it.cat} · suggested by {it.by}</div>
                  <button onClick={() => toggleComments(it.id)} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, marginTop: 10, padding: '6px 10px', border: '1px solid', borderColor: openComments === it.id ? 'var(--accent)' : 'var(--line)', borderRadius: 'var(--r-md)', background: openComments === it.id ? 'var(--accent-soft)' : 'var(--surface)', color: openComments === it.id ? 'var(--accent-strong)' : 'var(--ink-2)', fontSize: 12.5, cursor: 'pointer' }}>
                    <Icon name="comment" style={{ width: 14, height: 14 }} />
                    {it.commentCount ? 'Comments' : 'Comment'}
                    {it.commentCount > 0 && <span className="mono" style={{ minWidth: 18, textAlign: 'center', padding: '1px 6px', borderRadius: 10, background: 'var(--accent)', color: '#fff', fontSize: 11, fontWeight: 700 }}>{it.commentCount}</span>}
                  </button>
                  {openComments === it.id && (
                    <div style={{ marginTop: 12, borderTop: '1px solid var(--line)', paddingTop: 12 }}>
                      {commentLoading && !commentsById[it.id] && <div style={{ color: 'var(--ink-3)', fontSize: 13 }}>Loading…</div>}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {(commentsById[it.id] || []).filter(c => !c.parentId).map(c => {
                          const replies = (commentsById[it.id] || []).filter(r => r.parentId === c.id);
                          return (
                            <div key={c.id}>
                              {renderComment(it.id, c, false)}
                              {replies.length > 0 && (
                                <div style={{ marginLeft: 13, paddingLeft: 13, borderLeft: '2px solid var(--line)', display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
                                  {replies.map(r => renderComment(it.id, r, true))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                        {commentsById[it.id] && commentsById[it.id].length === 0 && !commentLoading && <div style={{ color: 'var(--ink-3)', fontSize: 13 }}>No comments yet.</div>}
                      </div>
                      {isAdmin && (<>
                      {replyTo && replyTo.id === it.id && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, fontSize: 12.5, color: 'var(--ink-2)' }}>
                          <Icon name="comment" style={{ width: 12, height: 12 }} /> Replying to <b>{replyTo.name}</b>
                          <button onClick={() => setReplyTo(null)} style={{ border: 'none', background: 'none', color: 'var(--ink-3)', cursor: 'pointer', display: 'inline-flex', padding: 2 }}><Icon name="x" style={{ width: 12, height: 12 }} /></button>
                        </div>
                      )}
                      <div style={{ display: 'flex', gap: 8, marginTop: (replyTo && replyTo.id === it.id) ? 6 : 12 }}>
                        <input value={commentDraft} onChange={e => onCommentChange(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); postComment(it.id); } }} placeholder={(replyTo && replyTo.id === it.id) ? `Reply to ${replyTo.name}…` : 'Add a comment…'} style={{ ...inp, flex: 1, padding: '8px 12px', fontSize: 13.5 }} />
                        <button className="btn btn-primary" disabled={(!commentDraft.trim() && !commentGif) || commentBusy} onClick={() => postComment(it.id)}>{(replyTo && replyTo.id === it.id) ? 'Reply' : 'Post'}</button>
                      </div>
                      {commentGif && (
                        <div style={{ position: 'relative', display: 'inline-block', marginTop: 8 }}>
                          <img src={commentGif.url} alt={commentGif.title} style={{ maxWidth: 200, maxHeight: 150, borderRadius: 'var(--r-md)', display: 'block', border: '1px solid var(--line)' }} />
                          <button onClick={() => setCommentGif(null)} title="Remove gif" style={{ position: 'absolute', top: 6, right: 6, width: 22, height: 22, borderRadius: '50%', border: 'none', background: 'rgba(0,0,0,.6)', color: '#fff', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="x" style={{ width: 12, height: 12 }} /></button>
                        </div>
                      )}
                      </>)}
                    </div>
                  )}
                  {(() => { const files = (it.attachments && it.attachments.length) ? it.attachments : (it.attachment ? [it.attachment] : []); return files.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
                      {files.map((f, i) => (
                        <button key={i} onClick={() => downloadAttachment(it, f)} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '6px 10px', border: '1px solid var(--line)', borderRadius: 'var(--r-md)', background: 'var(--surface)', color: 'var(--ink-2)', fontSize: 12.5, cursor: 'pointer' }}>
                          <Icon name="doc" style={{ width: 13, height: 13 }} />
                          <span style={{ maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                          {f.size ? <span className="mono" style={{ color: 'var(--ink-3)' }}>{fmtSize(f.size)}</span> : null}
                        </button>
                      ))}
                    </div>
                  ); })()}
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
        const archived = items.filter(i => i.status === 'Complete' || i.status === 'Declined').sort((a, b) => new Date(b.completedAt || b.createdAt || 0) - new Date(a.completedAt || a.createdAt || 0));
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {archived.length === 0 && <div style={{ padding: 24, textAlign: 'center', color: 'var(--ink-3)', fontSize: 13.5 }}>Nothing shipped or declined yet.</div>}
            {archived.map(it => {
              const declined = it.status === 'Declined';
              return (
              <div key={it.id} className="card" style={{ padding: 'var(--pad)', display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                <Icon name={declined ? 'x' : 'check'} style={{ width: 18, height: 18, color: declined ? 'var(--ink-3)' : 'var(--ok)', flex: 'none', marginTop: 2 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 600, fontSize: 15 }}>{it.title}</span>
                    <span className={`badge ${declined ? 'badge-todo' : 'badge-ok'}`}>{declined ? 'Declined' : 'Shipped'}</span>
                  </div>
                  <p style={{ fontSize: 13.5, color: 'var(--ink-2)', marginTop: 4, lineHeight: 1.45 }}>{it.desc}</p>
                  <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 6 }}>{it.cat} · suggested by {it.by}{it.completedAt ? ' · ' + (declined ? 'declined ' : 'completed ') + new Date(it.completedAt).toLocaleDateString() : ''}</div>
                </div>
                {isAdmin && <button className="btn btn-quiet" style={{ color: 'oklch(0.55 0.16 25)', fontSize: 12.5, flex: 'none' }} onClick={() => removeItem(it.id)}><Icon name="trash" style={{ width: 13, height: 13 }} /> Delete</button>}
              </div>
              );
            })}
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
                    <span style={{ width: 9, height: 9, borderRadius: '50%', background: status === 'Complete' ? 'var(--ok)' : status === 'In progress' ? 'var(--warn)' : status === 'Submitted' ? 'var(--ink-3)' : 'var(--accent)' }} />
                    <h3 style={{ fontSize: 14, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--ink-3)', fontFamily: 'var(--font-body)' }}>{label}</h3>
                    <span className="mono" style={{ fontSize: 11, color: 'var(--ink-3)' }}>{col.length}</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {col.length === 0 && <div style={{ fontSize: 12.5, color: 'var(--ink-3)', padding: '14px', textAlign: 'center', border: '1px dashed var(--line)', borderRadius: 'var(--r-md)' }}>Nothing here yet</div>}
                    {col.map(it => (
                      <div key={it.id} onClick={() => setDetail(it)} className="card" style={{ padding: '14px var(--pad)', cursor: 'pointer' }}
                        onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--accent)'} onMouseLeave={e => e.currentTarget.style.borderColor = ''}>
                        <div style={{ fontWeight: 600, fontSize: 14 }}>{it.title}</div>
                        <p style={{ fontSize: 12.5, color: 'var(--ink-2)', marginTop: 4, lineHeight: 1.4 }}>{it.desc}</p>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                          <span className="badge badge-todo" style={{ fontSize: 10.5 }}>{it.cat}</span>
                          {it.eta && <span className="badge badge-prog" style={{ fontSize: 10.5 }}><Icon name="calendar" /> {it.eta}</span>}
                          {!it.planned && <span className="mono" style={{ fontSize: 10.5, color: 'var(--ink-3)', marginLeft: !isAdmin ? 'auto' : 0 }}>▲ {it.votes}</span>}
                          {isAdmin && <button onClick={(e) => { e.stopPropagation(); removeItem(it.id); }} title="Delete" style={{ border: 'none', background: 'none', color: 'oklch(0.55 0.16 25)', cursor: 'pointer', padding: 0, marginLeft: 'auto' }}><Icon name="trash" style={{ width: 13, height: 13 }} /></button>}
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

      {gifOpen && <GifPicker onPick={g => { if (gifTarget === 'comment') setCommentGif(g); else setGif(g); setGifOpen(false); }} onClose={() => setGifOpen(false)} flash={flash} />}
      {detail && (
        <div onClick={() => setDetail(null)} style={{ position: 'fixed', inset: 0, zIndex: 90, background: 'oklch(0.2 0.03 250 / 0.45)', display: 'grid', placeItems: 'center', padding: '6vh 16px' }}>
          <div onClick={e => e.stopPropagation()} className="card" style={{ width: 'min(520px, 96vw)', maxHeight: '88vh', overflowY: 'auto', padding: 'var(--pad)' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <h2 style={{ fontSize: 18, flex: 1 }}>{detail.title}</h2>
              <button className="btn btn-quiet" style={{ padding: 8 }} onClick={() => setDetail(null)}><Icon name="x" /></button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
              <span className={`badge ${FB_TONE[detail.status]}`}>{detail.status}</span>
              <span className="badge badge-todo" style={{ fontSize: 10.5 }}>{detail.cat}</span>
              {detail.eta && <span className="badge badge-prog" style={{ fontSize: 10.5 }}><Icon name="calendar" /> {detail.eta}</span>}
              {!detail.planned && <span className="mono" style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>▲ {detail.votes || 0}</span>}
            </div>
            {detail.desc && <p style={{ fontSize: 13.5, color: 'var(--ink-2)', marginTop: 12, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{detail.desc}</p>}
            <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 12 }}>Suggested by {detail.by || 'someone'}{detail.commentCount ? ` · ${detail.commentCount} comment${detail.commentCount === 1 ? '' : 's'}` : ''}</div>
          </div>
        </div>
      )}
    </div>
  );
}

function GifPicker({ onPick, onClose, flash }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let live = true;
    setLoading(true);
    const t = setTimeout(() => {
      window.searchGifs(q)
        .then(gifs => { if (live) setResults(gifs); })
        .catch(e => { if (live) { setResults([]); flash && flash('Gif search failed (' + e.message + ')'); } })
        .finally(() => { if (live) setLoading(false); });
    }, q ? 300 : 0); // debounce typed queries; load trending immediately
    return () => { live = false; clearTimeout(t); };
  }, [q]);
  const inp = { width: '100%', padding: '10px 12px', borderRadius: 'var(--r-md)', fontSize: 14, border: '1.5px solid var(--line)', background: 'var(--surface)', color: 'var(--ink)', outline: 'none', fontFamily: 'var(--font-body)' };
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div onClick={e => e.stopPropagation()} className="card" style={{ width: 'min(560px,100%)', maxHeight: '80vh', display: 'flex', flexDirection: 'column', padding: 'var(--pad)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Search GIPHY…" style={{ ...inp, flex: 1 }} />
          <button onClick={onClose} className="btn btn-quiet"><Icon name="x" style={{ width: 14, height: 14 }} /></button>
        </div>
        <div style={{ overflowY: 'auto', flex: 1, minHeight: 120 }}>
          {loading && <div style={{ padding: 24, textAlign: 'center', color: 'var(--ink-3)', fontSize: 13.5 }}>Loading…</div>}
          {!loading && results.length === 0 && <div style={{ padding: 24, textAlign: 'center', color: 'var(--ink-3)', fontSize: 13.5 }}>No gifs found.</div>}
          {!loading && results.length > 0 && (
            <div style={{ columnCount: 3, columnGap: 8 }}>
              {results.map(g => (
                <img key={g.id} src={g.previewUrl} alt={g.title} onClick={() => onPick(g)} style={{ width: '100%', marginBottom: 8, borderRadius: 'var(--r-sm)', cursor: 'pointer', display: 'block' }} />
              ))}
            </div>
          )}
        </div>
        <div style={{ textAlign: 'right', fontSize: 10.5, color: 'var(--ink-3)', letterSpacing: '.04em', marginTop: 10 }}>POWERED BY GIPHY</div>
      </div>
    </div>
  );
}

Object.assign(window, { Feedback });
