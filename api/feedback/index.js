/* api/feedback/index.js — feature requests and the roadmap ("feedback" container, partition key /id).
   Managers and above can view; only admins submit, vote, comment, react, set status and delete. */

const { handler, resolveCaller } = require('../_shared/caller');
const { cosmos, listAll, strip, collPath } = require('../_shared/cosmos');
const { broadcast } = require('../_shared/push');
const { writeNotice } = require('../_shared/notices');

const STATUSES = ['Submitted', 'Under review', 'Planned', 'In progress', 'Complete', 'Declined'];
const CATS = ['Dashboard', 'Applicants', 'My onboarding', 'Directory', 'Scheduling', 'My schedule', 'Time clock', 'Reviews', 'Reports', 'Agent Automations', 'Offboarding', 'Offices', 'Organization', 'Security', 'Modules', 'Roadmap', 'Ask Riley', 'Ask HR', 'Learning Library', 'Scrubs', 'Other'];

/* Fire a direct notice to one person about activity on a feature request, and push it live on
   the same SignalR channel the client already listens on. Written through the shared notice
   writer (feedback is company-wide, so this bypasses /api/notify's office scoping). Never
   notifies you about your own action, and never fails the comment/reaction if the notice does.
   category: 'mention' (comments/replies — badge + ding) or 'social' (reactions — quiet). */
async function notifyRecipient(context, { toEmail, toName, fromEmail, fromName, title, body, category, feedbackId, id }) {
  const to = (toEmail || '').toLowerCase();
  if (!to || to === (fromEmail || '').toLowerCase()) return;
  try {
    await writeNotice(context, { id, to, from: { email: fromEmail, name: fromName }, toName, title, body, category: category || 'mention', deepLink: { view: 'feedback', feedbackId } });
  } catch (e) { context.log.warn('feedback notice failed', e); }
}

module.exports = handler(['GET', 'POST'], async ({ context, req, body }) => {
  const c = await resolveCaller(req);
  const { identity, me } = c;
  const coll = collPath('feedback');
  // voters stays server-only (no reason to expose the full list to every viewer), but each
  // caller needs to know if THEY already voted — otherwise the client can't restore that
  // state after a refresh and a returning voter can trigger a phantom local re-vote.
  // ballots: server-only [{ e, v }] with v ∈ {-1,1,2} (down / up / double-up), one per person.
  // Legacy `voters` (plain emails) count as +1 each until the doc is next written.
  const ballotsOf = doc => {
    const out = (doc.ballots || []).filter(b => b && b.e && b.v).map(b => ({ e: b.e, v: b.v }));
    const seen = new Set(out.map(b => b.e));
    (doc.voters || []).forEach(e => { if (e && !seen.has(e)) { out.push({ e, v: 1 }); seen.add(e); } });
    return out;
  };
  const clean = doc => {
    const { voters, ballots, ...rest } = doc;
    const b = ballotsOf(doc);
    const up = b.reduce((s, x) => s + (x.v > 0 ? x.v : 0), 0);
    const down = b.reduce((s, x) => s + (x.v < 0 ? -x.v : 0), 0);
    return { ...rest, votes: up - down, upCount: up, downCount: down, myVote: (b.find(x => x.e === identity.email) || {}).v || 0 };
  };

    const admin = c.access.flags.isAdmin;
    if (!c.access.caps.feedbackView) return { status: 403, body: { error: 'Not allowed to view feature requests' } };
    const myName = me.name || `${me.first || ''} ${me.last || ''}`.trim() || identity.email;

    /* ---------- READ ---------- */
    if (req.method === 'GET') {
      // listAll follows continuation tokens — a plain single-page GET silently drops
      // documents once the container grows past one page (see _shared/cosmos.js).
      const docs = (await listAll(coll)).map(strip).map(clean).sort((a, b) => (b.votes || 0) - (a.votes || 0));
      // Attach a comment count per request so the card badge shows without opening the
      // thread. One doc per post in feedbackComments (id = post id), holding the array.
      let counts = {};
      try {
        (await listAll(collPath('feedbackComments'))).forEach(d => { counts[d.id] = ((d.comments || []).length) || 0; });
      } catch (e) { /* container may be empty/absent — counts default to 0 */ }
      docs.forEach(d => { d.commentCount = counts[d.id] || 0; });
      return { status: 200, body: { items: docs } };
    }

    /* ---------- WRITE ---------- */
    const input = body;
    if (!input || !input.action) { return { status: 400, body: { error: 'action is required' } }; }
    // Reads (fetch a file / a thread) are fine for any viewer; everything else mutates and is
    // admin-only. Non-admin managers get read-only access to the section.
    if (!['getAttachment', 'getComments'].includes(input.action) && !admin) { return { status: 403, body: { error: 'Admin only' } }; }

    if (input.action === 'submit') {
      if (!input.title || !String(input.title).trim()) { return { status: 400, body: { error: 'title is required' } }; }
      // Optional gif: only a Giphy CDN URL is stored (no bytes). Restrict to Giphy hosts so
      // this field can't be turned into an arbitrary-image / tracking-pixel vector.
      let gifMeta = null;
      if (input.gif && input.gif.url && /^https:\/\/(media[0-9]*\.giphy\.com|i\.giphy\.com)\//.test(String(input.gif.url))) {
        gifMeta = {
          url: String(input.gif.url).slice(0, 500),
          width: Number(input.gif.width) || 0,
          height: Number(input.gif.height) || 0,
          title: String(input.gif.title || 'gif').slice(0, 200),
        };
      }
      const doc = {
        id: 'fr-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
        title: String(input.title).trim().slice(0, 200),
        desc: String(input.desc || '').trim().slice(0, 2000),
        cat: (input.cat === 'Other' && input.catOther) ? (String(input.catOther).trim().slice(0, 60) || 'Other') : (CATS.includes(input.cat) ? input.cat : 'Other'),
        by: myName, byEmail: identity.email,
        status: 'Submitted', eta: '',
        ballots: [{ e: identity.email, v: 1 }],
        createdAt: new Date().toISOString(),
      };
      // Attachments: up to 5, each ≤ ~1.4 MB. Metadata (with a per-file id) rides on the doc as
      // an array; each file's bytes go to their OWN doc in feedback-attachments (keyed by that
      // file id, not the request id), so the feed stays light and files are fetched on demand.
      const rawAtts = Array.isArray(input.attachments) ? input.attachments : (input.attachment ? [input.attachment] : []);
      const incoming = rawAtts.filter(a => a && a.contentBase64).slice(0, 5);
      const attFiles = [];
      for (const a of incoming) {
        // Cosmos caps a document at 2 MB; base64 inflates ~37%, so refuse per-file overflow.
        if (String(a.contentBase64).length > 1900000) { return { status: 413, body: { error: 'Attachment too large — max ~1.4 MB each.' } }; }
        attFiles.push({ fileId: doc.id + '-' + attFiles.length + '-' + Math.random().toString(36).slice(2, 7), name: String(a.name || 'file').slice(0, 255), size: Number(a.size) || 0, type: String(a.type || 'application/octet-stream').slice(0, 120), b64: String(a.contentBase64) });
      }
      if (attFiles.length) doc.attachments = attFiles.map(({ b64, ...m }) => m);
      if (gifMeta) doc.gif = gifMeta;
      const up = await cosmos({ verb: 'POST', resId: coll, path: `/${coll}/docs`, body: doc, partitionKey: doc.id, upsert: true });
      if (up.status !== 200 && up.status !== 201) { throw new Error('feedback submit failed: ' + up.status); }
      if (attFiles.length) {
        const attColl = collPath('feedback-attachments');
        for (const f of attFiles) {
          const attDoc = { id: f.fileId, reqId: doc.id, name: f.name, size: f.size, type: f.type, contentBase64: f.b64 };
          const ua = await cosmos({ verb: 'POST', resId: attColl, path: `/${attColl}/docs`, body: attDoc, partitionKey: f.fileId, upsert: true });
          if (ua.status !== 200 && ua.status !== 201) {
            // roll back the request AND any files already written so nothing half-shows / orphans
            await cosmos({ verb: 'DELETE', resId: `${coll}/docs/${doc.id}`, path: `/${coll}/docs/${doc.id}`, partitionKey: doc.id }).catch(() => {});
            for (const g of attFiles) await cosmos({ verb: 'DELETE', resId: `${attColl}/docs/${g.fileId}`, path: `/${attColl}/docs/${g.fileId}`, partitionKey: g.fileId }).catch(() => {});
            throw new Error('feedback attachment save failed: ' + ua.status);
          }
        }
      }
      return { status: 200, body: { ok: true, item: clean(strip(up.body)) } };
    }

    if (input.action === 'getAttachment') {
      const key = input.fileId || input.id;
      if (!key) { return { status: 400, body: { error: 'id is required' } }; }
      const attColl = collPath('feedback-attachments');
      const r = await cosmos({ verb: 'GET', resId: `${attColl}/docs/${key}`, path: `/${attColl}/docs/${key}`, partitionKey: key });
      if (r.status !== 200) { return { status: 404, body: { error: 'attachment not found' } }; }
      const a = strip(r.body);
      return { status: 200, body: { ok: true, name: a.name, type: a.type, size: a.size, contentBase64: a.contentBase64 } };
    }

    if (input.action === 'getComments') {
      if (!input.id) { return { status: 400, body: { error: 'id is required' } }; }
      const cColl = collPath('feedbackComments');
      const r = await cosmos({ verb: 'GET', resId: `${cColl}/docs/${input.id}`, path: `/${cColl}/docs/${input.id}`, partitionKey: input.id });
      const comments = r.status === 200 ? (strip(r.body).comments || []) : [];
      return { status: 200, body: { ok: true, comments } };
    }

    if (input.action === 'addComment') {
      if (!input.id) { return { status: 400, body: { error: 'id is required' } }; }
      const text = String(input.text || '').trim().slice(0, 2000);
      const cColl = collPath('feedbackComments');
      // Optional gif on the comment: Giphy CDN URL only, same host restriction as requests.
      let cGif = null;
      if (input.gif && input.gif.url && /^https:\/\/(media[0-9]*\.giphy\.com|i\.giphy\.com)\//.test(String(input.gif.url))) {
        cGif = { url: String(input.gif.url).slice(0, 500), width: Number(input.gif.width) || 0, height: Number(input.gif.height) || 0, title: String(input.gif.title || 'gif').slice(0, 200) };
      }
      if (!text && !cGif) { return { status: 400, body: { error: 'comment text is required' } }; }
      const parentId = input.parentId ? String(input.parentId).slice(0, 80) : null;
      const comment = { id: 'c-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7), by: myName, byEmail: identity.email, text, createdAt: new Date().toISOString() };
      if (cGif) comment.gif = cGif;
      // One doc per post holds all its comments, so appending is a read-modify-write on that
      // single doc — guard it with the doc's _etag (If-Match) and retry on 412 so two people
      // commenting at once never clobber each other.
      let saved = null;
      for (let attempt = 0; attempt < 4 && !saved; attempt++) {
        const cur = await cosmos({ verb: 'GET', resId: `${cColl}/docs/${input.id}`, path: `/${cColl}/docs/${input.id}`, partitionKey: input.id });
        const exists = cur.status === 200;
        const etag = exists ? cur.body._etag : null;
        const doc = exists ? strip(cur.body) : { id: input.id, comments: [] };
        // single-level threading: a reply attaches to a top-level comment; a reply to a reply
        // is normalized up to that reply's parent so nesting never exceeds one level.
        if (parentId) { const p = (doc.comments || []).find(c => c.id === parentId); comment.parentId = p && p.parentId ? p.parentId : parentId; }
        doc.comments = [...(doc.comments || []), comment];
        const wr = await cosmos({ verb: 'POST', resId: cColl, path: `/${cColl}/docs`, body: doc, partitionKey: input.id, upsert: true, ifMatch: etag || undefined });
        if (wr.status === 200 || wr.status === 201) { saved = strip(wr.body); break; }
        if (wr.status !== 412) { throw new Error('feedback comment save failed: ' + wr.status); }
        // 412 = someone else wrote first; loop re-reads and retries.
      }
      if (!saved) { return { status: 409, body: { error: 'Too busy — try again.' } }; }
      // Notify: a reply pings the parent comment's author; a top-level comment pings the
      // request's author. Both are 'mention' (badge + ding). Self-actions are skipped inside.
      const cBody = text || (cGif ? 'sent a GIF' : '');
      if (comment.parentId) {
        const parent = (saved.comments || []).find(c => c.id === comment.parentId);
        if (parent) await notifyRecipient(context, { toEmail: parent.byEmail, toName: parent.by, fromEmail: identity.email, fromName: myName, title: `${myName} replied to your comment`, body: cBody, category: 'mention', feedbackId: input.id });
      } else {
        const rq = await cosmos({ verb: 'GET', resId: `${coll}/docs/${input.id}`, path: `/${coll}/docs/${input.id}`, partitionKey: input.id });
        if (rq.status === 200) { const rd = strip(rq.body); await notifyRecipient(context, { toEmail: rd.byEmail, toName: rd.by, fromEmail: identity.email, fromName: myName, title: `${myName} commented on “${rd.title || 'your request'}”`, body: cBody, category: 'mention', feedbackId: input.id }); }
      }
      return { status: 200, body: { ok: true, comment, comments: saved.comments || [] } };
    }

    if (input.action === 'deleteComment') {
      if (!input.id || !input.commentId) { return { status: 400, body: { error: 'id and commentId are required' } }; }
      const cColl = collPath('feedbackComments');
      const cur = await cosmos({ verb: 'GET', resId: `${cColl}/docs/${input.id}`, path: `/${cColl}/docs/${input.id}`, partitionKey: input.id });
      if (cur.status !== 200) { return { status: 404, body: { error: 'no comments' } }; }
      const doc = strip(cur.body);
      const target = (doc.comments || []).find(c => c.id === input.commentId);
      if (!target) { return { status: 404, body: { error: 'comment not found' } }; }
      // A commenter may delete their own. Only the author may delete a comment.
      if (target.byEmail !== identity.email) { return { status: 403, body: { error: 'Not allowed' } }; }
      doc.comments = (doc.comments || []).filter(c => c.id !== input.commentId);
      const wr = await cosmos({ verb: 'POST', resId: cColl, path: `/${cColl}/docs`, body: doc, partitionKey: input.id, upsert: true, ifMatch: cur.body._etag });
      if (wr.status !== 200 && wr.status !== 201) { throw new Error('feedback delete failed: ' + wr.status); }
      return { status: 200, body: { ok: true, comments: strip(wr.body).comments || [] } };
    }

    if (input.action === 'reactComment') {
      if (!input.id || !input.commentId) { return { status: 400, body: { error: 'id and commentId are required' } }; }
      const REACTIONS = ['heart', 'up', 'down', 'laugh', 'fire'];
      if (!REACTIONS.includes(input.emoji)) { return { status: 400, body: { error: 'invalid reaction' } }; }
      const cColl = collPath('feedbackComments');
      // read-modify-write on the one comments doc, etag-guarded + retried, same as addComment.
      let saved = null;
      let didAdd = false;
      for (let attempt = 0; attempt < 4 && !saved; attempt++) {
        const cur = await cosmos({ verb: 'GET', resId: `${cColl}/docs/${input.id}`, path: `/${cColl}/docs/${input.id}`, partitionKey: input.id });
        if (cur.status !== 200) { return { status: 404, body: { error: 'no comments' } }; }
        const doc = strip(cur.body);
        const target = (doc.comments || []).find(c => c.id === input.commentId);
        if (!target) { return { status: 404, body: { error: 'comment not found' } }; }
        const r = target.reactions || {};
        // one reaction per person: clear this person from every emoji first, then set the chosen
        // one — unless they already had it, which makes this a toggle-off.
        const had = (r[input.emoji] || []).includes(identity.email);
        REACTIONS.forEach(k => { if (r[k]) r[k] = r[k].filter(e => e !== identity.email); });
        if (!had) r[input.emoji] = [...(r[input.emoji] || []), identity.email];
        didAdd = !had;
        REACTIONS.forEach(k => { if (r[k] && r[k].length === 0) delete r[k]; });
        target.reactions = r;
        const wr = await cosmos({ verb: 'POST', resId: cColl, path: `/${cColl}/docs`, body: doc, partitionKey: input.id, upsert: true, ifMatch: cur.body._etag });
        if (wr.status === 200 || wr.status === 201) { saved = strip(wr.body); break; }
        if (wr.status !== 412) { throw new Error('feedback reaction save failed: ' + wr.status); }
      }
      if (!saved) { return { status: 409, body: { error: 'Too busy — try again.' } }; }
      // Notify the comment's author — only when a reaction was ADDED (not toggled off). 'social'
      // so it lands quietly (no badge, no ding). One notice per comment (stable id) groups
      // repeat reactions into a single “N people reacted” entry that re-surfaces on each new one.
      if (didAdd) {
        const tc = (saved.comments || []).find(c => c.id === input.commentId);
        if (tc) {
          const total = REACTIONS.reduce((n, k) => n + ((tc.reactions || {})[k] || []).length, 0);
          await notifyRecipient(context, { id: 'nt-rx-' + input.commentId, toEmail: tc.byEmail, toName: tc.by, fromEmail: identity.email, fromName: myName, title: 'New reaction on your comment', body: `${total} ${total === 1 ? 'person has' : 'people have'} reacted to your comment.`, category: 'social', feedbackId: input.id });
        }
      }
      return { status: 200, body: { ok: true, comments: saved.comments || [] } };
    }

    // remaining actions operate on an existing doc
    if (!input.id) { return { status: 400, body: { error: 'id is required' } }; }
    const docRes = await cosmos({ verb: 'GET', resId: `${coll}/docs/${input.id}`, path: `/${coll}/docs/${input.id}`, partitionKey: input.id });
    if (docRes.status !== 200) { return { status: 404, body: { error: 'request not found' } }; }
    const item = strip(docRes.body);

    let next;
    if (input.action === 'vote') {
      // Directional, capped, mutually-exclusive: a person's ballot is a single value in
      // {-1,0,1,2}. Up moves +1 toward the cap of 2; down moves −1 toward the floor of −1;
      // 0 clears the ballot. So a third up-click is a no-op, and one down-click on your +2
      // takes you to +1. Never both directions at once — it's one signed value per person.
      const dir = input.dir === 'down' ? 'down' : 'up';
      const b = ballotsOf(item);
      const cur = (b.find(x => x.e === identity.email) || {}).v || 0;
      const nv = dir === 'up' ? Math.min(cur + 1, 2) : Math.max(cur - 1, -1);
      const rest = b.filter(x => x.e !== identity.email);
      if (nv !== 0) rest.push({ e: identity.email, v: nv });
      const { voters: _legacy, ...base } = item;
      next = { ...base, ballots: rest };
    } else if (input.action === 'update') {
      if (!admin) { return { status: 403, body: { error: 'Admin only' } }; }
      next = { ...item };
      if (input.status !== undefined && STATUSES.includes(input.status)) {
        // stamp the archive date when an item moves into a terminal state (Complete/Declined)
        const terminal = input.status === 'Complete' || input.status === 'Declined';
        const wasTerminal = item.status === 'Complete' || item.status === 'Declined';
        if (terminal && !wasTerminal) next.completedAt = new Date().toISOString();
        next.status = input.status;
      }
      if (input.eta !== undefined) next.eta = String(input.eta).slice(0, 60);
    } else if (input.action === 'delete') {
      if (!admin) { return { status: 403, body: { error: 'Admin only' } }; }
      // Best-effort remove the attachment doc too (may not exist) so bytes don't orphan.
      const attColl = collPath('feedback-attachments');
      // legacy single doc (keyed by request id) + any per-file docs (multi-attachment model)
      await cosmos({ verb: 'DELETE', resId: `${attColl}/docs/${input.id}`, path: `/${attColl}/docs/${input.id}`, partitionKey: input.id }).catch(() => {});
      for (const f of (item.attachments || [])) { if (f && f.fileId) await cosmos({ verb: 'DELETE', resId: `${attColl}/docs/${f.fileId}`, path: `/${attColl}/docs/${f.fileId}`, partitionKey: f.fileId }).catch(() => {}); }
      // Best-effort remove this post's comment thread too.
      const cColl = collPath('feedbackComments');
      await cosmos({ verb: 'DELETE', resId: `${cColl}/docs/${input.id}`, path: `/${cColl}/docs/${input.id}`, partitionKey: input.id }).catch(() => {});
      const del = await cosmos({ verb: 'DELETE', resId: `${coll}/docs/${input.id}`, path: `/${coll}/docs/${input.id}`, partitionKey: input.id });
      if (del.status !== 204 && del.status !== 200 && del.status !== 404) { throw new Error('feedback delete failed: ' + del.status); }
      broadcast(context, 'feedback-changed', { id: input.id, action: 'delete' });
      return { status: 200, body: { ok: true, id: input.id } };
    } else {
      return { status: 400, body: { error: 'unknown action' } };
    }

    const up = await cosmos({ verb: 'POST', resId: coll, path: `/${coll}/docs`, body: next, partitionKey: next.id, upsert: true });
    if (up.status !== 200 && up.status !== 201) { throw new Error('feedback update failed: ' + up.status); }
    broadcast(context, 'feedback-changed', { id: next.id, action: input.action });
    return { status: 200, body: { ok: true, item: clean(strip(up.body)) } };
});
