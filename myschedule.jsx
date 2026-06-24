/* myschedule.jsx — employee-facing personal schedule (read-only week view). */

function _h(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; }
const MS_DAYS = [['Mon', 'Jun 22'], ['Tue', 'Jun 23'], ['Wed', 'Jun 24'], ['Thu', 'Jun 25'], ['Fri', 'Jun 26'], ['Sat', 'Jun 27'], ['Sun', 'Jun 28']];
const MS_SHIFTS = [{ label: 'Opening', start: '7:00 AM', end: '3:00 PM', hrs: 8, hue: 195 }, { label: 'Mid', start: '9:00 AM', end: '5:00 PM', hrs: 8, hue: 220 }, { label: 'Closing', start: '11:00 AM', end: '7:00 PM', hrs: 8, hue: 280 }, { label: 'Half day', start: '8:00 AM', end: '12:00 PM', hrs: 4, hue: 150 }];

function myWeek(me) {
  const h = _h(me.id + 'sched');
  const ft = (_h(me.id + 'ft') % 10 < 7);
  const workDays = ft ? [0, 1, 2, 3, 4] : [0, 1, 3].map(d => (d + (h % 2)) % 6);
  return MS_DAYS.map(([d, date], i) => {
    if (!workDays.includes(i)) return { d, date, off: true };
    const s = MS_SHIFTS[(h + i) % (i === 5 ? MS_SHIFTS.length : 3)];
    return { d, date, off: false, ...s, loc: me.loc };
  });
}

function MySchedule({ me, flash }) {
  const week = useMemo(() => myWeek(me), [me]);
  const total = week.reduce((a, w) => a + (w.off ? 0 : w.hrs), 0);
  const today = 2; // Wed (demo "today")
  const next = week.find((w, i) => !w.off && i >= today) || week.find(w => !w.off);

  return (
    <div className="fade-in">
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 18 }}>
        <div>
          <h1 style={{ fontSize: 'clamp(22px,3vw,28px)' }}>My schedule</h1>
          <p style={{ color: 'var(--ink-2)', fontSize: 14.5, marginTop: 6 }}>Week of Jun 22 · {me.loc} · <b>{total}h</b> scheduled</p>
        </div>
        <span className="badge badge-ok" style={{ padding: '8px 14px' }}><Icon name="check" /> Published</span>
      </div>

      {next && (
        <div className="card" style={{ padding: 'var(--pad)', marginBottom: 'var(--gap)', display: 'flex', alignItems: 'center', gap: 16, borderColor: 'var(--accent)', background: 'var(--accent-softer)' }}>
          <div style={{ width: 46, height: 46, borderRadius: 'var(--r-md)', flex: 'none', display: 'grid', placeItems: 'center', background: 'var(--accent)', color: '#fff' }}><Icon name="calendar" style={{ width: 24, height: 24 }} /></div>
          <div style={{ flex: 1 }}>
            <div className="eyebrow" style={{ marginBottom: 2 }}>Next shift</div>
            <div style={{ fontWeight: 700, fontSize: 16 }}>{next.d}, {next.date} · {next.start}–{next.end}</div>
            <div style={{ fontSize: 13, color: 'var(--ink-2)' }}>{next.label} · {next.loc}</div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn btn-ghost" onClick={() => flash && flash('Time-off request — open Notifications to submit')}><Icon name="clock" /> Request off</button>
            <button className="btn btn-ghost" onClick={() => flash && flash('Swap request sent to your manager')}><Icon name="refresh" /> Swap</button>
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 'var(--gap)' }}>
        {week.map((w, i) => (
          <div key={w.d} className="card" style={{ padding: 'var(--pad)', textAlign: 'center', borderColor: i === today ? 'var(--accent)' : 'var(--line)', opacity: w.off ? 0.7 : 1 }}>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 16 }}>{w.d}</div>
            <div className="mono" style={{ fontSize: 11.5, color: 'var(--ink-3)', marginBottom: 12 }}>{w.date}{i === today ? ' · today' : ''}</div>
            {w.off ? (
              <div style={{ padding: '14px 0', color: 'var(--ink-3)', fontSize: 13.5, fontWeight: 600 }}>Off</div>
            ) : (
              <div style={{ borderRadius: 'var(--r-md)', padding: '12px 10px', background: `oklch(0.96 0.05 ${w.hue})`, borderLeft: `3px solid oklch(0.58 0.13 ${w.hue})`, textAlign: 'left' }}>
                <div style={{ fontWeight: 700, fontSize: 13.5, color: `oklch(0.4 0.13 ${w.hue})` }}>{w.label}</div>
                <div className="mono" style={{ fontSize: 11.5, color: 'var(--ink-2)', marginTop: 3 }}>{w.start}<br />{w.end}</div>
                <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 6 }}>{w.hrs}h · {w.loc}</div>
              </div>
            )}
          </div>
        ))}
      </div>

      <p style={{ fontSize: 12.5, color: 'var(--ink-3)', marginTop: 14, display: 'flex', gap: 7, alignItems: 'center' }}>
        <Icon name="bolt" style={{ width: 14, height: 14 }} /> Your manager publishes schedules here. Need a change? Request time off or a swap and it routes to them for approval.
      </p>
    </div>
  );
}

Object.assign(window, { MySchedule });
