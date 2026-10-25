/* api/_shared/email.js — send outbound email as a real Workspace mailbox via the Gmail API.

   Uses a Google Cloud service account with domain-wide delegation, impersonating the
   mailbox that should appear as the sender (GMAIL_SEND_AS). This reuses the Google
   Workspace org already in place for sign-in (api/_shared/auth.js) instead of adding a
   separate email vendor.

   Setup required in Google Workspace admin (one-time, by IT):
     1. Google Cloud Console → create a service account → generate a JSON key.
     2. Workspace Admin Console → Security → API controls → Domain-wide delegation →
        add the service account's Client ID with scope:
          https://www.googleapis.com/auth/gmail.send
     3. Set this env var on the Function App:
          GOOGLE_SERVICE_ACCOUNT_KEY = the full JSON key, as a single-line string
     Mail sends as hr@puredental.com by default; set GMAIL_SEND_AS to override.

   Until GOOGLE_SERVICE_ACCOUNT_KEY is set, sendEmail() resolves with { sent: false,
   reason: 'not configured' } rather than throwing — callers should treat email as
   best-effort, the same way api/applicants treats the Chat webhook. */

const { google } = require('googleapis');

const SEND_AS = process.env.GMAIL_SEND_AS || 'hr@puredental.com';

function emailConfigured() {
  return !!process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
}

let cachedClient = null;
function gmailClient() {
  if (cachedClient) return cachedClient;
  const key = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
  const auth = new google.auth.JWT({
    email: key.client_email,
    key: key.private_key,
    scopes: ['https://www.googleapis.com/auth/gmail.send'],
    subject: SEND_AS,
  });
  cachedClient = google.gmail({ version: 'v1', auth });
  return cachedClient;
}

/* RFC 2822 message, base64url-encoded per the Gmail API's `raw` field. */
function buildRawMessage({ to, cc, from, fromName, subject, html }) {
  const headers = [
    `To: ${to}`,
    cc ? `Cc: ${cc}` : null,
    `From: ${fromName ? `"${fromName}" <${from}>` : from}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset="UTF-8"',
  ].filter(Boolean).join('\r\n');
  const raw = `${headers}\r\n\r\n${html}`;
  return Buffer.from(raw).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/* Send one HTML email. Never throws — returns { sent, reason? } so callers can fall back
   to other notification channels without the whole request failing. `cc` may be a string
   or an array of addresses (e.g. the manager who requested the hire). */
async function sendEmail({ to, cc, subject, html, fromName }) {
  if (!to) return { sent: false, reason: 'no recipient' };
  if (!emailConfigured()) return { sent: false, reason: 'not configured' };
  try {
    const gmail = gmailClient();
    const ccStr = Array.isArray(cc) ? cc.filter(Boolean).join(', ') : (cc || '');
    const raw = buildRawMessage({ to, cc: ccStr, from: SEND_AS, fromName, subject, html });
    await gmail.users.messages.send({ userId: 'me', requestBody: { raw } });
    return { sent: true };
  } catch (e) {
    return { sent: false, reason: e.message };
  }
}

module.exports = { sendEmail, emailConfigured };
