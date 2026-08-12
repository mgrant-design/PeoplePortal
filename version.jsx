/* version.jsx — the deployed commit.

   `version.json` is written by the deploy workflow, not by hand: the values come from
   the commit being deployed, so there is no step anyone can forget and the number
   cannot drift from what is actually live. The short SHA is what shows on screen —
   compare it to the commit that was pushed and you know whether it landed.

   STALENESS IS THE ONLY FAILURE THAT MATTERS. A SHA showing the previous deploy is
   worse than showing nothing, because it is trusted. Three defences, all required,
   because any one of them alone can be defeated:
     1. staticwebapp.config.json sends `no-cache, must-revalidate` for /version.json
     2. the fetch below passes cache:'no-store'
     3. a ?t= cache-buster, for proxies that ignore both of the above
   The in-memory cache holds only for the life of one page load — a reload always
   re-fetches, because reloading is exactly the gesture someone makes to ask
   "has it landed yet?"

   Loaded as a CRITICAL module (before login.jsx) since the login screen renders it. */

let VERSION_CACHE = null;
let VERSION_PROMISE = null;

function fetchBuildInfo() {
  if (VERSION_CACHE) return Promise.resolve(VERSION_CACHE);
  if (!VERSION_PROMISE) {
    VERSION_PROMISE = fetch('/version.json?t=' + Date.now(), { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null))
      .then(v => { VERSION_CACHE = v; return v; })
      .catch(() => null);
  }
  return VERSION_PROMISE;
}

/* the short commit SHA, or null until it resolves / if it can't be read */
function useBuildSha() {
  const [info, setInfo] = useState(VERSION_CACHE);
  useEffect(() => {
    let alive = true;
    fetchBuildInfo().then(v => { if (alive) setInfo(v); });
    return () => { alive = false; };
  }, []);
  const s = info && String(info.short || '').trim();
  return /^[0-9a-f]{7,40}$/i.test(s || '') ? s : null;
}

/* Deliberately quiet: mono, small, muted. Renders nothing at all until the SHA is
   known, so a failed fetch shows blank rather than a wrong or placeholder value. */
function BuildTag({ style }) {
  const sha = useBuildSha();
  if (!sha) return null;
  return (
    <div className="mono" title="Deployed commit" style={{ fontSize: 10.5, color: 'var(--ink-3)', opacity: 0.65, letterSpacing: '.04em', userSelect: 'text', ...style }}>
      {sha}
    </div>
  );
}

Object.assign(window, { fetchBuildInfo, useBuildSha, BuildTag });
