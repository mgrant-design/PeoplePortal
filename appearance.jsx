/* appearance.jsx — per-employee look & feel, opened by the SECRET double-click on the
   top-bar tooth. Accent color, monochrome tint, light/dark, density, corners.
   Persists per employee to Cosmos via /api/settings (userSettings), with localStorage
   as an instant cache; hydrateAppearance() re-applies from Cosmos on sign-in for
   cross-device. applyAppearance() is also called on sign-in. */

const APPEARANCE_DEFAULTS = { accentHue: 245, accentL: 0.56, accentSat: 1, tint: 'subtle', density: 'regular', dark: false, corners: 'rounded', font: 'modern', contrast: 'normal', textsize: 'm', motion: 'normal', navMode: 'all' };

const ACCENTS = [
  ['Red', 25, 1.0, 0.56, 0.22], ['Orange', 70, 1.0, 0.68, 0.195], ['Yellow', 105, 1.0, 0.85, 0.18], ['Green', 145, 1.0, 0.56, 0.22],
  ['Teal', 195, 0.9, 0.62, 0.145], ['Blue', 255, 1.0, 0.54, 0.22], ['Indigo', 287, 1.1, 0.52, 0.235], ['Pink', 6, 0.85, 0.72, 0.16],
  ['Mono', -1, 0, 0.22, 'mono'],
];

/* Font pairings [id, display, body, label] — previewed in their own type. */
const FONTS = [
  ['modern', 'IBM Plex Sans', 'IBM Plex Sans', 'Clean'],
  ['editorial', 'Abril Fatface', 'Lora', 'Editorial'],
  ['sweet', 'Rochester', 'Oregano', 'Sweet'],
  ['terminal', 'Sixtyfour', 'Kode Mono', 'Terminal'],
  ['bold', 'Sekuya', 'Manrope', 'Bold'],
  ['noir', 'Manufacturing Consent', 'Jim Nightshade', 'Noir'],
];

/* ---- gamut-true color helper (keeps the Unprofessional wash monochromatic) ----
   The wash asks for far more chroma than sRGB can show at these lightnesses, so the browser
   gamut-maps it and can shift the HUE — a blue wash lands on teal, a dark-orange wash lands
   on red. That's what breaks the "everything is one color" cohesion. maxChroma() finds the
   most chroma a given lightness+hue can actually hold, so we can request the richest colour
   that is still TRUE to the hue (no stray teal/red). ~20 cubes per call — cheap. */
function oklchToRgb(L, C, Hdeg) {
  const h = Hdeg * Math.PI / 180, a = C * Math.cos(h), b = C * Math.sin(h);
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.2914855480 * b;
  const l = l_ * l_ * l_, m = m_ * m_ * m_, s = s_ * s_ * s_;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
  ];
}
function inGamut(L, C, H) { const e = 0.001; return oklchToRgb(L, C, H).every(v => v >= -e && v <= 1 + e); }
function maxChroma(L, H) { let lo = 0, hi = 0.4; for (let i = 0; i < 20; i++) { const mid = (lo + hi) / 2; if (inGamut(L, mid, H)) lo = mid; else hi = mid; } return lo; }
/* oklch() string at the requested chroma, but never past what stays true to the hue. */
function trueOk(L, H, reqC) { return `oklch(${L} ${Math.min(reqC, maxChroma(L, H)).toFixed(3)} ${H})`; }
/* The lightness that can hold `targetC` chroma for this hue — searched from hiL toward loL
   (light: pick the LIGHTEST such L; dark: pass preferDark to pick the DARKEST). This is how we
   homogenise saturation across hues: each hue sits at whatever lightness lets it reach the SAME
   chroma, so a narrow-gamut hue (blue, teal) ends up as colour-drenched as a wide one (green). */
function lForC(H, targetC, hiL, loL, preferDark) {
  if (preferDark) { for (let L = loL; L <= hiL; L += 0.01) if (maxChroma(L, H) >= targetC) return +L.toFixed(3); return hiL; }
  for (let L = hiL; L >= loL; L -= 0.01) if (maxChroma(L, H) >= targetC) return +L.toFixed(3);
  return loL;
}

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
  // The full-screen neutral wash is Unprofessional's alone now. Tinted no longer washes
  // the page/text — it expresses itself via card + linework accents in styles.css.
  const washed = heavy;
  // In Unprofessional ONLY, nudge a few hues (warmer orange, forest green, cooler indigo)
  // without touching the global accent identity that Subtle/Tinted use. Keyed by swatch hue.
  const WASH_HUE = { 70: 52, 145: 138, 287: 298 };
  const washHue = (washed && !a.dark && WASH_HUE[a.accentHue] != null) ? WASH_HUE[a.accentHue] : a.accentHue;
  r.style.setProperty('--accent-hue', washHue);
  const aS = a.accentSat || 1;
  const acc = (typeof ACCENTS !== 'undefined') ? ACCENTS.find(c => c[1] === a.accentHue) : null;
  const mono = !!(acc && acc[4] === 'mono');
  const cmul = (acc && acc[2]) || 1;
  const maxC = (acc && typeof acc[4] === 'number') ? acc[4] : 0.2;   // per-color in-gamut chroma ceiling
  // Mono accent is achromatic; colored accents saturate up to maxC (no clipping/hue-shift) and desaturate toward gray.
  let accL = (acc && acc[3]) || 0.56;
  if (mono) accL = (a.accentL >= 0.1 && a.accentL <= 0.99 && a.accentL !== 0.56) ? a.accentL : 0.22;
  r.style.setProperty('--accent-l', accL);
  if (mono) {
    r.style.setProperty('--accent-chroma', '0');
    r.style.setProperty('--accent-soft', a.dark ? 'oklch(0.30 0 0)' : 'oklch(0.93 0 0)');
    r.style.setProperty('--accent-softer', a.dark ? 'oklch(0.26 0 0)' : 'oklch(0.965 0 0)');
  } else {
    r.style.setProperty('--accent-chroma', Math.min(maxC, Math.max(0.075, 0.13 * cmul * aS)).toFixed(3));
    r.style.removeProperty('--accent-soft');
    r.style.removeProperty('--accent-softer');
  }
  // Readable foreground + an edge for light accent fills (Chalk, Yellow): dark text, faint border.
  r.style.setProperty('--on-accent', accL > 0.7 ? 'oklch(0.24 0 0)' : '#fff');
  // Raw saturation (0.4–2.6) exposed for tinted-light: --accent-chroma clamps at each
  // hue's in-gamut ceiling, so it stops responding at high slider values. Tinted's cards
  // multiply by this instead, so dragging up keeps adding tint past the chroma clamp.
  r.style.setProperty('--accent-sat', (a.accentSat || 1).toFixed(3));
  r.style.setProperty('--accent-edge', accL > 0.82 ? 'var(--line)' : 'transparent');
  // When a light/near-white accent is used in light mode, switch to outline contrast mode.
  r.setAttribute('data-accent-tone', (!a.dark && accL >= 0.88) ? 'light' : 'normal');
  r.setAttribute('data-accent', acc ? String(acc[0]).toLowerCase() : 'custom');
  r.style.setProperty('--neutral-hue', (washed && !mono) ? washHue : 240);
  const levelMult = heavy ? (a.dark ? 9 : 14) : 1;
  r.style.setProperty('--tint-mult', (washed && !mono) ? (levelMult * aS * cmul) : 1);
  r.style.setProperty('--ink-tint', mono ? 0 : (heavy ? (a.dark ? 0.035 : 0.05) : 0));
  // Unprofessional wash, kept MONOCHROMATIC: we honor the designed lightnesses + chroma
  // budget, but clamp every surface to the richest colour that is still TRUE to the hue,
  // so nothing strays into a neighbour (blue→teal, dark-orange→red). Same rule in light &
  // dark, every accent incl. pink — that's what makes the whole UI read as one colour.
  if (washed && !mono) {
    const H = washHue;
    const D = a.dark;
    if (D) {
      // DARK theme, Unprofessional: the tuned dark wash. Designed dark lightnesses, chroma
      // clamped so it stays TRUE to the hue. Most intense tint in dark.
      const tm = levelMult * aS * cmul;
      // Warm hues (orange/yellow) can't hold colour at deep-dark lightness — they collapse to
      // brown/red ("orange looks like the red swatch"). Lift ONLY those so orange reads as amber;
      // every other hue — including teal — stays exactly as designed (deep & untouched).
      const warmLift = (H >= 45 && H <= 115) ? 0.17 : 0;
      const S = (name, L, reqC) => r.style.setProperty(name, trueOk(L + warmLift, H, reqC));
      S('--bg',        0.185, 0.006 * tm);
      S('--surface',   0.235, 0.006 * tm);
      S('--surface-2', 0.275, 0.008 * tm);
      S('--line',      0.340, Math.min(0.05, 0.012 * tm));
      S('--line-soft', 0.300, Math.min(0.04, 0.010 * tm));
      S('--accent-soft',   0.360, 0.07);
      S('--accent-softer', 0.290, 0.05);
      // nav labels: a soft, LESS-saturated tint of the base hue (in-theme contrast, like the
      // rest of the wash) — NOT the max-chroma neon that made green read as lime.
      r.style.setProperty('--accent-c-text', Math.min(maxChroma(0.84, H), 0.05).toFixed(3));
      r.style.removeProperty('--ink-2'); r.style.removeProperty('--ink-3');
    } else {
      // LIGHT theme, Unprofessional — the MOST intense tint. Wide-gamut hues (orange/yellow/
      // green/teal) get their natural light+saturated wash and are LEFT ALONE. Only the hues that
      // wash out to near-white at these light lightnesses (red/blue/indigo/pink — they hold
      // <0.09 chroma up here) get rescued: ride a little darker until the colour reaches a
      // proper saturation, matching the good ones — never dark enough to read as "dark mode".
      const p = Math.min(1, Math.max(0, (aS - 0.4) / 2.2));
      const weak = maxChroma(0.85, H) < 0.09;
      const T = (name, l0, l1, fillTop, weakTarget) => {
        let L = l0 + (l1 - l0) * p;
        let C = maxChroma(L, H) * (0.12 + (fillTop - 0.12) * p);
        if (weak) {
          const target = weakTarget * p;
          if (C < target) { L = lForC(H, target, L, l1 - 0.18, false); C = Math.min(target, maxChroma(L, H)); }
        }
        r.style.setProperty(name, `oklch(${L.toFixed(3)} ${C.toFixed(3)} ${H})`);
      };
      //        name             l0     l1    fill  weak-hue rescue target
      T('--bg',        0.970, 0.660, 0.97, 0.150);   // page
      T('--surface',   0.980, 0.850, 0.90, 0.110);   // cards
      T('--surface-2', 0.965, 0.730, 0.95, 0.120);   // topbar / chips
      T('--line',      0.880, 0.560, 1.00, 0.150);
      T('--line-soft', 0.920, 0.680, 0.85, 0.110);
      T('--accent-soft',   0.900, 0.780, 0.95, 0.130);
      T('--accent-softer', 0.940, 0.860, 0.80, 0.090);
      r.style.setProperty('--accent-c-text', maxChroma(0.46, H).toFixed(3));
      // Secondary GREY text deepens in-theme as the wash darkens, so meta/label text keeps its
      // contrast on the colour-drenched cards & bar instead of washing out — a deeper tint of
      // the base hue, never a fresh grey.
      r.style.setProperty('--ink-2', `oklch(${(0.46 - 0.10 * p).toFixed(3)} 0.045 ${H})`);
      r.style.setProperty('--ink-3', `oklch(${(0.60 - 0.16 * p).toFixed(3)} 0.040 ${H})`);
    }
  } else {
    ['--bg', '--surface', '--surface-2', '--line', '--line-soft', '--accent-c-text', '--ink-2', '--ink-3'].forEach(t => r.style.removeProperty(t));
  }
  let paperL = 0;
  if (mono && a.tint === 'tinted') paperL = a.dark ? 0.02 : 0.035;
  else if (mono && a.tint === 'unprofessional') paperL = a.dark ? 0.045 : 0.07;
  r.style.setProperty('--paper-l', paperL);
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

function AppearanceMenu({ me, onClose, onNav }) {
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
  const swatchDown = (hue, e, mono) => {
    if (mono) {
      const baseL = 0.22;
      const startL = (p.accentHue === hue && p.accentL >= 0.1 && p.accentL <= 0.99 && p.accentL !== 0.56) ? p.accentL : baseL;
      drag.current = { hue, mono: true, startY: e.clientY, startL };
      setMany({ accentHue: hue, accentL: startL, accentSat: 1 });
    } else {
      const startSat = p.accentHue === hue ? (p.accentSat || 1) : 1;
      drag.current = { hue, startY: e.clientY, startSat };
      setMany({ accentHue: hue, accentSat: startSat });
    }
    bump(true);
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch (_) {}
  };
  const swatchMove = (e) => {
    const d = drag.current; if (!d) return;
    if (d.mono) {
      const L = Math.max(0.12, Math.min(0.99, d.startL + (d.startY - e.clientY) * 0.0026));
      setMany({ accentHue: d.hue, accentL: +L.toFixed(3) });
    } else {
      const S = Math.max(0.4, Math.min(2.6, d.startSat + (d.startY - e.clientY) * 0.006));
      setMany({ accentHue: d.hue, accentSat: +S.toFixed(3) });
    }
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
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14, justifyContent: 'space-between' }}>
          {ACCENTS.map(([name, hue, cmul, lOv, m5]) => m5 === 'mono' ? (
            <button key={hue} title="Black & white — drag up/down for lightness"
              onPointerDown={(e) => swatchDown(hue, e, true)} onPointerMove={swatchMove} onPointerUp={swatchUp}
              onDoubleClick={() => setMany({ accentHue: hue, accentL: 0.22, accentSat: 1 })}
              style={{ width: 24, height: 24, borderRadius: '50%', cursor: 'ns-resize', touchAction: 'none',
                background: p.accentHue === hue ? `oklch(${(p.accentL >= 0.1 && p.accentL !== 0.56) ? p.accentL : 0.22} 0 0)` : 'linear-gradient(135deg, #141414 0 50%, #ffffff 50% 100%)',
                border: p.accentHue === hue ? '2px solid var(--accent)' : '2px solid var(--line)', outline: p.accentHue === hue ? '2px solid var(--surface)' : 'none', outlineOffset: -4 }} />
          ) : (
            <button key={hue} title={`${name} — drag up/down for saturation, double-click to reset`}
              onPointerDown={(e) => swatchDown(hue, e)} onPointerMove={swatchMove} onPointerUp={swatchUp}
              onDoubleClick={() => setMany({ accentHue: hue, accentSat: 1 })}
              style={{ width: 24, height: 24, borderRadius: '50%', cursor: 'ns-resize', touchAction: 'none', background: `oklch(${lOv || 0.56} ${Math.min((typeof m5 === 'number' ? m5 : 0.2), Math.max(0.075, 0.13 * (cmul || 1) * (p.accentHue === hue ? (p.accentSat || 1) : 1))).toFixed(3)} ${hue})`,
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

        <AppSeg label="Navigation" value={p.navMode || 'all'} options={[['all', 'All pages'], ['grouped', 'Grouped tabs']]} onChange={v => { set('navMode', v); if (onNav) onNav(v); }} />

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
