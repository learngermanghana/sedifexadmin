import Link from 'next/link';
import { AlertTriangle, ArrowUpRight, Database, Edit3, Search, Store } from 'lucide-react';
import { SectionCard, StatCard, StatusBadge } from '../../../components/admin/ui';
import { getFirebaseEnvStatus, listFirestoreDocuments } from '../../../lib/firebase-admin';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type SearchParams = Promise<{ q?: string }>;
type StoreRecord = Record<string, unknown> & { id?: string; path?: string; updateTime?: string | null; createTime?: string | null };
type MergedStore = {
  id: string;
  profile: StoreRecord | null;
  settings: StoreRecord | null;
  merged: StoreRecord;
};

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function nestedValue(store: StoreRecord | null | undefined, keys: string[]) {
  let current: unknown = store;
  for (const key of keys) {
    const currentObject = objectValue(current);
    if (!currentObject) return undefined;
    current = currentObject[key];
  }
  return current;
}

function valueText(value: unknown, fallback = '') {
  if (typeof value === 'string') return value.trim() || fallback;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return fallback;
}

function fieldText(store: StoreRecord | null | undefined, fields: string[], fallback = 'Not set') {
  if (!store) return fallback;
  for (const field of fields) {
    const value = store[field];
    const text = valueText(value, '');
    if (text) return text;
  }
  return fallback;
}

function nestedText(store: StoreRecord | null | undefined, paths: string[][], fallback = 'Not set') {
  for (const path of paths) {
    const text = valueText(nestedValue(store, path), '');
    if (text) return text;
  }
  return fallback;
}

function storeName(store: MergedStore) {
  return fieldText(
    store.merged,
    ['displayName', 'storeName', 'name', 'businessName', 'merchantName', 'ownerName', 'id'],
    store.id,
  );
}

function storeContact(store: MergedStore) {
  return fieldText(
    store.merged,
    ['publicEmail', 'email', 'ownerEmail', 'adminEmail', 'supportEmail', 'contactEmail'],
    'Not set',
  );
}

function storePhone(store: MergedStore) {
  return fieldText(
    store.merged,
    ['publicPhone', 'phone', 'phoneNumber', 'contactPhone', 'storePhone', 'whatsappNumber'],
    'Not set',
  );
}

function storeLocation(store: MergedStore) {
  const address = fieldText(store.merged, ['addressLine1', 'address', 'businessAddress'], '');
  const city = fieldText(store.merged, ['city', 'storeCity', 'town'], '');
  const country = fieldText(store.merged, ['country', 'storeCountry'], '');
  return [address, city, country].filter(Boolean).join(', ') || 'Not set';
}

function workspaceActive(store: MergedStore) {
  const status = [
    fieldText(store.merged, ['workspaceStatus', 'accountStatus', 'status'], ''),
    nestedText(store.merged, [['subscription', 'status'], ['billing', 'status']], ''),
  ].join(' ').toLowerCase();

  if (/suspended|disabled|inactive|cancelled|canceled|closed/.test(status)) return false;
  if (/active|paid|trial|live|enabled/.test(status)) return true;
  return Boolean(store.profile || store.settings);
}

function hasWebsite(store: MergedStore) {
  return Boolean(fieldText(store.merged, ['websiteUrl', 'websiteLink', 'storeWebsiteUrl', 'publicUrl'], ''));
}

function numberField(store: StoreRecord | null | undefined, fields: string[]) {
  if (!store) return 0;
  for (const field of fields) {
    const value = store[field];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
  }
  return 0;
}

function countFromMap(store: StoreRecord | null | undefined, key: string) {
  const map = objectValue(store?.publicCatalogDocCount);
  const value = map?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function formatDate(value: unknown) {
  if (typeof value !== 'string') return '—';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
}

function searchableText(store: MergedStore) {
  return [
    storeName(store),
    store.id,
    storeContact(store),
    storePhone(store),
    storeLocation(store),
    fieldText(store.merged, ['websiteUrl', 'websiteLink', 'storeWebsiteUrl'], ''),
    nestedText(store.merged, [['publicProfile', 'displayName'], ['socialLinks', 'displayName']], ''),
  ].join(' ').toLowerCase();
}

function mergeStores(profiles: StoreRecord[], settings: StoreRecord[]) {
  const byId = new Map<string, MergedStore>();

  for (const profile of profiles) {
    const id = String(profile.id || profile.storeId || '');
    if (!id) continue;
    byId.set(id, { id, profile, settings: null, merged: { ...profile, id } });
  }

  for (const setting of settings) {
    const id = String(setting.id || setting.storeId || '');
    if (!id) continue;
    const current = byId.get(id);
    byId.set(id, {
      id,
      profile: current?.profile ?? null,
      settings: setting,
      merged: { ...(setting || {}), ...(current?.profile || {}), id },
    });
  }

  return [...byId.values()].sort((a, b) => storeName(a).localeCompare(storeName(b)));
}

async function loadStores() {
  const env = getFirebaseEnvStatus();
  if (!env.ready) {
    return { ok: false, error: 'Firebase envs are not ready in Vercel.', stores: [] as MergedStore[] };
  }

  try {
    const [profiles, settings] = await Promise.all([
      listFirestoreDocuments('stores', 400).catch(() => ({ documents: [] as StoreRecord[] })),
      listFirestoreDocuments('storeSettings', 400).catch(() => ({ documents: [] as StoreRecord[] })),
    ]);
    return { ok: true, error: null, stores: mergeStores(profiles.documents as StoreRecord[], settings.documents as StoreRecord[]) };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Unable to load store data.',
      stores: [] as MergedStore[],
    };
  }
}

export default async function StoresPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const query = (params.q || '').trim().toLowerCase();
  const result = await loadStores();
  const allStores = result.stores;
  const stores = query ? allStores.filter((store) => searchableText(store).includes(query)) : allStores;
  const activeWorkspaceCount = allStores.filter(workspaceActive).length;
  const websiteCount = allStores.filter(hasWebsite).length;
  const contactCount = allStores.filter((store) => storeContact(store) !== 'Not set').length;
  const firstStore = stores[0] || allStores[0] || null;

  const stats = [
    { label: 'Client workspaces', value: result.ok ? String(allStores.length) : 'Setup', delta: result.ok ? 'Merged stores + settings' : 'Database not ready' },
    { label: 'Active workspaces', value: result.ok ? String(activeWorkspaceCount) : '—', delta: 'Available Sedifex clients' },
    { label: 'With website', value: result.ok ? String(websiteCount) : '—', delta: 'Connected client website detected' },
    { label: 'With contact', value: result.ok ? String(contactCount) : '—', delta: 'Client contact email detected' },
  ];

  return (
    <div className="space-y-6">
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => <StatCard key={stat.label} {...stat} />)}
      </section>

      {result.error ? (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <div className="flex gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <p className="font-semibold">Store data is not available yet.</p>
              <p className="mt-1 leading-6">{result.error}</p>
            </div>
          </div>
        </section>
      ) : null}

      <section className="grid gap-6 xl:grid-cols-[1.75fr_0.85fr]">
        <SectionCard
          title="Client workspace directory"
          action={<Link href="/api/admin/firestore/store-settings?limit=100" className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-500">Raw data <ArrowUpRight className="h-3.5 w-3.5" /></Link>}
        >
          <form className="mb-4 flex flex-col gap-3 sm:flex-row" action="/admin/stores">
            <label className="relative flex-1">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                name="q"
                defaultValue={params.q || ''}
                placeholder="Search by store name, email, phone, city, website, or ID"
                className="w-full rounded-2xl border border-slate-200 bg-white py-3 pl-11 pr-4 text-sm text-slate-900 outline-none transition focus:border-indigo-300 focus:ring-4 focus:ring-indigo-100"
              />
            </label>
            <button className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-bold text-white transition hover:bg-slate-800">Search</button>
          </form>

          <div className="overflow-hidden rounded-2xl border border-slate-200">
            <div className="grid grid-cols-[1.35fr_0.9fr_0.9fr_0.85fr_0.75fr_auto] bg-slate-50 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 max-xl:hidden">
              <span>Store name</span><span>Contact</span><span>Location</span><span>Catalog</span><span>Status</span><span>Actions</span>
            </div>
            <div className="divide-y divide-slate-200">
              {stores.length === 0 ? (
                <div className="p-8 text-center text-sm text-slate-500">No stores match this search.</div>
              ) : stores.map((store) => {
                const detailHref = `/admin/stores/${encodeURIComponent(store.id)}`;
                const editHref = `/admin/stores/${encodeURIComponent(store.id)}/edit`;
                const products = countFromMap(store.merged, 'products') || numberField(store.merged, ['productCount']);
                const services = countFromMap(store.merged, 'services');
                const website = hasWebsite(store);

                return (
                  <div key={store.id} className="grid gap-3 px-4 py-4 text-sm transition hover:bg-indigo-50/60 xl:grid-cols-[1.35fr_0.9fr_0.9fr_0.85fr_0.75fr_auto] xl:items-center">
                    <Link href={detailHref} className="flex min-w-0 items-center gap-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600"><Store className="h-4 w-4" /></span>
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-slate-950">{storeName(store)}</p>
                        <p className="truncate text-xs text-slate-500">{store.id}</p>
                      </div>
                    </Link>
                    <div className="min-w-0 text-slate-600">
                      <p className="truncate">{storeContact(store)}</p>
                      <p className="truncate text-xs text-slate-500">{storePhone(store)}</p>
                    </div>
                    <p className="truncate text-slate-600">{storeLocation(store)}</p>
                    <div className="text-xs text-slate-600">
                      <p><strong>{products}</strong> products · <strong>{services}</strong> services</p>
                      <p className={website ? 'text-emerald-700' : 'text-slate-500'}>{website ? 'Website connected' : 'No website saved'}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <StatusBadge tone={workspaceActive(store) ? 'green' : 'yellow'}>{workspaceActive(store) ? 'Active workspace' : 'Review workspace'}</StatusBadge>
                      <StatusBadge tone={website ? 'blue' : 'slate'}>{website ? 'Website linked' : 'No website'}</StatusBadge>
                    </div>
                    <div className="flex flex-wrap gap-2 xl:justify-end">
                      <Link href={detailHref} className="inline-flex items-center gap-1 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-indigo-600 transition hover:bg-white">Open <ArrowUpRight className="h-3.5 w-3.5" /></Link>
                      <Link href={editHref} className="inline-flex items-center gap-1 rounded-xl bg-indigo-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-indigo-500"><Edit3 className="h-3.5 w-3.5" /> Edit</Link>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </SectionCard>

        <div className="space-y-6">
          <SectionCard title="Store preview">
            {firstStore ? (
              <div className="space-y-4 text-sm">
                <div className="rounded-2xl bg-slate-950 p-5 text-white">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-200">Selected store</p>
                  <h3 className="mt-2 text-xl font-bold">{storeName(firstStore)}</h3>
                  <p className="mt-1 break-all text-xs text-slate-400">{firstStore.id}</p>
                </div>
                <div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Contact</p><p className="mt-1 font-semibold text-slate-950">{storeContact(firstStore)}</p><p className="mt-1 text-xs text-slate-500">{storePhone(firstStore)}</p></div>
                <div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Location</p><p className="mt-1 font-semibold text-slate-950">{storeLocation(firstStore)}</p></div>
                <div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Last updated</p><p className="mt-1 font-semibold text-slate-950">{formatDate(firstStore.merged.updateTime || firstStore.merged.updatedAt)}</p></div>
                <div className="grid grid-cols-2 gap-2">
                  <Link href={`/admin/stores/${encodeURIComponent(firstStore.id)}`} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-indigo-500 px-4 py-3 text-sm font-bold text-white transition hover:bg-indigo-400">
                    Details <ArrowUpRight className="h-4 w-4" />
                  </Link>
                  <Link href={`/admin/stores/${encodeURIComponent(firstStore.id)}/edit`} className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-700 transition hover:bg-slate-50">
                    Edit <Edit3 className="h-4 w-4" />
                  </Link>
                </div>
              </div>
            ) : <p className="text-sm text-slate-500">No store selected yet.</p>}
          </SectionCard>

          <SectionCard title="What changed">
            <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
              <div className="flex items-center gap-2 font-semibold text-slate-950"><Database className="h-4 w-4 text-indigo-600" />Merged profile data</div>
              <p className="mt-2 leading-6">This page merges /stores and /storeSettings by workspace ID so client status, contact details, website connection, and catalog counts are visible in one place.</p>
            </div>
          </SectionCard>
        </div>
      </section>
    </div>
  );
}
