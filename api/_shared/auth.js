/* api/_shared/auth.js — verifies a Google sign-in token and returns the user's identity.
   Uses Google's tokeninfo endpoint as the source of truth (no manual key matching).
   One place identity is decided. Every protected endpoint calls verifyGoogleToken(). */

const https = require('https');

function fetchTokenInfo(token) {
  return new Promise((resolve, reject) => {
    const url = 'https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(token);
    https.get(url, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch (e) { reject(new Error('tokeninfo parse error')); }
      });
    }).on('error', reject);
  });
}

/* Returns { email, name, sub, hd } on success. Throws on any failure. */
async function verifyGoogleToken(token) {
  if (!token) throw new Error('No token');

  const res = await fetchTokenInfo(token);
  if (res.status !== 200) {
    throw new Error('Token rejected by Google (' + res.status + ')');
  }
  const p = res.body;

  // must be for THIS app
  if (p.aud !== process.env.GOOGLE_CLIENT_ID) {
    throw new Error('Wrong audience');
  }
  // issued by Google
  if (p.iss !== 'https://accounts.google.com' && p.iss !== 'accounts.google.com') {
    throw new Error('Wrong issuer');
  }
  // not expired (tokeninfo also enforces this, but double-check)
  if (p.exp && Date.now() / 1000 > Number(p.exp)) {
    throw new Error('Token expired');
  }
  // email present and verified
  if (!p.email || (p.email_verified !== true && p.email_verified !== 'true')) {
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
