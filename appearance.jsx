/* appearance.jsx — per-employee look & feel, opened by the SECRET double-click on the
   top-bar tooth. Accent color, monochrome tint, light/dark, density, corners.
   Persists per employee in localStorage now; the /api/settings (userSettings, Cosmos)
   wiring swaps in later for cross-device. applyAppearance() is also called on sign-in. */

const APPEARANCE_DEFAULTS = { accentHue: 245, accentL: 0.56, accentSat: 1, tint: 'subtle', style: 'clinical', density: 'regular', dark: false, corners: 'rounded', font: 'modern' };

const ACCENTS = [
  ['Red', 18], ['Orange', 53, 1.25], ['Yellow', 90], ['Green', 158],
  ['Teal', 190], ['Blue', 256, 1.12], ['Indigo', 278, 1.45], ['Pink', 348],
];

/* Font pairings [id, display, body, label] — previewed in their own type. */
const FONTS = [
  ['modern', 'Bricolage Grotesque', 'Hanken Grotesk', 'Clean'],
  ['editorial', 'DM Serif Display', 'Lora', 'Editorial'],
  ['sweet', 'Sacramento', 'Varela Round', 'Sweet'],
  ['terminal', 'Space Mono', 'JetBrains Mono', 'Terminal'],
  ['bold', 'Archivo Black', 'Archivo', 'Bold'],
  ['playful', 'Patrick Hand', 'Nunito', 'Playful'],
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
  const warm = a.style === 'warm';
  const heavy = a.tint === 'unprofessional';
  const washed = a.tint === 'tinted' || heavy;
  r.style.setProperty('--accent-hue', a.accentHue);
  const aS = a.accentSat || 1;
  r.style.setProperty('--accent-l', 0.56);
  const acc = (typeof ACCENTS !== 'undefined') ? ACCENTS.find(c => c[1] === a.accentHue) : null;
  const cmul = (acc && acc[2]) || 1;
  r.style.setProperty('--accent-chroma', Math.max(0.1, 0.13 * cmul * aS).toFixed(3));
  r.style.setProperty('--neutral-hue', washed ? a.accentHue : (warm ? 65 : 240));
  const levelMult = heavy ? (a.dark ? 9 : 14) : (a.tint === 'tinted' ? (a.dark ? 5 : 6.5) : (warm ? 2.6 : 1));
  r.style.setProperty('--tint-mult', (levelMult * aS).toFixed(3));
  r.style.setProperty('--ink-tint', heavy ? (a.dark ? 0.035 : 0.05) : (a.tint === 'tinted' ? (a.dark ? 0.015 : 0.022) : 0));
  r.style.setProperty('--paper-l', 0);
  const f = (typeof FONTS !== 'undefined' ? FONTS.find(x => x[0] === a.font) : null) || ['modern', 'Bricolage Grotesque', 'Hanken Grotesk'];
  r.style.setProperty('--font-display', `'${f[1]}', system-ui, sans-serif`);
  r.style.setProperty('--font-body', `'${f[2]}', system-ui, sans-serif`);
  r.setAttribute('data-font', a.font || 'modern');
  r.setAttribute('data-style', a.style);
  r.setAttribute('data-density', a.density);
  r.setAttribute('data-tint', a.tint);
  r.setAttribute('data-corners', a.corners);
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
  const [colorChanges, setColorChanges] = useState(() => { try { return (+localStorage.getItem('pd_color_changes')) || 0; } catch (e) { return 0; } });
  const set = (k, v) => { const next = { ...p, [k]: v }; setP(next); applyAppearance(next); saveAppearance(me.id, next); if (typeof pushSettings === 'function') pushSettings(next).catch(() => {}); };
  const bumpColors = () => { setColorChanges(n => { const v = n + 1; try { localStorage.setItem('pd_color_changes', v); } catch (e) {} return v; }); };
  const setMany = (obj) => { const next = { ...p, ...obj }; setP(next); applyAppearance(next); saveAppearance(me.id, next); if (typeof pushSettings === 'function') pushSettings(next).catch(() => {}); };
  const drag = React.useRef(null);
  const swatchDown = (hue, e) => {
    const startSat = p.accentHue === hue ? (p.accentSat || 1) : 1;
    drag.current = { hue, startY: e.clientY, startSat };
    setMany({ accentHue: hue, accentSat: startSat });
    bumpColors();
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch (_) {}
  };
  const swatchMove = (e) => {
    const d = drag.current; if (!d) return;
    const S = Math.max(0.3, Math.min(1.9, d.startSat + (d.startY - e.clientY) * 0.006));
    setMany({ accentHue: d.hue, accentSat: +S.toFixed(3) });
  };
  const swatchUp = () => { drag.current = null; };

  useEffect(() => { const h = (e) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h); }, []);

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 90 }}>
      <div onClick={e => e.stopPropagation()} className="fade-in"
        style={{ position: 'fixed', top: 64, left: 'clamp(12px, 2vw, 22px)', width: 'min(320px, 92vw)', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--r-lg)', boxShadow: '0 10px 24px oklch(0.45 0.05 var(--neutral-hue) / 0.18), 0 30px 70px oklch(0.45 0.05 var(--neutral-hue) / 0.22)', padding: 16 }}>
        <div style={{ position: 'relative', marginBottom: 14 }}>
          {(() => { const snarky = colorChanges > 10 && colorChanges <= 12; return <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: snarky ? 13 : 19, lineHeight: 1.25, textAlign: 'center', padding: '0 22px' }}>{snarky ? 'Interaction with this easter egg is monitored; Please choose a color already!' : 'Customization'}</div>; })()}
          <button onClick={onClose} style={{ position: 'absolute', top: -3, right: -3, border: 'none', background: 'none', cursor: 'pointer', color: 'var(--ink-3)', padding: 4 }}><Icon name="x" style={{ width: 16, height: 16 }} /></button>
        </div>

        <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--ink-3)', marginBottom: 7 }}>Accent</div>
        <div style={{ display: 'flex', gap: 6, marginBottom: 14, justifyContent: 'space-between' }}>
          {ACCENTS.map(([name, hue, cmul]) => (
            <button key={hue} title={`${name} — drag up/down for saturation, double-click to reset`}
              onPointerDown={(e) => swatchDown(hue, e)} onPointerMove={swatchMove} onPointerUp={swatchUp}
              onDoubleClick={() => setMany({ accentHue: hue, accentSat: 1 })}
              style={{ width: 28, height: 28, borderRadius: '50%', cursor: 'ns-resize', touchAction: 'none', background: `oklch(0.6 ${Math.max(0.1, 0.15 * (cmul || 1) * (p.accentHue === hue ? (p.accentSat || 1) : 1)).toFixed(3)} ${hue})`,
                border: p.accentHue === hue ? '2px solid var(--ink)' : '2px solid transparent', outline: p.accentHue === hue ? '2px solid var(--surface)' : 'none', outlineOffset: -4 }} />
          ))}
        </div>

        <AppSeg label="Tint" value={p.tint} options={[['subtle', 'Subtle'], ['tinted', 'Tinted'], ['unprofessional', 'Unprofessional']]} onChange={v => set('tint', v)} />
        <AppSeg label="Theme" value={p.dark ? 'dark' : 'light'} options={[['light', 'Light'], ['dark', 'Dark']]} onChange={v => set('dark', v === 'dark')} />
        <AppSeg label="Style" value={p.style} options={[['clinical', 'Cool'], ['warm', 'Warm']]} onChange={v => set('style', v)} />
        <AppSeg label="Density" value={p.density} options={[['regular', 'Comfortable'], ['compact', 'Compact']]} onChange={v => set('density', v)} />
        <AppSeg label="Corners" value={p.corners} options={[['rounded', 'Rounded'], ['sharp', 'Sharp']]} onChange={v => set('corners', v)} />

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

        <div style={{ fontSize: 11, color: 'var(--ink-3)', textAlign: 'center', marginTop: 4 }}>Saved just for you</div>
      </div>
    </div>
  );
}

Object.assign(window, { APPEARANCE_DEFAULTS, loadAppearance, saveAppearance, applyAppearance, AppearanceMenu, fetchSettings, pushSettings, hydrateAppearance });
