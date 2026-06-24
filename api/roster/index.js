const { CosmosClient } = require('@azure/cosmos');

module.exports = async function (context, req) {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
  };

  if (req.method === 'OPTIONS') {
    context.res = { status: 204, headers };
    return;
  }

  // Check env vars are present
  if (!process.env.COSMOS_ENDPOINT || !process.env.COSMOS_KEY) {
    context.res = {
      status: 500,
      headers,
      body: JSON.stringify({ error: 'Missing COSMOS_ENDPOINT or COSMOS_KEY environment variables' })
    };
    return;
  }

  try {
    const client = new CosmosClient({
      endpoint: process.env.COSMOS_ENDPOINT,
      key: process.env.COSMOS_KEY,
    });

    const db = process.env.COSMOS_DB || 'portal';
    const containerName = process.env.COSMOS_CONTAINER || 'roster';

    const { resources } = await client
      .database(db)
      .container(containerName)
      .items
      .query('SELECT * FROM c')
      .fetchAll();

    const clean = resources.map(({ _rid, _self, _etag, _attachments, _ts, ...emp }) => emp);
    const employees = clean.filter(r => !r.docType || r.docType === 'employee');
    const offices = clean.filter(r => r.docType === 'office').map(({ docType, ...o }) => o);
    const managers = clean.filter(r => r.docType === 'manager').map(({ docType, ...m }) => m);
    const users = clean.filter(r => r.docType === 'user').map(({ docType, ...u }) => u);
    const offboarding = clean.filter(r => r.docType === 'offboarding').map(({ docType, ...o }) => o);

    context.res = {
      status: 200,
      headers,
      body: JSON.stringify({ employees, offices, departments: [], titles: [], managers, users, offboarding }),
    };
  } catch (err) {
    context.res = {
      status: 500,
      headers,
      body: JSON.stringify({ error: err.message, stack: err.stack }),
    };
  }
};
