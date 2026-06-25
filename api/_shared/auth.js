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

// Pull the bearer token out of an incoming request's Authorization header.
function tokenFromReq(req) {
  const h = (req.headers && (req.headers['authorization'] || req.headers['Authorization'])) || '';
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : '';
}

module.exports = { verifyGoogleToken, tokenFromReq };
