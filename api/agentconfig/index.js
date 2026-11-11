/* api/agentconfig/index.js — read & write Riley's editable config (the Agent Dashboard).
   GET  /api/agentconfig                → { knowledge, routing, channels }
   POST /api/agentconfig  { section, value }
        → replace ONE section (knowledge | routing | channels) of the riley-config doc.

   This is what makes the Agent Dashboard's editor real: Riley's knowledge base, routing
   rules, and channel toggles move out of per-browser localStorage into Cosmos, so an edit
   made here changes Riley's answers for EVERYONE and survives a browser clear. The client
   (agent.jsx / buildRileySystem + answerFor) reads this same config, so the console is the
   live control surface, not a dead knob.

   No new container needed — the config lives as a single doc (id "riley-config",
   partition /type) in the existing `appState` collection, exactly like roster-support.

   Any signed-in staff member can read it, because Riley answers everyone. Only an admin
   can save, and saves use the doc's _etag so two editors can't overwrite each other. */

const { handler, resolveCaller, HttpError } = require('../_shared/caller');
const { cosmos, listAll, collPath } = require('../_shared/cosmos');

const SECTIONS = ['knowledge', 'routing', 'channels'];
const DOC_ID = 'riley-config';
const APP = collPath('appState');

module.exports = handler(['GET', 'POST'], async ({ req, body }) => {
  const c = await resolveCaller(req);
  // the config doc may not exist yet; the first save creates it
  const cfg = (await listAll(APP)).find(d => d.id === DOC_ID) || null;

  if (req.method === 'GET') {
    const doc = cfg || {};
    return { status: 200, body: { knowledge: doc.knowledge || [], routing: doc.routing || [], channels: doc.channels || [] } };
  }

  if (!c.access.flags.isAdmin) throw new HttpError(403, 'Only an administrator can edit the agent configuration');
  const input = body || {};
  if (!SECTIONS.includes(input.section) || !Array.isArray(input.value)) {
    throw new HttpError(400, 'Body must be { section: one of ' + SECTIONS.join('|') + ', value: [...] }');
  }
  // appState is partitioned by /type
  const base = cfg || { id: DOC_ID, type: DOC_ID };
  const next = { ...base, id: DOC_ID, type: base.type || DOC_ID, [input.section]: input.value, updatedBy: c.identity.email, updatedAt: new Date().toISOString() };
  const up = await cosmos({ verb: 'POST', resId: APP, path: `/${APP}/docs`, body: next, partitionKey: next.type, upsert: true, ifMatch: cfg ? cfg._etag : undefined });
  if (up.status === 412) throw new HttpError(409, 'Someone else just saved. Reload and try again.');
  if (up.status !== 200 && up.status !== 201) throw new Error('agent config write failed: ' + up.status);
  return { status: 200, body: { ok: true, [input.section]: input.value } };
});
