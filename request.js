/* request.js — the one way screens call the server. Sends the Google sign-in token,
   returns the parsed JSON, and throws PdApiError carrying the server's own message.
   An expired sign-in is reported once until a call succeeds again. */
(function () {
  class PdApiError extends Error {
    constructor(status, message, body) { super(message); this.status = status; this.body = body; }
  }

  let signedOutTold = false;

  async function pdApi(path, { method = 'GET', body, query } = {}) {
    let url = path;
    if (query) {
      const qs = new URLSearchParams();
      Object.keys(query).forEach(k => { if (query[k] !== undefined && query[k] !== null) qs.append(k, String(query[k])); });
      const s = qs.toString();
      if (s) url += (url.includes('?') ? '&' : '?') + s;
    }
    const headers = { 'X-Google-Token': window.PD_GOOGLE_TOKEN || '' };
    const opts = { method, headers };
    if (body !== undefined) { headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }

    const res = await fetch(url, opts);
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : {}; } catch (e) { data = null; }

    if (res.status === 401 && !signedOutTold && typeof window.PD_ON_SIGNED_OUT === 'function') {
      signedOutTold = true;
      window.PD_ON_SIGNED_OUT('Your sign-in expired. Sign in again.');
    }
    if (!res.ok) throw new PdApiError(res.status, (data && data.error) || `The server didn't answer (HTTP ${res.status})`, data);
    if (data === null) throw new PdApiError(res.status, `The server didn't answer (HTTP ${res.status})`);
    signedOutTold = false;
    return data;
  }

  window.pdApi = pdApi;
  window.PdApiError = PdApiError;
})();
