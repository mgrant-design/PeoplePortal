/* ui.jsx — shared primitives: icons, ProgressRing, Avatar, Badge, etc. */
const { useState, useRef, useEffect, useMemo, useCallback } = React;

/* ---- Icon set (simple line icons) ---- */
const ICON = {
  tooth: 'M8 2.2c-2.2 0-3.7 1.7-3.7 4 0 1.4.4 2.6.6 4 .3 1.9.2 4 .9 6.2.3 1 .8 1.9 1.6 1.9 1 0 1.1-1.2 1.3-2.4.2-1.1.4-2.3 1.3-2.3s1.1 1.2 1.3 2.3c.2 1.2.3 2.4 1.3 2.4.8 0 1.3-.9 1.6-1.9.7-2.2.6-4.3.9-6.2.2-1.4.6-2.6.6-4 0-2.3-1.5-4-3.7-4-1 0-1.8.4-2 .4s-1-.4-2-.4Z',
  check: 'M4 10.5l4 4 8-9',
  arrowRight: 'M4 10h12M11 5l5 5-5 5',
  arrowLeft: 'M16 10H4M9 15l-5-5 5-5',
  lock: 'M5.5 9V6.5a4.5 4.5 0 019 0V9M4 9h12v8H4z',
  doc: 'M5 2.5h6l4 4V17.5H5zM11 2.5V6.5h4',
  pen: 'M3 17l2-.5 9.5-9.5-1.5-1.5L3.5 15 3 17zM12.5 4.5l1.5 1.5',
  shield: 'M10 2.5l6 2.2v4.6c0 4-2.7 6.6-6 8-3.3-1.4-6-4-6-8V4.7z',
  key: 'M12.5 2.5a4 4 0 00-3.7 5.5L2.5 14.3V17.5H6l.5-2h2v-2h2l.8-.8A4 4 0 1012.5 2.5zm1.2 2.3a1 1 0 110 2 1 1 0 010-2z',
  book: 'M3 4.5C3 3.7 3.7 3 4.5 3H9v13H4.5C3.7 16 3 16.3 3 17V4.5zM17 4.5C17 3.7 16.3 3 15.5 3H11v13h4.5c.8 0 1.5.3 1.5 1V4.5z',
  users: 'M7 9a2.6 2.6 0 100-5.2A2.6 2.6 0 007 9zm6 0a2.3 2.3 0 100-4.6M2.5 16v-1.2C2.5 12.7 4.5 11.5 7 11.5s4.5 1.2 4.5 3.3V16M13 11.6c2 .2 3.5 1.3 3.5 3.2V16',
  calendar: 'M4 5h12v11H4zM4 8h12M7 3v3M13 3v3',
  heart: 'M10 16C5 12.5 3 10 3 7.3 3 5.4 4.5 4 6.3 4c1.3 0 2.4.7 3 1.7C9.8 4.7 11 4 12.3 4 14 4 15.5 5.4 15.5 7.3 15.5 10 13 12.5 10 16z',
  sparkle: 'M10 3l1.6 4.4L16 9l-4.4 1.6L10 15l-1.6-4.4L4 9l4.4-1.6z',
  clock: 'M10 5v5l3 2M10 2.5a7.5 7.5 0 100 15 7.5 7.5 0 000-15z',
  mail: 'M3 5h14v10H3zM3 5.5l7 5 7-5',
  bolt: 'M11 2.5L4.5 11H9l-1 6.5L15.5 9H11z',
  grid: 'M3 3h6v6H3zM11 3h6v6h-6zM3 11h6v6H3zM11 11h6v6h-6z',
  list: 'M6 5h11M6 10h11M6 15h11M3 5h.01M3 10h.01M3 15h.01',
  plus: 'M10 4v12M4 10h12',
  pin: 'M10 17s5-4.2 5-8a5 5 0 10-10 0c0 3.8 5 8 5 8zm0-6.2a2 2 0 100-4 2 2 0 000 4z',
  building: 'M4 17V4h8v13M12 8h4v9M6.5 7h2M6.5 10h2M6.5 13h2',
  bell: 'M10 3a4 4 0 00-4 4c0 4-1.5 5-1.5 5h11S14 11 14 7a4 4 0 00-4-4zM8.5 15.5a1.5 1.5 0 003 0',
  chevron: 'M7 4l6 6-6 6',
  dots: 'M5 10h.01M10 10h.01M15 10h.01',
  trash: 'M4 6h12M8 6V4h4v2M5.5 6l.7 10h7.6l.7-10',
  x: 'M5 5l10 10M15 5L5 15',
  upload: 'M10 14V4M6 8l4-4 4 4M4 15v1h12v-1',
  phone: 'M5 3h3l1.5 4-2 1.5a10 10 0 004 4l1.5-2 4 1.5v3a1 1 0 01-1 1A13 13 0 014 4a1 1 0 011-1z',
  star: 'M10 3l2.1 4.5 4.9.5-3.7 3.3 1.1 4.8L10 13.8 5.6 16.4l1.1-4.8L3 8.3l4.9-.5z',
  refresh: 'M15.5 7A6 6 0 005 5.5L3.5 7M4.5 13A6 6 0 0015 14.5L16.5 13M16.5 4v3h-3M3.5 16v-3h3',
  link: 'M8 12a3 3 0 010-4l2-2a3 3 0 014 4l-1 1M12 8a3 3 0 010 4l-2 2a3 3 0 01-4-4l1-1',
  bag: 'M5 6.5h10l-.8 10.5a1 1 0 01-1 1H6.8a1 1 0 01-1-1zM7.5 6.5V5.5a2.5 2.5 0 015 0v1',
  box: 'M3.5 6.2L10 3l6.5 3.2v7.6L10 17l-6.5-3.2zM3.5 6.2L10 9.4l6.5-3.2M10 9.4V17',
  shirt: 'M7 3l3 2 3-2 3.5 2.5-2 3-1.5-1V17H6V7.5l-1.5 1-2-3z',
  truck: 'M2.5 5.5h8.5v7.5H2.5zM11 8.5h3.5l2.5 2.5v2H11zM6 16a1.4 1.4 0 100-2.8A1.4 1.4 0 006 16zM14.5 16a1.4 1.4 0 100-2.8 1.4 1.4 0 000 2.8z',
  help: 'M7.6 7.7a2.5 2.5 0 114 2c-1 .7-1.6 1.2-1.6 2.3M10 14.4h.01M10 2.5a7.5 7.5 0 100 15 7.5 7.5 0 000-15z',
  play: 'M7 5l8 5-8 5z',
  search: 'M9 3a6 6 0 104.5 10l3.5 3.5M9 3a6 6 0 010 12',
  download: 'M10 3v9m0 0l-3.5-3.5M10 12l3.5-3.5M4 15v1.5h12V15',
  comment: 'M3.5 4.5h13v9h-7l-3.5 3v-3h-2.5z',
};

function Icon({ name, style, className }) {
  const d = ICON[name] || '';
  const filled = ['tooth', 'heart', 'sparkle', 'pin', 'star', 'bolt'].includes(name) ? false : false;
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6"
         strokeLinecap="round" strokeLinejoin="round" style={style} className={className}>
      <path d={d} />
    </svg>
  );
}

function Avatar({ name, size = 38, src, style }) {
  const initials = (name || '?').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
  return (
    <div className="avatar" style={{ width: size, height: size, fontSize: size * 0.38, ...style }}>
      {initials}
    </div>
  );
}

/* Avatar that shows an uploaded photo (from localStorage via getPhoto) if present */
function empPhoto(emp) {
  if (!emp) return null;
  const uploaded = (typeof getPhoto === 'function') ? getPhoto(emp.id) : null;
  if (uploaded) return uploaded;
  return /^https?:\/\//.test(emp.photo || '') ? emp.photo : null;
}
function PhotoAvatar({ emp, size = 38, style }) {
  const photo = empPhoto(emp);
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); }, [photo]);
  if (photo && !failed) return <img src={photo} alt={emp.name} onError={() => setFailed(true)} style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flex: 'none', ...style }} />;
  return <Avatar name={emp ? emp.name : '?'} size={size} style={style} />;
}

function ProgressRing({ value, size = 54, stroke = 5, children }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div style={{ position: 'relative', width: size, height: size, flex: 'none' }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--line)" strokeWidth={stroke} />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--accent)" strokeWidth={stroke}
          strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - value / 100)}
          style={{ transition: 'stroke-dashoffset .6s cubic-bezier(.4,0,.2,1)' }} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: size * 0.26 }}>
        {children}
      </div>
    </div>
  );
}

const STATUS_BADGE = {
  done:    { cls: 'badge-ok',   icon: 'check',  label: 'Complete' },
  progress:{ cls: 'badge-prog', icon: 'bolt',   label: 'In progress' },
  todo:    { cls: 'badge-todo', icon: null,     label: 'Not started' },
  locked:  { cls: 'badge-lock', icon: 'lock',   label: 'Locked' },
  action:  { cls: 'badge-warn', icon: 'bell',   label: 'Action needed' },
};
function StatusBadge({ status }) {
  const s = STATUS_BADGE[status] || STATUS_BADGE.todo;
  return <span className={`badge ${s.cls}`}>{s.icon && <Icon name={s.icon} />}{s.label}</span>;
}

Object.assign(window, { Icon, ICON, Avatar, PhotoAvatar, empPhoto, ProgressRing, StatusBadge, STATUS_BADGE,
  useState, useRef, useEffect, useMemo, useCallback });
