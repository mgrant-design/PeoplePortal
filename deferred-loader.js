/* deferred-loader.js — boot-time optimization.

   The login screen only needs a small "critical" set of modules. The ~35 post-login
   view modules (dashboard, scheduler, employee record, reports, etc.) are NOT needed
   until AFTER sign-in, so we don't let them block the login paint.

   index.html loads the critical modules as <script type="text/babel"> as usual, then
   app.jsx (the last critical module) renders the login screen and kicks off this loader
   for everything in window.__PD_DEFERRED. Each deferred file is fetched, compiled with
   the same Babel preset the inline text/babel path uses, and executed in global scope —
   exactly as if it had been a <script type="text/babel"> tag, just later.

   The whole thing resolves a single promise: window.__PD_MODULES_READY. App AWAITS that
   promise before it will show the authenticated Portal, so you can never enter into a
   half-loaded app — the login just paints fast, and entry waits (behind its existing
   loading spinner) only if the modules haven't finished yet. */

(function () {
  'use strict';

  // Compile + run one module in global scope. Returns a promise that resolves once the
  // module's <script> has executed (synchronous on append), with a paint yield after.
  async function loadOne(src) {
    var res = await fetch(src);
    if (!res.ok) throw new Error('fetch ' + src + ' → HTTP ' + res.status);
    var code = await res.text();
    // 'react' preset handles JSX; modern JS (optional chaining, spread, async) runs
    // natively in current browsers, matching the inline text/babel behavior.
    var out = window.Babel.transform(code, { presets: ['react'], filename: src }).code;
    var s = document.createElement('script');
    s.setAttribute('data-deferred-src', src);
    s.textContent = out;
    document.body.appendChild(s);          // executes now, in global scope
    // Yield to the event loop so the browser can paint between heavy compiles.
    await new Promise(function (r) { setTimeout(r, 0); });
  }

  // Load the list strictly in order (some modules define data others read at eval time,
  // e.g. *-data.jsx before their view). Never rejects — a bad module is logged and
  // skipped so one failure can't wedge the whole app.
  window.__PD_LOAD_DEFERRED = function (list) {
    var t0 = (window.performance && performance.now) ? performance.now() : Date.now();
    return (async function () {
      for (var i = 0; i < list.length; i++) {
        try { await loadOne(list[i]); }
        catch (e) { console.error('[deferred-loader] failed:', list[i], e); }
      }
      var t1 = (window.performance && performance.now) ? performance.now() : Date.now();
      try { console.info('[deferred-loader] ' + list.length + ' modules ready in ' + Math.round(t1 - t0) + 'ms'); } catch (e) {}
    })();
  };
})();
