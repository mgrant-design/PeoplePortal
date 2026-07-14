/* api/resumeupload/index.js — store a raw résumé PDF in Azure Blob Storage.
   POST /api/resumeupload  { applicantId, filename, contentBase64 }
        → uploads the PDF into the `parsedResumes` blob container and returns a pointer:
          { name, blobPath, url, uploadedAt }
   The pointer is what the applicant record (api/applicants) keeps in its `resumes` list.

   Same sign-in checks as the other endpoints: valid Google token + domain lock, and the
   caller must be resolvable in the roster. The raw bytes never touch Cosmos — they live in
   Blob Storage, and only the pointer goes in the applicant record.

   Requires one Function-app setting: AZURE_STORAGE_CONNECTION_STRING (the storage account's
   connection string). The container is created on first use if it doesn't exist.

   NOTE: the container is created PRIVATE. This endpoint returns the blob's url as the
   pointer, but opening that url directly needs a signed link — that read/download step is
   NOT built here. */

const { verifyGoogleToken, tokenFromReq } = require('../_shared/auth');
const { loadRosterAndSupport } = require('../_shared/cosmos');
const { BlobServiceClient } = require('@azure/storage-blob');

const ALLOWED_DOMAINS = ['puredental.com', 'foureversmile.com', 'puredentallab.com'];
const CONTAINER = 'parsedResumes';

function safeName(n) {
  return (n || 'resume.pdf').replace(/[^a-z0-9._-]+/gi, '_').replace(/_+/g, '_').slice(-120);
}

module.exports = async function (context, req) {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Google-Token',
  };
  if (req.method === 'OPTIONS') { context.res = { status: 204, headers }; return; }

  let identity;
  try { identity = await verifyGoogleToken(tokenFromReq(req)); }
  catch (e) { context.res = { status: 401, headers, body: JSON.stringify({ error: 'Not authenticated', detail: e.message }) }; return; }
  if (!ALLOWED_DOMAINS.includes(identity.email.split('@')[1] || '')) {
    context.res = { status: 403, headers, body: JSON.stringify({ error: 'Domain not allowed' }) }; return;
  }

  const conn = process.env.AZURE_STORAGE_CONNECTION_STRING || '';
  if (!conn) { context.res = { status: 500, headers, body: JSON.stringify({ error: 'Missing AZURE_STORAGE_CONNECTION_STRING' }) }; return; }

  let input = req.body;
  if (typeof input === 'string') { try { input = JSON.parse(input); } catch (e) { input = null; } }
  if (!input || !input.contentBase64 || !input.applicantId) {
    context.res = { status: 400, headers, body: JSON.stringify({ error: 'Body must be { applicantId, filename, contentBase64 }' }) }; return;
  }

  try {
    // caller must exist in the roster (same gate as the other write paths)
    const { employees } = await loadRosterAndSupport();
    const me = employees.find(e => (e.workEmail || '').toLowerCase() === identity.email);
    if (!me) { context.res = { status: 403, headers, body: JSON.stringify({ error: 'No roster account for ' + identity.email }) }; return; }

    const buf = Buffer.from(input.contentBase64, 'base64');
    const svc = BlobServiceClient.fromConnectionString(conn);
    const container = svc.getContainerClient(CONTAINER);
    await container.createIfNotExists();

    const name = safeName(input.filename);
    const blobPath = `${input.applicantId}/${Date.now()}-${name}`;
    const block = container.getBlockBlobClient(blobPath);
    await block.upload(buf, buf.length, { blobHTTPHeaders: { blobContentType: 'application/pdf' } });

    context.res = { status: 200, headers, body: JSON.stringify({
      name: input.filename || name, blobPath, url: block.url, uploadedAt: new Date().toISOString(),
    }) };
  } catch (err) {
    context.res = { status: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
