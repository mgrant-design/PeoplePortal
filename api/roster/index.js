/* api/roster/index.js
   Azure Function — GET /api/roster
   Reads the employee roster from Cosmos DB and returns it in the shape
   that roster-loader.js expects:
   { employees:[…], offices:[…], departments:[…], titles:[…],
     managers:[…], users:[…], offboarding:[…] }

   Environment variables (set in Azure App Settings, sourced from Key Vault):
     COSMOS_ENDPOINT   — e.g. https://cosmos-pdpp-prod.documents.azure.com:443/
     COSMOS_KEY        — the primary read-write key from Cosmos DB → Keys
     COSMOS_DB         — portal
     COSMOS_CONTAINER  — roster
*/

const { CosmosClient } = require('@azure/cosmos');

const client = new CosmosClient({
  endpoint: process.env.COSMOS_ENDPOINT,
  key: process.env.COSMOS_KEY,
});

const db        = process.env.COSMOS_DB        || 'portal';
const container = process.env.COSMOS_CONTAINER || 'roster';

module.exports = async function (context, req) {
  // --- CORS: allow the SWA origin and localhost dev ---
  const origin = req.headers['origin'] || '';
  const allowed = [
    process.env.APP_ORIGIN || '',   // e.g. https://pdpp-prod.azurestaticapps.net
    'http://localhost:3000',
    'http://127.0.0.1:5500',
  ].filter(Boolean);

  const corsOrigin = allowed.includes(origin) ? origin : (allowed[0] || '*');

  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': corsOrigin,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Cache-Control': 'no-store',
  };

  // Pre-flight
  if (req.method === 'OPTIONS') {
    context.res = { status: 204, headers };
    return;
  }

  try {
    const { resources } = await client
      .database(db)
      .container(container)
      .items
      .query('SELECT * FROM c')
      .fetchAll();

    // Cosmos adds internal fields (_rid, _self, _etag, _ts) — strip them
    const clean = resources.map(({ _rid, _self, _etag, _attachments, _ts, ...emp }) => emp);

    // Group into the HRDATA shape roster-loader.js expects.
    // All sub-arrays are stored as separate document types in the same container,
    // distinguished by a 'docType' field. Employees have no docType (or docType:'employee').
    const employees   = clean.filter(r => !r.docType || r.docType === 'employee');
    const offices     = clean.filter(r => r.docType === 'office').map(r => { const { docType, ...o } = r; return o; });
    const departments = clean.filter(r => r.docType === 'department').map(r => r.name || r);
    const titles      = clean.filter(r => r.docType === 'title').map(r => r.name || r);
    const managers    = clean.filter(r => r.docType === 'manager').map(r => { const { docType, ...m } = r; return m; });
    const users       = clean.filter(r => r.docType === 'user').map(r => { const { docType, ...u } = r; return u; });
    const offboarding = clean.filter(r => r.docType === 'offboarding').map(r => { const { docType, ...o } = r; return o; });

    context.res = {
      status: 200,
      headers,
      body: JSON.stringify({ employees, offices, departments, titles, managers, users, offboarding }),
    };
  } catch (err) {
    context.log.error('Roster fetch error:', err.message);
    context.res = {
      status: 500,
      headers,
      body: JSON.stringify({ error: 'Failed to load roster', detail: err.message }),
    };
  }
};
