const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');

function fixture(count) {
  const records = Array.from({ length: count }, (_, i) => ({ id: String(i).padStart(5, '0'), ref: { path: `orders/${String(i).padStart(5, '0')}` }, data: () => ({ name: `Order ${i}` }) }));
  const db = { collection: () => {
    let after = '';
    let limit = 0;
    const query = { orderBy: () => query, limit: value => { limit = value; return query; }, startAfter: value => { after = value; return query; }, get: async () => ({ docs: records.filter(row => row.id > after).slice(0, limit) }) };
    return query;
  } };
  const module = { exports: {} };
  const context = { module, exports: module.exports, process: { env: {} }, require: name => {
    if (name === 'firebase-admin/app') return { getApps: () => [{}] };
    if (name === 'firebase-admin/firestore') return { getFirestore: () => db, FieldPath: { documentId: () => '__name__' } };
    return {};
  } };
  const source = ts.transpileModule(fs.readFileSync(require.resolve('../lib/firebase-admin.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  vm.runInNewContext(source, context);
  return module.exports;
}

test('page cursors traverse older records without truncating or repeating rows', async () => {
  const api = fixture(1001);
  const first = await api.listFirestoreDocuments('orders', 1000);
  assert.equal(first.documents.length, 1000);
  assert.equal(first.nextPageToken, '00999');
  const next = await api.listFirestoreDocuments('orders', 1000, first.nextPageToken);
  assert.equal(next.documents.length, 1);
  assert.equal(next.documents[0].id, '01000');
  assert.equal(next.nextPageToken, null);
  const all = await api.listAllFirestoreDocuments('orders');
  assert.equal(all.documents.length, 1001);
  assert.equal(new Set(all.documents.map(row => row.id)).size, 1001);
});

test('an exact full page has no misleading next cursor', async () => {
  const page = await fixture(50).listFirestoreDocuments('orders', 50);
  assert.equal(page.documents.length, 50);
  assert.equal(page.nextPageToken, null);
});
