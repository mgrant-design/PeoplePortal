/* appearance.jsx — per-employee look & feel, opened by the SECRET double-click on the
   top-bar tooth. Accent color, monochrome tint, light/dark, density, corners.
   Persists per employee in localStorage now; the /api/settings (userSettings, Cosmos)
   wiring swaps in later for cross-device. applyAppearance() is also called on sign-in. */

const APPEARANCE_DEFAULTS = { accentHue: 245, tint: 'subtle', style: 'clinical', density: 'regular', dark: false, corners: 'rounded' };

const ACCENTS = [
  ['Red', 18], ['Orange', 42], ['Yellow', 90], ['Green', 158],
  ['Teal', 190], ['Blue', 256], ['Indigo', 278], ['Pink', 348],
];

function loadAppearance(empId) {
  try { const s = localStorage.getItem('pd_appearance_' + empId); if (s) return { ...APPEARANCE_DEFAULTS, ...JSON.parse(s) }; } catch (e) {}
  return { ...APPEARANCE_DEFAULTS };
}
function saveAppearance(empId, p) { try { localStorage.setItem('pd_appearance_' + empId, JSON.stringify(p)); } catch (e) {} }

function applyAppearance(p) {
  const r = document.documentElement;
  const a = { ...APPEARANCE_DEFAULTS, ...(p || {}) };
  const warm = a.style === 'warm';
  const heavy = a.tint === 'unprofessional';
  const washed = a.tint === 'tinted' || heavy;
  r.style.setProperty('--accent-hue', a.accentHue);
  r.style.setProperty('--neutral-hue', washed ? a.accentHue : (warm ? 65 : 240));
  r.style.setProperty('--tint-mult', heavy ? (a.dark ? 9 : 14) : (a.tint === 'tinted' ? (a.dark ? 5 : 6.5) : (warm ? 2.6 : 1)));
  r.style.setProperty('--ink-tint', heavy ? (a.dark ? 0.035 : 0.05) : (a.tint === 'tinted' ? (a.dark ? 0.015 : 0.022) : 0));
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
  const set = (k, v) => { const next = { ...p, [k]: v }; setP(next); applyAppearance(next); saveAppearance(me.id, next); /* TODO: also POST to /api/settings */ };
  const bumpColors = () => { setColorChanges(n => { const v = n + 1; try { localStorage.setItem('pd_color_changes', v); } catch (e) {} return v; }); };

  useEffect(() => { const h = (e) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h); }, []);

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 90 }}>
      <div onClick={e => e.stopPropagation()} className="fade-in"
        style={{ position: 'fixed', top: 64, left: 'clamp(12px, 2vw, 22px)', width: 'min(320px, 92vw)', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--r-lg)', boxShadow: '0 10px 24px oklch(0.45 0.05 var(--neutral-hue) / 0.18), 0 30px 70px oklch(0.45 0.05 var(--neutral-hue) / 0.22)', padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <span style={{ fontSize: 16 }}>✨</span>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: colorChanges > 10 ? 12.5 : 15, flex: 1, lineHeight: 1.25 }}>{colorChanges > 10 ? 'Interaction with this easter egg is monitored; Please choose a color already!' : 'Customization'}</div>
          <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--ink-3)', padding: 4 }}><Icon name="x" style={{ width: 16, height: 16 }} /></button>
        </div>

        <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--ink-3)', marginBottom: 7 }}>Accent</div>
        <div style={{ display: 'flex', gap: 6, marginBottom: 14, justifyContent: 'space-between' }}>
          {ACCENTS.map(([name, hue]) => (
            <button key={hue} title={name} onClick={() => { set('accentHue', hue); bumpColors(); }}
              style={{ width: 28, height: 28, borderRadius: '50%', cursor: 'pointer', background: `oklch(0.6 0.15 ${hue})`,
                border: p.accentHue === hue ? '2px solid var(--ink)' : '2px solid transparent', outline: p.accentHue === hue ? '2px solid var(--surface)' : 'none', outlineOffset: -4 }} />
          ))}
        </div>

        <AppSeg label="Tint" value={p.tint} options={[['subtle', 'Subtle'], ['tinted', 'Tinted'], ['unprofessional', 'Unprofessional']]} onChange={v => set('tint', v)} />
        <AppSeg label="Theme" value={p.dark ? 'dark' : 'light'} options={[['light', 'Light'], ['dark', 'Dark']]} onChange={v => set('dark', v === 'dark')} />
        <AppSeg label="Style" value={p.style} options={[['clinical', 'Cool'], ['warm', 'Warm']]} onChange={v => set('style', v)} />
        <AppSeg label="Density" value={p.density} options={[['regular', 'Comfortable'], ['compact', 'Compact']]} onChange={v => set('density', v)} />
        <AppSeg label="Corners" value={p.corners} options={[['rounded', 'Rounded'], ['sharp', 'Sharp']]} onChange={v => set('corners', v)} />

        <div style={{ fontSize: 11, color: 'var(--ink-3)', textAlign: 'center', marginTop: 4 }}>Saved just for you</div>
      </div>
    </div>
  );
}

Object.assign(window, { APPEARANCE_DEFAULTS, loadAppearance, saveAppearance, applyAppearance, AppearanceMenu });
