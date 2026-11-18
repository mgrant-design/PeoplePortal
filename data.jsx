/* data.jsx — the review scale and questions, and the calls the screens make to the server. */

/* ---- Performance reviews: default question template (HR/exec editable) ---- */
const REVIEW_SCALE = [
  { v: 1, label: 'Needs improvement' }, { v: 2, label: 'Developing' }, { v: 3, label: 'Meets expectations' }, { v: 4, label: 'Exceeds' }, { v: 5, label: 'Outstanding' },
];
const REVIEW_QUESTIONS = [
  { id: 'q1', category: 'Role excellence', text: 'Demonstrates competency and quality in their role.' },
  { id: 'q2', category: 'Patient experience', text: 'Delivers a caring, professional patient experience.' },
  { id: 'q3', category: 'Teamwork', text: 'Communicates and collaborates well with the team.' },
  { id: 'q4', category: 'Reliability', text: 'Punctual, dependable, and accountable for their work.' },
  { id: 'q5', category: 'Growth', text: 'Seeks feedback and pursues professional development.' },
];

/* ---- server calls, all through pdApi (request.js) ---- */

/* feature requests & roadmap */
async function fetchFeedback() { return (await pdApi('/api/feedback')).items || []; }
async function feedbackAction(body) { return pdApi('/api/feedback', { method: 'POST', body }); }
/* GIF search, proxied so the Giphy key stays on the server; an empty query returns trending */
async function searchGifs(q) { return (await pdApi('/api/giphy', { query: q ? { q } : undefined })).gifs || []; }

/* This week's stable key and the schedule fetch/publish helpers were re-homed
   in sched-core.jsx when the scheduler was rebuilt (real date ranges, shift lists). */

/* per-person permission grants: GET lists them, POST saves one person's */
async function fetchAccessControl() { return (await pdApi('/api/accesscontrol')).overrides || []; }
async function saveAccessOverride(body) { return pdApi('/api/accesscontrol', { method: 'POST', body }); }

/* direct notices, person to person */
async function fetchNotices() { return (await pdApi('/api/notify')).notices || []; }
async function sendNotice(body) { return pdApi('/api/notify', { method: 'POST', body }); }
async function markNoticeRead(id) { return pdApi('/api/notify', { method: 'POST', body: { action: 'read', id } }); }
async function deleteNotice(id) { return pdApi('/api/notify', { method: 'POST', body: { action: 'delete', id } }); }
async function restoreNotice(id) { return pdApi('/api/notify', { method: 'POST', body: { action: 'restore', id } }); }
/* Open the live SignalR connection so notices pushed to me arrive instantly. Returns the
   connection (call .stop() to close) or null when unavailable — no client library, not
   signed in, or no /api (sandbox). Safe to call always: on null the 5-min poll still covers
   everything, just not instantly.
   `extra` is an optional { target: handler } map for the broadcast events other pages care
   about (e.g. 'feedback-changed', 'schedule-changed', 'roster-changed' — see api/_shared/push.js)
   — one shared connection, more `.on()` registrations, rather than every page opening its own. */
async function connectNotifications(email, onNotice, extra) {
  if (typeof window === 'undefined' || !window.signalR || !email) return null;
  if (!window.PD_GOOGLE_TOKEN) return null;
  try {
    const info = await pdApi('/api/negotiate', { query: { userId: email } });
    const conn = new window.signalR.HubConnectionBuilder()
      .withUrl(info.url, { accessTokenFactory: () => info.accessToken })
      .withAutomaticReconnect()
      .build();
    conn.on('notify', (notice) => { try { onNotice && onNotice(notice); } catch (e) {} });
    if (extra && typeof extra === 'object') {
      Object.keys(extra).forEach(target => {
        const handler = extra[target];
        if (typeof handler === 'function') conn.on(target, (payload) => { try { handler(payload); } catch (e) {} });
      });
    }
    await conn.start();
    return conn;
  } catch (e) { return null; }
}

Object.assign(window, {
  REVIEW_SCALE, REVIEW_QUESTIONS,
  fetchNotices, sendNotice, markNoticeRead, deleteNotice, restoreNotice, connectNotifications, fetchAccessControl, saveAccessOverride,
  fetchFeedback, feedbackAction, searchGifs,
});
