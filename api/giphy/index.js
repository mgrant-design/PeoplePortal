/* api/giphy/index.js — server-side Giphy proxy for the feature-request gif picker.
   The browser NEVER sees the Giphy key. The client calls GET /api/giphy?q=<terms>
   (empty q = trending); we authenticate the caller (same Google token + domain lock as
   /api/feedback so randoms can't burn the rate limit), call Giphy, and return a trimmed
   list of results — only the fields the picker needs, no raw Giphy payload.

   Azure config required (Static Web App → Environment variables):
     GIPHY_API_KEY   (required)  your Giphy API key from developers.giphy.com */

const https = require('https');
const { verifyGoogleToken, tokenFromReq } = require('../_shared/auth');

const ALLOWED_DOMAINS = ['puredental.com', 'foureversmile.com', 'puredentallab.com'];

function giphyGet(path) {
  return new Promise((resolve, reject) => {
    const r = https.request({ hostname: 'api.giphy.com', path, method: 'GET' }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch (e) { reject(new Error('parse: ' + data)); }
      });
    });
    r.on('error', reject);
    r.end();
  });
}

module.exports = async function (context, req) {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Google-Token',
  };
  if (req.method === 'OPTIONS') { context.res = { status: 204, headers }; return; }

  let identity;
  try { identity = await verifyGoogleToken(tokenFromReq(req)); }
  catch (e) { context.res = { status: 401, headers, body: JSON.stringify({ error: 'Not authenticated', detail: e.message }) }; return; }
  if (!ALLOWED_DOMAINS.includes(identity.email.split('@')[1] || '')) {
    context.res = { status: 403, headers, body: JSON.stringify({ error: 'Domain not allowed' }) }; return;
  }

  const apiKey = process.env.GIPHY_API_KEY || '';
  if (!apiKey) { context.res = { status: 500, headers, body: JSON.stringify({ error: 'Server missing GIPHY_API_KEY' }) }; return; }

  const q = String((req.query && req.query.q) || '').trim();
  const limit = 24;
  const path = q
    ? `/v1/gifs/search?api_key=${apiKey}&q=${encodeURIComponent(q)}&limit=${limit}&rating=pg-13&bundle=messaging_non_clips`
    : `/v1/gifs/trending?api_key=${apiKey}&limit=${limit}&rating=pg-13&bundle=messaging_non_clips`;

  try {
    const r = await giphyGet(path);
    if (r.status !== 200) {
      const detail = (r.body && r.body.meta && r.body.meta.msg) || ('HTTP ' + r.status);
      context.res = { status: 502, headers, body: JSON.stringify({ error: 'Giphy error', detail }) };
      return;
    }
    // Trim to just what the picker renders: a small preview to show in the grid, the full
    // gif to embed on the card, dimensions to avoid layout jump, and title for alt text.
    const gifs = (r.body.data || []).map(g => {
      const img = g.images || {};
      const full = img.downsized_medium || img.original || {};
      const prev = img.fixed_width_small || img.fixed_width || full;
      return {
        id: g.id,
        title: g.title || 'gif',
        url: full.url,
        previewUrl: prev.url,
        width: Number(full.width) || 0,
        height: Number(full.height) || 0,
      };
    }).filter(g => g.url && g.previewUrl);
    context.res = { status: 200, headers, body: JSON.stringify({ gifs }) };
  } catch (err) {
    context.res = { status: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
