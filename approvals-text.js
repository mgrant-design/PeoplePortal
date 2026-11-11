/* approvals-text.js — plain words for an approval record: who it's about, what it is,
   and when. Loaded by index.html and copied into api/_shared/ for the server's notices
   (deploy workflow, npm run sync). It also holds the 12-hour time format the screens use
   (sched-core.jsx's fmt12), so the server's notices read the same. */
(function () {
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const KIND_LABEL = { timeoff: 'Time off', offboarding: 'Offboarding notice', schedEdit: 'Schedule change', swapOffer: 'Shift offer', swapAccept: 'Shift swap', uniform: 'Uniform order', offer: 'Job offer' };

  /* 'YYYY-MM-DD' or 'M/D/YYYY' → a UTC date, or null */
  function parseDay(s) {
    const t = String(s || '').trim();
    let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
    if (m) return new Date(Date.UTC(+m[3] < 100 ? 2000 + +m[3] : +m[3], +m[1] - 1, +m[2]));
    return null;
  }
  /* "Mar 14", with the year when it isn't this year: "Jan 5, 2027" */
  /* the current year at the offices (US Eastern), so a server on a UTC clock agrees with the screens */
  const thisYear = (now) => Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric' }).format(now || new Date()));
  const short = (d) => `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}` + (d.getUTCFullYear() !== thisYear() ? `, ${d.getUTCFullYear()}` : '');
  /* "08:00" → "8a", "16:30" → "4:30p" */
  function time12(t) {
    let [h, m] = String(t || '').split(':').map(Number);
    if (isNaN(h)) return t || '';
    const ap = h >= 12 ? 'p' : 'a'; h = h % 12 || 12;
    return m ? `${h}:${String(m).padStart(2, '0')}${ap}` : `${h}${ap}`;
  }
  const day = (s) => { const d = parseDay(s); return d ? short(d) : String(s || ''); };

  function describeApproval(record) {
    const p = record.payload || {};
    const label = KIND_LABEL[record.kind] || 'Request';
    const submitter = record.submittedName || record.submittedBy || '';

    if (record.kind === 'timeoff') {
      const a = parseDay(p.start), b = parseDay(p.end || p.start);
      const n = a && b ? Math.max(0, Math.round((b - a) / 86400000) + 1) : 0;
      const hours = Number(p.hours);
      return {
        who: submitter,
        what: n ? `Time off, ${n} day${n === 1 ? '' : 's'}` : 'Time off',
        when: !a ? '' : n === 1 ? short(a) : `${short(a)} to ${short(b)}`,
        detail: [p.type, hours ? `${hours} hour${hours === 1 ? '' : 's'}` : ''].filter(Boolean).join(' · '),
      };
    }
    if (record.kind === 'offboarding') {
      const leaving = `${p.first || ''} ${p.last || ''}`.trim() || submitter;
      const status = p.termStatus || p.status;
      return { who: leaving, what: status ? `${label} · ${status}` : label, when: p.effective ? `Last day ${day(p.effective)}` : '' };
    }
    if (record.kind === 'swapOffer' || record.kind === 'swapAccept' || record.kind === 'schedEdit') {
      const s = p.shift || p;
      const d = parseDay(s.date);
      const times = s.start ? time12(s.start) + (s.end ? '–' + time12(s.end) : '') : '';
      const withWho = record.kind === 'swapAccept' && p.fromName ? ` with ${p.fromName}` : '';
      return {
        who: submitter,
        what: `${label}${withWho}${s.office ? ' · ' + s.office : ''}`,
        when: [d ? `${DAYS[d.getUTCDay()]} ${short(d)}` : '', times].filter(Boolean).join(', '),
      };
    }
    const sent = record.createdAt ? new Date(record.createdAt) : null;   // local day, not UTC
    return { who: submitter, what: label, when: sent && !isNaN(sent) ? short(new Date(Date.UTC(sent.getFullYear(), sent.getMonth(), sent.getDate()))) : '' };
  }

  const api = { describeApproval, KIND_LABEL, dayLabel: day, time12, thisYear };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else { window.describeApproval = describeApproval; window.APPROVAL_KIND_LABEL = KIND_LABEL; window.pdTime12 = time12; }
})();
