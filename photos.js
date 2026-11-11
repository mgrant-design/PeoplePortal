/* photos.js — everyone's profile photos for the screens, from /api/photo. Which people have
   a photo is asked once; each photo is fetched the first time it is shown, and kept for the
   life of the page; a request that fails is tried again. Screens subscribe per person to
   hear when that person's photo arrives or changes. */
(function () {
  const photos = {};        // empId → data URL, or null when they have none
  const waiting = {};       // empId → the fetch in flight
  const subs = {};          // empId → Set of listeners
  let list = null;          // the promise of { empId: updatedAt }

  const tell = (id) => (subs[id] || new Set()).forEach(f => { try { f(); } catch (e) {} });
  const whoHasOne = () => {
    if (!list) list = window.pdApi('/api/photo').then(r => (r && r.photos) || {}).catch((e) => { list = null; throw e; });
    return list;
  };
  /* a request that failed (the server busy, a sign-in renewing) is tried again in 30 seconds,
     once for everyone it failed for, up to five tries a person */
  const again = new Set();
  const tries = {};         // empId → failed tries; after five the person shows initials until the page reloads
  let retry = null;
  const retryLater = (id) => {
    tries[id] = (tries[id] || 0) + 1;
    if (tries[id] >= 5) { photos[id] = null; tell(id); return; }
    again.add(id);
    if (retry) return;
    retry = setTimeout(() => { retry = null; const ids = [...again]; again.clear(); ids.forEach(i => window.PD_PHOTOS.load(i)); }, 30000);
  };

  window.PD_PHOTOS = {
    get(id) { return photos[id] || null; },
    load(id) {
      if (!id || id in photos || waiting[id]) return;
      waiting[id] = whoHasOne()
        .then(have => have[id] ? window.pdApi('/api/photo', { query: { id } }).then(r => (r && r.dataUrl) || null, e => { if (e && e.status === 404) return null; throw e; }) : null)
        .then(url => { delete waiting[id]; photos[id] = url; tell(id); }, () => { delete waiting[id]; retryLater(id); });
    },
    /* stores a data URL as this person's photo; resolves once the server has it */
    upload(id, dataUrl) {
      const m = /^data:([^;]+);base64,(.*)$/.exec(String(dataUrl || ''));
      if (!m) return Promise.reject(new Error('That file is not an image'));
      return window.pdApi('/api/photo', { method: 'POST', body: { contentType: m[1], contentBase64: m[2] } })
        .then(() => { photos[id] = dataUrl; tell(id); });
    },
    subscribe(id, fn) { (subs[id] = subs[id] || new Set()).add(fn); return () => subs[id].delete(fn); },
  };
})();
