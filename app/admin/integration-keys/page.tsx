import Link from 'next/link';
import { redirect } from 'next/navigation';
import AdminIntegrationManager from '../../../components/admin/AdminIntegrationManager';
import { getAuthenticatedAdminSession } from '../../../lib/admin-session-server';
import { AlertTriangle, ArrowUpRight, Clock, KeyRound, ShieldAlert, ShieldCheck, Store, TimerReset } from 'lucide-react';
import { SectionCard, StatCard, StatusBadge } from '../../../components/admin/ui';
import { getFirebaseEnvStatus, listFirestoreDocuments, listAllFirestoreDocuments } from '../../../lib/firebase-admin';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type IntegrationKey = Record<string, unknown> & {
  id?: string;
  path?: string;
  storeId?: string;
  name?: string;
  status?: string;
  keyPreview?: string;
  source?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
  lastUsedAt?: unknown;
  revokedAt?: unknown;
};

type StoreRecord = Record<string, unknown> & {
  id?: string;
  storeName?: string;
  name?: string;
  businessName?: string;
  displayName?: string;
};

function cleanText(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function timestampMillis(value: unknown): number | null {
  if (!value) return null;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (typeof value === 'object') {
    const candidate = value as { toMillis?: unknown; seconds?: unknown; _seconds?: unknown };
    if (typeof candidate.toMillis === 'function') {
      const millis = candidate.toMillis.call(value);
      return typeof millis === 'number' && Number.isFinite(millis) ? millis : null;
    }
    const seconds = typeof candidate.seconds === 'number' ? candidate.seconds : typeof candidate._seconds === 'number' ? candidate._seconds : null;
    return seconds ? seconds * 1000 : null;
  }
  return null;
}

function formatDate(value: unknown) {
  const millis = timestampMillis(value);
  if (!millis) return 'Never';
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(millis));
}

function isRecentlyUsed(value: unknown) {
  const millis = timestampMillis(value);
  if (!millis) return false;
  return Date.now() - millis < 30 * 24 * 60 * 60 * 1000;
}

function isOldUnused(key: IntegrationKey) {
  const createdMillis = timestampMillis(key.createdAt);
  const usedMillis = timestampMillis(key.lastUsedAt);
  if (usedMillis) return false;
  if (!createdMillis) return false;
  return Date.now() - createdMillis > 30 * 24 * 60 * 60 * 1000;
}

function keyStatus(key: IntegrationKey) {
  return cleanText(key.status).toLowerCase() === 'revoked' ? 'revoked' : 'active';
}

function statusTone(status: string) {
  return status === 'active' ? ('green' as const) : ('red' as const);
}

function storeName(store: StoreRecord | undefined, fallback: string) {
  if (!store) return fallback || 'Unknown store';
  return cleanText(store.storeName) || cleanText(store.name) || cleanText(store.businessName) || cleanText(store.displayName) || cleanText(store.id) || fallback || 'Unknown store';
}

function keyName(key: IntegrationKey) {
  return cleanText(key.name) || 'Unnamed key';
}

function keyPreview(key: IntegrationKey) {
  return cleanText(key.keyPreview) || '••••••••';
}

async function loadIntegrationKeys() {
  const env = getFirebaseEnvStatus();

  if (!env.ready) {
    return {
      ok: false,
      error: 'Firebase envs are not ready in Vercel.',
      keys: [] as IntegrationKey[],
      stores: [] as StoreRecord[],
    };
  }

  try {
    const [keysResult, storesResult, settingsResult] = await Promise.all([
      listFirestoreDocuments('integrationApiKeys', 100),
      listAllFirestoreDocuments('stores'),
      listAllFirestoreDocuments('storeSettings'),
    ]);

    return {
      ok: true,
      error: null,
      keys: keysResult.documents as IntegrationKey[],
      stores: [...storesResult.documents, ...settingsResult.documents] as StoreRecord[],
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Unable to load integration API keys.',
      keys: [] as IntegrationKey[],
      stores: [] as StoreRecord[],
    };
  }
}

export default async function IntegrationKeysPage({ searchParams }: { searchParams: Promise<{ storeId?: string }> }) {
  const session = await getAuthenticatedAdminSession();
  if (!session || session.scope !== 'platform' || !['super_admin', 'ops_admin'].includes(session.role)) redirect('/admin');
  const params = await searchParams;
  const result = await loadIntegrationKeys();
  const keys = result.keys;
  const storeMap = new Map(result.stores.map((store) => [cleanText(store.id), store]));
  const activeKeys = keys.filter((key) => keyStatus(key) === 'active');
  const revokedKeys = keys.filter((key) => keyStatus(key) === 'revoked');
  const recentlyUsed = activeKeys.filter((key) => isRecentlyUsed(key.lastUsedAt));
  const neverUsed = activeKeys.filter((key) => !timestampMillis(key.lastUsedAt));
  const oldUnused = activeKeys.filter(isOldUnused);
  const keysMissingStore = keys.filter((key) => !cleanText(key.storeId));
  const storeKeyCounts = activeKeys.reduce<Record<string, number>>((acc, key) => {
    const storeId = cleanText(key.storeId) || 'missing-store';
    acc[storeId] = (acc[storeId] || 0) + 1;
    return acc;
  }, {});
  const storesWithManyKeys = Object.entries(storeKeyCounts)
    .filter(([, count]) => count > 2)
    .sort((a, b) => b[1] - a[1]);

  const reviewKeys = [...keysMissingStore, ...oldUnused, ...revokedKeys]
    .filter((key, index, array) => array.findIndex((entry) => entry.id === key.id) === index)
    .slice(0, 15);

  const stats = [
    { label: 'API keys', value: result.ok ? String(keys.length) : 'Setup', delta: result.ok ? 'From integrationApiKeys' : 'Database not ready' },
    { label: 'Active keys', value: result.ok ? String(activeKeys.length) : '—', delta: 'Can authenticate integrations' },
    { label: 'Revoked keys', value: result.ok ? String(revokedKeys.length) : '—', delta: 'Disabled credentials' },
    { label: 'Need review', value: result.ok ? String(reviewKeys.length) : '—', delta: 'Missing store, old unused, or revoked' },
  ];

  const healthCards = [
    { label: 'Recently used', value: String(recentlyUsed.length), icon: Clock, tone: recentlyUsed.length ? ('green' as const) : ('slate' as const) },
    { label: 'Never used', value: String(neverUsed.length), icon: TimerReset, tone: neverUsed.length ? ('yellow' as const) : ('green' as const) },
    { label: 'Old unused', value: String(oldUnused.length), icon: ShieldAlert, tone: oldUnused.length ? ('red' as const) : ('green' as const) },
    { label: 'Missing storeId', value: String(keysMissingStore.length), icon: Store, tone: keysMissingStore.length ? ('red' as const) : ('green' as const) },
  ];

  return (
    <div className="space-y-6">
      {result.ok ? <AdminIntegrationManager stores={Array.from(storeMap.entries()).map(([id, store]) => ({ id, name: storeName(store, id) }))} initialStoreId={params.storeId || ''} /> : null}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => <StatCard key={stat.label} {...stat} />)}
      </section>

      {result.error ? (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <div className="flex gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <p className="font-semibold">Integration key data is not available yet.</p>
              <p className="mt-1 leading-6">{result.error}</p>
            </div>
          </div>
        </section>
      ) : null}

      <section className="grid gap-6 xl:grid-cols-[1.45fr_0.9fr]">
        <div className="space-y-6">
          <SectionCard
            title="Integration API keys"
            action={<Link href="/admin/webhooks" className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-500">Webhooks <ArrowUpRight className="h-3.5 w-3.5" /></Link>}
          >
            <div className="overflow-hidden rounded-2xl border border-slate-200">
              <div className="grid grid-cols-[1.1fr_1fr_0.8fr_0.8fr_0.7fr_auto] bg-slate-50 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 max-lg:hidden">
                <span>Key</span><span>Store</span><span>Preview</span><span>Last used</span><span>Source</span><span>Status</span>
              </div>
              <div className="divide-y divide-slate-200">
                {keys.length === 0 ? (
                  <div className="p-8 text-center text-sm text-slate-500">No integration API keys found.</div>
                ) : keys.map((key) => {
                  const sid = cleanText(key.storeId);
                  const store = storeMap.get(sid);
                  const status = keyStatus(key);

                  return (
                    <div key={key.path || key.id} className="grid gap-3 px-4 py-4 text-sm lg:grid-cols-[1.1fr_1fr_0.8fr_0.8fr_0.7fr_auto] lg:items-center">
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-slate-950">{keyName(key)}</p>
                        <p className="truncate text-xs text-slate-500">{key.id || 'No key ID'}</p>
                      </div>
                      <Link href={sid ? `/admin/stores/${encodeURIComponent(sid)}` : '/admin/stores'} className="min-w-0 text-slate-600 hover:text-indigo-600">
                        <p className="truncate font-medium">{storeName(store, sid)}</p>
                        <p className="truncate text-xs text-slate-500">{sid || 'Missing storeId'}</p>
                      </Link>
                      <p className="truncate font-mono text-xs text-slate-600">{keyPreview(key)}</p>
                      <p className="truncate text-slate-600">{formatDate(key.lastUsedAt)}</p>
                      <p className="truncate text-slate-600">{cleanText(key.source) || 'manual'}</p>
                      <StatusBadge tone={statusTone(status)}>{status}</StatusBadge>
                    </div>
                  );
                })}
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Keys needing attention">
            <div className="overflow-hidden rounded-2xl border border-slate-200">
              <div className="grid grid-cols-[1.1fr_0.9fr_1fr_auto] bg-slate-50 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 max-lg:hidden">
                <span>Key</span><span>Store</span><span>Issue</span><span>Status</span>
              </div>
              <div className="divide-y divide-slate-200">
                {reviewKeys.length === 0 ? (
                  <div className="p-8 text-center text-sm text-slate-500">No key issues found in the loaded sample.</div>
                ) : reviewKeys.map((key) => {
                  const issues = [
                    !cleanText(key.storeId) ? 'missing storeId' : null,
                    isOldUnused(key) ? 'older than 30 days and never used' : null,
                    keyStatus(key) === 'revoked' ? 'revoked' : null,
                  ].filter(Boolean);

                  return (
                    <div key={`review-${key.path || key.id}`} className="grid gap-3 px-4 py-4 text-sm lg:grid-cols-[1.1fr_0.9fr_1fr_auto] lg:items-center">
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-slate-950">{keyName(key)}</p>
                        <p className="truncate text-xs text-slate-500">{keyPreview(key)}</p>
                      </div>
                      <p className="truncate text-slate-600">{cleanText(key.storeId) || 'Missing store'}</p>
                      <p className="truncate text-slate-600">{issues.join(', ')}</p>
                      <StatusBadge tone={keyStatus(key) === 'active' ? 'yellow' : 'red'}>{keyStatus(key)}</StatusBadge>
                    </div>
                  );
                })}
              </div>
            </div>
          </SectionCard>
        </div>

        <div className="space-y-6">
          <SectionCard title="Key health">
            <div className="space-y-3">
              {healthCards.map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.label} className="flex items-center justify-between gap-3 rounded-2xl bg-slate-50 p-4">
                    <div className="flex items-center gap-3">
                      <span className="rounded-xl bg-white p-2 text-slate-500 shadow-sm ring-1 ring-slate-200"><Icon className="h-4 w-4" /></span>
                      <span className="text-sm font-semibold text-slate-800">{item.label}</span>
                    </div>
                    <StatusBadge tone={item.tone}>{item.value}</StatusBadge>
                  </div>
                );
              })}
            </div>
          </SectionCard>

          <SectionCard title="Stores with many active keys">
            <div className="space-y-3">
              {storesWithManyKeys.length === 0 ? (
                <div className="rounded-2xl bg-slate-50 p-4 text-sm leading-6 text-slate-600">No store has more than two active keys in the loaded sample.</div>
              ) : storesWithManyKeys.slice(0, 8).map(([sid, count]) => {
                const store = storeMap.get(sid);
                return (
                  <Link key={sid} href={sid !== 'missing-store' ? `/admin/stores/${encodeURIComponent(sid)}` : '/admin/stores'} className="flex items-center justify-between gap-3 rounded-2xl bg-slate-50 p-4 text-sm transition hover:bg-indigo-50">
                    <span className="min-w-0">
                      <span className="block truncate font-semibold text-slate-950">{storeName(store, sid)}</span>
                      <span className="block truncate text-xs text-slate-500">{sid}</span>
                    </span>
                    <StatusBadge tone="yellow">{count}</StatusBadge>
                  </Link>
                );
              })}
            </div>
          </SectionCard>

          <SectionCard title="Key safety rules">
            <div className="space-y-3 text-sm leading-6 text-slate-600">
              <div className="rounded-2xl bg-slate-50 p-4">
                <div className="mb-2 flex items-center gap-2 font-semibold text-slate-950"><ShieldCheck className="h-4 w-4 text-emerald-600" /> Keep active keys limited</div>
                Stores should not keep many unused active keys. Rotate or revoke old keys after integrations change.
              </div>
              <div className="rounded-2xl bg-slate-50 p-4">
                <div className="mb-2 flex items-center gap-2 font-semibold text-slate-950"><KeyRound className="h-4 w-4 text-indigo-600" /> Never expose full tokens</div>
                This page only shows key preview values. Full tokens should only be shown once when created.
              </div>
            </div>
          </SectionCard>
        </div>
      </section>
    </div>
  );
}
