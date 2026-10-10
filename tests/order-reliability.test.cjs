const assert = require('node:assert/strict');
const { test } = require('node:test');
const path = require('node:path');
const load = require('./helpers/load-typescript.cjs');
const modulePath = name => path.join(__dirname, '..', name);

function orderRoute(session) {
  let reads = 0;
  let cursor;
  const auth = load(modulePath('lib/admin-api-auth.ts'), { './admin-session': { ADMIN_SESSION_COOKIE: 'admin-session', verifyAdminSessionToken: async token => token === 'valid' ? session : null } });
  const route = load(modulePath('app/api/admin/firestore/integration-orders/route.ts'), {
    '@/lib/admin-api-auth': auth,
    'firebase-admin/firestore': {},
    'next/server': { NextResponse: { json: (body, options = {}) => ({ body, status: options.status || 200 }) } },
    '@/lib/firebase-admin': { listFirestoreDocuments: async (_collection, _limit, token) => { reads++; cursor = token; return { documents: [], nextPageToken: 'next' }; }, adminFirestore: () => ({ batch: () => ({ commit: async () => {} }) }) },
    '@/lib/payment-audit': {}, '@/lib/payment-audit-email': {},
  });
  return { route, reads: () => reads, cursor: () => cursor };
}

test('unauthenticated and store-scoped clients cannot enumerate any order-history page', async () => {
  for (const session of [null, { role: 'support', scope: 'store' }, { role: 'owner', scope: 'platform' }]) {
    const fixture = orderRoute(session);
    const result = await fixture.route.GET(new Request('https://example.com/api/admin/firestore/integration-orders?pageToken=older', { headers: session ? { cookie: 'admin-session=valid' } : {} }));
    assert.equal(result.status, 403);
    assert.equal(fixture.reads(), 0);
  }
});

test('authorized platform admins can follow a cursor', async () => {
  const fixture = orderRoute({ role: 'analyst', scope: 'platform' });
  const result = await fixture.route.GET(new Request('https://example.com/api/admin/firestore/integration-orders?pageToken=older', { headers: { cookie: 'admin-session=valid' } }));
  assert.equal(result.status, 200);
  assert.equal(fixture.cursor(), 'older');
  assert.equal(result.body.nextPageToken, 'next');
});

test('a required post-action reload waits for the active refresh and then runs', async () => {
  const coordinator = load(modulePath('lib/refresh-coordinator.ts')).createRefreshCoordinator();
  let finish;
  const events = [];
  const active = coordinator.run(() => new Promise(resolve => { events.push('old refresh'); finish = resolve; }));
  await Promise.resolve();
  const required = coordinator.run(async () => { events.push('post-action refresh'); }, true);
  assert.deepEqual(events, ['old refresh']);
  finish();
  await Promise.all([active, required]);
  assert.deepEqual(events, ['old refresh', 'post-action refresh']);
});

test('notification lookups query only visible references, in bounded batches', async () => {
  const queried = [];
  const db = { collection: name => ({ where: (field, operator, refs) => { assert.equal(name, 'notification_outbox'); assert.equal(field, 'reference'); assert.equal(operator, 'in'); queried.push(...refs); assert.ok(refs.length <= 30); return { get: async () => ({ docs: [] }) }; } }) };
  const api = load(modulePath('lib/firebase-admin.ts'), { 'firebase-admin/app': { getApps: () => [{}] }, 'firebase-admin/firestore': { getFirestore: () => db }, 'firebase-admin/auth': {}, 'firebase-admin/storage': {} });
  const visible = Array.from({ length: 50 }, (_, i) => `booking-${i}`);
  await api.listBookingNotifications([...visible, visible[0]]);
  assert.deepEqual(queried, visible);
  await api.listBookingNotifications([]);
  assert.equal(queried.length, 50);
});
