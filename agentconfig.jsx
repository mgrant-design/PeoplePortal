/* agentconfig.jsx — client persistence for Riley's editable config (the Agent Dashboard):
   knowledge base, routing rules, and channel toggles.

   Talks to /api/agentconfig (Cosmos appState/riley-config). Mirrors orgconfig.jsx's
   fetch/push pattern and sends the Google token in X-Google-Token (Azure overwrites the
   standard Authorization header — same reason as /api/roster & /api/orgconfig).

   The single source of truth once an admin has edited it is Cosmos; the RILEY_* / AGENT_*
   constants in riley-data.jsx are only the initial SEED, used when the config doc doesn't
   exist yet (or off-prod where there's no /api). Both of Riley's paths — the live AI
   (buildRileySystem) and the offline fallback (answerFor) — read the loaded config, so an
   admin edit here changes Riley's answers everywhere, for everyone. */

const AGENT_SECTIONS = ['knowledge', 'routing', 'channels'];

async function fetchAgentConfig() {
  const token = (typeof window !== 'undefined' && window.PD_GOOGLE_TOKEN) || '';
  const res = await fetch('/api/agentconfig', { headers: { 'X-Google-Token': token } });
  if (!res.ok) throw new Error('agentconfig read failed (' + res.status + ')');
  return res.json(); // { knowledge, routing, channels }
}

/* Persist ONE section (knowledge | routing | channels). Throws 'conflict' on a 409 so the
   caller can refetch and retry; returns the server's echo of the saved section. */
async function saveAgentSection(section, value) {
  if (!AGENT_SECTIONS.includes(section)) throw new Error('unknown section: ' + section);
  const token = (typeof window !== 'undefined' && window.PD_GOOGLE_TOKEN) || '';
  const res = await fetch('/api/agentconfig', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Google-Token': token },
    body: JSON.stringify({ section, value }),
  });
  if (res.status === 409) throw new Error('conflict');
  if (!res.ok) { const b = await res.json().catch(() => ({})); throw new Error(b.error || ('save failed (' + res.status + ')')); }
  return res.json();
}

/* React hook owning Riley's config → { knowledge, routing, channels, save*, status }.
   - seeds from the riley-data.jsx constants so Riley works instantly and off-prod
   - hydrates from Cosmos on mount, replacing any section the server actually has
   - save*(next): optimistic local update, then writes that section to Cosmos
   - status: 'idle' | 'saving' | 'saved' | 'error' | 'conflict'
     ('error' means the local edit stuck but the server write didn't — e.g. off-prod) */
function useAgentConfig() {
  const [knowledge, setKnowledge] = useState(() => ((typeof RILEY_KNOWLEDGE !== 'undefined' && RILEY_KNOWLEDGE) || []).map(x => ({ ...x })));
  const [routing, setRouting] = useState(() => ((typeof RILEY_ROUTING !== 'undefined' && RILEY_ROUTING) || []).map(x => ({ ...x })));
  const [channels, setChannels] = useState(() => ((typeof AGENT_CHANNELS !== 'undefined' && AGENT_CHANNELS) || []).map(x => ({ ...x })));
  const [status, setStatus] = useState('idle');

  useEffect(() => {
    let alive = true;
    fetchAgentConfig().then(cfg => {
      if (!alive || !cfg) return;
      if (Array.isArray(cfg.knowledge) && cfg.knowledge.length) setKnowledge(cfg.knowledge);
      if (Array.isArray(cfg.routing) && cfg.routing.length) setRouting(cfg.routing);
      if (Array.isArray(cfg.channels) && cfg.channels.length) setChannels(cfg.channels);
    }).catch(() => { /* off-prod / no api → keep the seed */ });
    return () => { alive = false; };
  }, []);

  const mkSave = (section, setter) => useCallback(async (next) => {
    setter(next);                 // optimistic — UI + Riley update immediately
    setStatus('saving');
    try {
      await saveAgentSection(section, next);
      setStatus('saved');
      setTimeout(() => setStatus(s => (s === 'saved' ? 'idle' : s)), 1600);
    } catch (e) {
      setStatus(e.message === 'conflict' ? 'conflict' : 'error');
    }
  }, [section]);

  return {
    knowledge, routing, channels, status,
    saveKnowledge: mkSave('knowledge', setKnowledge),
    saveRouting: mkSave('routing', setRouting),
    saveChannels: mkSave('channels', setChannels),
  };
}

Object.assign(window, { fetchAgentConfig, saveAgentSection, useAgentConfig, AGENT_SECTIONS });
