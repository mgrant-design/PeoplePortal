/* api/_shared/push.js — broadcast a live update to every connected client over the same
   SignalR hub the direct-notice push already uses (see api/notify/index.js, api/negotiate).
   Omitting `userId` on a signalRMessages entry sends to everyone, not just one person — that's
   the mechanism for "this changed, refresh your view" rather than "here's a notice for you". */

function broadcast(context, target, payload) {
  context.bindings.signalRMessages = [...(context.bindings.signalRMessages || []), { target, arguments: [payload] }];
}

module.exports = { broadcast };
