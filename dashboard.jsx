/* dashboard.jsx — role-adaptive landing. Employee = self/onboarding; manager+/HR = team ops. */

function StatCard({ icon, label, value, sub, tone = 'accent' }) {
  const bg = tone === 'ok' ? 'var(--ok-soft)' : tone === 'warn' ? 'var(--warn-soft)' : 'var(--accent-soft)';
  const fg = tone === 'ok' ? 'oklch(0.45 0.12 155)' : tone === 'warn' ? 'oklch(0.5 0.13 60)' : 'var(--accent-strong)';
  return (
    <div className="card" style={{ padding: 'var(--pad)' }}>
      <div style={{ width: 38, height: 38, borderRadius: 'var(--r-md)', display: 'grid', placeItems: 'center', background: bg, color: fg, marginBottom: 12 }}><Icon name={icon} style={{ width: 20, height: 20 }} /></div>
      <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 30, letterSpacing: '-0.02em' }}>{value}</div>
      <div style={{ fontSize: 13.5, color: 'var(--ink-2)', marginTop: 2 }}>{label}</div>
      {sub && <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

/* date helpers — handle both "M/D/YYYY" and ISO "YYYY-MM-DD" */
function pdParseDate(s) {
  if (!s) return null; s = String(s).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) { const [y, mo, d] = s.slice(0, 10).split('-').map(Number); return { y, mo, d }; }
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (m) { let y = +m[3]; if (y < 100) y += 1900; return { y, mo: +m[1], d: +m[2] }; }
  return null;
}
function pdToday() { const n = new Date(); return { y: n.getFullYear(), mo: n.getMonth() + 1, d: n.getDate() }; }
function isBirthdayToday(e, t) { const b = pdParseDate(e.birthdate); return !!b && b.mo === t.mo && b.d === t.d; }
function isStartingToday(e, t) { const s = pdParseDate(e.startDate); return !!s && s.mo === t.mo && s.d === t.d && s.y === t.y; }
function birthdayMessage(names) {
  const list = names.length === 1 ? names[0] : names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1];
  return `\u{1F382} Happy birthday to ${list}! Wishing you a wonderful day from your Pure Dental family. \u2600\uFE0F`;
}

function Dashboard({ me, access, employees, onNav, onOpenEmp }) {
  const greeting = (() => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'; })();
  const isManagerView = access.caps.viewTeam || access.caps.viewAll;
  const [bdaySent, setBdaySent] = useState(false);

  if (!isManagerView) {
    // ---- Employee dashboard ----
    const celebs = (typeof getCelebrations === 'function') ? getCelebrations(me) : [];
    const hasB = celebs.some(c => c.type === 'birthday'); const anniv = celebs.find(c => c.type === 'anniversary');
    const scrubReady = (typeof scrubAccess === 'function' && typeof CLINICAL !== 'undefined' && CLINICAL.includes(scrubAccess(me))) && (() => { const s = pdParseDate(me.startDate); return !s || (Date.now() - s.getTime()) >= 90 * 864e5; })();
    const tiles = [
      { id: 'onboarding', icon: 'sparkle', t: 'My onboarding', d: 'Finish your setup tasks' },
      { id: 'resources', icon: 'bell', t: 'Ask Riley', d: 'Instant answers, any time' },
      ...(scrubReady ? [{ id: 'scrubs', icon: 'shirt', t: 'Order clinical wear', d: 'Your scrubs allowance is ready' }] : []),
      { id: 'profile', icon: 'users', t: 'My profile', d: 'Add a photo & review details' },
      { id: 'people', icon: 'users', t: 'Directory', d: 'Find a colleague’s contact info' },
    ];
    return (
      <div className="fade-in">
        {celebs.length > 0 && (
          <div className="card" style={{ padding: '16px 20px', marginBottom: 'var(--gap)', background: 'var(--accent-softer)', display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ fontSize: 32, lineHeight: 1 }}>{hasB ? '\u{1F382}' : '\u{1F389}'}</div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 16 }}>{hasB ? `Happy Birthday, ${me.first}!` : `Happy Work Anniversary, ${me.first}!`}</div>
              <div style={{ fontSize: 13, color: 'var(--ink-2)', marginTop: 2 }}>{hasB && anniv ? `It’s your birthday — and ${anniv.years} year${anniv.years === 1 ? '' : 's'} with us today!` : hasB ? 'Wishing you a wonderful day from the whole team. \u2600\uFE0F' : `${anniv.years} year${anniv.years === 1 ? '' : 's'} at Pure Dental — thank you! \u{1F499}`}</div>
            </div>
          </div>
        )}
        <div className="card" style={{ padding: 'clamp(20px,3.5vw,32px)', marginBottom: 'var(--gap)' }}>
          <div className="eyebrow" style={{ marginBottom: 10 }}>Welcome back</div>
          <h1 style={{ fontSize: 'clamp(24px,3.4vw,34px)' }}>{greeting}, {me.first}.</h1>
          <p style={{ color: 'var(--ink-2)', fontSize: 15.5, marginTop: 10, maxWidth: 540, lineHeight: 1.5 }}>You’re a <b style={{ color: 'var(--ink)' }}>{me.jobTitle}</b> at Pure Dental {me.loc}. Here’s your space.</p>
          <button className="btn btn-primary btn-lg" style={{ marginTop: 18 }} onClick={() => onNav('onboarding')}><Icon name="bolt" /> Continue onboarding</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: 'var(--gap)' }}>
          {tiles.map(t => (
            <button key={t.id} className="card task-card" onClick={() => onNav(t.id)} style={{ textAlign: 'left', padding: 'var(--pad)', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 10 }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.boxShadow = 'var(--shadow-md)'; }} onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = ''; }}>
              <div style={{ width: 40, height: 40, borderRadius: 'var(--r-md)', display: 'grid', placeItems: 'center', background: 'var(--accent-soft)', color: 'var(--accent-strong)' }}><Icon name={t.icon} style={{ width: 21, height: 21 }} /></div>
              <div style={{ fontWeight: 600, fontSize: 15.5 }}>{t.t}</div>
              <div style={{ fontSize: 13, color: 'var(--ink-3)' }}>{t.d}</div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // ---- Manager / HR dashboard ----
  const team = employees.filter(e => e.id !== me.id);
  const active = team.filter(e => e.status === 'Active');
  const providers = active.filter(e => e.provider);
  const onboarding = active.filter(e => e.accountStatus && e.accountStatus !== 'Complete');
  const offReqs = (window.HR.offboarding || []).filter(o => access.caps.viewAll || (o.manager || '').toLowerCase().includes(me.last.toLowerCase()));
  const byOffice = {}; active.forEach(e => byOffice[e.loc] = (byOffice[e.loc] || 0) + 1);
  const recent = active.slice().sort((a, b) => (b.startDate || '').localeCompare(a.startDate || '')).slice(0, 6);

  const today = pdToday();
  const startingToday = active.filter(e => isStartingToday(e, today));
  const birthdaysToday = active.filter(e => isBirthdayToday(e, today));
  const anniversariesToday = active.map(e => { const s = pdParseDate(e.startDate); return (s && s.mo === today.mo && s.d === today.d && s.y < today.y) ? { ...e, _years: today.y - s.y } : null; }).filter(Boolean);

  const sendBirthdayWish = () => {
    let hook = '';
    try { hook = localStorage.getItem('pd_sunshine_webhook') || ''; } catch (e) {}
    if (!hook) {
      hook = window.prompt('Paste the Google Chat \u201cSunshine Club\u201d incoming-webhook URL\n(Space \u2192 Apps & integrations \u2192 Webhooks \u2192 Add webhook):', '');
      if (!hook) return;
      try { localStorage.setItem('pd_sunshine_webhook', hook); } catch (e) {}
    }
    setBdaySent(true);
  };

  return (
    <div className="fade-in">
      <div style={{ marginBottom: 18 }}>
        <div className="eyebrow" style={{ marginBottom: 8 }}>{access.label} dashboard</div>
        <h1 style={{ fontSize: 'clamp(23px,3vw,30px)' }}>{greeting}, {me.first}.</h1>
        <p style={{ color: 'var(--ink-2)', fontSize: 14.5, marginTop: 6 }}>{access.caps.viewAll ? 'Company-wide view' : 'Your team'} · {active.length} active people</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 'var(--gap)', marginBottom: 'var(--gap)' }}>
        <StatCard icon="users" label="Active team members" value={active.length} sub={`${team.length - active.length} inactive`} />
        <StatCard icon="star" label="Providers" value={providers.length} sub="NPI / DEA on file" tone="ok" />
        <StatCard icon="bolt" label="Onboarding in progress" value={onboarding.length} sub="accounts pending" tone="accent" />
        <StatCard icon="bell" label="Offboarding requests" value={offReqs.length} sub="this view" tone="warn" />
      </div>

      {(startingToday.length > 0 || birthdaysToday.length > 0 || anniversariesToday.length > 0) && (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 'var(--gap)', marginBottom: 'var(--gap)' }}>
        <div className="card" style={{ padding: 'var(--pad)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 14 }}>
            <div style={{ width: 30, height: 30, borderRadius: 'var(--r-md)', display: 'grid', placeItems: 'center', background: 'var(--ok-soft)', color: 'oklch(0.45 0.12 155)', flex: 'none' }}><Icon name="sparkle" style={{ width: 16, height: 16 }} /></div>
            <h3 style={{ fontSize: 16 }}>Starting today</h3>
            <span className="badge badge-ok" style={{ marginLeft: 'auto' }}>{startingToday.length}</span>
          </div>
          {startingToday.length === 0
            ? <p style={{ fontSize: 13, color: 'var(--ink-3)' }}>No one starts today.</p>
            : <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {startingToday.map((e, i) => (
                  <button key={e.id} onClick={() => onOpenEmp(e)} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 6px', border: 'none', borderTop: i ? '1px solid var(--line-soft)' : 'none', background: 'none', cursor: 'pointer', textAlign: 'left', borderRadius: 8 }}
                    onMouseEnter={ev => ev.currentTarget.style.background = 'var(--surface-2)'} onMouseLeave={ev => ev.currentTarget.style.background = 'none'}>
                    <PhotoAvatar emp={e} size={34} />
                    <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontWeight: 600, fontSize: 13.5 }}>{e.name}</div><div style={{ fontSize: 12, color: 'var(--ink-3)' }}>{e.jobTitle} · {e.loc}</div></div>
                    <span className="badge badge-prog" style={{ fontSize: 11 }}>Day 1</span>
                  </button>
                ))}
              </div>}
        </div>

        <div className="card" style={{ padding: 'var(--pad)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 14 }}>
            <div style={{ width: 30, height: 30, borderRadius: 'var(--r-md)', display: 'grid', placeItems: 'center', background: 'var(--accent-soft)', color: 'var(--accent-strong)', flex: 'none', fontSize: 16 }}>🎉</div>
            <h3 style={{ fontSize: 16 }}>Today’s celebrations</h3>
            <span className="badge" style={{ marginLeft: 'auto', background: 'var(--accent-soft)', color: 'var(--accent-strong)' }}>{birthdaysToday.length + anniversariesToday.length}</span>
          </div>
          {(birthdaysToday.length + anniversariesToday.length) === 0
            ? <p style={{ fontSize: 13, color: 'var(--ink-3)' }}>No birthdays or anniversaries today.</p>
            : <>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 14 }}>
                  {birthdaysToday.map((e, i) => (
                    <button key={'b' + e.id} onClick={() => onOpenEmp(e)} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 6px', border: 'none', borderTop: i ? '1px solid var(--line-soft)' : 'none', background: 'none', cursor: 'pointer', textAlign: 'left', borderRadius: 8 }}
                      onMouseEnter={ev => ev.currentTarget.style.background = 'var(--surface-2)'} onMouseLeave={ev => ev.currentTarget.style.background = 'none'}>
                      <PhotoAvatar emp={e} size={34} />
                      <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontWeight: 600, fontSize: 13.5 }}>{e.name}</div><div style={{ fontSize: 12, color: 'var(--ink-3)' }}>{e.jobTitle} · {e.loc}</div></div>
                      <span style={{ fontSize: 17 }} title="Birthday">🎂</span>
                    </button>
                  ))}
                  {anniversariesToday.map((e, i) => (
                    <button key={'a' + e.id} onClick={() => onOpenEmp(e)} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 6px', border: 'none', borderTop: (i || birthdaysToday.length) ? '1px solid var(--line-soft)' : 'none', background: 'none', cursor: 'pointer', textAlign: 'left', borderRadius: 8 }}
                      onMouseEnter={ev => ev.currentTarget.style.background = 'var(--surface-2)'} onMouseLeave={ev => ev.currentTarget.style.background = 'none'}>
                      <PhotoAvatar emp={e} size={34} />
                      <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontWeight: 600, fontSize: 13.5 }}>{e.name}</div><div style={{ fontSize: 12, color: 'var(--ink-3)' }}>{e.jobTitle} · {e.loc}</div></div>
                      <span className="badge" style={{ fontSize: 11, background: 'var(--accent-soft)', color: 'var(--accent-strong)' }}>🎉 {e._years} yr{e._years === 1 ? '' : 's'}</span>
                    </button>
                  ))}
                </div>
                {bdaySent
                  ? <div className="fade-in" style={{ borderRadius: 'var(--r-md)', background: 'var(--ok-soft)', padding: '12px 14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700, color: 'oklch(0.4 0.12 155)', marginBottom: 6 }}><Icon name="check" style={{ width: 16, height: 16 }} /> Posted to Google Chat · Sunshine Club ☀️</div>
                      <div style={{ fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.5, whiteSpace: 'pre-line' }}>{typeof buildSunshinePost === 'function' ? buildSunshinePost(birthdaysToday, anniversariesToday) : birthdayMessage(birthdaysToday.map(e => e.first))}</div>
                    </div>
                  : <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} onClick={sendBirthdayWish}>🎉 Send wishes to Sunshine Club</button>}
                <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 9, display: 'flex', alignItems: 'center', gap: 6 }}><Icon name="bolt" style={{ width: 12, height: 12 }} /> Auto-posts each morning with a branded card via the Sunshine Club webhook</div>
              </>}
        </div>
      </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.4fr) minmax(0,1fr)', gap: 'var(--gap)', alignItems: 'start' }}>
        <div className="card" style={{ padding: 'var(--pad)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <h3 style={{ fontSize: 16 }}>{access.caps.viewAll ? 'Recent starters' : 'Your team'}</h3>
            <button className="btn btn-quiet" style={{ fontSize: 13, padding: '6px 12px' }} onClick={() => onNav('people')}>View all <Icon name="arrowRight" style={{ width: 15, height: 15 }} /></button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {recent.map((e, i) => (
              <button key={e.id} onClick={() => onOpenEmp(e)} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 6px', border: 'none', borderTop: i ? '1px solid var(--line-soft)' : 'none', background: 'none', cursor: 'pointer', textAlign: 'left', borderRadius: 8 }}
                onMouseEnter={ev => ev.currentTarget.style.background = 'var(--surface-2)'} onMouseLeave={ev => ev.currentTarget.style.background = 'none'}>
                <PhotoAvatar emp={e} size={34} />
                <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontWeight: 600, fontSize: 13.5 }}>{e.name}</div><div style={{ fontSize: 12, color: 'var(--ink-3)' }}>{e.jobTitle}</div></div>
                <span className="mono" style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>{e.loc}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="card" style={{ padding: 'var(--pad)' }}>
          <h3 style={{ fontSize: 16, marginBottom: 14 }}>Headcount by office</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {Object.entries(byOffice).sort((a, b) => b[1] - a[1]).map(([loc, n]) => {
              const max = Math.max(...Object.values(byOffice));
              return (
                <div key={loc}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 4 }}><span style={{ fontWeight: 600 }}>{loc}</span><span className="mono" style={{ color: 'var(--ink-3)' }}>{n}</span></div>
                  <div style={{ height: 7, borderRadius: 99, background: 'var(--surface-2)', overflow: 'hidden' }}><div style={{ height: '100%', width: `${n / max * 100}%`, background: 'var(--accent)', borderRadius: 99 }} /></div>
                </div>
              );
            })}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 18, flexWrap: 'wrap' }}>
            {access.caps.schedule && <button className="btn btn-ghost" style={{ fontSize: 13 }} onClick={() => onNav('scheduler')}><Icon name="grid" /> Scheduling</button>}
            {access.caps.offboard && <button className="btn btn-ghost" style={{ fontSize: 13 }} onClick={() => onNav('offboarding')}><Icon name="bell" /> Offboarding</button>}
          </div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { Dashboard });
