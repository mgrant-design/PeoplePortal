/* api/negotiate/index.js — opens a live connection for the signed-in person only.
   ?userId must equal the caller's own email; the SignalR binding scopes the connection to it. */

const { handler, resolveCaller, HttpError } = require('../_shared/caller');

module.exports = handler(['GET', 'POST'], async ({ context, req }) => {
  const c = await resolveCaller(req);
  const claimed = String((req.query && req.query.userId) || '').toLowerCase();
  if (claimed !== c.identity.email) throw new HttpError(403, 'userId must match your identity');
  return { status: 200, body: context.bindings.connectionInfo };
});
