/* api/_shared/auth.js — verifies a Google sign-in token and returns the user's identity.
   One place identity is decided. Every protected endpoint calls verifyGoogleToken(). */

const https = require('https');

let _keysCache = null;
let _keysExpiry = 0;

// Google's public signing keys (rotated periodically). Cached until expiry.
function getGoogleCerts() {
  return new Promise((resolve, reject) => {
    const now = Date.now();
    if (_keysCache && now < _keysExpiry) return resolve(_keysCache);
    https.get('https://www.googleapis.com/oauth2/v3/certs', (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          // honor cache-control max-age if present, else 1h
          const cc = res.headers['cache-control'] || '';
          const m = cc.match(/max-age=(\d+)/);
          _keysExpiry = now + (m ? parseInt(m[1], 10) * 1000 : 3600 * 1000);
          _keysCache = json.keys;
          resolve(json.keys);
        } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

function b64urlToBuf(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  return Buffer.from(s, 'base64');
}

// Build a PEM public key from a JWK (RSA n/e) without external libs.
const crypto = require('crypto');
function jwkToPem(jwk) {
  return crypto.createPublicKey({ key: jwk, format: 'jwk' });
}

/* Returns { email, name, sub, hd } on success. Throws on any failure. */
async function verifyGoogleToken(token) {
  if (!token) throw new Error('No token');
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Malformed token');

  const header = JSON.parse(b64urlToBuf(parts[0]).toString('utf8'));
  const payload = JSON.parse(b64urlToBuf(parts[1]).toString('utf8'));
  const signature = b64urlToBuf(parts[2]);
  const signedData = Buffer.from(parts[0] + '.' + parts[1]);

  // 1) signature must match one of Google's current keys
  const keys = await getGoogleCerts();
  const jwk = keys.find(k => k.kid === header.kid);
  if (!jwk) throw new Error('Signing key not found');
  const pubKey = jwkToPem(jwk);
  const ok = crypto.verify('RSA-SHA256', signedData, pubKey, signature);
  if (!ok) throw new Error('Bad signature');

  // 2) token must be issued by Google
  if (payload.iss !== 'https://accounts.google.com' && payload.iss !== 'accounts.google.com') {
    throw new Error('Wrong issuer');
  }
  // 3) token must be for THIS app
  if (payload.aud !== process.env.GOOGLE_CLIENT_ID) {
    throw new Error('Wrong audience');
  }
  // 4) not expired
  if (payload.exp && Date.now() / 1000 > payload.exp) {
    throw new Error('Token expired');
  }
  // 5) email present and verified
  if (!payload.email || payload.email_verified === false) {
    throw new Error('Email not verified');
  }

  return {
    email: payload.email.toLowerCase(),
    name: payload.name || '',
    sub: payload.sub,
    hd: payload.hd || '',
  };
}

// Pull the bearer token out of an incoming request's Authorization header.
function tokenFromReq(req) {
  const h = (req.headers && (req.headers['authorization'] || req.headers['Authorization'])) || '';
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : '';
}

module.exports = { verifyGoogleToken, tokenFromReq };
