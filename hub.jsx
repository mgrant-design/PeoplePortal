/* hub.jsx — onboarding hub (dashboard). Hybrid: progress + task cards. */

function HubHero({ pct, onResume, roleLabel, emp }) {
  const nh = newHireProfile(emp);
  const who = { name: nh.name, role: nh.role, loc: nh.location, startDate: nh.startDate, manager: nh.manager };
  const greeting = (() => {
    const h = new Date().getHours();
    return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
  })();
  return (
    <div className="card fade-in" style={{ overflow: 'hidden', marginBottom: 'var(--gap)' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: 24, alignItems: 'center', padding: 'clamp(20px,3.5vw,34px)' }}>
        <div>
          <div className="eyebrow" style={{ marginBottom: 12 }}>Onboarding · Day 0</div>
          <h1 style={{ fontSize: 'clamp(26px,3.4vw,38px)', lineHeight: 1.05 }}>
            {greeting}, {who.name.split(' ')[0]}.
          </h1>
          <p style={{ color: 'var(--ink-2)', fontSize: 16, marginTop: 12, maxWidth: 520, lineHeight: 1.5 }}>
            Welcome to <b style={{ color: 'var(--ink)' }}>Pure Dental</b>. You're a <b style={{ color: 'var(--ink)' }}>{roleLabel || who.role}</b>{who.loc ? ` at ${who.loc}` : ''}{who.startDate ? `, starting ${who.startDate}` : ''}. Let’s get you ready.
          </p>
          <div style={{ display: 'flex', gap: 10, marginTop: 22, flexWrap: 'wrap' }}>
            <button className="btn btn-primary btn-lg" onClick={onResume}>
              <Icon name="bolt" /> Resume where you left off
            </button>
            <div className="badge badge-warn" style={{ alignSelf: 'center', padding: '8px 14px' }}>
              <Icon name="bell" /> {PAPERWORK_DOCS.length} documents need your signature
            </div>
          </div>
        </div>
        <div style={{ display: 'grid', placeItems: 'center', gap: 10, paddingRight: 8 }}>
          <ProgressRing value={pct} size={132} stroke={10}>
            <div style={{ textAlign: 'center', lineHeight: 1 }}>
              <div style={{ fontSize: 30 }}>{pct}%</div>
              <div style={{ fontSize: 11, fontFamily: 'var(--font-body)', fontWeight: 600, color: 'var(--ink-3)', marginTop: 3 }}>complete</div>
            </div>
          </ProgressRing>
        </div>
      </div>
      <div style={{ display: 'flex', borderTop: '1px solid var(--line)', background: 'var(--surface-2)' }}>
        {[['Start date', (who.startDate || '—').split(',')[0]], ['Location', who.loc || '—'], ['Manager', who.manager || '—']].map(([k, v], i) => (
          <div key={k} style={{ flex: 1, padding: '14px 20px', borderLeft: i ? '1px solid var(--line)' : 'none' }}>
            <div style={{ fontSize: 11, color: 'var(--ink-3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em' }}>{k}</div>
            <div style={{ fontSize: 14, fontWeight: 600, marginTop: 3 }}>{v}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TaskCard({ task, onOpen }) {
  const locked = task.status === 'locked';
  return (
    <button
      className="card task-card"
      onClick={() => !locked && onOpen(task.id)}
      style={{
        textAlign: 'left', padding: 'var(--pad)', display: 'flex', flexDirection: 'column', gap: 12,
        cursor: locked ? 'not-allowed' : 'pointer', opacity: locked ? 0.62 : 1,
        transition: 'transform .16s, box-shadow .16s, border-color .16s', position: 'relative',
        borderColor: task.status === 'action' ? 'var(--warn)' : 'var(--line)',
      }}
      onMouseEnter={e => { if (!locked) { e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.boxShadow = 'var(--shadow-md)'; } }}
      onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = ''; }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
        <div style={{
          width: 42, height: 42, borderRadius: 'var(--r-md)', display: 'grid', placeItems: 'center', flex: 'none',
          background: task.status === 'done' ? 'var(--ok-soft)' : 'var(--accent-soft)',
          color: task.status === 'done' ? 'oklch(0.45 0.12 155)' : 'var(--accent-strong)',
        }}>
          <Icon name={task.icon} style={{ width: 22, height: 22 }} />
        </div>
        <StatusBadge status={task.status} />
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 16.5, letterSpacing: '-0.01em' }}>{task.title}</div>
        <p style={{ color: 'var(--ink-2)', fontSize: 13.5, marginTop: 5, lineHeight: 1.45 }}>{task.blurb}</p>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid var(--line-soft)', paddingTop: 11 }}>
        <span className="mono" style={{ fontSize: 11.5, color: 'var(--ink-3)', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <Icon name="clock" style={{ width: 13, height: 13 }} /> {task.est}{task.count ? ` · ${task.count}` : ''}{locked && task.lockNote ? ` · ${task.lockNote}` : ''}
        </span>
        {!locked && <span style={{ color: 'var(--accent)', display: 'inline-flex' }}><Icon name="arrowRight" style={{ width: 18, height: 18 }} /></span>}
      </div>
    </button>
  );
}

function TaskRow({ task, onOpen }) {
  const locked = task.status === 'locked';
  return (
    <button className="card" onClick={() => !locked && onOpen(task.id)}
      style={{ textAlign: 'left', padding: '14px var(--pad)', display: 'flex', alignItems: 'center', gap: 16,
        cursor: locked ? 'not-allowed' : 'pointer', opacity: locked ? 0.62 : 1, width: '100%',
        transition: 'border-color .16s, background .16s' }}
      onMouseEnter={e => { if (!locked) e.currentTarget.style.borderColor = 'var(--accent)'; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--line)'; }}>
      <div style={{ width: 38, height: 38, borderRadius: 'var(--r-md)', display: 'grid', placeItems: 'center', flex: 'none',
        background: task.status === 'done' ? 'var(--ok-soft)' : 'var(--accent-soft)',
        color: task.status === 'done' ? 'oklch(0.45 0.12 155)' : 'var(--accent-strong)' }}>
        <Icon name={task.icon} style={{ width: 20, height: 20 }} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 15 }}>{task.title}</div>
        <p style={{ color: 'var(--ink-3)', fontSize: 13, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.blurb}</p>
      </div>
      <span className="mono" style={{ fontSize: 11.5, color: 'var(--ink-3)', flex: 'none' }}>{task.est}</span>
      <div style={{ flex: 'none', width: 110, display: 'flex', justifyContent: 'flex-end' }}><StatusBadge status={task.status} /></div>
      {!locked && <span style={{ color: 'var(--ink-3)', flex: 'none' }}><Icon name="chevron" style={{ width: 16, height: 16 }} /></span>}
    </button>
  );
}

function Hub({ tasks, onOpen, layout, roleLabel, notice, emp }) {
  const done = tasks.filter(t => t.status === 'done').length;
  const pct = Math.round((done / tasks.length) * 100);
  const groups = useMemo(() => {
    const m = {};
    tasks.forEach(t => { (m[t.group] = m[t.group] || []).push(t); });
    return m;
  }, [tasks]);

  const firstOpen = tasks.find(t => t.status === 'action' || t.status === 'progress') || tasks[0];

  return (
    <div>
      <HubHero pct={pct} onResume={() => onOpen(firstOpen.id)} roleLabel={roleLabel} emp={emp} />
      {notice && (
        <button onClick={notice.onView} className="card fade-in" style={{ width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 14, padding: '14px var(--pad)', marginBottom: 'var(--gap)', borderColor: 'var(--ok)', cursor: 'pointer' }}>
          <div style={{ width: 40, height: 40, borderRadius: '50%', flex: 'none', background: 'var(--ok)', color: '#fff', display: 'grid', placeItems: 'center' }}><Icon name="bell" style={{ width: 20, height: 20 }} /></div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 14.5 }}>Your accounts are ready — credentials delivered</div>
            <p style={{ fontSize: 13, color: 'var(--ink-2)', marginTop: 2 }}>View your logins for every system, plus a tour of the intranet and resources.</p>
          </div>
          <span className="btn btn-primary" style={{ flex: 'none' }}>View credentials <Icon name="arrowRight" /></span>
        </button>
      )}
      {layout === 'list' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--gap)' }}>
          {Object.entries(groups).map(([g, items]) => (
            <section key={g}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '4px 2px 12px' }}>
                <h3 style={{ fontSize: 13, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--ink-3)', fontFamily: 'var(--font-body)' }}>{g}</h3>
                <div style={{ flex: 1, height: 1, background: 'var(--line)' }} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {items.map(t => <TaskRow key={t.id} task={t} onOpen={onOpen} />)}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'calc(var(--gap) + 6px)' }}>
          {Object.entries(groups).map(([g, items]) => (
            <section key={g}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '2px 2px 14px' }}>
                <h3 style={{ fontSize: 13, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--ink-3)', fontFamily: 'var(--font-body)' }}>{g}</h3>
                <div style={{ flex: 1, height: 1, background: 'var(--line)' }} />
                <span className="mono" style={{ fontSize: 11, color: 'var(--ink-3)' }}>{items.filter(t=>t.status==='done').length}/{items.length}</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(258px, 1fr))', gap: 'var(--gap)' }}>
                {items.map(t => <TaskCard key={t.id} task={t} onOpen={onOpen} />)}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

Object.assign(window, { Hub });
