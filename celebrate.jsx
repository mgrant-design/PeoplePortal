/* celebrate.jsx — birthday & work-anniversary login celebration + Sunshine Club helpers.
   Self-contained; exposes getCelebrations(), buildSunshinePost(), and <CelebrationOverlay>. */

function celebParse(s) {
  if (!s) return null; s = String(s).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) { const [y, mo, d] = s.slice(0, 10).split('-').map(Number); return { y, mo, d }; }
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (m) { let y = +m[3]; if (y < 100) y += 1900; return { y, mo: +m[1], d: +m[2] }; }
  return null;
}
function celebToday() { const n = new Date(); return { y: n.getFullYear(), mo: n.getMonth() + 1, d: n.getDate() }; }

/* returns [{type:'birthday'} | {type:'anniversary', years}] for a person, today */
function getCelebrations(emp) {
  if (!emp) return [];
  const t = celebToday(); const out = [];
  const b = celebParse(emp.birthdate);
  if (b && b.mo === t.mo && b.d === t.d) out.push({ type: 'birthday' });
  const s = celebParse(emp.startDate);
  if (s && s.mo === t.mo && s.d === t.d && s.y < t.y) out.push({ type: 'anniversary', years: t.y - s.y });
  return out;
}

/* compose the Google Chat Sunshine Club post for today's birthdays + anniversaries */
function buildSunshinePost(birthdays, anniversaries) {
  const lines = [];
  if (birthdays.length) {
    const names = birthdays.map(e => e.first);
    const list = names.length === 1 ? names[0] : names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1];
    lines.push(`🎂 Happy birthday to ${list}! Wishing you a wonderful day from your Pure Dental family. ☀️`);
  }
  if (anniversaries.length) {
    anniversaries.forEach(e => lines.push(`🎉 Congratulations ${e.first} on ${e._years} year${e._years === 1 ? '' : 's'} at Pure Dental — thank you for all you do! 💙`));
  }
  return lines.join('\n');
}

/* ---- confetti ---- */
function Confetti({ n = 56 }) {
  const colors = ['oklch(0.7 0.15 200)', 'oklch(0.65 0.16 250)', 'oklch(0.78 0.14 160)', 'oklch(0.82 0.15 90)', 'oklch(0.7 0.18 20)'];
  const pieces = useMemo(() => Array.from({ length: n }, (_, i) => ({
    left: Math.random() * 100, delay: Math.random() * 0.8, dur: 2.4 + Math.random() * 2,
    size: 7 + Math.random() * 8, color: colors[i % colors.length], rot: Math.random() * 360, round: Math.random() > 0.6,
  })), [n]);
  return (
    <div aria-hidden="true" style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
      {pieces.map((p, i) => (
        <span key={i} style={{
          position: 'absolute', top: '-6%', left: p.left + '%', width: p.size, height: p.round ? p.size : p.size * 0.5,
          background: p.color, borderRadius: p.round ? '50%' : 2, transform: `rotate(${p.rot}deg)`,
          animation: `celebFall ${p.dur}s ${p.delay}s linear infinite`,
        }} />
      ))}
    </div>
  );
}

/* ---- branded mascot: a happy tooth in a party hat ---- */
function ToothMascot() {
  return (
    <div style={{ animation: 'celebBounce 1.1s ease-in-out infinite', display: 'grid', placeItems: 'center', filter: 'drop-shadow(0 8px 16px oklch(0.5 0.1 230 / 0.25))' }}>
      <svg width="116" height="124" viewBox="0 0 116 124" fill="none">
        {/* party hat */}
        <path d="M58 4 L78 40 H38 Z" fill="var(--accent-strong)" />
        <path d="M58 4 L68 22 L48 22 Z" fill="oklch(0.85 0.13 90)" />
        <circle cx="58" cy="6" r="5" fill="oklch(0.82 0.15 20)" />
        <circle cx="50" cy="33" r="2.5" fill="#fff" /><circle cx="66" cy="30" r="2.5" fill="#fff" /><circle cx="58" cy="38" r="2.5" fill="#fff" />
        {/* tooth body */}
        <path d="M58 40 C36 40 28 52 28 72 C28 96 36 116 44 116 C50 116 50 100 58 100 C66 100 66 116 72 116 C80 116 88 96 88 72 C88 52 80 40 58 40 Z" fill="#fff" stroke="var(--accent)" strokeWidth="3" />
        {/* face */}
        <circle cx="49" cy="68" r="3.6" fill="var(--ink)" /><circle cx="67" cy="68" r="3.6" fill="var(--ink)" />
        <path d="M48 80 Q58 90 68 80" stroke="var(--ink)" strokeWidth="3" strokeLinecap="round" fill="none" />
        <circle cx="42" cy="76" r="3.5" fill="oklch(0.82 0.1 20 / 0.6)" /><circle cx="74" cy="76" r="3.5" fill="oklch(0.82 0.1 20 / 0.6)" />
      </svg>
    </div>
  );
}

function CelebrationOverlay({ emp, celebrations, onClose }) {
  const hasBday = celebrations.some(c => c.type === 'birthday');
  const anniv = celebrations.find(c => c.type === 'anniversary');
  const title = hasBday ? `Happy Birthday, ${emp.first}! 🎂` : `Happy Anniversary, ${emp.first}! 🎉`;
  const sub = hasBday && anniv
    ? `It’s your birthday — and ${anniv.years} year${anniv.years === 1 ? '' : 's'} with Pure Dental today. What a day!`
    : hasBday
      ? `Wishing you a wonderful day from your whole Pure Dental family. ☀️`
      : `${anniv.years} year${anniv.years === 1 ? '' : 's'} at Pure Dental today — thank you for everything you bring to the team. 💙`;

  return (
    <div className="fade-in" onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 80, display: 'grid', placeItems: 'center', background: 'oklch(0.2 0.04 240 / 0.5)', backdropFilter: 'blur(4px)', padding: 20 }}>
      <Confetti />
      <div onClick={e => e.stopPropagation()} style={{ position: 'relative', maxWidth: 440, width: '100%', background: 'var(--surface)', borderRadius: 'var(--r-lg, 20px)', boxShadow: 'var(--shadow-lg)', padding: 'clamp(24px,4vw,38px)', textAlign: 'center', animation: 'celebPop .4s cubic-bezier(.2,1.2,.3,1)' }}>
        <button onClick={onClose} aria-label="Close" style={{ position: 'absolute', top: 14, right: 14, border: 'none', background: 'var(--surface-2)', color: 'var(--ink-3)', width: 30, height: 30, borderRadius: '50%', cursor: 'pointer', display: 'grid', placeItems: 'center', fontSize: 16 }}>×</button>
        <div style={{ marginBottom: 6 }}><ToothMascot /></div>
        <div className="eyebrow" style={{ marginBottom: 6 }}>{hasBday ? 'A little birthday cheer' : 'Celebrating you'}</div>
        <h1 style={{ fontSize: 'clamp(22px,3.4vw,28px)', lineHeight: 1.15 }}>{title}</h1>
        <p style={{ color: 'var(--ink-2)', fontSize: 15, marginTop: 12, lineHeight: 1.5 }}>{sub}</p>
        <button className="btn btn-primary btn-lg" style={{ marginTop: 22 }} onClick={onClose}>Thank you! 🎈</button>
        <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <Icon name="users" style={{ width: 13, height: 13 }} /> Shared with the Sunshine Club ☀️
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { getCelebrations, buildSunshinePost, CelebrationOverlay });
