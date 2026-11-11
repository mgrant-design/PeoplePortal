/* api/_shared/blobs.js — a blob container in the storage account named by
   AZURE_STORAGE_CONNECTION_STRING. */

function containerClient(name) {
  const conn = process.env.AZURE_STORAGE_CONNECTION_STRING || '';
  if (!conn) throw new Error('Missing AZURE_STORAGE_CONNECTION_STRING');
  const { BlobServiceClient } = require('@azure/storage-blob');
  return BlobServiceClient.fromConnectionString(conn).getContainerClient(name);
}

module.exports = { containerClient };
