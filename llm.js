/* llm.js — generic LLM transport wrapper for the People Portal.
   ONE entry point the whole app calls: window.PD_LLM.complete({ system, messages }).
   Riley, Harper, and anything else share this — only the transport underneath changes.

   Transports
   ----------
   • 'prototype' — uses the in-browser window.claude.complete helper. Works in the
     Claude artifact/sandbox with no key or endpoint. Model + token cap are fixed by
     the host (claude-haiku-4-5, 1024 out).
   • 'server'    — POSTs to your own endpoint (the future Azure Function AI proxy) so
     the real API key never ships to the browser. Send/receive contract below.
   • 'auto'      — (default) use prototype if window.claude exists, else server.

   Production wiring (when the proxy exists): set in index.html BEFORE this script:
       window.PD_AI = { transport: 'server', endpoint: '/api/ai', model: 'claude-...' };

   Server endpoint contract (what the Azure Function must accept/return)
   --------------------------------------------------------------------
   REQUEST  POST <endpoint>  Content-Type: application/json
       { "system": "<string>", "messages": [ { "role":"user|assistant", "content":"…" } ],
         "model": "<string|null>", "max_tokens": <int> }
   RESPONSE 200  application/json — any ONE of these shapes is accepted:
       { "text": "…" }                                  ← simplest, recommended
       { "completion": "…" }
       { "content": [ { "type":"text", "text":"…" } ] }  ← raw Anthropic Messages shape
   The function should attach the API key server-side, call Anthropic, and return text.
   It should also enforce auth/domain-lock just like /api/roster. */

window.PD_LLM = (function () {
  'use strict';

  var cfg = Object.assign({
    transport: 'auto',
    endpoint: '/api/ai',
    model: null,          // null → let the host/server pick its default
    maxTokens: 1024,
    headers: {}           // extra headers for the server transport (e.g. auth)
  }, window.PD_AI || {});

  function activeTransport() {
    if (cfg.transport && cfg.transport !== 'auto') return cfg.transport;
    var hasHelper = typeof window.claude !== 'undefined' && window.claude && typeof window.claude.complete === 'function';
    return hasHelper ? 'prototype' : 'server';
  }

  // Anthropic requires the first message to be a user turn — drop any leading
  // assistant turns (e.g. Riley's opening greeting) before sending.
  function normalize(messages) {
    var m = (messages || []).filter(function (x) { return x && x.content; });
    while (m.length && m[0].role === 'assistant') m.shift();
    return m;
  }

  async function viaPrototype(opts) {
    var messages = normalize(opts.messages).map(function (m) { return { role: m.role, content: m.content }; });
    if (opts.system) {
      // The in-browser helper does NOT honor a separate top-level `system` field —
      // verified empirically (it returns generic, ungrounded replies). So fold the
      // system prompt into the first user turn as a preamble; it stays at the top of
      // the conversation and grounds every subsequent turn. (The server transport
      // keeps `system` separate, the way the real Messages API wants it.)
      if (!messages.length) messages.push({ role: 'user', content: opts.system });
      else messages[0] = { role: 'user', content: opts.system + '\n\n———\n\n' + messages[0].content };
    }
    var out = await window.claude.complete({ messages: messages });
    if (typeof out === 'string') return out;
    return (out && (out.text || out.completion)) || '';
  }

  async function viaServer(opts) {
    var hdrs = Object.assign({ 'Content-Type': 'application/json' }, cfg.headers);
    // Send the Google token so /api/ai can authenticate the caller (protects the budget).
    // Custom header, because Azure overwrites Authorization (same reason as /api/roster).
    if (window.PD_GOOGLE_TOKEN) hdrs['X-Google-Token'] = window.PD_GOOGLE_TOKEN;
    var res = await fetch(cfg.endpoint, {
      method: 'POST',
      headers: hdrs,
      body: JSON.stringify({
        system: opts.system || '',
        messages: normalize(opts.messages),
        model: opts.model || cfg.model,
        max_tokens: opts.maxTokens || cfg.maxTokens
      })
    });
    if (!res.ok) throw new Error('PD_LLM server transport HTTP ' + res.status);
    var data = await res.json();
    return data.text || data.completion ||
      (data.content && data.content[0] && data.content[0].text) || '';
  }

  /* complete(opts) → Promise<string>
     opts: { system?, messages: [{role,content}], model?, maxTokens? }
     A bare string is also accepted as a single user message. */
  async function complete(opts) {
    if (typeof opts === 'string') opts = { messages: [{ role: 'user', content: opts }] };
    return activeTransport() === 'prototype' ? viaPrototype(opts) : viaServer(opts);
  }

  return { complete: complete, activeTransport: activeTransport, config: cfg };
})();
