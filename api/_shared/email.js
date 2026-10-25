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
     3. Set env vars on the Function App:
          GOOGLE_SERVICE_ACCOUNT_KEY = the full JSON key, as a single-line string
          GMAIL_SEND_AS              = the mailbox to send as, e.g. hr@puredental.com

   Until those env vars are set, sendEmail() resolves with { sent: false, reason: 'not
   configured' } rather than throwing — callers should treat email as best-effort, the
   same way api/applicants treats the Chat webhook. */

const { google } = require('googleapis');

function emailConfigured() {
  return !!(process.env.GOOGLE_SERVICE_ACCOUNT_KEY && process.env.GMAIL_SEND_AS);
}

let cachedClient = null;
function gmailClient() {
  if (cachedClient) return cachedClient;
  const key = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
  const auth = new google.auth.JWT({
    email: key.client_email,
    key: key.private_key,
    scopes: ['https://www.googleapis.com/auth/gmail.send'],
    subject: process.env.GMAIL_SEND_AS,
  });
  cachedClient = google.gmail({ version: 'v1', auth });
  return cachedClient;
}

/* RFC 2822 message, base64url-encoded per the Gmail API's `raw` field. */
function buildRawMessage({ to, from, fromName, subject, html }) {
  const headers = [
    `To: ${to}`,
    `From: ${fromName ? `"${fromName}" <${from}>` : from}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset="UTF-8"',
  ].join('\r\n');
  const raw = `${headers}\r\n\r\n${html}`;
  return Buffer.from(raw).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/* Send one HTML email. Never throws — returns { sent, reason? } so callers can fall back
   to other notification channels without the whole request failing. */
async function sendEmail({ to, subject, html, fromName }) {
  if (!to) return { sent: false, reason: 'no recipient' };
  if (!emailConfigured()) return { sent: false, reason: 'not configured' };
  try {
    const gmail = gmailClient();
    const raw = buildRawMessage({ to, from: process.env.GMAIL_SEND_AS, fromName, subject, html });
    await gmail.users.messages.send({ userId: 'me', requestBody: { raw } });
    return { sent: true };
  } catch (e) {
    return { sent: false, reason: e.message };
  }
}

module.exports = { sendEmail, emailConfigured };
