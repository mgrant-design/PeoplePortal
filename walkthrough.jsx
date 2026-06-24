/* walkthrough.jsx — AI-presenter navigation walkthrough ("video") + dismissible
   interactive guided tour. */

const WT_SCENES = [
  { icon: 'sparkle', title: 'Welcome to the People Portal', cap: 'Hi there — I’m Riley. Welcome to Pure Dental.', say: '[Warm and welcoming] Hi there... I’m Riley. Welcome to Pure Dental. Let me show you around. It’ll only take a minute.' },
  { icon: 'grid', title: 'Your dashboard', cap: 'Your home base — it adapts to your role.', say: '[Clear and instructional] This is your dashboard. Think of it as your home base. It changes based on your role... so you only see what matters to YOU.' },
  { icon: 'users', title: 'Directory', cap: 'Find any coworker’s photo, role, and contact.', say: '[Friendly] Need to find a coworker? Open the Directory. You’ll see their photo, their role, and how to reach them. Managers can open full records, too.' },
  { icon: 'bolt', title: 'Onboarding & the agent', cap: 'New hires get set up automatically.', say: '[Encouraging] Here’s my favorite part. When a new hire joins, I reach out by email, text, and phone. I gather their details... check their credentials... and set up their accounts. All on my own.' },
  { icon: 'calendar', title: 'Scheduling & time clock', cap: 'Drag to build shifts; clock in by location.', say: '[Clear and instructional] Building the schedule is easy. Just drag a shift onto a slot. Your team clocks in right from their phone... by location. And the hours add up on their own.' },
  { icon: 'star', title: 'Reviews & reports', cap: 'Run reviews and drag-to-build reports.', say: '[Warm] Review season? No stress. You can run reviews in just a few clicks. And to build a report... simply drag in the data you care about.' },
  { icon: 'shirt', title: 'Scrub orders', cap: 'Order scrubs — the company covers your allowance.', say: '[Friendly] Clinical team? Order your scrubs right here. Pick your pieces, your fit, and your logo. We cover your allowance automatically... and anything extra is a simple payroll deduction. Your manager approves, and we handle the rest with the vendor.' },
  { icon: 'help', title: 'Always here to help', cap: 'Tap the help icon any time, or just ask me.', say: '[Encouraging] Stuck on anything? Tap the help icon on any page. Or just ask me. That’s it... you’re ready to go. Welcome aboard!' },
];

function AIWalkthrough() {
  const [playing, setPlaying] = useState(false);
  const [i, setI] = useState(0);
  const [started, setStarted] = useState(false);
  const [muted, setMuted] = useState(() => window.__rileyVoice === false);
  const voiceOn = !muted && window.__rileyVoice !== false;
  useEffect(() => {
    if (!playing) { if (typeof stopSpeak === 'function') stopSpeak(); return; }
    let advanced = false;
    const adv = () => { if (advanced) return; advanced = true; if (i < WT_SCENES.length - 1) setI(i + 1); else { setPlaying(false); if (typeof stopSpeak === 'function') stopSpeak(); } };
    let fb;
    if (voiceOn && typeof speak === 'function') { speak(WT_SCENES[i].say, { onend: adv }); fb = setTimeout(adv, 18000); }
    else { const words = WT_SCENES[i].say.replace(/\[[^\]]*\]/g, '').split(/\s+/).length; fb = setTimeout(adv, Math.max(3800, words * 360)); }
    return () => clearTimeout(fb);
  }, [playing, i]);
  useEffect(() => () => { if (typeof stopSpeak === 'function') stopSpeak(); }, []);
  const sc = WT_SCENES[i];
  const start = () => { setStarted(true); setPlaying(true); if (i >= WT_SCENES.length - 1) setI(0); };

  return (
    <div style={{ position: 'relative', aspectRatio: '16/9', borderRadius: 'var(--r-lg)', overflow: 'hidden', background: 'linear-gradient(150deg, var(--accent-strong), oklch(0.45 0.1 255))' }}>
      <div style={{ position: 'absolute', inset: 0, background: 'repeating-linear-gradient(135deg, transparent, transparent 18px, oklch(1 0 0 / 0.04) 18px, oklch(1 0 0 / 0.04) 36px)' }} />
      {!started ? (
        <button onClick={start} style={{ position: 'absolute', inset: 0, border: 'none', background: 'none', cursor: 'pointer', display: 'grid', placeItems: 'center' }}>
          <div style={{ width: 60, height: 60, borderRadius: '50%', background: 'oklch(1 0 0 / 0.95)', display: 'grid', placeItems: 'center', boxShadow: 'var(--shadow-lg)' }}>
            <div style={{ width: 0, height: 0, borderLeft: '18px solid var(--accent-strong)', borderTop: '11px solid transparent', borderBottom: '11px solid transparent', marginLeft: 5 }} />
          </div>
          <div style={{ position: 'absolute', left: 16, bottom: 14, color: '#fff', textAlign: 'left' }}>
            <div className="eyebrow" style={{ color: 'oklch(0.9 0.05 200)' }}>AI Walkthrough</div>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 18 }}>Meet Riley — your portal guide</div>
            <div className="mono" style={{ fontSize: 11.5, opacity: 0.85, marginTop: 2 }}>~90s · narrated by Riley · 🔊 sound on</div>
          </div>
        </button>
      ) : (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: 16, color: '#fff' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div className="wt-avatar" style={{ width: 38, height: 38, borderRadius: '50%', flex: 'none', display: 'grid', placeItems: 'center', background: 'oklch(1 0 0 / 0.18)', border: '1.5px solid oklch(1 0 0 / 0.4)' }}>
              <Icon name="sparkle" style={{ width: 19, height: 19 }} />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 13.5 }}>Riley</div>
              <div style={{ display: 'flex', gap: 3, alignItems: 'center', height: 10 }}>
                {playing ? [0, 1, 2, 3].map(b => <span key={b} className="wt-bar" style={{ width: 3, background: 'oklch(1 0 0 / 0.8)', borderRadius: 2, animationDelay: b * 0.15 + 's' }} />) : <span style={{ fontSize: 10.5, opacity: 0.7 }} className="mono">paused</span>}
              </div>
            </div>
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
              <button onClick={() => { setMuted(m => { const nm = !m; if (nm && typeof stopSpeak === 'function') stopSpeak(); else if (!nm && playing && typeof speak === 'function') speak(sc.say); return nm; }); }} title={muted ? 'Unmute Riley' : 'Mute Riley'}
                style={{ border: 'none', background: 'oklch(1 0 0 / 0.18)', color: '#fff', borderRadius: 99, width: 34, height: 34, display: 'grid', placeItems: 'center', cursor: 'pointer', flex: 'none', fontSize: 15 }}>{muted ? '🔇' : '🔊'}</button>
              <div style={{ display: 'grid', placeItems: 'center', width: 52, height: 52, borderRadius: 14, background: 'oklch(1 0 0 / 0.14)' }}>
                <Icon name={sc.icon} style={{ width: 26, height: 26 }} />
              </div>
            </div>
          </div>
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 'clamp(16px,3.5vw,20px)', marginBottom: 4 }}>{sc.title}</div>
            <p style={{ fontSize: 13, lineHeight: 1.45, opacity: 0.95, minHeight: 38 }}>{sc.cap}</p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
              <button onClick={() => setPlaying(p => !p)} style={{ border: 'none', background: 'oklch(1 0 0 / 0.2)', color: '#fff', borderRadius: 99, width: 30, height: 30, display: 'grid', placeItems: 'center', cursor: 'pointer', flex: 'none' }}>
                {playing ? <span style={{ display: 'flex', gap: 3 }}><span style={{ width: 3, height: 11, background: '#fff' }} /><span style={{ width: 3, height: 11, background: '#fff' }} /></span> : <div style={{ width: 0, height: 0, borderLeft: '9px solid #fff', borderTop: '6px solid transparent', borderBottom: '6px solid transparent', marginLeft: 2 }} />}
              </button>
              <div style={{ flex: 1, display: 'flex', gap: 4 }}>
                {WT_SCENES.map((_, k) => <div key={k} onClick={() => { setI(k); }} style={{ flex: 1, height: 4, borderRadius: 2, cursor: 'pointer', background: k <= i ? '#fff' : 'oklch(1 0 0 / 0.3)' }} />)}
              </div>
              <span className="mono" style={{ fontSize: 11, opacity: 0.8 }}>{i + 1}/{WT_SCENES.length}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- Interactive guided tour ---------- */
function GuidedTour({ steps, onNavigate, onClose }) {
  const [i, setI] = useState(0);
  const s = steps[i];
  useEffect(() => { if (s && s.view) onNavigate(s.view); }, [i]);
  useEffect(() => { const h = (e) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h); }, []);
  if (!s) return null;
  const last = i === steps.length - 1;

  return (
    <div style={{ position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 95, display: 'flex', justifyContent: 'center', padding: 'clamp(12px,3vw,24px)', pointerEvents: 'none' }}>
      <div className="fade-in" style={{ pointerEvents: 'auto', width: 'min(520px, 96vw)', background: 'var(--surface)', borderRadius: 'var(--r-lg)', boxShadow: 'var(--shadow-lg)', border: '1px solid var(--line)', padding: 'var(--pad)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 13 }}>
          <div style={{ width: 40, height: 40, borderRadius: '50%', flex: 'none', display: 'grid', placeItems: 'center', background: 'linear-gradient(150deg, var(--accent), var(--accent-strong))', color: '#fff' }}><Icon name={s.icon || 'sparkle'} style={{ width: 20, height: 20 }} /></div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span className="eyebrow">Step {i + 1} of {steps.length}</span></div>
            <h3 style={{ fontSize: 17, marginTop: 4 }}>{s.title}</h3>
            <p style={{ fontSize: 13.5, color: 'var(--ink-2)', marginTop: 5, lineHeight: 1.5 }}>{s.body}</p>
          </div>
          <button className="btn btn-quiet" style={{ padding: 7 }} onClick={onClose}><Icon name="x" /></button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 16 }}>
          <div style={{ flex: 1, display: 'flex', gap: 4 }}>
            {steps.map((_, k) => <div key={k} style={{ width: k === i ? 22 : 6, height: 6, borderRadius: 99, background: k <= i ? 'var(--accent)' : 'var(--line)', transition: 'all .2s' }} />)}
          </div>
          <button className="btn btn-quiet" onClick={onClose} style={{ fontSize: 13 }}>Skip</button>
          {i > 0 && <button className="btn btn-ghost" onClick={() => setI(i - 1)}>Back</button>}
          <button className="btn btn-primary" onClick={() => last ? onClose() : setI(i + 1)}>{last ? 'Finish' : 'Next'} {!last && <Icon name="arrowRight" />}</button>
        </div>
      </div>
    </div>
  );
}

const TOUR_STEPS_ALL = [
  { view: 'dashboard', icon: 'grid', title: 'Your dashboard', body: 'This is home. It adapts to your role — quick actions for staff, team stats and shortcuts for managers and leadership.' },
  { view: 'people', icon: 'users', title: 'Directory', body: 'Search any colleague and see their role and work contact. Managers & HR can open full records from here.' },
  { view: 'ask', icon: 'sparkle', title: 'Ask Riley', body: 'Your AI assistant. Ask about pay, benefits, logins or time off and get instant answers — or it routes you to the right person.' },
  { view: 'timeclock', icon: 'clock', title: 'Time clock', body: 'Clock in and out by location, take breaks, and view your timesheet. It’s matched to your scheduled shift.' },
  { view: 'scheduler', icon: 'calendar', title: 'Scheduling', body: 'Managers build the week with drag-and-drop, smart-fill by skill, and publish — staff see their shifts here.' },
  { view: 'reviews', icon: 'star', title: 'Performance reviews', body: 'Complete your self-review and see your manager’s feedback once it’s shared.' },
  { view: 'reports', icon: 'list', title: 'Reports', body: 'Build reports by dragging data elements, and track scheduled vs. worked hours and overtime.' },
  { view: 'scrubs', icon: 'shirt', title: 'Scrub orders', body: 'Clinical staff order scrubs here — the company covers your allowance, and anything over is an easy payroll deduction. Managers approve, batch to the vendor (CID Resources), and track delivery.' },
  { view: 'me', icon: 'users', title: 'Your profile', body: 'Add a photo and review your details anytime. You can reopen this tour from the Help menu.' },
];

Object.assign(window, { AIWalkthrough, GuidedTour, TOUR_STEPS_ALL });
