/* api/giphy/index.js — server-side Giphy search for the /gif picker, so the key never
   reaches the browser. GET /api/giphy?q=<terms> (empty q = trending), signed-in staff only.

   Azure config required (Static Web App → Environment variables):
     GIPHY_API_KEY   (required)  your Giphy API key from developers.giphy.com */

const https = require('https');
const { handler, resolveCaller, HttpError } = require('../_shared/caller');

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

module.exports = handler(['GET'], async ({ req }) => {
  await resolveCaller(req);
  const apiKey = process.env.GIPHY_API_KEY || '';
  if (!apiKey) throw new Error('Server missing GIPHY_API_KEY');

  const q = String((req.query && req.query.q) || '').trim();
  const limit = 24;
  const path = q
    ? `/v1/gifs/search?api_key=${apiKey}&q=${encodeURIComponent(q)}&limit=${limit}&rating=pg-13&bundle=messaging_non_clips`
    : `/v1/gifs/trending?api_key=${apiKey}&limit=${limit}&rating=pg-13&bundle=messaging_non_clips`;

  const r = await giphyGet(path);
  if (r.status !== 200) throw new HttpError(502, 'The GIF search is unavailable right now', new Error('giphy ' + r.status + ' ' + (((r.body || {}).meta || {}).msg || '')));
  // only what the picker renders: a grid preview, the full gif, its size, and alt text
  const gifs = (r.body.data || []).map(g => {
    const img = g.images || {};
    const full = img.downsized_medium || img.original || {};
    const prev = img.fixed_width_small || img.fixed_width || full;
    return { id: g.id, title: g.title || 'gif', url: full.url, previewUrl: prev.url, width: Number(full.width) || 0, height: Number(full.height) || 0 };
  }).filter(g => g.url && g.previewUrl);
  return { status: 200, body: { gifs } };
});
