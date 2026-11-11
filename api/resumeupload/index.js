/* api/resumeupload/index.js — store a raw résumé PDF in Azure Blob Storage.
   POST /api/resumeupload  { applicantId, filename, contentBase64 }
        → uploads the PDF into the `parsedresumes` blob container and returns a pointer:
          { name, blobPath, url, uploadedAt }
   The pointer is what the applicant record (api/applicants) keeps in its `resumes` list.

   Only people who can recruit may upload. The raw bytes live in Blob Storage, and only the
   pointer goes in the applicant record.

   Requires one Function-app setting: AZURE_STORAGE_CONNECTION_STRING (the storage account's
   connection string). The container is created on first use if it doesn't exist.

   NOTE: the container is created PRIVATE. This endpoint returns the blob's url as the
   pointer, but opening that url directly needs a signed link — that read/download step is
   NOT built here. */

const { handler, resolveCaller, HttpError } = require('../_shared/caller');
const blobs = require('../_shared/blobs');

const CONTAINER = 'parsedresumes';

function safeName(n) {
  return (n || 'resume.pdf').replace(/[^a-z0-9._-]+/gi, '_').replace(/_+/g, '_').slice(-120);
}

module.exports = handler(['POST'], async ({ req, body }) => {
  const c = await resolveCaller(req);
  if (!c.access.caps.recruiting) throw new HttpError(403, 'Only people who can recruit can upload résumés');
  const input = body || {};
  if (!input.contentBase64 || !input.applicantId) throw new HttpError(400, 'Body must be { applicantId, filename, contentBase64 }');
  const buf = Buffer.from(input.contentBase64, 'base64');
  const container = blobs.containerClient(CONTAINER);
  await container.createIfNotExists();
  const name = safeName(input.filename);
  const blobPath = `${input.applicantId}/${Date.now()}-${name}`;
  const block = container.getBlockBlobClient(blobPath);
  await block.upload(buf, buf.length, { blobHTTPHeaders: { blobContentType: 'application/pdf' } });
  return { status: 200, body: { name: input.filename || name, blobPath, url: block.url, uploadedAt: new Date().toISOString() } };
});
