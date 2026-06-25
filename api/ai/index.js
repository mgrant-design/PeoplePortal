/* api/ai/index.js — server-side Claude proxy for Riley & Harper.
   The browser NEVER sees the API key. llm.js (transport: 'server') POSTs here with
   { system, messages, model?, max_tokens? }; we authenticate the caller (same Google
   token + domain lock as /api/roster so randoms can't burn the budget), call Anthropic's
   Messages API, and return { text }.

   Azure config required (Static Web App → Environment variables):
     ANTHROPIC_API_KEY   (required)  your sk-ant-... key
     ANTHROPIC_MODEL     (optional)  defaults to claude-haiku-4-5 (cheap). Set to a
                                     sonnet model for higher-quality answers. */

const https = require('https');
const { verifyGoogleToken, tokenFromReq } = require('../_shared/auth');

function anthropicMessages({ apiKey, model, system, messages, maxTokens }) {
  return new Promise((resolve, reject) => {
    // Prompt caching: send the (large, stable) system prompt — Riley's KB / Harper's
    // handbook — as a cached content block. Anthropic caches the prefix up to this block,
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

module.exports = async function (context, req) {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Google-Token',
  };
  if (req.method === 'OPTIONS') { context.res = { status: 204, headers }; return; }

  // --- auth: only signed-in company users may spend the budget ---
  let identity;
  try {
    identity = await verifyGoogleToken(tokenFromReq(req));
  } catch (e) {
    context.res = { status: 401, headers, body: JSON.stringify({ error: 'Not authenticated', detail: e.message }) };
    return;
  }
  const allowedDomains = ['puredental.com', 'foureversmile.com', 'puredentallab.com'];
  if (!allowedDomains.includes(identity.email.split('@')[1] || '')) {
    context.res = { status: 403, headers, body: JSON.stringify({ error: 'Domain not allowed' }) };
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY || '';
  if (!apiKey) { context.res = { status: 500, headers, body: JSON.stringify({ error: 'Server missing ANTHROPIC_API_KEY' }) }; return; }

  const body = req.body || {};
  const messages = Array.isArray(body.messages) ? body.messages : [];
  if (!messages.length) { context.res = { status: 400, headers, body: JSON.stringify({ error: 'No messages' }) }; return; }
  const model = body.model || process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5';
  const maxTokens = Math.min(Number(body.max_tokens) || 1024, 2048);

  try {
    const r = await anthropicMessages({ apiKey, model, system: body.system || '', messages, maxTokens });
    if (r.status !== 200) {
      const detail = (r.body && r.body.error && r.body.error.message) || ('HTTP ' + r.status);
      context.res = { status: 502, headers, body: JSON.stringify({ error: 'Model error', detail }) };
      return;
    }
    const text = (r.body.content || []).filter(b => b.type === 'text').map(b => b.text).join('').trim();
    context.res = { status: 200, headers, body: JSON.stringify({ text }) };
  } catch (err) {
    context.res = { status: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
