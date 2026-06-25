/* askhr.jsx — "Ask HR": management-facing outsourced-HR module (CEDR-style).
   Advisor chat (live model + offline fallback), Guides & Templates, Webinars,
   and jurisdiction-specific Compliance Alerts. Gated to managers & up. */

/* ---------- advisor badge ---------- */
function HRBadge({ size = 34 }) {
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', flex: 'none', display: 'grid', placeItems: 'center', background: 'linear-gradient(150deg, var(--teal), var(--accent-strong))', color: '#fff', boxShadow: 'inset 0 0 0 1px oklch(1 0 0 / 0.15)' }}>
      <Icon name="shield" style={{ width: size * 0.5, height: size * 0.5 }} />
    </div>
  );
}

/* ---------- lightweight rich-text renderer (bold / italic / bullets / handbook cites) ---------- */
function inlineRich(text, onHandbook) {
  // split on bold, italic, and handbook citations like [Handbook §3.2] or bare §3.2
  const parts = String(text).split(/(\*\*[^*]+\*\*|\*[^*\n]+\*|_[^_\n]+_|\[Handbook §[\d.]+\]|§\d+\.\d+)/g).filter(Boolean);
  return parts.map((p, i) => {
    if (/^\*\*[^*]+\*\*$/.test(p)) return <b key={i}>{p.slice(2, -2)}</b>;
    if (/^\*[^*\n]+\*$/.test(p)) return <i key={i} style={{ color: 'var(--ink-2)' }}>{p.slice(1, -1)}</i>;
    if (/^_[^_\n]+_$/.test(p)) return <i key={i} style={{ color: 'var(--ink-2)' }}>{p.slice(1, -1)}</i>;
    const hb = p.match(/§([\d.]+)/);
    if (hb && (p.startsWith('[Handbook') || /^§\d+\.\d+$/.test(p))) {
      const id = hb[1];
      const sec = (typeof handbookSection === 'function') ? handbookSection(id) : null;
      return (
        <button key={i} onClick={() => onHandbook && onHandbook(id)} title={sec ? sec.title : 'Open handbook'}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 3, verticalAlign: 'baseline', border: '1px solid var(--accent-soft)', background: 'var(--surface)', color: 'var(--accent-strong)', borderRadius: 'var(--r-pill)', padding: '0 7px', margin: '0 1px', fontSize: '0.86em', fontWeight: 700, cursor: 'pointer', lineHeight: 1.5 }}>
          <Icon name="book" style={{ width: 10, height: 10 }} /> §{id}
        </button>
      );
    }
    return <span key={i}>{p}</span>;
  });
}
function RichText({ text, onHandbook }) {
  const lines = String(text).split('\n');
  const blocks = [];
  let list = null;
  lines.forEach((ln, i) => {
    const t = ln.trim();
    if (/^[-•]\s+/.test(t)) {
      if (!list) { list = []; blocks.push({ type: 'ul', items: list }); }
      list.push(t.replace(/^[-•]\s+/, ''));
    } else {
      list = null;
      if (t) blocks.push({ type: 'p', text: t });
    }
  });
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {blocks.map((b, i) => b.type === 'ul'
        ? <ul key={i} style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4 }}>{b.items.map((it, j) => <li key={j} style={{ lineHeight: 1.5 }}>{inlineRich(it, onHandbook)}</li>)}</ul>
        : <p key={i} style={{ margin: 0, lineHeight: 1.55 }}>{inlineRich(b.text, onHandbook)}</p>
      )}
    </div>
  );
}

/* ---------- handbook section drawer ---------- */
function HandbookDrawer({ id, onClose, onNav }) {
  const sec = (typeof handbookSection === 'function') ? handbookSection(id) : null;
  const related = sec ? HANDBOOK.sections.filter(s => s.cat === sec.cat && s.id !== sec.id) : [];
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'oklch(0.2 0.02 250 / 0.45)', zIndex: 80, display: 'flex', justifyContent: 'flex-end' }}>
      <div onClick={e => e.stopPropagation()} className="fade-in" style={{ width: 'min(94vw, 440px)', height: '100%', background: 'var(--surface)', boxShadow: 'var(--shadow-lg)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: 'var(--pad)', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ width: 38, height: 38, borderRadius: 'var(--r-md)', flex: 'none', display: 'grid', placeItems: 'center', background: 'var(--accent-soft)', color: 'var(--accent-strong)' }}><Icon name="book" style={{ width: 19, height: 19 }} /></div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="mono" style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>{HANDBOOK.title}</div>
            <div style={{ fontWeight: 700, fontSize: 16, lineHeight: 1.25, marginTop: 2 }}>{sec ? `§${sec.id} ${sec.title}` : 'Section not found'}</div>
            {sec && <span className="badge" style={{ fontSize: 9.5, padding: '1px 8px', marginTop: 6, background: 'var(--surface-2)', color: 'var(--ink-2)' }}>{sec.cat}</span>}
          </div>
          <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--ink-3)', padding: 4 }}><Icon name="x" /></button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--pad)' }}>
          {sec
            ? <p style={{ fontSize: 14.5, color: 'var(--ink)', lineHeight: 1.6 }}>{sec.summary}</p>
            : <p style={{ fontSize: 14, color: 'var(--ink-2)' }}>That section isn’t in the current handbook edition. Open the Guides &amp; templates tab for the full document.</p>}
          {related.length > 0 && (
            <div style={{ marginTop: 22 }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--ink-3)', marginBottom: 9 }}>Related in {sec.cat}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                {related.map(r => (
                  <button key={r.id} onClick={() => onNav(r.id)} style={{ textAlign: 'left', border: '1px solid var(--line)', background: 'var(--surface-2)', borderRadius: 'var(--r-md)', padding: '9px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 9 }}>
                    <span className="mono" style={{ fontSize: 11.5, color: 'var(--accent-strong)', fontWeight: 700, flex: 'none' }}>§{r.id}</span>
                    <span style={{ fontSize: 13, color: 'var(--ink)', fontWeight: 600 }}>{r.title}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        <div style={{ padding: 'var(--pad)', borderTop: '1px solid var(--line)', fontSize: 11.5, color: 'var(--ink-3)', display: 'flex', alignItems: 'center', gap: 7 }}>
          <Icon name="pin" style={{ width: 13, height: 13, flex: 'none' }} /> {HANDBOOK.edition}
        </div>
      </div>
    </div>
  );
}

/* ---------- offline fallback matcher ---------- */
function hrFallbackAnswer(q) {
  const s = q.toLowerCase();
  let best = null, score = 0;
  HR_FALLBACK.forEach(f => {
    let sc = 0; f.keywords.split(/\s+/).forEach(w => { if (w.length > 2 && s.includes(w)) sc++; });
    if (sc > score) { score = sc; best = f; }
  });
  if (best && score > 0) return best.body;
  return `Here's how I'd approach that:\n\n- Start by documenting the facts — dates, people, and the specific behavior or policy at issue.\n- Check our handbook for the governing policy, and whether the rule differs across our NY offices (Suffolk/Nassau) and the Totowa, NJ office.\n- Apply it consistently with how you've handled similar situations — progressive discipline lives in [Handbook §7.1].\n- For anything involving a leave, a complaint, or a protected class, have an employment attorney review before you act.\n\nWant me to pull the relevant template from the Guides tab?\n\n**Sources:** Handbook §7.1. _General HR guidance, not legal advice._`;
}

/* ---------- Advisor chat ---------- */
function HRAdvisorChat({ me }) {
  const KEY = 'pd_askhr_chat_' + me.id;
  const greeting = { who: 'hr', text: `Hi ${me.first} — I'm ${HR_ADVISOR.short}, your ${HR_ADVISOR.title}. Ask me anything about employee relations, discipline, leaves, wage & hour, or compliance across our NY and NJ offices. I'll give you the practical answer and tell you what to document.\n\n_General HR guidance, not legal advice._` };
  const [msgs, setMsgs] = useState(() => { try { const s = JSON.parse(localStorage.getItem(KEY)); return (s && s.length) ? s : [greeting]; } catch (e) { return [greeting]; } });
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [hbId, setHbId] = useState(null);
  const feedRef = useRef(null);
  useEffect(() => { if (feedRef.current) feedRef.current.scrollTop = feedRef.current.scrollHeight; }, [msgs, busy]);
  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(msgs.slice(-30))); } catch (e) {} }, [msgs]);

  const ask = async (text) => {
    const query = (text || q).trim(); if (!query || busy) return;
    const next = [...msgs, { who: 'me', text: query }];
    setMsgs(next); setQ(''); setBusy(true);
    let answer = null;
    try {
      // Through the shared transport wrapper (PD_LLM): sandbox → window.claude,
      // production → the server AI proxy. Same call for Riley and Harper.
      const messages = next.filter(m => m.who !== 'sys').map(m => ({
        role: m.who === 'me' ? 'user' : 'assistant', content: m.text
      }));
      answer = await window.PD_LLM.complete({ system: HR_SYSTEM_PROMPT, messages });
    } catch (e) { answer = null; }
    if (!answer || !answer.trim()) answer = hrFallbackAnswer(query);
    setMsgs(m => [...m, { who: 'hr', text: answer.trim() }]);
    setBusy(false);
  };

  const reset = () => { setMsgs([greeting]); try { localStorage.removeItem(KEY); } catch (e) {} };

  return (
    <>
    <div className="card" style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', height: 'min(72vh, 660px)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px var(--pad)', borderBottom: '1px solid var(--line)', background: 'var(--surface-2)' }}>
        <HRBadge size={38} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 14.5, display: 'flex', alignItems: 'center', gap: 7 }}>{HR_ADVISOR.name} <span className="badge badge-ok" style={{ fontSize: 9.5, padding: '1px 7px' }}><span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--ok)', display: 'inline-block' }} /> Available</span></div>
          <div style={{ fontSize: 12.5, color: 'var(--ink-3)' }}>{HR_ADVISOR.title} · {HR_ADVISOR.creds}</div>
        </div>
        <button className="btn btn-quiet" style={{ padding: '6px 11px', fontSize: 12.5 }} onClick={reset} title="Start over"><Icon name="refresh" style={{ width: 14, height: 14 }} /> New</button>
      </div>

      <div ref={feedRef} style={{ flex: 1, overflowY: 'auto', padding: 'var(--pad)', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {msgs.map((m, i) => (
          <div key={i} style={{ display: 'flex', gap: 10, flexDirection: m.who === 'me' ? 'row-reverse' : 'row' }}>
            {m.who === 'hr' ? <HRBadge size={30} /> : <PhotoAvatar emp={me} size={30} />}
            <div style={{ maxWidth: '82%', padding: '11px 14px', borderRadius: 14, fontSize: 13.5, lineHeight: 1.5,
              background: m.who === 'hr' ? 'var(--accent-soft)' : 'var(--surface-2)', color: 'var(--ink)',
              borderTopLeftRadius: m.who === 'hr' ? 4 : 14, borderTopRightRadius: m.who === 'me' ? 4 : 14 }}>
              {m.who === 'hr' ? <RichText text={m.text} onHandbook={setHbId} /> : m.text}
            </div>
          </div>
        ))}
        {busy && (
          <div style={{ display: 'flex', gap: 10 }}>
            <HRBadge size={30} />
            <div style={{ padding: '12px 16px', borderRadius: 14, borderTopLeftRadius: 4, background: 'var(--accent-soft)', display: 'flex', gap: 5, alignItems: 'center' }}>
              {[0, 1, 2].map(i => <span key={i} className="hr-dot" style={{ animationDelay: `${i * 0.15}s` }} />)}
            </div>
          </div>
        )}
      </div>

      <div style={{ borderTop: '1px solid var(--line)', padding: 'var(--pad)' }}>
        {msgs.length <= 1 && (
          <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 12 }}>
            {HR_SUGGESTED.slice(0, 5).map(s => (
              <button key={s} onClick={() => ask(s)} style={{ border: '1px solid var(--line)', background: 'var(--surface)', borderRadius: 'var(--r-pill)', padding: '6px 13px', fontSize: 12.5, color: 'var(--ink-2)', cursor: 'pointer', fontWeight: 600, textAlign: 'left' }}>{s}</button>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', gap: 8 }}>
          <input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === 'Enter' && ask()} placeholder={`Ask ${HR_ADVISOR.short} an HR question…`} disabled={busy}
            style={{ flex: 1, padding: '12px 15px', borderRadius: 'var(--r-pill)', fontSize: 14, border: '1.5px solid var(--line)', background: 'var(--surface)', color: 'var(--ink)', outline: 'none' }} />
          <button className="btn btn-primary" onClick={() => ask()} disabled={busy} style={{ padding: '12px 17px' }}><Icon name="arrowRight" /></button>
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Icon name="book" style={{ width: 13, height: 13, flex: 'none' }} /> Answers cite our Employee Handbook — tap any <b style={{ color: 'var(--accent-strong)' }}>§</b> to read the policy. General HR guidance, not legal advice.
        </div>
      </div>
    </div>
    {hbId && <HandbookDrawer id={hbId} onClose={() => setHbId(null)} onNav={setHbId} />}
    </>
  );
}

/* ---------- Guides & templates ---------- */
const GUIDES_KEY = 'pd_hr_forms_v1';
function loadCustomForms() { try { return JSON.parse(localStorage.getItem(GUIDES_KEY)) || []; } catch (e) { return []; } }
function extKind(name) {
  const e = (name.split('.').pop() || '').toUpperCase();
  return ['PDF', 'DOC', 'DOCX', 'XLS', 'XLSX', 'PNG', 'JPG', 'JPEG'].includes(e) ? e : 'File';
}
function GuidesTab({ flash }) {
  const [custom, setCustom] = useState(loadCustomForms);
  const [cat, setCat] = useState('All');
  const [open, setOpen] = useState(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);

  const all = useMemo(() => [...custom, ...HR_GUIDES.map((g, i) => ({ ...g, _sid: 'seed' + i }))], [custom]);
  const cats = useMemo(() => ['All', ...Array.from(new Set(all.map(g => g.cat)))], [all]);
  const list = all.filter(g => cat === 'All' || g.cat === cat);

  const persist = (next) => { setCustom(next); try { localStorage.setItem(GUIDES_KEY, JSON.stringify(next)); } catch (e) { flash && flash('Storage full — file too large to save'); } };

  const onFiles = (files) => {
    const arr = Array.from(files || []); if (!arr.length) return;
    setBusy(true);
    let pending = arr.length; const added = [];
    arr.forEach(f => {
      const reader = new FileReader();
      reader.onload = () => {
        added.push({ id: 'form' + Date.now() + Math.random().toString(36).slice(2, 6), custom: true, cat: 'My uploads', icon: 'doc', title: f.name.replace(/\.[^.]+$/, ''), fileName: f.name, kind: extKind(f.name), desc: 'Uploaded by your team. Stored in this portal for managers to download.', updated: 'Uploaded ' + new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), data: reader.result });
        if (--pending === 0) { persist([...added, ...loadCustomForms()]); setBusy(false); setCat('My uploads'); flash && flash(added.length > 1 ? `${added.length} forms uploaded` : `Uploaded · ${added[0].title}`); }
      };
      reader.onerror = () => { if (--pending === 0) setBusy(false); };
      reader.readAsDataURL(f);
    });
  };

  const removeForm = (id) => { persist(loadCustomForms().filter(g => g.id !== id)); setOpen(null); flash && flash('Form removed'); };
  const downloadForm = (g) => {
    if (g.custom && g.data) { const a = document.createElement('a'); a.href = g.data; a.download = g.fileName || g.title; document.body.appendChild(a); a.click(); a.remove(); flash && flash('Downloaded · ' + (g.fileName || g.title)); }
    else { flash && flash('Downloaded · ' + g.title); }
    setOpen(null);
  };

  return (
    <div className="fade-in">
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 'var(--gap)' }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', flex: 1 }}>
          {cats.map(c => (
            <button key={c} onClick={() => setCat(c)} style={{ border: '1px solid var(--line)', background: cat === c ? 'var(--accent)' : 'var(--surface)', color: cat === c ? '#fff' : 'var(--ink-2)', borderColor: cat === c ? 'var(--accent)' : 'var(--line)', borderRadius: 'var(--r-pill)', padding: '6px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>{c}</button>
          ))}
        </div>
        <input ref={fileRef} type="file" multiple style={{ display: 'none' }} accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg" onChange={e => { onFiles(e.target.files); e.target.value = ''; }} />
        <button className="btn btn-primary" disabled={busy} onClick={() => fileRef.current && fileRef.current.click()}><Icon name={busy ? 'refresh' : 'upload'} className={busy ? 'spin' : ''} /> Upload a form</button>
      </div>

      <div onDragOver={e => { e.preventDefault(); }} onDrop={e => { e.preventDefault(); onFiles(e.dataTransfer.files); }}
        style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 'var(--gap)' }}>
        {list.map((g) => (
          <button key={g.id || g._sid} className="card" onClick={() => setOpen(g)} style={{ padding: 'var(--pad)', textAlign: 'left', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 10, border: '1px solid var(--line)', background: 'var(--surface)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
              <div style={{ width: 38, height: 38, borderRadius: 'var(--r-md)', flex: 'none', display: 'grid', placeItems: 'center', background: g.custom ? 'var(--accent-softer)' : 'var(--accent-soft)', color: 'var(--accent-strong)' }}><Icon name={g.icon} style={{ width: 19, height: 19 }} /></div>
              <div style={{ flex: 1, minWidth: 0, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <span className="badge" style={{ fontSize: 9.5, padding: '1px 7px', background: 'var(--surface-2)', color: 'var(--ink-3)' }}>{g.kind}</span>
                {g.custom && <span className="badge badge-ok" style={{ fontSize: 9.5, padding: '1px 7px' }}>Your upload</span>}
              </div>
            </div>
            <div style={{ fontWeight: 700, fontSize: 14.5, lineHeight: 1.3 }}>{g.title}</div>
            <div style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.45, flex: 1 }}>{g.desc}</div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11.5, color: 'var(--ink-3)' }}>
              <span className="mono">{g.updated}</span>
              <span style={{ color: 'var(--accent-strong)', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}>Open <Icon name="chevron" style={{ width: 12, height: 12 }} /></span>
            </div>
          </button>
        ))}
      </div>
      {list.length === 0 && (
        <div className="card" style={{ padding: '36px 20px', textAlign: 'center', color: 'var(--ink-3)' }}>
          <Icon name="upload" style={{ width: 28, height: 28, margin: '0 auto 10px', color: 'var(--ink-3)' }} />
          <div style={{ fontSize: 13.5 }}>No forms here yet. Drag files in or use <b style={{ color: 'var(--ink-2)' }}>Upload a form</b>.</div>
        </div>
      )}
      {open && (
        <div onClick={() => setOpen(null)} style={{ position: 'fixed', inset: 0, background: 'oklch(0.2 0.02 250 / 0.45)', zIndex: 70, display: 'flex', justifyContent: 'flex-end' }}>
          <div onClick={e => e.stopPropagation()} className="fade-in" style={{ width: 'min(94vw, 460px)', height: '100%', background: 'var(--surface)', boxShadow: 'var(--shadow-lg)', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: 'var(--pad)', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <div style={{ width: 40, height: 40, borderRadius: 'var(--r-md)', flex: 'none', display: 'grid', placeItems: 'center', background: 'var(--accent-soft)', color: 'var(--accent-strong)' }}><Icon name={open.icon} style={{ width: 20, height: 20 }} /></div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 16, lineHeight: 1.25 }}>{open.title}</div>
                <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 3 }}>{open.cat} · {open.kind} · {open.updated}</div>
              </div>
              <button onClick={() => setOpen(null)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--ink-3)', padding: 4 }}><Icon name="x" /></button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--pad)' }}>
              <p style={{ fontSize: 14, color: 'var(--ink-2)', lineHeight: 1.55 }}>{open.desc}</p>
              {open.custom && /^data:image\//.test(open.data || '')
                ? <img src={open.data} alt={open.title} style={{ marginTop: 16, width: '100%', borderRadius: 'var(--r-md)', border: '1px solid var(--line)' }} />
                : (
                  <div style={{ marginTop: 16, border: '1px dashed var(--line)', borderRadius: 'var(--r-md)', background: 'var(--surface-2)', padding: '40px 20px', textAlign: 'center' }}>
                    <Icon name="doc" style={{ width: 30, height: 30, color: 'var(--ink-3)', margin: '0 auto' }} />
                    <div className="mono" style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 10 }}>{open.custom ? (open.fileName || open.title) : 'Document preview · ' + open.title}</div>
                  </div>
                )}
            </div>
            <div style={{ padding: 'var(--pad)', borderTop: '1px solid var(--line)', display: 'flex', gap: 10 }}>
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => downloadForm(open)}><Icon name="download" /> Download</button>
              {open.custom
                ? <button className="btn btn-ghost" onClick={() => removeForm(open.id)}><Icon name="trash" /> Remove</button>
                : <button className="btn btn-ghost" onClick={() => { flash && flash('Customization requested from Harper'); }}><Icon name="pen" /> Customize</button>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- Webinars ---------- */
function WebinarsTab({ flash }) {
  const live = HR_WEBINARS.filter(w => w.live);
  const demand = HR_WEBINARS.filter(w => !w.live);
  return (
    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 26 }}>
      <div>
        <h3 style={{ fontSize: 15, marginBottom: 'var(--gap)', display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--warn)' }} /> Upcoming live sessions</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))', gap: 'var(--gap)' }}>
          {live.map((w, i) => (
            <div key={i} className="card" style={{ padding: 'var(--pad)', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span className="badge badge-warn" style={{ fontSize: 10 }}><Icon name="calendar" style={{ width: 11, height: 11 }} /> Live</span>
                <span className="mono" style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>{w.dur}</span>
              </div>
              <div style={{ fontWeight: 700, fontSize: 15, lineHeight: 1.3 }}>{w.title}</div>
              <div style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.45, flex: 1 }}>{w.desc}</div>
              <div style={{ fontSize: 12.5, color: 'var(--accent-strong)', fontWeight: 600 }}>{w.when}</div>
              <button className="btn btn-primary" style={{ width: '100%' }} onClick={() => flash && flash('Registered · ' + w.title)}><Icon name="check" /> Register</button>
            </div>
          ))}
        </div>
      </div>
      <div>
        <h3 style={{ fontSize: 15, marginBottom: 'var(--gap)', display: 'flex', alignItems: 'center', gap: 8 }}><Icon name="play" style={{ width: 15, height: 15, color: 'var(--accent)' }} /> On-demand library</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))', gap: 'var(--gap)' }}>
          {demand.map((w, i) => (
            <button key={i} className="card" onClick={() => flash && flash('Playing · ' + w.title)} style={{ padding: 0, overflow: 'hidden', textAlign: 'left', cursor: 'pointer', border: '1px solid var(--line)', background: 'var(--surface)', display: 'flex', flexDirection: 'column' }}>
              <div style={{ aspectRatio: '16/7', background: 'linear-gradient(135deg, var(--accent-soft), var(--surface-2))', display: 'grid', placeItems: 'center', position: 'relative' }}>
                <div style={{ width: 46, height: 46, borderRadius: '50%', background: 'var(--surface)', boxShadow: 'var(--shadow-md)', display: 'grid', placeItems: 'center', color: 'var(--accent-strong)' }}><Icon name="play" style={{ width: 20, height: 20 }} /></div>
                <span className="mono" style={{ position: 'absolute', bottom: 8, right: 10, fontSize: 11, color: 'var(--ink-2)', background: 'var(--surface)', padding: '2px 7px', borderRadius: 'var(--r-pill)' }}>{w.dur}</span>
              </div>
              <div style={{ padding: 'var(--pad)', display: 'flex', flexDirection: 'column', gap: 7 }}>
                <span className="badge" style={{ fontSize: 9.5, padding: '1px 7px', background: 'var(--accent-soft)', color: 'var(--accent-strong)', alignSelf: 'flex-start' }}>{w.tag}</span>
                <div style={{ fontWeight: 700, fontSize: 14.5, lineHeight: 1.3 }}>{w.title}</div>
                <div style={{ fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.45 }}>{w.desc}</div>
                <div style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>{w.presenter}</div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ---------- Compliance alerts ---------- */
const HR_ALERT_STYLE = {
  action: { label: 'Action needed', color: 'var(--warn)', soft: 'var(--warn-soft)', icon: 'bolt' },
  review: { label: 'Review', color: 'var(--accent)', soft: 'var(--accent-soft)', icon: 'shield' },
  info: { label: 'For awareness', color: 'var(--ink-3)', soft: 'var(--surface-2)', icon: 'bell' },
};
function ComplianceTab() {
  return (
    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--gap)' }}>
      <div className="card" style={{ padding: '14px var(--pad)', display: 'flex', alignItems: 'center', gap: 12, background: 'var(--accent-softer)', borderColor: 'var(--accent-soft)' }}>
        <Icon name="pin" style={{ width: 18, height: 18, color: 'var(--accent-strong)', flex: 'none' }} />
        <div style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.45 }}>Tracking <b>NY State</b> (Suffolk, Nassau, Erie counties) and <b>New Jersey</b> (Totowa, Passaic County). Figures and dates are guidance — confirm current values before acting.</div>
      </div>
      {HR_ALERTS.map((a, i) => {
        const s = HR_ALERT_STYLE[a.level];
        return (
          <div key={i} className="card" style={{ padding: 'var(--pad)', display: 'flex', gap: 14, alignItems: 'flex-start', borderLeft: `3px solid ${s.color}` }}>
            <div style={{ width: 36, height: 36, borderRadius: 'var(--r-md)', flex: 'none', display: 'grid', placeItems: 'center', background: s.soft, color: s.color }}><Icon name={s.icon} style={{ width: 18, height: 18 }} /></div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 5 }}>
                <span style={{ fontWeight: 700, fontSize: 14.5 }}>{a.title}</span>
                <span className="badge" style={{ fontSize: 9.5, padding: '1px 8px', background: s.soft, color: s.color, fontWeight: 700 }}>{s.label}</span>
              </div>
              <div style={{ fontSize: 13.5, color: 'var(--ink-2)', lineHeight: 1.5 }}>{a.body}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 9, fontSize: 11.5, color: 'var(--ink-3)' }}>
                <span className="badge" style={{ fontSize: 9.5, padding: '1px 8px', background: 'var(--surface-2)', color: 'var(--ink-2)' }}><Icon name="pin" style={{ width: 10, height: 10 }} /> {a.juris}</span>
                <span className="mono">{a.effective}</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ---------- module shell ---------- */
function AskHR({ me, flash }) {
  const [tab, setTab] = useState('advisor');
  const TABS = [
    { id: 'advisor', label: 'Advisor', icon: 'sparkle' },
    { id: 'guides', label: 'Guides & templates', icon: 'book' },
    { id: 'webinars', label: 'Webinars', icon: 'play' },
    { id: 'compliance', label: 'Compliance alerts', icon: 'shield' },
  ];
  const alertN = HR_ALERTS.filter(a => a.level === 'action').length;
  return (
    <div className="fade-in">
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 6, flexWrap: 'wrap' }}>
        <HRBadge size={46} />
        <div style={{ flex: 1, minWidth: 220 }}>
          <h1 style={{ fontSize: 'clamp(22px,3vw,28px)' }}>Ask HR</h1>
          <p style={{ color: 'var(--ink-2)', fontSize: 14.5, marginTop: 4 }}>{HR_ADVISOR.blurb}</p>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 4 }}>
        {HR_JURISDICTIONS.map(j => (
          <span key={j.tag} className="badge" title={j.detail} style={{ fontSize: 10.5, padding: '3px 9px', background: 'var(--surface-2)', color: 'var(--ink-2)' }}><Icon name="pin" style={{ width: 11, height: 11 }} /> {j.tag}</span>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--line)', margin: '18px 0 var(--gap)', overflowX: 'auto' }}>
        {TABS.map(tb => (
          <button key={tb.id} onClick={() => setTab(tb.id)} style={{ border: 'none', background: 'none', cursor: 'pointer', padding: '10px 14px', fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap', color: tab === tb.id ? 'var(--accent-strong)' : 'var(--ink-3)', borderBottom: tab === tb.id ? '2px solid var(--accent)' : '2px solid transparent', marginBottom: -1, display: 'flex', alignItems: 'center', gap: 7 }}>
            <Icon name={tb.icon} style={{ width: 16, height: 16 }} /> {tb.label}
            {tb.id === 'compliance' && alertN > 0 && <span style={{ minWidth: 17, height: 17, padding: '0 4px', borderRadius: 99, background: 'var(--warn)', color: '#3a2a00', fontSize: 10, fontWeight: 800, display: 'grid', placeItems: 'center' }}>{alertN}</span>}
          </button>
        ))}
      </div>

      {tab === 'advisor' && <HRAdvisorChat me={me} />}
      {tab === 'guides' && <GuidesTab flash={flash} />}
      {tab === 'webinars' && <WebinarsTab flash={flash} />}
      {tab === 'compliance' && <ComplianceTab />}
    </div>
  );
}

Object.assign(window, { AskHR, HRBadge, HandbookDrawer });
