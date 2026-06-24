/* secure.jsx — lightweight at-rest encryption for sensitive data in localStorage.
   Real AES-256-GCM via the Web Crypto API, keyed by a per-device key. This keeps
   PII (applicant contact details, resumes, notes) as ciphertext in browser
   storage so it can't be read by casually inspecting the device.

   Prototype-grade by design: with no backend/login secret yet, the data key
   lives on the device. In production the key moves server-side / to Azure Key
   Vault and decryption happens behind Entra auth (see Production Handoff).

   API (all async except isEncrypted):
     await PD_SEC.setItem(key, value)   encrypt JSON value → localStorage
     await PD_SEC.getItem(key, fallback) decrypt → value (or fallback)
     PD_SEC.isEncrypted(key)            true if stored value is ciphertext
     PD_SEC.available                   Web Crypto present
*/
const PD_SEC = (function () {
  const KEY_NAME = 'pd_dek_v1';        // device data-encryption key (base64 raw)
  const PREFIX = 'enc:v1:';
  const available = !!(window.crypto && window.crypto.subtle);
  let _keyPromise = null;

  const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
  const unb64 = (str) => Uint8Array.from(atob(str), c => c.charCodeAt(0));

  async function getKey() {
    if (_keyPromise) return _keyPromise;
    _keyPromise = (async () => {
      let raw = null;
      try { raw = localStorage.getItem(KEY_NAME); } catch (e) {}
      if (raw) {
        try { return await crypto.subtle.importKey('raw', unb64(raw), 'AES-GCM', false, ['encrypt', 'decrypt']); } catch (e) {}
      }
      const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
      try { localStorage.setItem(KEY_NAME, b64(await crypto.subtle.exportKey('raw', key))); } catch (e) {}
      return key;
    })();
    return _keyPromise;
  }

  async function encrypt(value) {
    if (!available) return JSON.stringify(value);     // graceful fallback
    const key = await getKey();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const data = new TextEncoder().encode(JSON.stringify(value));
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data);
    return PREFIX + b64(iv) + ':' + b64(ct);
  }

  async function decrypt(str) {
    if (typeof str !== 'string') return null;
    if (!str.startsWith(PREFIX)) { try { return JSON.parse(str); } catch (e) { return null; } }
    const parts = str.split(':');                       // enc:v1:iv:ct
    const key = await getKey();
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(parts[2]) }, key, unb64(parts[3]));
    return JSON.parse(new TextDecoder().decode(pt));
  }

  async function setItem(storageKey, value) {
    try { localStorage.setItem(storageKey, await encrypt(value)); } catch (e) {}
  }
  async function getItem(storageKey, fallback = null) {
    let raw = null;
    try { raw = localStorage.getItem(storageKey); } catch (e) {}
    if (raw == null) return fallback;
    try { const v = await decrypt(raw); return v == null ? fallback : v; } catch (e) { return fallback; }
  }
  function isEncrypted(storageKey) {
    try { return (localStorage.getItem(storageKey) || '').startsWith(PREFIX); } catch (e) { return false; }
  }

  return { encrypt, decrypt, setItem, getItem, isEncrypted, available, KEY_NAME };
})();

window.PD_SEC = PD_SEC;
