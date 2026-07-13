/* roster-loader.js — loads the employee roster at RUNTIME from a configured
   source, BEFORE the app code runs. The roster is NOT hardcoded into this file
   or the bundled HTML — it's fetched when the page opens, so employee data never
   lives in the shipped HTML.

   Configure the source by setting window.PD_DATA_SOURCE before this script:

     window.PD_DATA_SOURCE = {
       type: 'json',   // 'json'  → fetch a URL returning the roster JSON
                       //            (Google Sheets via an Apps Script web app now,
                       //             Azure Cosmos / API later — same JSON shape)
                       // 'local' → use a window.HRDATA already on the page
       url:  'https://…'   // endpoint for type:'json'
     };

   The endpoint must return JSON shaped:
     { employees:[…], offices:[…], departments:[…], titles:[…],
       managers:[…], users:[…], offboarding:[…] }   (only employees[] is required)

   This runs as an ordinary (synchronous) script placed before the app's scripts,
   so window.HRDATA is populated by the time the app compiles and reads it.
*/
(function () {
  var EMPTY = { employees: [], offices: [], departments: [], titles: [], managers: [], users: [], offboarding: [] };

  function errorScreen(title, msg, showRetry) {
    var r = document.getElementById('root');
    if (!r) return;
    r.innerHTML =
      '<div style="position:fixed;inset:0;display:flex;align-items:center;justify-content:center;'
      + 'font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;background:#f4f6f8;color:#1f2933;padding:24px;z-index:9;">'
      + '<div style="max-width:440px;text-align:center;background:#fff;border:1px solid #e3e8ee;border-radius:16px;'
      + 'padding:34px 30px;box-shadow:0 8px 30px rgba(20,40,60,.08);">'
      + '<div style="font-size:30px;margin-bottom:12px;">' + (showRetry ? '⚠️' : '⚙️') + '</div>'
      + '<h2 style="font-size:18px;margin:0 0 8px;">' + title + '</h2>'
      + '<p style="font-size:13.5px;line-height:1.55;color:#52606d;margin:0;word-break:break-word;">' + msg + '</p>'
      + (showRetry
          ? '<button onclick="location.reload()" style="margin-top:18px;border:none;background:#0e7c88;color:#fff;'
            + 'font:600 13.5px/1 inherit;padding:10px 18px;border-radius:9px;cursor:pointer;">Try again</button>'
          : '')
      + '</div></div>';
  }

  function fail(title, msg, retry) {
    window.__PD_ROSTER_ERROR = msg || title;   // app.jsx checks this and skips mounting
    window.HRDATA = window.HRDATA || EMPTY;
    errorScreen(title, msg, retry !== false);
  }

  var cfg = window.PD_DATA_SOURCE || { type: 'local' };

  try {
    if (cfg.type === 'local') {
      if (!window.HRDATA || !Array.isArray(window.HRDATA.employees)) {
        fail('No roster loaded', 'This page is set to use a local roster but none was loaded.', false);
      }
    } else if (cfg.type === 'json') {
      if (!cfg.url) {
        fail('Connect your roster',
          'No roster source is set. Open the page’s data config and set <b>PD_DATA_SOURCE.url</b> to your '
          + 'Google Sheets / API endpoint that returns the roster JSON.', false);
      } else {
        var x = new XMLHttpRequest();
        x.open('GET', cfg.url, false);   // synchronous: blocks until the roster is in, before the app reads it
        x.send();
        if (x.status >= 200 && x.status < 300) {
          var data;
          try { data = JSON.parse(x.responseText); }
          catch (e) { data = null; }
          if (!data || !Array.isArray(data.employees) || data.employees.length === 0) {
            fail('Couldn’t load the roster', 'The roster endpoint responded but contained no employees[].');
          } else {
            window.HRDATA = Object.assign({}, EMPTY, data);
          }
        } else {
          fail('Couldn’t load the roster', 'The roster endpoint returned HTTP ' + (x.status || 0) + '.');
        }
      }
    } else {
      fail('Roster misconfigured', 'Unknown roster source type: "' + cfg.type + '".', false);
    }
  } catch (e) {
    fail('Couldn’t load the roster', (e && e.message) || String(e));
  }

  // Permissions now live in their own Cosmos container ("accessControl") and are folded
  // into the roster's users list server-side (api/roster). No client-side overlay.
})();
