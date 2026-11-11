/* orgconfig.jsx — client persistence for the shared org-config doc: the sections in
   ORG_SECTIONS.

   Talks to /api/orgconfig (Cosmos appState/roster-support) through pdApi.

   These sections arrive with the roster at sign-in and live on window.HR. Writes here
   update window.HR in place (so every module that reads window.HR[section] sees the
   change immediately) and then persist to Cosmos. Off-prod (no /api) the write rejects
   and the hook surfaces status 'error' while keeping the local value, so sandbox UI
   work still functions — same graceful degradation as the schedule helpers. */

const ORG_SECTIONS = ['offices', 'departments', 'titles', 'managers', 'offboarding', 'weekStart', 'refLinks', 'flags', 'approvers'];

function fetchOrgConfig() {
  return pdApi('/api/orgconfig'); // one key per section in ORG_SECTIONS
}

/* Persist ONE section. Sends the section as this screen last saw it, so the server can
   refuse with 409 when someone else saved first; on any failure window.HR goes back to
   what it was, and a conflict throws 'conflict'. Returns the server's echo of the saved section. */
async function saveOrgSection(section, value) {
  if (!ORG_SECTIONS.includes(section)) throw new Error('unknown section: ' + section);
  const previous = window.HR ? window.HR[section] : undefined;
  if (window.HR) window.HR[section] = value;       // optimistic local update
  try {
    return await pdApi('/api/orgconfig', { method: 'POST', body: { section, value, previous } });
  } catch (e) {
    if (window.HR) window.HR[section] = previous;   // only a saved value counts as what the server has
    if (e.status === 409) throw new Error('conflict');
    throw e;
  }
}

/* React hook for one section → [value, save, status, setValue].
   - seeds from window.HR[section]
   - save(next): sets state, updates window.HR, writes to Cosmos
   - status: 'idle' | 'saving' | 'saved' | 'error' | 'conflict' */
function useOrgSection(section) {
  const [value, setValue] = useState(() => ((window.HR && window.HR[section]) || []).map(x => ({ ...x })));
  const [status, setStatus] = useState('idle');
  const save = useCallback(async (next) => {
    const before = (window.HR && window.HR[section]) || [];
    setValue(next);
    setStatus('saving');
    try {
      await saveOrgSection(section, next);
      setStatus('saved');
      setTimeout(() => setStatus(s => (s === 'saved' ? 'idle' : s)), 1600);
    } catch (e) {
      if (e.message === 'conflict') { setValue(before.map(x => ({ ...x }))); setStatus('conflict'); }
      else setStatus('error');
    }
  }, [section]);
  return [value, save, status, setValue];
}

Object.assign(window, { fetchOrgConfig, saveOrgSection, useOrgSection, ORG_SECTIONS });
