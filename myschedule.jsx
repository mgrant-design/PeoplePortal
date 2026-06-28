/* myschedule.jsx — employee-facing personal schedule (read-only).
   Reads the published week from /api/schedule and shows this employee's own shifts.
   Empty until a manager publishes; no fabricated data. */

function msHours(tpl) {
  if (!tpl) return 0;
  const toMin = s => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
  let end = toMin(tpl.end), start = toMin(tpl.start);
  if (end <= start) end += 12 * 60;
  return Math.round((end - start) / 60 * 10) / 10;
}

function MySchedule({ me }) {
  const [doc, setDoc] = useState(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoaded(false); setDoc(null);
    fetchSchedules({ weekKey: WEEK_KEY })
      .then(list => {
        if (cancelled) return;
        const mine = list.find(s => s.cells && Object.keys(s.cells).some(k => k.startsWith(me.id + '|')))
          || list.find(s => s.office === me.loc) || null;
        setDoc(mine); setLoaded(true);
      })
      .catch(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, [me.id]);

  const tplById = useMemo(() => Object.fromEntries((typeof SHIFT_TEMPLATES !== 'undefined' ? SHIFT_TEMPLATES : []).map(t => [t.id, t])), []);
  const days = (typeof WEEK_DAYS !== 'undefined' ? WEEK_DAYS : []);
  const week = days.map((label, d) => {
    const cell = doc && doc.cells ? doc.cells[`${me.id}|${d}`] : null;
    const [dname, dnum] = label.split(' ');
    return { dname, dnum, tpl: cell ? tplById[cell.tpl] : null };
  });
  const total = week.reduce((a, w) => a + msHours(w.tpl), 0);
  const hasAny = week.some(w => w.tpl);

  return (
    <div className="fade-in">
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 18 }}>
        <div>
          <h1 style={{ fontSize: 'clamp(22px,3vw,28px)' }}>My schedule</h1>
          <p style={{ color: 'var(--ink-2)', fontSize: 14.5, marginTop: 6 }}>
            Week of {days[0] || ''}{me.loc ? ` · ${me.loc}` : ''}{hasAny ? <> · <b>{total}h</b> scheduled</> : ''}
          </p>
        </div>
        {hasAny && <span className="badge badge-ok" style={{ padding: '8px 14px' }}><Icon name="check" /> Published</span>}
      </div>

      {!loaded ? (
        <div className="card" style={{ padding: 'clamp(28px,5vw,48px)', textAlign: 'center', color: 'var(--ink-3)' }}>Loading your schedule…</div>
      ) : !hasAny ? (
        <div className="card" style={{ padding: 'clamp(30px,6vw,52px)', textAlign: 'center', color: 'var(--ink-2)' }}>
          <Icon name="calendar" style={{ width: 30, height: 30, color: 'var(--ink-3)', margin: '0 auto 12px', display: 'block' }} />
          <h3 style={{ fontSize: 17, marginBottom: 8 }}>No shifts published yet</h3>
          <p style={{ fontSize: 14, maxWidth: 420, margin: '0 auto', lineHeight: 1.55 }}>When your manager publishes the schedule for this week, your shifts show up here.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 'var(--gap)' }}>
          {week.map((w, i) => (
            <div key={i} className="card" style={{ padding: 'var(--pad)', textAlign: 'center', opacity: w.tpl ? 1 : 0.7 }}>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 16 }}>{w.dname}</div>
              <div className="mono" style={{ fontSize: 11.5, color: 'var(--ink-3)', marginBottom: 12 }}>{w.dnum}</div>
              {!w.tpl ? (
                <div style={{ padding: '14px 0', color: 'var(--ink-3)', fontSize: 13.5, fontWeight: 600 }}>Off</div>
              ) : (
                <div style={{ borderRadius: 'var(--r-md)', padding: '12px 10px', background: `oklch(0.96 0.05 ${w.tpl.hue})`, borderLeft: `3px solid oklch(0.58 0.13 ${w.tpl.hue})`, textAlign: 'left' }}>
                  <div style={{ fontWeight: 700, fontSize: 13.5, color: `oklch(0.4 0.13 ${w.tpl.hue})` }}>{w.tpl.label}</div>
                  <div className="mono" style={{ fontSize: 11.5, color: 'var(--ink-2)', marginTop: 3 }}>{w.tpl.start}–{w.tpl.end}</div>
                  <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 6 }}>{msHours(w.tpl)}h{me.loc ? ` · ${me.loc}` : ''}</div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <p style={{ fontSize: 12.5, color: 'var(--ink-3)', marginTop: 14, display: 'flex', gap: 7, alignItems: 'center' }}>
        <Icon name="bolt" style={{ width: 14, height: 14 }} /> Your manager publishes schedules here. Need a change? Request time off or a swap and it routes to them for approval.
      </p>
    </div>
  );
}

Object.assign(window, { MySchedule });
