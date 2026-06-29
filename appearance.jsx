/* appearance.jsx — per-employee look & feel, opened by the SECRET double-click on the
   top-bar tooth. Accent color, monochrome tint, light/dark, density, corners.
   Persists per employee in localStorage now; the /api/settings (userSettings, Cosmos)
   wiring swaps in later for cross-device. applyAppearance() is also called on sign-in. */

const APPEARANCE_DEFAULTS = { accentHue: 245, accentL: 0.56, accentSat: 1, tint: 'subtle', density: 'regular', dark: false, corners: 'rounded', font: 'modern', contrast: 'normal', textsize: 'm', motion: 'normal' };

const ACCENTS = [
  ['Red', 18, 1, 0.56], ['Orange', 60, 1.15, 0.66], ['Yellow', 92, 1.0, 0.82], ['Green', 152, 1.0, 0.56],
  ['Teal', 190, 0.82, 0.6], ['Blue', 264, 1.1, 0.54], ['Indigo', 278, 1.45, 0.54], ['Pink', 348, 1, 0.58],
];

/* Font pairings [id, display, body, label] — previewed in their own type. */
const FONTS = [
  ['modern', 'IBM Plex Sans', 'IBM Plex Sans', 'Clean'],
  ['editorial', 'Abril Fatface', 'Lora', 'Editorial'],
  ['sweet', 'Great Vibes', 'Jost', 'Sweet'],
  ['terminal', 'Handjet', 'IBM Plex Mono', 'Terminal'],
  ['bold', 'Anton', 'Manrope', 'Bold'],
  ['noir', 'Cinzel Decorative', 'Spectral', 'Noir'],
];

function loadAppearance(empId) {
  try { const s = localStorage.getItem('pd_appearance_' + empId); if (s) return { ...APPEARANCE_DEFAULTS, ...JSON.parse(s) }; } catch (e) {}
  return { ...APPEARANCE_DEFAULTS };
}
function saveAppearance(empId, p) { try { localStorage.setItem('pd_appearance_' + empId, JSON.stringify(p)); } catch (e) {} }

/* Cosmos sync (api/settings → userSettings). localStorage stays as an instant cache. */
async function fetchSettings() {
  const token = (typeof window !== 'undefined' && window.PD_GOOGLE_TOKEN) || '';
  const res = await fetch('/api/settings', { headers: { 'X-Google-Token': token } });
  if (!res.ok) throw new Error('settings read failed (' + res.status + ')');
  const data = await res.json();
  return data.settings || null;
}
function pushSettings(prefs) {
  const token = (typeof window !== 'undefined' && window.PD_GOOGLE_TOKEN) || '';
  return fetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Google-Token': token }, body: JSON.stringify(prefs) });
}
// Apply the cached prefs instantly, then hydrate from Cosmos and re-apply if present.
function hydrateAppearance(empId) {
  applyAppearance(loadAppearance(empId));
  if (typeof fetch !== 'function') return;
  fetchSettings().then(s => { if (s) { const merged = { ...APPEARANCE_DEFAULTS, ...s }; saveAppearance(empId, merged); applyAppearance(merged); } }).catch(() => {});
}

function applyAppearance(p) {
  const r = document.documentElement;
  const a = { ...APPEARANCE_DEFAULTS, ...(p || {}) };
  const heavy = a.tint === 'unprofessional';
  const washed = a.tint === 'tinted' || heavy;
  r.style.setProperty('--accent-hue', a.accentHue);
  const aS = a.accentSat || 1;
  const acc = (typeof ACCENTS !== 'undefined') ? ACCENTS.find(c => c[1] === a.accentHue) : null;
  const cmul = (acc && acc[2]) || 1;
  r.style.setProperty('--accent-l', (acc && acc[3]) || 0.56);
  r.style.setProperty('--accent-chroma', Math.max(0.1, 0.13 * cmul * aS).toFixed(3));
  r.style.setProperty('--neutral-hue', washed ? a.accentHue : 240);
  const levelMult = heavy ? (a.dark ? 9 : 14) : (a.tint === 'tinted' ? (a.dark ? 5 : 6.5) : 1);
  r.style.setProperty('--tint-mult', washed ? (levelMult * aS * cmul) : 1);
  r.style.setProperty('--ink-tint', heavy ? (a.dark ? 0.035 : 0.05) : (a.tint === 'tinted' ? (a.dark ? 0.015 : 0.022) : 0));
  r.style.setProperty('--paper-l', 0);
  const f = (typeof FONTS !== 'undefined' ? FONTS.find(x => x[0] === a.font) : null) || ['modern', 'IBM Plex Sans', 'IBM Plex Sans'];
  r.style.setProperty('--font-display', `'${f[1]}', system-ui, sans-serif`);
  r.style.setProperty('--font-body', `'${f[2]}', system-ui, sans-serif`);
  r.setAttribute('data-font', a.font || 'modern');
  r.setAttribute('data-density', a.density);
  r.setAttribute('data-tint', a.tint);
  r.setAttribute('data-corners', a.corners);
  r.setAttribute('data-contrast', a.contrast || 'normal');
  r.setAttribute('data-textsize', a.textsize || 'm');
  r.setAttribute('data-motion', a.motion || 'normal');
  if (a.dark) r.setAttribute('data-theme', 'dark'); else r.removeAttribute('data-theme');
}

function AppSeg({ label, value, options, onChange }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--ink-3)', marginBottom: 6 }}>{label}</div>
      <div style={{ display: 'flex', gap: 3, background: 'var(--surface-2)', borderRadius: 'var(--r-md)', padding: 3 }}>
        {options.map(([val, lbl]) => (
          <button key={val} onClick={() => onChange(val)}
            style={{ flex: 1, border: 'none', cursor: 'pointer', borderRadius: 'calc(var(--r-md) - 3px)', padding: '7px 3px', fontSize: 11.5, fontWeight: 600, fontFamily: 'var(--font-body)', whiteSpace: 'nowrap',
              background: value === val ? 'var(--surface)' : 'transparent', color: value === val ? 'var(--ink)' : 'var(--ink-3)', boxShadow: value === val ? 'var(--shadow-sm)' : 'none' }}>{lbl}</button>
        ))}
      </div>
    </div>
  );
}

function AppearanceMenu({ me, onClose }) {
  const [p, setP] = useState(() => loadAppearance(me.id));
  const [advOpen, setAdvOpen] = useState(false);
  // Snarky nudge: fires after every 10 option-clicks in the panel OR every 5 color
  // changes. Once it shows it lingers for exactly one more click, then the cycle resets.
  const clicksRef = React.useRef(0);
  const colorRef = React.useRef((() => { try { return (+localStorage.getItem('pd_color_changes')) || 0; } catch (e) { return 0; } })());
  const [snarky, setSnarky] = useState(false);
  const bump = (isColor) => {
    if (snarky) { setSnarky(false); clicksRef.current = 0; colorRef.current = 0; try { localStorage.setItem('pd_color_changes', 0); } catch (e) {} return; }
    clicksRef.current += 1;
    if (isColor) { colorRef.current += 1; try { localStorage.setItem('pd_color_changes', colorRef.current); } catch (e) {} }
    if (clicksRef.current % 10 === 0 || (isColor && colorRef.current % 5 === 0)) setSnarky(true);
  };
  const set = (k, v) => { const next = { ...p, [k]: v }; setP(next); applyAppearance(next); saveAppearance(me.id, next); if (typeof pushSettings === 'function') pushSettings(next).catch(() => {}); bump(false); };
  const setMany = (obj) => { const next = { ...p, ...obj }; setP(next); applyAppearance(next); saveAppearance(me.id, next); if (typeof pushSettings === 'function') pushSettings(next).catch(() => {}); };
  const drag = React.useRef(null);
  const swatchDown = (hue, e) => {
    const startSat = p.accentHue === hue ? (p.accentSat || 1) : 1;
    drag.current = { hue, startY: e.clientY, startSat };
    setMany({ accentHue: hue, accentSat: startSat });
    bump(true);
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch (_) {}
  };
  const swatchMove = (e) => {
    const d = drag.current; if (!d) return;
    const S = Math.max(0.3, Math.min(2.7, d.startSat + (d.startY - e.clientY) * 0.006));
    setMany({ accentHue: d.hue, accentSat: +S.toFixed(3) });
  };
  const swatchUp = () => { drag.current = null; };

  useEffect(() => { const h = (e) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h); }, []);

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 90 }}>
      <div onClick={e => e.stopPropagation()} className="fade-in cust-menu"
        style={{ position: 'fixed', top: 64, left: 'clamp(12px, 2vw, 22px)', width: 'min(320px, 92vw)', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 16, boxShadow: '0 12px 30px rgba(0,0,0,0.16), 0 30px 70px rgba(0,0,0,0.2)', padding: 16, maxHeight: 'calc(100vh - 80px)', overflowY: 'auto', scrollbarWidth: 'none' }}>
        <div style={{ position: 'relative', marginBottom: 14 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 19, lineHeight: 1.25, textAlign: 'center', padding: '0 22px' }}>{snarky ? 'Indecisive, huh?' : 'Customization'}</div>
          <button onClick={onClose} style={{ position: 'absolute', top: -3, right: -3, border: 'none', background: 'none', cursor: 'pointer', color: 'var(--ink-3)', padding: 4 }}><Icon name="x" style={{ width: 16, height: 16 }} /></button>
        </div>

        <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--ink-3)', marginBottom: 7 }}>Accent</div>
        <div style={{ display: 'flex', gap: 6, marginBottom: 14, justifyContent: 'space-between' }}>
          {ACCENTS.map(([name, hue, cmul, lOv]) => (
            <button key={hue} title={`${name} — drag up/down for saturation, double-click to reset`}
              onPointerDown={(e) => swatchDown(hue, e)} onPointerMove={swatchMove} onPointerUp={swatchUp}
              onDoubleClick={() => setMany({ accentHue: hue, accentSat: 1 })}
              style={{ width: 28, height: 28, borderRadius: '50%', cursor: 'ns-resize', touchAction: 'none', background: `oklch(${lOv || 0.56} ${Math.max(0.1, 0.15 * (cmul || 1) * (p.accentHue === hue ? (p.accentSat || 1) : 1)).toFixed(3)} ${hue})`,
                border: p.accentHue === hue ? '2px solid var(--ink)' : '2px solid transparent', outline: p.accentHue === hue ? '2px solid var(--surface)' : 'none', outlineOffset: -4 }} />
          ))}
        </div>

        <AppSeg label="Tint" value={p.tint} options={[['subtle', 'Subtle'], ['tinted', 'Tinted'], ['unprofessional', 'Unprofessional']]} onChange={v => set('tint', v)} />
        <AppSeg label="Theme" value={p.dark ? 'dark' : 'light'} options={[['light', 'Light'], ['dark', 'Dark']]} onChange={v => set('dark', v === 'dark')} />
        <AppSeg label="Text size" value={p.textsize} options={[['s', 'Small'], ['m', 'Medium'], ['l', 'Large']]} onChange={v => set('textsize', v)} />

        <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--ink-3)', marginBottom: 7 }}>Font</div>
        <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
          {FONTS.map(([id, disp, body, label]) => (
            <button key={id} onClick={() => set('font', id)}
              style={{ flex: '1 1 28%', cursor: 'pointer', borderRadius: 'var(--r-md)', padding: '8px 4px', textAlign: 'center',
                border: p.font === id ? '2px solid var(--accent)' : '1px solid var(--line)', background: p.font === id ? 'var(--accent-softer)' : 'var(--surface)' }}>
              <div style={{ fontFamily: `'${disp}', sans-serif`, fontSize: 18, fontWeight: 700, lineHeight: 1.15, color: 'var(--ink)' }}>Aa</div>
              <div style={{ fontFamily: `'${body}', sans-serif`, fontSize: 9, color: 'var(--ink-3)', marginTop: 3 }}>{label}</div>
            </button>
          ))}
        </div>

        <button onClick={() => setAdvOpen(o => !o)} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', border: 'none', background: 'var(--surface-2)', color: 'var(--ink-2)', cursor: 'pointer', borderRadius: 10, padding: '9px 12px', fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 14, fontFamily: 'var(--font-body)' }}>
          Advanced options <span style={{ transition: 'transform .16s', transform: advOpen ? 'rotate(180deg)' : 'none', display: 'inline-flex' }}><Icon name="chevron" style={{ width: 14, height: 14 }} /></span>
        </button>
        {advOpen && <div className="fade-in">
          <AppSeg label="Density" value={p.density} options={[['regular', 'Comfortable'], ['compact', 'Compact']]} onChange={v => set('density', v)} />
          <AppSeg label="Corners" value={p.corners} options={[['rounded', 'Rounded'], ['sharp', 'Sharp'], ['cut', 'Cut']]} onChange={v => set('corners', v)} />
          <AppSeg label="Contrast" value={p.contrast} options={[['normal', 'Normal'], ['high', 'High']]} onChange={v => set('contrast', v)} />
          <AppSeg label="Motion" value={p.motion} options={[['calm', 'Calm'], ['normal', 'Normal'], ['bouncy', 'Bouncy']]} onChange={v => set('motion', v)} />
        </div>}

        <div style={{ fontSize: 11, color: 'var(--ink-3)', textAlign: 'center', marginTop: 4 }}>Saved just for you</div>
      </div>
    </div>
  );
}

Object.assign(window, { APPEARANCE_DEFAULTS, loadAppearance, saveAppearance, applyAppearance, AppearanceMenu, fetchSettings, pushSettings, hydrateAppearance });
