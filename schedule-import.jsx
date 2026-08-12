/* deputy-import.jsx — one-way migration loader: a Deputy roster export (CSV) into our
   own week documents. Deputy is never read at runtime; this exists to get the history
   across once, and is free to be removed after the migration.

   The export is a ROSTER — one row per person-day shift — not a regular-hours profile.
   So this writes actual shifts only; it never touches `regularHours` (those are entered
   by managers).

   CSV columns (verified against a real export):
     Location, Area, Team Member, Start Date, Start Time, End Date, End Time,
     Total Meal Break, Total Rest Break, Total Time, Status, Note, Email, Cost
   Mapping: Location → office via normLoc(); Start Date → shift date (weekKey = its
   Monday); Start/End Time '07:45 AM' → 24h; Total Meal Break '0:30' → breakMins 30;
   Note → note. Total Time is ignored (we recompute, break-subtracted); Cost is ignored
   (no wage data, SCHEDULER.md D2).

   Two matching rules the file forces:
     1. Deputy's long location strings don't match our short office names — normLoc()
        maps them (including the Totowa spa → New Jersey).
     2. Some rows carry personal (gmail) addresses that can't join our roster on
        workEmail, so we fall back to matching the Team Member name, and REPORT every
        row we still can't resolve rather than dropping it silently. */

/* RFC-4180-ish parser: handles quoted fields and escaped quotes */
function parseCSV(text) {
  const rows = []; let field = '', row = [], q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') { if (field !== '' || row.length) { row.push(field); rows.push(row); row = []; field = ''; } }
    else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

/* '07:45 AM' | '7:45 PM' | '19:45' → '07:45' (24h) */
function to24h(raw) {
  const s = String(raw || '').trim();
  let m = s.match(/^(\d{1,2}):(\d{2})\s*([AaPp])\.?[Mm]?\.?$/);
  if (m) {
    let h = Number(m[1]) % 12;
    if (m[3].toLowerCase() === 'p') h += 12;
    return String(h).padStart(2, '0') + ':' + m[2];
  }
  m = s.match(/^(\d{1,2}):(\d{2})$/);
  return m ? String(Number(m[1])).padStart(2, '0') + ':' + m[2] : null;
}
/* '0:30' | '30' | '' → minutes */
function breakToMins(raw) {
  const s = String(raw || '').trim();
  if (!s) return 0;
  const m = s.match(/^(\d+):(\d{2})$/);
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  const n = Number(s);
  return isFinite(n) && n > 0 ? Math.round(n) : 0;
}
/* '2026-07-27' | '07/27/2026' → ISO */
function toISODate(raw) {
  const s = String(raw || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[3]}-${String(m[1]).padStart(2, '0')}-${String(m[2]).padStart(2, '0')}`;
  const d = new Date(s);
  return isNaN(d) ? null : isoDate(d);
}
const normName = n => String(n || '').toLowerCase().replace(/[^a-z]/g, '');

/* Parse + resolve a Deputy export against our roster.
   Returns { shifts:[{office, weekKey, shift}], unresolved:[...], weeks:[...], offices:[...] } */
function parseDeputyExport(text) {
  const rows = parseCSV(text);
  if (!rows.length) return { error: 'That file has no rows.' };
  const head = rows[0].map(h => String(h).trim());
  const col = name => head.findIndex(h => h.toLowerCase() === name.toLowerCase());
  const need = ['Location', 'Team Member', 'Start Date', 'Start Time', 'End Time'];
  const missing = need.filter(n => col(n) < 0);
  if (missing.length) return { error: 'This doesn\'t look like a Deputy roster export — missing column(s): ' + missing.join(', ') + '.' };

  const iLoc = col('Location'), iArea = col('Area'), iName = col('Team Member');
  const iDate = col('Start Date'), iStart = col('Start Time'), iEnd = col('End Time');
  const iMeal = col('Total Meal Break'), iNote = col('Note'), iEmail = col('Email'), iStatus = col('Status');

  const staff = (typeof EMPLOYEES !== 'undefined' ? EMPLOYEES : []);
  const byEmail = {}; staff.forEach(e => { const k = (e.emailLower || e.workEmail || '').toLowerCase(); if (k) byEmail[k] = e; });
  const byName = {}; staff.forEach(e => { const k = normName(e.name); if (k) (byName[k] = byName[k] || []).push(e); });

  const shifts = [], unresolved = [];
  const weeks = new Set(), offices = new Set();

  rows.slice(1).forEach((r, n) => {
    if (!r.length || r.every(c => !String(c).trim())) return;
    const line = n + 2; /* 1-based, +1 for the header */
    const rawLoc = String(r[iLoc] || '').trim();
    const person = String(r[iName] || '').trim();
    const date = toISODate(r[iDate]);
    const start = to24h(r[iStart]), end = to24h(r[iEnd]);
    const office = typeof normLoc === 'function' ? normLoc(rawLoc) : rawLoc;

    if (!date || !start || !end) { unresolved.push({ line, person, reason: 'Unreadable date or time', raw: `${r[iDate]} ${r[iStart]}–${r[iEnd]}` }); return; }
    if (timeMins(end) <= timeMins(start)) { unresolved.push({ line, person, reason: 'Shift ends before it starts (overnight shifts aren\'t supported)', raw: `${start}–${end}` }); return; }
    if (!office || office === 'Unassigned') { unresolved.push({ line, person, reason: 'Location doesn\'t match one of our offices', raw: rawLoc }); return; }

    const email = (iEmail >= 0 ? String(r[iEmail] || '').trim().toLowerCase() : '');
    let emp = email && byEmail[email];
    if (!emp) {
      const hits = byName[normName(person)] || [];
      if (hits.length === 1) emp = hits[0];
      else if (hits.length > 1) { unresolved.push({ line, person, reason: 'More than one active employee has this name — no work-email match to break the tie', raw: email || '(no email)' }); return; }
    }
    if (!emp) { unresolved.push({ line, person, reason: email ? 'No roster account matches this email or name' : 'No roster account matches this name', raw: email || rawLoc }); return; }

    const shift = { id: newShiftId(), empId: emp.id, date, start, end };
    const br = iMeal >= 0 ? breakToMins(r[iMeal]) : 0;
    if (br > 0) shift.breakMins = br;
    const note = iNote >= 0 ? String(r[iNote] || '').trim().slice(0, 280) : '';
    if (note) shift.note = note;

    const weekKey = weekKeyOf(date);
    weeks.add(weekKey); offices.add(office);
    shifts.push({ office, weekKey, shift, area: iArea >= 0 ? String(r[iArea] || '').trim() : '', status: iStatus >= 0 ? String(r[iStatus] || '').trim() : '' });
  });

  return { shifts, unresolved, weeks: [...weeks].sort(), offices: [...offices].sort(), rowCount: rows.length - 1 };
}

/* ---- the import screen: pick a file, review what resolved, then load ---- */
function DeputyImportModal({ offices, flash, onDone, onClose }) {
  const [parsed, setParsed] = useState(null);
  const [fileName, setFileName] = useState('');
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState('merge'); // merge | replace
  const [result, setResult] = useState(null);

  const onFile = (file) => {
    if (!file) return;
    setFileName(file.name); setParsed(null); setResult(null);
    const fr = new FileReader();
    fr.onload = () => { const p = parseDeputyExport(String(fr.result || '')); setParsed(p); if (p.error) flash(p.error); };
    fr.onerror = () => flash('Couldn\'t read that file.');
    fr.readAsText(file);
  };

  const run = async () => {
    if (!parsed || !parsed.shifts || !parsed.shifts.length) return;
    setBusy(true);
    try {
      const res = await schedImport({ mode, fileName, shifts: parsed.shifts.map(s => ({ office: s.office, weekKey: s.weekKey, shift: s.shift })), unresolved: parsed.unresolved });
      setResult(res);
      flash(`Imported ${res.written || 0} shift${res.written === 1 ? '' : 's'} into ${(res.weeks || []).length} week document${(res.weeks || []).length === 1 ? '' : 's'}.`);
    } catch (e) { flash('Import failed: ' + e.message); }
    setBusy(false);
  };

  const ok = parsed && !parsed.error;
  return (
    <RegPortal>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'oklch(0.2 0.02 230 / 0.4)', zIndex: 80 }} />
<div className="card fade-in" role="dialog" aria-modal="true" style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', zIndex: 81, width: 'min(620px, 94vw)', maxHeight: '90vh', overflowY: 'auto', padding: 0, boxShadow: 'var(--shadow-lg)' }}>
        <div style={{ padding: '16px 20px 12px', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <div style={{ fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--accent-strong)' }}>Migration</div>
            <h3 style={{ fontSize: 17, margin: '2px 0 0' }}>Import from Deputy</h3>
            <p style={{ fontSize: 12.5, color: 'var(--ink-3)', margin: '4px 0 0', lineHeight: 1.5 }}>Loads a Deputy roster export (CSV) into our own schedule. One-way — nothing reads Deputy afterwards.</p>
          </div>
          <button onClick={onClose} className="btn btn-quiet" style={{ width: 30, height: 30, padding: 0, flex: 'none', justifyContent: 'center' }}><Icon name="x" style={{ width: 14, height: 14 }} /></button>
        </div>

        <div style={{ padding: '14px 20px', display: 'flex', flexDirection: 'column', gap: 13 }}>
          {!result && (
            <label className="btn btn-ghost" style={{ alignSelf: 'flex-start', cursor: 'pointer' }}>
              <Icon name="upload" /> {fileName || 'Choose a CSV export…'}
              <input type="file" accept=".csv,text/csv" onChange={e => onFile(e.target.files && e.target.files[0])} style={{ display: 'none' }} />
            </label>
          )}

          {ok && !result && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8 }}>
                {[['Rows read', parsed.rowCount], ['Shifts matched', parsed.shifts.length], ['Couldn\'t match', parsed.unresolved.length], ['Weeks', parsed.weeks.length]].map(([l, n]) => (
                  <div key={l} style={{ padding: '9px 11px', borderRadius: 'var(--r-md)', background: 'var(--surface-2)' }}>
                    <div className="mono" style={{ fontSize: 18, fontWeight: 700, color: l === 'Couldn\'t match' && n ? 'oklch(0.52 0.18 25)' : 'var(--ink)' }}>{n}</div>
                    <div style={{ fontSize: 11, color: 'var(--ink-3)', fontWeight: 600 }}>{l}</div>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.55 }}>
                Offices: <b>{parsed.offices.join(', ') || '—'}</b><br />
                Weeks: <b className="mono">{parsed.weeks.join(', ') || '—'}</b>
              </div>

              {parsed.unresolved.length > 0 && (
                <div style={{ border: '1.5px solid var(--warn)', background: 'var(--warn-soft)', borderRadius: 'var(--r-md)', padding: '10px 13px' }}>
                  <b style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'oklch(0.42 0.11 60)' }}><Icon name="bell" style={{ width: 14, height: 14 }} /> {parsed.unresolved.length} row{parsed.unresolved.length === 1 ? '' : 's'} won't import</b>
                  <div style={{ maxHeight: 150, overflowY: 'auto', marginTop: 7, display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {parsed.unresolved.map((u, i) => (
                      <div key={i} style={{ fontSize: 11.5, color: 'var(--ink-2)', lineHeight: 1.45 }}>
                        <span className="mono" style={{ color: 'var(--ink-3)' }}>line {u.line}</span> · <b>{u.person || '(no name)'}</b> — {u.reason}{u.raw ? <span style={{ color: 'var(--ink-3)' }}> ({u.raw})</span> : null}
                      </div>
                    ))}
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 7 }}>These are listed rather than dropped quietly. Fix them in the roster (or the CSV) and import again — matched rows aren't duplicated if you re-run with Merge.</div>
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {[['merge', 'Merge', 'Add these shifts alongside anything already in those weeks'], ['replace', 'Replace', 'Clear each imported week first, then load — use for a clean migration']].map(([id, label, hint]) => (
                  <label key={id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', cursor: 'pointer', padding: '7px 10px', borderRadius: 'var(--r-md)', background: mode === id ? 'var(--accent-softer)' : 'transparent' }}>
                    <input type="radio" name="impmode" checked={mode === id} onChange={() => setMode(id)} style={{ marginTop: 2 }} />
                    <span>
                      <b style={{ fontSize: 13 }}>{label}</b>
                      <span style={{ display: 'block', fontSize: 11.5, color: 'var(--ink-3)' }}>{hint}</span>
                    </span>
                  </label>
                ))}
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--ink-3)', lineHeight: 1.5 }}>Imported weeks arrive unpublished, so you can review them before anyone is notified. Regular hours aren't touched — set those under Options → Regular hours.</div>
            </>
          )}

          {result && (
            <div style={{ border: '1.5px solid oklch(0.6 0.13 150)', background: 'color-mix(in oklab, oklch(0.7 0.13 150) 12%, var(--surface))', borderRadius: 'var(--r-md)', padding: '12px 14px', fontSize: 13, lineHeight: 1.6, color: 'oklch(0.36 0.09 150)' }}>
              <b style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Icon name="check" style={{ width: 15, height: 15 }} /> Import complete</b>
              <div style={{ marginTop: 4 }}><b className="mono">{result.written}</b> shifts written across <b className="mono">{(result.weeks || []).length}</b> week documents. They're unpublished — review, then publish to notify.</div>
              {result.logId && <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 4 }}>Receipt saved as <span className="mono">{result.logId}</span>.</div>}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, padding: '13px 20px 16px', borderTop: '1px solid var(--line)' }}>
          <div style={{ flex: 1 }} />
          {result ? <button onClick={onDone} className="btn btn-primary"><Icon name="check" /> Done</button> : (
            <>
              <button onClick={onClose} className="btn btn-ghost">Cancel</button>
              <button disabled={!ok || busy || !parsed.shifts.length} onClick={run} className="btn btn-primary"><Icon name="upload" /> {busy ? 'Importing…' : `Import ${ok ? parsed.shifts.length : ''} shifts`}</button>
            </>
          )}
        </div>
      </div>
    </RegPortal>
  );
}

/* ---- client for the import endpoint ---- */
async function schedImport(body) {
  const res = await fetch('/api/deputyimport', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Google-Token': (window.PD_GOOGLE_TOKEN || '') },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || ('import failed (' + res.status + ')'));
  return data;
}

Object.assign(window, { parseCSV, to24h, breakToMins, toISODate, parseDeputyExport, DeputyImportModal, schedImport });
