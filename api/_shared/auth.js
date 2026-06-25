/* api/_shared/auth.js — verifies a Google sign-in ID token and returns the user's identity.
   Uses google-auth-library (Google's recommended production method). One place identity
   is decided. Every protected endpoint calls verifyGoogleToken(). */

const { OAuth2Client } = require('google-auth-library');

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const client = new OAuth2Client(CLIENT_ID);

/* Returns { email, name, sub, hd } on success. Throws on any failure. */
async function verifyGoogleToken(token) {
  if (!token) throw new Error('No token');
  if (!CLIENT_ID) throw new Error('Server missing GOOGLE_CLIENT_ID');

  // verifyIdToken checks signature, audience, issuer, and expiry in one step.
  const ticket = await client.verifyIdToken({ idToken: token, audience: CLIENT_ID });
  const p = ticket.getPayload();
  if (!p) throw new Error('Token has no payload');

  if (!p.email || p.email_verified === false) {
    throw new Error('Email not verified');
  }

  return {
    email: p.email.toLowerCase(),
    name: p.name || '',
    sub: p.sub,
    hd: p.hd || '',
  };
}

// Pull the token from a CUSTOM header. Azure Static Web Apps overwrites the standard
// "Authorization" header with its own Easy Auth token, so we use X-Google-Token instead.
function tokenFromReq(req) {
  const h = (req.headers && (req.headers['x-google-token'] || req.headers['X-Google-Token'])) || '';
  // tolerate an optional "Bearer " prefix, though the client sends the raw token
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : h;
}

module.exports = { verifyGoogleToken, tokenFromReq };
