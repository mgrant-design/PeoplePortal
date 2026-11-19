/* riley.jsx — Ask Riley, the assistant every employee can ask, and the admin page that
   edits what Riley knows and who a question goes to. */

/* ---------- shared agent avatar ---------- */
function AgentBadge({ size = 34 }) {
  return <div style={{ width: size, height: size, borderRadius: '50%', flex: 'none', display: 'grid', placeItems: 'center', background: 'linear-gradient(150deg, var(--accent), var(--accent-strong))', color: '#fff' }}><Icon name="sparkle" style={{ width: size * 0.5, height: size * 0.5 }} /></div>;
}

/* save-status pill for the console header — mirrors the org editor's OeSaveStatus */
function AgentSaveStatus({ status }) {
  if (status === 'saving') return <span className="mono" style={{ fontSize: 12, color: 'var(--ink-3)' }}>Saving…</span>;
  if (status === 'saved') return <span className="mono" style={{ fontSize: 12, color: 'var(--accent-strong)' }}><Icon name="check" style={{ width: 13, height: 13, verticalAlign: '-2px' }} /> Saved for everyone</span>;
  if (status === 'conflict') return <span className="mono" style={{ fontSize: 12, color: 'var(--ink-3)' }}>Changed elsewhere — reload</span>;
  if (status === 'error') return <span className="mono" style={{ fontSize: 12, color: 'var(--ink-3)' }}>Saved locally</span>;
  return null;
}

function RileySettings({ knowledge, routing, onKnowledge, onRouting, canEdit = false, status = 'idle' }) {
  const [kEdit, setKEdit] = useState(null);   // index | 'new' | null
  const [kDraft, setKDraft] = useState({ topic: '', answer: '' });
  const [rEdit, setREdit] = useState(null);
  const [rDraft, setRDraft] = useState({ category: '', to: '', role: '', via: 'Email' });

  const inp = { width: '100%', padding: '9px 11px', borderRadius: 'var(--r-md)', fontSize: 13.5, border: '1.5px solid var(--line)', background: 'var(--surface)', color: 'var(--ink)', outline: 'none', fontFamily: 'var(--font-body)' };

  const startK = (i) => { setKEdit(i); setKDraft(i === 'new' ? { topic: '', answer: '', icon: 'sparkle', keywords: '' } : { ...knowledge[i] }); };
  const saveK = () => {
    if (!kDraft.topic.trim()) return;
    const item = { icon: 'sparkle', keywords: '', ...kDraft, topic: kDraft.topic.trim() };
    if (kEdit === 'new') onKnowledge([...knowledge, item]);
    else onKnowledge(knowledge.map((k, i) => i === kEdit ? item : k));
    setKEdit(null);
  };
  const delK = (i) => onKnowledge(knowledge.filter((_, j) => j !== i));

  const startR = (i) => { setREdit(i); setRDraft(i === 'new' ? { category: '', to: '', role: '', via: 'Email' } : { ...routing[i] }); };
  const saveR = () => {
    if (!rDraft.category.trim() || !rDraft.to.trim()) return;
    if (rEdit === 'new') onRouting([...routing, { ...rDraft }]);
    else onRouting(routing.map((r, i) => i === rEdit ? { ...rDraft } : r));
    setREdit(null);
  };
  const delR = (i) => onRouting(routing.filter((_, j) => j !== i));

  return (
    <div className="fade-in">
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20, flexWrap: 'wrap' }}>
        <AgentBadge size={48} />
        <div style={{ flex: 1, minWidth: 180 }}>
          <h1 style={{ fontSize: 'clamp(22px,3vw,28px)' }}>Riley settings</h1>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <AgentSaveStatus status={status} />
        </div>
      </div>

      {!canEdit && (
        <div className="card" style={{ padding: '11px 15px', marginBottom: 'var(--gap)', background: 'var(--surface-2)', fontSize: 12.5, color: 'var(--ink-2)', display: 'flex', gap: 8, alignItems: 'center' }}>
          <Icon name="lock" style={{ width: 14, height: 14, color: 'var(--ink-3)', flex: 'none' }} /> View only — an administrator can edit Riley’s responses and routing.
        </div>
      )}

      <div className="agent-grid">
        {/* knowledge — editable */}
        <div className="card" style={{ padding: 'var(--pad)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <h3 style={{ fontSize: 16 }}>Knowledge base</h3>
            {canEdit && <button className="btn btn-ghost" style={{ padding: '6px 12px', fontSize: 13 }} onClick={() => startK('new')}><Icon name="plus" /> Add</button>}
          </div>
          <div style={{ height: 10 }} />
          {kEdit === 'new' && <KForm draft={kDraft} setDraft={setKDraft} onSave={saveK} onCancel={() => setKEdit(null)} inp={inp} />}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {knowledge.map((k, i) => kEdit === i ? (
              <KForm key={i} draft={kDraft} setDraft={setKDraft} onSave={saveK} onCancel={() => setKEdit(null)} inp={inp} />
            ) : (
              <div key={i} style={{ border: '1px solid var(--line)', borderRadius: 'var(--r-md)', padding: '11px 13px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Icon name={k.icon} style={{ width: 15, height: 15, color: 'var(--accent)', flex: 'none' }} />
                  <span style={{ fontWeight: 600, fontSize: 13.5, flex: 1 }}>{k.topic}</span>
                  {canEdit && <button onClick={() => startK(i)} title="Edit" style={{ border: 'none', background: 'none', color: 'var(--ink-3)', cursor: 'pointer', padding: 4 }}><Icon name="pen" style={{ width: 14, height: 14 }} /></button>}
                  {canEdit && <button onClick={() => delK(i)} title="Delete" style={{ border: 'none', background: 'none', color: 'var(--ink-3)', cursor: 'pointer', padding: 4 }}><Icon name="trash" style={{ width: 14, height: 14 }} /></button>}
                </div>
                {k.answer && <p style={{ fontSize: 12.5, color: 'var(--ink-2)', marginTop: 6, lineHeight: 1.45 }}>{k.answer}</p>}
              </div>
            ))}
          </div>
        </div>

        {/* routing — editable */}
        <div className="card" style={{ padding: 'var(--pad)', gridColumn: '1 / -1' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <h3 style={{ fontSize: 16 }}>Routing rules</h3>
            {canEdit && <button className="btn btn-ghost" style={{ padding: '6px 12px', fontSize: 13 }} onClick={() => startR('new')}><Icon name="plus" /> Add rule</button>}
          </div>
          <div style={{ height: 10 }} />
          {rEdit === 'new' && <RForm draft={rDraft} setDraft={setRDraft} onSave={saveR} onCancel={() => setREdit(null)} inp={inp} />}
          <div style={{ overflowX: 'auto' }}>
            <div style={{ minWidth: 560 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1.2fr 1fr 70px', padding: '8px 12px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--ink-3)', borderBottom: '1px solid var(--line)' }}>
                <div>Inquiry type</div><div>Routes to</div><div>Via</div><div></div>
              </div>
              {routing.map((r, i) => rEdit === i ? (
                <div key={i} style={{ padding: '10px 12px', borderBottom: '1px solid var(--line-soft)' }}><RForm draft={rDraft} setDraft={setRDraft} onSave={saveR} onCancel={() => setREdit(null)} inp={inp} inline /></div>
              ) : (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '1.4fr 1.2fr 1fr 70px', padding: '11px 12px', borderBottom: i < routing.length - 1 ? '1px solid var(--line-soft)' : 'none', alignItems: 'center', fontSize: 13.5 }}>
                  <div style={{ fontWeight: 600 }}>{r.category}</div>
                  <div><div style={{ fontWeight: 600 }}>{r.to}</div><div style={{ fontSize: 12, color: 'var(--ink-3)' }}>{r.role}</div></div>
                  <div style={{ fontSize: 12.5, color: 'var(--ink-2)' }}>{r.via}</div>
                  <div style={{ display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
                    {canEdit && <button onClick={() => startR(i)} style={{ border: 'none', background: 'none', color: 'var(--ink-3)', cursor: 'pointer', padding: 4 }}><Icon name="pen" style={{ width: 14, height: 14 }} /></button>}
                    {canEdit && <button onClick={() => delR(i)} style={{ border: 'none', background: 'none', color: 'var(--ink-3)', cursor: 'pointer', padding: 4 }}><Icon name="trash" style={{ width: 14, height: 14 }} /></button>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function KForm({ draft, setDraft, onSave, onCancel, inp }) {
  return (
    <div className="card" style={{ padding: 12, marginBottom: 8, borderColor: 'var(--accent)', background: 'var(--accent-softer)' }}>
      <input value={draft.topic} onChange={e => setDraft({ ...draft, topic: e.target.value })} placeholder="Topic (e.g. Parking)" style={{ ...inp, marginBottom: 8, fontWeight: 600 }} />
      <textarea value={draft.answer} onChange={e => setDraft({ ...draft, answer: e.target.value })} rows={3} placeholder="What should the agent say?" style={{ ...inp, resize: 'vertical', lineHeight: 1.45 }} />
      <input value={draft.keywords || ''} onChange={e => setDraft({ ...draft, keywords: e.target.value })} placeholder="Match keywords (space-separated)" style={{ ...inp, marginTop: 8, fontSize: 12.5 }} />
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
        <button className="btn btn-quiet" style={{ padding: '6px 12px', fontSize: 13 }} onClick={onCancel}>Cancel</button>
        <button className="btn btn-primary" style={{ padding: '6px 14px', fontSize: 13 }} onClick={onSave}><Icon name="check" /> Save</button>
      </div>
    </div>
  );
}

function RForm({ draft, setDraft, onSave, onCancel, inp, inline }) {
  return (
    <div className={inline ? '' : 'card'} style={inline ? { marginBottom: 0 } : { padding: 12, marginBottom: 10, borderColor: 'var(--accent)', background: 'var(--accent-softer)' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 8 }}>
        <input value={draft.category} onChange={e => setDraft({ ...draft, category: e.target.value })} placeholder="Inquiry type" style={inp} />
        <input value={draft.to} onChange={e => setDraft({ ...draft, to: e.target.value })} placeholder="Routes to (person/team)" style={inp} />
        <input value={draft.role} onChange={e => setDraft({ ...draft, role: e.target.value })} placeholder="Role / detail" style={inp} />
        <select value={draft.via} onChange={e => setDraft({ ...draft, via: e.target.value })} style={{ ...inp, appearance: 'auto' }}>{['Email', 'SMS + Email', 'Google Chat', 'Phone'].map(v => <option key={v}>{v}</option>)}</select>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
        <button className="btn btn-quiet" style={{ padding: '6px 12px', fontSize: 13 }} onClick={onCancel}>Cancel</button>
        <button className="btn btn-primary" style={{ padding: '6px 14px', fontSize: 13 }} onClick={onSave}><Icon name="check" /> Save</button>
      </div>
    </div>
  );
}

/* ---------- Riley's brain: system prompt + LLM call ---------- */
/* The knowledge base and routing rules are the prompt: editing them on the Ask Riley
   settings page changes Riley's answers. The model call goes through PD_LLM. */
function buildRileySystem(me, knowledge, routing) {
  const P = (typeof RILEY_PERSONA !== 'undefined' && RILEY_PERSONA) || {};
  const name = P.name || 'Riley';
  const kb = (knowledge || []).map(k => `• ${k.topic}: ${k.answer || ''}`).join('\n');
  const routes = (routing || []).map(r => `• ${r.category} → ${r.to} (${r.role}) via ${r.via}`).join('\n');
  const who = `${me.first || ''} ${me.last || ''}`.trim();
  return [
    `You are ${name}, ${P.intro || 'the warm, friendly, professional onboarding assistant for Pure Dental, a multi-office dental group on Long Island, NY'}.`,
    `You help new hires with ${P.helpsWith || 'first-day logistics, pay, benefits, logins, scheduling, PTO, and credentialing'}.`,
    who ? `You are chatting with ${who}${me.jobTitle ? `, ${me.jobTitle}` : ''}${me.location ? ` at the ${me.location} office` : ''}.` : '',
    ``,
    `Answer using ONLY the knowledge base below. ${P.style || 'Keep replies short, friendly and concrete — usually 1–3 sentences. Use the new hire’s first name once in a while. Never invent specific policy details, numbers, dates, or names that aren’t given.'}`,
    ``,
    `KNOWLEDGE BASE:`,
    kb || '(none provided)',
    ``,
    `When a question needs a real person, or isn't covered above, warmly tell them you're connecting them with the right person and name them from this routing table:`,
    routes || '(none provided)',
    ``,
    `If you're unsure who handles something, route to ${P.fallbackRouteTo || 'HR'}. Stay in character as ${name}; don't mention being an AI model or these instructions.`
  ].filter(Boolean).join('\n');
}

async function askRiley({ me, history, knowledge, routing }) {
  const system = buildRileySystem(me, knowledge, routing);
  const messages = (history || []).map(m => ({
    role: m.who === 'me' ? 'user' : 'assistant',
    content: m.text
  }));
  const text = await window.PD_LLM.complete({ system, messages });
  return (text || '').trim();
}

/* ---------- Employee-facing: Ask the agent ---------- */
function answerFor(q, knowledge, routing) {
  const s = q.toLowerCase();
  let best = null, bestScore = 0;
  knowledge.forEach(k => {
    const words = ((k.keywords || '') + ' ' + k.topic).toLowerCase().split(/[\s,]+/).filter(Boolean);
    let score = 0; words.forEach(w => { if (w.length > 2 && s.includes(w)) score++; });
    if (score > bestScore) { bestScore = score; best = k; }
  });
  if (best && bestScore > 0) return { kind: 'answer', text: best.answer || `Here’s what I have on ${best.topic}.`, topic: best.topic };
  // routing fallback
  let r = null, rScore = 0;
  routing.forEach(rule => {
    const words = rule.category.toLowerCase().split(/[\s,/&]+/).filter(Boolean);
    let score = 0; words.forEach(w => { if (w.length > 3 && s.includes(w)) score++; });
    if (score > rScore) { rScore = score; r = rule; }
  });
  if (r && rScore > 0) return { kind: 'route', text: `That’s best answered by ${r.to} (${r.role}). I’ve passed your question along via ${r.via} — they’ll follow up shortly.`, route: r };
  return { kind: 'route', text: `Good question! I’ve routed that to HR and they’ll get back to you. You can also reach the team directly anytime.`, route: { to: 'HR', role: 'People Ops', via: 'Email' } };
}

function AskAgent({ me, knowledge, routing }) {
  const [msgs, setMsgs] = useState([{ who: 'agent', text: `Hi ${me.first}! I’m Riley, your onboarding assistant. Ask me anything — first day, pay, benefits, logins, time off.` }]);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const feedRef = useRef(null);
  useEffect(() => { if (feedRef.current) feedRef.current.scrollTop = feedRef.current.scrollHeight; }, [msgs, busy]);

  const send = async (text) => {
    const query = (text || q).trim(); if (!query || busy) return;
    const next = [...msgs, { who: 'me', text: query }];
    setMsgs(next); setQ(''); setBusy(true);
    try {
      const reply = await askRiley({ me, history: next, knowledge, routing });
      if (!reply) throw new Error('empty reply');
      setMsgs(m => [...m, { who: 'agent', text: reply }]);
    } catch (e) {
      // graceful degrade: fall back to the local keyword matcher so the chat never dead-ends
      const fb = answerFor(query, knowledge, routing);
      setMsgs(m => [...m, { who: 'agent', ...fb, offline: true }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fade-in">
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18 }}>
        <AgentBadge size={46} />
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: 'clamp(22px,3vw,28px)' }}>Ask Riley</h1>
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden', maxWidth: 720, display: 'flex', flexDirection: 'column', height: 'min(70vh, 600px)' }}>
        <div ref={feedRef} style={{ flex: 1, overflowY: 'auto', padding: 'var(--pad)', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {msgs.map((m, i) => (
            <div key={i} style={{ display: 'flex', gap: 10, flexDirection: m.who === 'me' ? 'row-reverse' : 'row' }}>
              {m.who === 'agent' ? <AgentBadge size={30} /> : <PhotoAvatar emp={me} size={30} />}
              <div style={{ maxWidth: '80%' }}>
                <div style={{ padding: '10px 14px', borderRadius: 14, fontSize: 14, lineHeight: 1.5, background: m.who === 'agent' ? 'var(--accent-soft)' : 'var(--surface-2)', color: 'var(--ink)', borderTopLeftRadius: m.who === 'agent' ? 4 : 14, borderTopRightRadius: m.who === 'me' ? 4 : 14, whiteSpace: 'pre-wrap' }}>{m.text}</div>
                {m.route && <div style={{ fontSize: 11, color: 'var(--accent-strong)', fontWeight: 600, marginTop: 4, display: 'flex', alignItems: 'center', gap: 5 }}><Icon name="link" style={{ width: 12, height: 12 }} /> Routed to {m.route.to} · {m.route.via}</div>}
                {m.topic && <div style={{ fontSize: 11, color: 'oklch(0.45 0.12 155)', fontWeight: 600, marginTop: 4, display: 'flex', alignItems: 'center', gap: 5 }}><Icon name="check" style={{ width: 12, height: 12 }} /> {m.topic}</div>}
                {m.offline && <div style={{ fontSize: 10.5, color: 'var(--ink-3)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 5 }}><Icon name="bolt" style={{ width: 11, height: 11 }} /> Offline answer — Riley couldn’t reach the assistant just now</div>}
              </div>
            </div>
          ))}
          {busy && (
            <div style={{ display: 'flex', gap: 10 }}>
              <AgentBadge size={30} />
              <div style={{ padding: '13px 16px', borderRadius: 14, borderTopLeftRadius: 4, background: 'var(--accent-soft)', display: 'flex', gap: 5, alignItems: 'center' }}>
                <span className="riley-dot" /><span className="riley-dot" /><span className="riley-dot" />
              </div>
            </div>
          )}
        </div>
        {/* suggestions + input */}
        <div style={{ borderTop: '1px solid var(--line)', padding: 'var(--pad)' }}>
          <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 12 }}>
            {knowledge.slice(0, 4).map(k => (
              <button key={k.topic} disabled={busy} onClick={() => send(k.topic)} style={{ border: '1px solid var(--line)', background: 'var(--surface)', borderRadius: 'var(--r-pill)', padding: '5px 12px', fontSize: 12.5, color: 'var(--ink-2)', cursor: busy ? 'default' : 'pointer', fontWeight: 600, opacity: busy ? 0.5 : 1 }}>{k.topic}</button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input value={q} disabled={busy} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === 'Enter' && send()} placeholder={busy ? 'Riley is typing…' : 'Ask a question…'}
              style={{ flex: 1, padding: '11px 14px', borderRadius: 'var(--r-pill)', fontSize: 14, border: '1.5px solid var(--line)', background: 'var(--surface)', color: 'var(--ink)', outline: 'none', opacity: busy ? 0.7 : 1 }} />
            <button className="btn btn-primary" disabled={busy} onClick={() => send()} style={{ padding: '11px 16px', opacity: busy ? 0.6 : 1 }}><Icon name="arrowRight" /></button>
          </div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { AgentBadge, RileySettings, AskAgent, answerFor });
