/* pdfparse.js — deterministic résumé parser for the ATS.
   Extracts real text from a PDF client-side (pdf.js, lazy-loaded from CDN) and
   pulls contact/identity fields with regex heuristics — NO AI. Reliable on
   email & phone; best-effort on name & address (recruiter reviews before save).

   window.PD_RESUME.parseFile(file) -> Promise<{ text, fields, empty, error? }>
     fields = { first, last, email, phone, address }
   window.PD_RESUME.extractText(file) -> Promise<string[]>  (reconstructed lines)
*/
window.PD_RESUME = (function () {
  'use strict';

  var PDFJS_URL = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
  var WORKER_URL = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  var _loading = null;

  function loadPdfJs() {
    if (window.pdfjsLib) { window.pdfjsLib.GlobalWorkerOptions.workerSrc = WORKER_URL; return Promise.resolve(window.pdfjsLib); }
    if (_loading) return _loading;
    _loading = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = PDFJS_URL;
      s.onload = function () {
        if (window.pdfjsLib) { window.pdfjsLib.GlobalWorkerOptions.workerSrc = WORKER_URL; resolve(window.pdfjsLib); }
        else reject(new Error('pdf.js loaded but pdfjsLib is missing'));
      };
      s.onerror = function () { reject(new Error('Could not load pdf.js')); };
      document.head.appendChild(s);
    });
    return _loading;
  }

  /* Reconstruct visual lines from a page's text items: group by rounded y,
     order top→bottom, then left→right, inserting a space where the x-gap
     between glyph runs is wide enough to be a real word break. */
  async function extractText(file) {
    var pdfjs = await loadPdfJs();
    var buf = await file.arrayBuffer();
    var doc = await pdfjs.getDocument({ data: buf }).promise;
    var lines = [];
    for (var p = 1; p <= doc.numPages; p++) {
      var page = await doc.getPage(p);
      var tc = await page.getTextContent();
      var rows = {};
      tc.items.forEach(function (it) {
        if (!it.str) return;
        var y = Math.round(it.transform[5]);
        (rows[y] = rows[y] || []).push({ x: it.transform[4], w: it.width || 0, s: it.str });
      });
      Object.keys(rows).map(Number).sort(function (a, b) { return b - a; }).forEach(function (y) {
        var items = rows[y].sort(function (a, b) { return a.x - b.x; });
        var line = '', prevEnd = null;
        items.forEach(function (o) {
          if (prevEnd != null && (o.x - prevEnd) > 1.2) line += ' ';
          line += o.s; prevEnd = o.x + o.w;
        });
        line = line.replace(/\s+/g, ' ').trim();
        if (line) lines.push(line);
      });
    }
    try { await doc.destroy(); } catch (e) {}
    return lines;
  }

  function cap(w) {
    if (!w) return '';
    return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
  }

  function normPhone(raw) {
    if (!raw) return '';
    var d = raw.replace(/\D/g, '');
    if (d.length === 11 && d[0] === '1') d = d.slice(1);
    if (d.length !== 10) return raw.trim();
    return '(' + d.slice(0, 3) + ') ' + d.slice(3, 6) + '-' + d.slice(6);
  }

  function nameFromFile(fn) {
    return (fn || '').replace(/\.[a-z0-9]+$/i, '').replace(/resume|resumé|cv|curriculum vitae/gi, ' ')
      .replace(/[_\-]+/g, ' ').replace(/\s+/g, ' ').trim();
  }

  var HEADER_RE = /(resume|résumé|curriculum vitae|\bcv\b|objective|summary|experience|education|skills|references|profile|contact|address|phone|email)/i;
  var PHONE_RE = /(?:\+?1[\s.\-]?)?\(?\d{3}\)?[\s.\-]?\d{3}[\s.\-]?\d{4}/;
  var PHONE_RE_G = /(?:\+?1[\s.\-]?)?\(?\d{3}\)?[\s.\-]?\d{3}[\s.\-]?\d{4}/g;
  var STREET_RE = /^\d+\s+\S|\b(st|street|ave|avenue|rd|road|blvd|dr|drive|ln|lane|ct|court|way|pkwy|parkway|hwy|apt|suite|ste|unit|pl|place|ter|terrace|cir|circle)\b/i;

  function parseFields(lines, fileName) {
    var text = lines.join('\n');

    var email = (text.match(/[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}/i) || [])[0] || '';

    var phone = '';
    var labelled = lines.find(function (l) { return /(cell|mobile|\bmob\b|phone|tel)\b/i.test(l) && PHONE_RE.test(l); });
    if (labelled) { var lm = labelled.match(PHONE_RE); if (lm) phone = lm[0]; }
    if (!phone) { var m = text.match(PHONE_RE_G); if (m) phone = m[0]; }
    phone = normPhone(phone);

    // Name: first plausible "First … Last" line near the top.
    var first = '', last = '';
    var top = lines.slice(0, 8);
    for (var i = 0; i < top.length; i++) {
      var l = top[i];
      if (!l || l.indexOf('@') >= 0 || /\d/.test(l) || HEADER_RE.test(l)) continue;
      var words = l.replace(/,.*$/, '').split(' ').filter(Boolean);
      if (words.length >= 2 && words.length <= 4 && words.every(function (w) { return /^[A-Za-z][A-Za-z.'\-]*$/.test(w); })) {
        first = cap(words[0]); last = cap(words[words.length - 1]); break;
      }
    }
    if (!first && email) {
      var lp = email.split('@')[0].split(/[._\-]+/).filter(Boolean);
      if (lp.length >= 2) { first = cap(lp[0]); last = cap(lp[1]); }
    }
    if (!first && fileName) {
      var fw = nameFromFile(fileName).split(' ').filter(Boolean);
      if (fw.length) { first = cap(fw[0]); last = cap(fw[fw.length - 1] || ''); }
    }

    // Address: anchor on a "City, ST 12345" line, prepend a street line above it.
    // Matched per-line (not against the joined text) so the city capture can't
    // cross a \n and swallow unrelated preceding lines when they contain commas.
    var address = '';
    var csz = null;
    for (var li = 0; li < lines.length && !csz; li++) {
      csz = lines[li].match(/([A-Za-z][A-Za-z.\s'\-]+),\s*([A-Z]{2})\s+(\d{5})(?:-\d{4})?/);
    }
    if (csz) {
      var idx = lines.findIndex(function (l) { return l.indexOf(csz[0]) >= 0; });
      var street = '';
      if (idx > 0) { var prev = lines[idx - 1]; if (STREET_RE.test(prev) && !HEADER_RE.test(prev)) street = prev; }
      var same = lines[idx] || csz[0];
      // If the street already sits on the same line as the city, keep the whole line.
      address = (street ? street + ', ' : '') + (STREET_RE.test(same) ? same : csz[0]);
    }

    return { first: first, last: last, email: email, phone: phone, address: address.trim() };
  }

  async function parseFile(file) {
    try {
      var lines = await extractText(file);
      var text = lines.join('\n');
      return { text: text, fields: parseFields(lines, file.name), empty: !text.trim() };
    } catch (e) {
      return { text: '', fields: { first: '', last: '', email: '', phone: '', address: '' }, empty: true, error: String((e && e.message) || e) };
    }
  }

  return { parseFile: parseFile, extractText: extractText, parseFields: parseFields };
})();
