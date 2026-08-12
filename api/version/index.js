/* api/version/index.js — what is actually deployed, and whether the API is intact.

   GET /api/version → { short, sha, build, builtAt, node, functions, unregistered, healthy }

   Deliberately has NO dependencies: no auth, no Cosmos, no shared helpers. It has to
   answer when those are the things that are broken, and it has to answer before anyone
   signs in. Nothing here is secret — the repo is public and endpoint names are
   discoverable by probing — so it exposes build metadata and route names only, never
   configuration or environment values.

   `unregistered` is the self-check. An endpoint folder with an index.js but no
   function.json is invisible to the Functions runtime and 404s at runtime, which is
   exactly how /api/reghours and /api/scheduleimport silently failed. This lists them
   instead of waiting for someone to notice a broken feature. */

const fs = require('fs');
const path = require('path');

module.exports = async function (context, req) {
  const headers = {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
  if (req.method === 'OPTIONS') { context.res = { status: 204, headers }; return; }

  /* written by the deploy workflow; absent when running from a plain checkout */
  let version = {};
  try { version = JSON.parse(fs.readFileSync(path.join(__dirname, 'version.json'), 'utf8')); }
  catch (e) { version = { short: null, sha: null, build: null, builtAt: null }; }

  /* every sibling endpoint folder, and whether the runtime can see it */
  let routes = [];
  try {
    const apiRoot = path.join(__dirname, '..');
    routes = fs.readdirSync(apiRoot, { withFileTypes: true })
      .filter(d => d.isDirectory() && d.name !== 'node_modules' && !d.name.startsWith('_') && !d.name.startsWith('.'))
      .map(d => ({ name: d.name, registered: fs.existsSync(path.join(apiRoot, d.name, 'function.json')) }))
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch (e) { routes = []; }

  const unregistered = routes.filter(r => !r.registered).map(r => r.name);

  context.res = {
    status: 200,
    headers,
    body: JSON.stringify({
      short: version.short || null,
      sha: version.sha || null,
      build: version.build != null ? version.build : null,
      builtAt: version.builtAt || null,
      node: process.version,
      functions: routes.length,
      unregistered,
      healthy: routes.length > 0 && unregistered.length === 0,
    }),
  };
};
