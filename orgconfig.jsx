/* orgconfig.jsx — client persistence for the shared org-config doc:
   offices, departments, titles, managers, users, offboarding.

   Talks to /api/orgconfig (Cosmos appState/roster-support). Mirrors appearance.jsx's
   fetch/push pattern and sends the Google token in X-Google-Token (Azure overwrites
   the standard Authorization header — same reason as /api/roster & /api/settings).

   These sections arrive with the roster at sign-in and live on window.HR. Writes here
   update window.HR in place (so every module that reads window.HR[section] sees the
   change immediately) and then persist to Cosmos. Off-prod (no /api) the write rejects
   and the hook surfaces status 'error' while keeping the local value, so sandbox UI
   work still functions — same graceful degradation as the schedule/coverage helpers. */

const ORG_SECTIONS = ['offices', 'departments', 'titles', 'managers', 'users', 'offboarding'];

async function fetchOrgConfig() {
  const token = (typeof window !== 'undefined' && window.PD_GOOGLE_TOKEN) || '';
  const res = await fetch('/api/orgconfig', { headers: { 'X-Google-Token': token } });
  if (!res.ok) throw new Error('orgconfig read failed (' + res.status + ')');
  return res.json(); // { offices, departments, titles, managers, users, offboarding }
}

/* Persist ONE section. Optimistically updates window.HR[section] in place, then writes
   to Cosmos. Throws 'conflict' on a 409 (someone else saved first) so the caller can
   refetch and retry. Returns the server's echo of the saved section. */
async function saveOrgSection(section, value) {
  if (!ORG_SECTIONS.includes(section)) throw new Error('unknown section: ' + section);
  if (window.HR) window.HR[section] = value;       // optimistic local update
  const token = (typeof window !== 'undefined' && window.PD_GOOGLE_TOKEN) || '';
  const res = await fetch('/api/orgconfig', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Google-Token': token },
    body: JSON.stringify({ section, value }),
  });
  if (res.status === 409) throw new Error('conflict');
  if (!res.ok) { const b = await res.json().catch(() => ({})); throw new Error(b.error || ('save failed (' + res.status + ')')); }
  return res.json();
}

/* React hook for one section → [value, save, status, setValue].
   - seeds from window.HR[section]
   - save(next): sets state, updates window.HR, writes to Cosmos
   - status: 'idle' | 'saving' | 'saved' | 'error' | 'conflict' */
function useOrgSection(section) {
  const [value, setValue] = useState(() => ((window.HR && window.HR[section]) || []).map(x => ({ ...x })));
  const [status, setStatus] = useState('idle');
  const save = useCallback(async (next) => {
    setValue(next);
    setStatus('saving');
    try {
      await saveOrgSection(section, next);
      setStatus('saved');
      setTimeout(() => setStatus(s => (s === 'saved' ? 'idle' : s)), 1600);
    } catch (e) {
      setStatus(e.message === 'conflict' ? 'conflict' : 'error');
    }
  }, [section]);
  return [value, save, status, setValue];
}

Object.assign(window, { fetchOrgConfig, saveOrgSection, useOrgSection, ORG_SECTIONS });
