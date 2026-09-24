const assert = require('node:assert/strict');
const Module = require('node:module');

const originalLoad = Module._load;
const routes = new Map();
let turn = 1;
let wrote = false;
let allowWrites = false;
let nextSent = false;
const db = { query: async (sql) => {
  if (sql.includes('JOIN envelopes e')) return { rows: [{ id: 2, env_id: 8, routing_order: 2,
    status: 'pending', env_status: 'sent', consent_at: new Date(), email: 'second@example.test' }] };
  if (sql.includes('MIN(routing_order)')) return { rows: [{ turn }] };
  if (allowWrites) {
    if (sql.includes('SELECT id, type, required FROM envelope_fields')) return { rows: [] };
    if (sql.includes('COUNT(*)::int AS n')) return { rows: [{ n: 1 }] };
    if (sql.includes('SELECT * FROM envelopes')) return { rows: [{ id: 8, title: 'Test document' }] };
    return { rows: [] };
  }
  wrote = true;
  throw new Error('An out-of-turn signer must not write to the database');
} };
function router() {
  return { get: (path, ...fns) => routes.set('GET ' + path, fns.at(-1)),
    post: (path, ...fns) => routes.set('POST ' + path, fns.at(-1)),
    patch() {}, put() {}, delete() {} };
}
const stubs = {
  express: { Router: router }, multer: Object.assign(() => ({ array: () => () => {} }), { memoryStorage: () => ({}) }),
  '../db': db, '../services/email': {}, '../services/sms': {},
  '../middleware/auth': { requireAuth() {} },
  '../services/delivery': {
    pendingRecipients: async () => [{ id: 3, routing_order: 3 }],
    deliverSigningLinks: async ({ recipients }) => { nextSent = recipients[0].id === 3; return { sent: [], failed: [] }; },
  },
  'pdf-lib': { PDFDocument: {} },
  '../services/esign': { hashToken: () => 'hash' },
};
Module._load = function(id, parent, main) { return id in stubs ? stubs[id] : originalLoad.call(this, id, parent, main); };
try { require('../routes/esign'); } finally { Module._load = originalLoad; }

async function check(path) {
  let result;
  const res = { status(code) { result = { code }; return this; }, json(body) { result.body = body; return this; } };
  await routes.get(path)({ params: { token: 'old-link' }, body: { agree: true, typedName: 'Second Signer' } }, res);
  assert.equal(result.code, 403, path);
  assert.match(result.body.error, /turn|previous recipient/i);
}

(async () => {
  await check('POST /:token/consent');
  await check('POST /:token/sign');
  assert.equal(wrote, false);
  let invalid;
  await routes.get('POST /field-layouts')({ body: { name: 'Outside page', recipientCount: 1,
    fields: [{ type: 'signature', page: 1, recipientIndex: 0, x: .9, y: .5, w: .3, h: .1 }] } },
  { status: code => ({ json: body => { invalid = { code, body }; } }) });
  assert.equal(invalid.code, 400, 'invalid saved fields must be rejected');
  turn = 2; allowWrites = true;
  let signed;
  await routes.get('POST /:token/sign')({
    params: { token: 'current-link' }, ip: '127.0.0.1', get: () => 'test',
    protocol: 'https', body: { typedName: 'Second Signer', signaturePng: 'data:image/png;base64,AA==' },
  }, { json: body => { signed = body; } });
  assert.equal(signed.success, true);
  assert.equal(nextSent, true, 'the next signer should receive the link after this signer completes');
  const source = require('node:fs').readFileSync(require.resolve('../services/delivery'), 'utf8');
  assert.match(source, /routing_order = \([\s\S]*MIN\(routing_order\)/);
  console.log('Signing order: later recipient blocked; delivery limited to the current recipient.');
})().catch(e => { console.error(e); process.exitCode = 1; });
