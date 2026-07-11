/* api/negotiate/index.js — the SignalR handshake.

   The browser calls this FIRST, before it can open a live connection. We verify the
   Google sign-in token (same as every other endpoint), confirm the caller is only asking
   for a connection scoped to THEIR OWN identity, and hand back the connection info that
   the SignalR client library needs.

   Security: the connection is scoped to a userId (we use the email). Messages sent to
   that userId land only on that person's connection. To stop anyone from opening a
   connection as someone else, we require ?userId=<their email> and reject it unless it
   matches the verified token. So you can only listen as yourself. */

const { verifyGoogleToken, tokenFromReq } = require('../_shared/auth');

const ALLOWED = ['puredental.com', 'foureversmile.com', 'puredentallab.com'];

module.exports = async function (context, req, connectionInfo) {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Google-Token',
  };
  if (req.method === 'OPTIONS') { context.res = { status: 204, headers }; return; }

  let identity;
  try { identity = await verifyGoogleToken(tokenFromReq(req)); }
  catch (e) { context.res = { status: 401, headers, body: JSON.stringify({ error: 'Not authenticated' }) }; return; }

  if (!ALLOWED.includes(identity.email.split('@')[1] || '')) {
    context.res = { status: 403, headers, body: JSON.stringify({ error: 'Domain not allowed' }) }; return;
  }

  // The client must ask for a connection scoped to its own email — nobody else's.
  const claimed = ((req.query && req.query.userId) || '').toLowerCase();
  if (claimed !== identity.email) {
    context.res = { status: 403, headers, body: JSON.stringify({ error: 'userId must match your identity' }) }; return;
  }

  // connectionInfo was built by the signalRConnectionInfo binding, scoped to {query.userId}.
  context.res = { status: 200, headers, body: JSON.stringify(connectionInfo) };
};
