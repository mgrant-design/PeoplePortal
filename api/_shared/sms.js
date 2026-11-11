/* api/_shared/sms.js — text messages through the text service, using the settings
   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_FROM. With none set, nothing is sent. */

const https = require('https');

/* a US number in any common form → +1XXXXXXXXXX, or '' when it isn't one */
function normPhone(p) {
  const raw = String(p || '').trim();
  if (!raw) return '';
  if (raw.startsWith('+')) { const d = raw.replace(/[^\d]/g, ''); return d.length >= 10 ? '+' + d : ''; }
  const d = raw.replace(/[^\d]/g, '');
  if (d.length === 10) return '+1' + d;
  if (d.length === 11 && d[0] === '1') return '+' + d;
  return '';
}

const settings = () => ({ sid: process.env.TWILIO_ACCOUNT_SID || '', tok: process.env.TWILIO_AUTH_TOKEN || '', from: process.env.TWILIO_FROM || '' });
const smsConfigured = () => { const s = settings(); return !!(s.sid && s.tok && s.from); };

function post(url, headers, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const rq = https.request({ hostname: u.hostname, path: u.pathname + u.search, method: 'POST', headers: { 'Content-Length': Buffer.byteLength(body), ...headers } },
      (res) => { res.on('data', () => {}); res.on('end', () => resolve(res.statusCode)); });
    rq.on('error', reject);
    rq.setTimeout(8000, () => rq.destroy(new Error('the text service did not answer in time')));
    rq.write(body); rq.end();
  });
}

/* → { sent: true } or { sent: false, reason }. Never throws. */
async function sendSms({ to, body }) {
  const { sid, tok, from } = settings();
  if (!(sid && tok && from)) return { sent: false, reason: 'not configured' };
  const phone = normPhone(to);
  if (!phone) return { sent: false, reason: 'no mobile number on file' };
  try {
    const status = await post(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`,
      { Authorization: 'Basic ' + Buffer.from(`${sid}:${tok}`).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' },
      new URLSearchParams({ To: phone, From: from, Body: String(body || '') }).toString());
    return status >= 200 && status < 300 ? { sent: true } : { sent: false, reason: 'the text service answered ' + status };
  } catch (e) { return { sent: false, reason: e.message }; }
}

module.exports = { sendSms, smsConfigured, normPhone };
