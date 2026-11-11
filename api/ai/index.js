/* api/ai/index.js — server-side language model proxy for Riley and Harper, so the key
   never reaches the browser. POST { system, messages, model?, max_tokens? } → { text }.
   Signed-in staff only. Settings: ANTHROPIC_API_KEY (required), ANTHROPIC_MODEL (optional). */

const https = require('https');
const { handler, resolveCaller, HttpError } = require('../_shared/caller');

function modelMessages({ apiKey, model, system, messages, maxTokens }) {
  return new Promise((resolve, reject) => {
    // Prompt caching: send the (large, stable) system prompt — Riley's KB / Harper's
    // handbook — as a cached content block. The service caches the prefix up to this block,
    // so every later turn in the ~5-min window reads it back at ~10% of input cost and
    // lower latency instead of re-billing the whole knowledge base each message. No-op if
    // the prompt is under the model's cache minimum; harmless either way.
    const sys = system
      ? [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }]
      : undefined;
    const payload = JSON.stringify(Object.assign(
      { model, max_tokens: maxTokens, messages },
      sys ? { system: sys } : {}
    ));
    const options = {
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(payload),
      },
    };
    const r = https.request(options, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch (e) { reject(new Error('parse: ' + data)); }
      });
    });
    r.on('error', reject);
    r.write(payload);
    r.end();
  });
}

module.exports = handler(['POST'], async ({ req, body }) => {
  await resolveCaller(req);
  const apiKey = process.env.ANTHROPIC_API_KEY || '';
  if (!apiKey) throw new Error('Server missing ANTHROPIC_API_KEY');

  body = body || {};
  const messages = Array.isArray(body.messages) ? body.messages : [];
  if (!messages.length) throw new HttpError(400, 'No messages');
  const model = body.model || process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5';
  const maxTokens = Math.min(Number(body.max_tokens) || 1024, 2048);

  const r = await modelMessages({ apiKey, model, system: body.system || '', messages, maxTokens });
  if (r.status !== 200) throw new HttpError(502, 'The assistant is unavailable right now', new Error('model ' + r.status + ' ' + (((r.body || {}).error || {}).message || '')));
  const text = (r.body.content || []).filter(b => b.type === 'text').map(b => b.text).join('').trim();
  return { status: 200, body: { text } };
});
