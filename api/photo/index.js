/* api/photo/index.js — everyone's profile photo, visible to all signed-in staff.
   GET            → { photos: { empId: updatedAt } } for everyone who has one
   GET ?id=empId  → { id, dataUrl, updatedAt }, or 404
   POST { contentType, contentBase64 } → stores the caller's own photo
   Photos live in the `photos` blob container, one blob per person, named by employee id;
   the container is created on the first upload. Photos of people who have left (terminated,
   or no longer on the roster) are not served; terminating someone and the nightly cleanup
   delete them. */

const { handler, resolveCaller, HttpError } = require('../_shared/caller');
const blobs = require('../_shared/blobs');

const CONTAINER = 'photos';
const TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_BYTES = 400 * 1024;
const notFound = (e) => e && (e.statusCode === 404 || /NotFound/.test(e.code || e.message || ''));

module.exports = handler(['GET', 'POST'], async ({ req, body }) => {
  const c = await resolveCaller(req);
  const container = blobs.containerClient(CONTAINER);
  const staying = new Set(c.employees.filter(e => e.status !== 'Terminated').map(e => e.id));

  if (req.method === 'GET') {
    const id = String((req.query || {}).id || '');
    if (!id) {
      const photos = {};
      try {
        for await (const b of container.listBlobsFlat()) if (staying.has(b.name)) photos[b.name] = new Date(b.properties.lastModified).toISOString();
      } catch (e) { if (!notFound(e)) throw e; }
      return { status: 200, body: { photos } };
    }
    if (!/^[A-Za-z0-9_-]{1,60}$/.test(id)) throw new HttpError(400, 'id is not valid');
    if (!staying.has(id)) throw new HttpError(404, 'No photo');
    const blob = container.getBlockBlobClient(id);
    try {
      const props = await blob.getProperties();
      const buf = await blob.downloadToBuffer();
      return { status: 200, body: { id, dataUrl: `data:${props.contentType};base64,${buf.toString('base64')}`, updatedAt: new Date(props.lastModified).toISOString() } };
    } catch (e) {
      if (notFound(e)) throw new HttpError(404, 'No photo');
      throw e;
    }
  }

  const input = body || {};
  if (input.empId && input.empId !== c.me.id) throw new HttpError(403, 'You can only change your own photo');
  if (!TYPES.includes(input.contentType)) throw new HttpError(400, 'The photo must be a JPEG, PNG or WebP image');
  if (!input.contentBase64) throw new HttpError(400, 'contentBase64 is required');
  const buf = Buffer.from(String(input.contentBase64), 'base64');
  if (!buf.length || buf.length > MAX_BYTES) throw new HttpError(400, 'The photo must be under 400 KB');
  await container.createIfNotExists();
  await container.getBlockBlobClient(c.me.id).upload(buf, buf.length, { blobHTTPHeaders: { blobContentType: input.contentType } });
  return { status: 200, body: { ok: true, id: c.me.id } };
});
