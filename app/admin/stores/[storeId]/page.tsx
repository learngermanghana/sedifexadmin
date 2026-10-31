import Link from 'next/link';
import { ArrowLeft, Database, Edit3, ExternalLink, Hammer, PackageSearch, ReceiptText, ShoppingBag, Store } from 'lucide-react';
import { SectionCard, StatusBadge } from '../../../../components/admin/ui';
import { getFirebaseEnvStatus, getFirestoreDocument, listFirestoreDocuments } from '../../../../lib/firebase-admin';
import { getAuthenticatedAdminSession } from '../../../../lib/admin-session-server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Params = Promise<{ storeId: string }>;
type DashboardRecord = Record<string, unknown> & {
  id?: string;
  path?: string;
  updateTime?: string | null;
  createTime?: string | null;
};

type StoreDocs = {
  profile: DashboardRecord | null;
  settings: DashboardRecord | null;
  catalogItems: DashboardRecord[];
  orders: DashboardRecord[];
  error: string | null;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function text(record: DashboardRecord | null | undefined, fields: string[], fallback = 'Not set') {
  if (!record) return fallback;
  for (const field of fields) {
    const value = record[field];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number') return String(value);
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  }
  return fallback;
}

function nested(record: DashboardRecord | null | undefined, path: string[]) {
  let current: unknown = record;
  for (const key of path) {
    const currentRecord = asRecord(current);
    if (!currentRecord) return undefined;
    current = currentRecord[key];
  }
  return current;
}

function nestedText(record: DashboardRecord | null | undefined, path: string[], fallback = 'Not set') {
  const value = nested(record, path);
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return fallback;
}

function numberField(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function countMap(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function mergedIdentity(profile: DashboardRecord | null, settings: DashboardRecord | null) {
  return { ...(settings || {}), ...(profile || {}) } as DashboardRecord;
}

function storeName(profile: DashboardRecord | null, settings: DashboardRecord | null, fallback: string) {
  const identity = mergedIdentity(profile, settings);
  return text(identity, ['displayName', 'storeName', 'name', 'businessName', 'merchantName'], fallback);
}

function isStoreCatalogItem(item: DashboardRecord, storeId: string) {
  return text(item, ['storeId', 'merchantId', 'businessId'], '') === storeId;
}

function isStoreOrder(order: DashboardRecord, storeId: string) {
  return text(order, ['storeId', 'merchantId', 'businessId'], '') === storeId;
}

function missingCatalogFields(item: DashboardRecord) {
  const missing = [
    text(item, ['name', 'title', 'productName', 'serviceName', 'courseName'], '') ? null : 'name',
    text(item, ['storeId', 'merchantId', 'businessId'], '') ? null : 'storeId',
    text(item, ['category', 'categoryName', 'categoryKey'], '') ? null : 'category',
    text(item, ['imageUrl', 'image', 'photoUrl', 'thumbnailUrl'], '') || Array.isArray(item.imageUrls) ? null : 'image',
    numberField(item.price) > 0 || numberField(item.fullFee) > 0 ? null : 'price',
  ].filter(Boolean);
  return missing.length;
}

function timestampToMillis(value: unknown) {
  if (!value) return 0;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  if (value && typeof value === 'object') {
    const candidate = value as { seconds?: unknown; _seconds?: unknown };
    const seconds = typeof candidate.seconds === 'number' ? candidate.seconds : typeof candidate._seconds === 'number' ? candidate._seconds : 0;
    return seconds * 1000;
  }
  return 0;
}

function recordTime(record: DashboardRecord) {
  return timestampToMillis(record.updatedAt ?? record.updateTime ?? record.createdAt ?? record.createTime);
}

function formatDate(value: unknown) {
  const millis = timestampToMillis(value);
  if (!millis) return 'Not set';
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(millis));
}

async function readCollection(collectionPath: string, limit = 100) {
  try {
    const result = await listFirestoreDocuments(collectionPath, limit);
    return result.documents as DashboardRecord[];
  } catch {
    return [] as DashboardRecord[];
  }
}

async function loadStore(storeId: string): Promise<StoreDocs> {
  const env = getFirebaseEnvStatus();
  if (!env.ready) {
    return { profile: null, settings: null, catalogItems: [], orders: [], error: 'Firebase envs are not ready in this deployment.' };
  }

  const [profile, settings, products, services, courses, catalogItems, orders] = await Promise.all([
    getFirestoreDocument(`stores/${storeId}`).catch(() => null),
    getFirestoreDocument(`storeSettings/${storeId}`).catch(() => null),
    readCollection('products', 400),
    readCollection('services', 400),
    readCollection('courses', 400),
    readCollection('catalogItems', 400),
    readCollection('integrationOrders', 100),
  ]);

  return {
    profile: profile as DashboardRecord | null,
    settings: settings as DashboardRecord | null,
    catalogItems: [...products, ...services, ...courses, ...catalogItems].filter((item) => isStoreCatalogItem(item, storeId)),
    orders: orders.filter((order) => isStoreOrder(order, storeId)),
    error: !profile && !settings ? 'Store not available in stores or storeSettings.' : null,
  };
}

function InfoCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 break-words text-base font-bold text-slate-950">{value}</p>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="grid gap-1 rounded-2xl border border-slate-100 bg-slate-50 p-4 sm:grid-cols-[160px_1fr] sm:items-center">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="break-words text-sm font-semibold text-slate-900">{value}</p>
    </div>
  );
}

export default async function StoreDetailPage({ params }: { params: Params }) {
  const { storeId } = await params;
  const session = await getAuthenticatedAdminSession();
  const canManageIntegrations = session?.scope === 'platform' && (session.role === 'super_admin' || session.role === 'ops_admin');
  const decodedStoreId = decodeURIComponent(storeId);
  const result = await loadStore(decodedStoreId);
  const identity = mergedIdentity(result.profile, result.settings);
  const counts = countMap(identity.publicCatalogDocCount);
  const catalogIssuesCount = result.catalogItems.reduce((sum: number, item) => sum + missingCatalogFields(item), 0);
  const recentOrders = [...result.orders].sort((a, b) => recordTime(b) - recordTime(a)).slice(0, 5);
  const shoppingConnected = nested(result.settings, ['googleShopping', 'connection', 'connected']) === true;
  const autoSyncEnabled = nested(result.settings, ['googleShopping', 'catalogSync', 'autoSyncEnabled']) === true;
  const storeTitle = storeName(result.profile, result.settings, decodedStoreId);

  if (!result.profile && !result.settings) {
    return (
      <div className="space-y-6">
        <Link href="/admin/stores" className="inline-flex items-center gap-2 text-sm font-semibold text-indigo-600 hover:text-indigo-500">
          <ArrowLeft className="h-4 w-4" /> Back to stores
        </Link>
        <SectionCard title="Store not available">
          <p className="text-sm leading-6 text-slate-600">{result.error || 'This store could not be loaded.'}</p>
        </SectionCard>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/admin/stores" className="inline-flex items-center gap-2 text-sm font-semibold text-indigo-600 hover:text-indigo-500">
          <ArrowLeft className="h-4 w-4" /> Back to stores
        </Link>
        <div className="flex flex-wrap gap-2">
          {canManageIntegrations ? <Link href={`/admin/integration-keys?storeId=${encodeURIComponent(decodedStoreId)}`} className="inline-flex items-center gap-2 rounded-2xl border border-indigo-200 bg-white px-4 py-3 text-sm font-semibold text-indigo-700 transition hover:bg-indigo-50">Manage website integration</Link> : null}
        <Link href={`/admin/stores/${encodeURIComponent(decodedStoreId)}/edit`} className="inline-flex items-center gap-2 rounded-2xl bg-indigo-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-indigo-500">
          <Edit3 className="h-4 w-4" /> Edit store
        </Link>
        </div>
      </div>

      <section className="rounded-3xl border border-slate-200 bg-slate-950 p-6 text-white shadow-sm sm:p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-indigo-300/20 bg-indigo-400/10 px-3 py-1 text-xs font-semibold text-indigo-100">
              <Store className="h-4 w-4" /> Store control page
            </div>
            <h2 className="mt-5 text-3xl font-bold tracking-tight sm:text-4xl">{storeTitle}</h2>
            <p className="mt-2 max-w-2xl break-all text-sm leading-7 text-slate-300">Store ID: {decodedStoreId}</p>
            <p className="mt-1 max-w-2xl text-sm leading-7 text-slate-300">{text(identity, ['addressLine1', 'address'], '')} {text(identity, ['city', 'storeCity'], '')} {text(identity, ['country', 'storeCountry'], '')}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <StatusBadge tone={identity.status === 'active' || identity.paymentStatus === 'active' ? 'green' : 'slate'}>{text(identity, ['status', 'paymentStatus'], 'Unknown')}</StatusBadge>
            <StatusBadge tone={identity.eligibleForBuy === true ? 'green' : 'slate'}>{identity.eligibleForBuy === true ? 'Buy ready' : 'Buy not ready'}</StatusBadge>
            <StatusBadge tone={shoppingConnected ? 'green' : 'slate'}>Shopping {shoppingConnected ? 'On' : 'Off'}</StatusBadge>
            <StatusBadge tone={autoSyncEnabled ? 'green' : 'slate'}>Auto sync {autoSyncEnabled ? 'On' : 'Off'}</StatusBadge>
            <StatusBadge tone={numberField(identity.publicCatalogOutOfSyncCount) > 0 ? 'yellow' : 'green'}>{numberField(identity.publicCatalogOutOfSyncCount)} out of sync</StatusBadge>
          </div>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <InfoCard label="Products" value={numberField(counts.products)} />
        <InfoCard label="Services" value={numberField(counts.services)} />
        <InfoCard label="Stock count" value={numberField(identity.totalStockCount)} />
        <InfoCard label="Amount paid" value={`${text(identity, ['billing.currency'], 'GHS')} ${numberField(nested(identity, ['billing', 'amountPaid'])) || 0}`} />
        <InfoCard label="Plan" value={nestedText(identity, ['billing', 'planKey'])} />
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-6">
          <SectionCard title="Store basics">
            <div className="grid gap-3">
              <DetailRow label="Store name" value={storeTitle} />
              <DetailRow label="Email" value={text(identity, ['publicEmail', 'email', 'ownerEmail'])} />
              <DetailRow label="Phone" value={text(identity, ['publicPhone', 'phone', 'phoneNumber', 'contactPhone', 'storePhone'])} />
              <DetailRow label="Address" value={text(identity, ['addressLine1', 'address'])} />
              <DetailRow label="City / Country" value={`${text(identity, ['city', 'storeCity'])}, ${text(identity, ['country', 'storeCountry'])}`} />
              <DetailRow label="Website" value={text(identity, ['websiteUrl', 'websiteLink', 'storeWebsiteUrl'])} />
              <DetailRow label="Hubtel Sender ID" value={text(identity, ['hubtelApprovedSenderId'])} />
            </div>
          </SectionCard>

          <SectionCard title="Public profile and social links">
            <div className="grid gap-3">
              <DetailRow label="Display name" value={nestedText(identity, ['publicProfile', 'displayName'], text(identity, ['displayName']))} />
              <DetailRow label="Public email" value={nestedText(identity, ['publicProfile', 'publicEmail'], text(identity, ['publicEmail']))} />
              <DetailRow label="Public phone" value={nestedText(identity, ['publicProfile', 'publicPhone'], text(identity, ['publicPhone']))} />
              <DetailRow label="Website" value={nestedText(identity, ['publicProfile', 'websiteUrl'], text(identity, ['websiteUrl']))} />
              <DetailRow label="Instagram" value={nestedText(identity, ['publicProfile', 'instagramHandle'], text(identity, ['instagramHandle', 'instagramUrl']))} />
              <DetailRow label="TikTok" value={nestedText(identity, ['publicProfile', 'tiktokHandle'], text(identity, ['tiktokHandle', 'tiktokUrl']))} />
              <DetailRow label="WhatsApp" value={nestedText(identity, ['publicProfile', 'whatsappNumber'], text(identity, ['whatsappNumber']))} />
            </div>
          </SectionCard>

          <SectionCard title="Catalog sample for this store">
            {result.catalogItems.length === 0 ? (
              <p className="text-sm leading-6 text-slate-600">No catalog records were found in the first loaded products, services, courses, or catalogItems records.</p>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-slate-200">
                <div className="grid grid-cols-[1.3fr_0.7fr_0.7fr] bg-slate-50 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <span>Item</span><span>Type</span><span>Issues</span>
                </div>
                <div className="divide-y divide-slate-200">
                  {result.catalogItems.slice(0, 10).map((item) => (
                    <div key={String(item.path || item.id)} className="grid grid-cols-[1.3fr_0.7fr_0.7fr] items-center px-4 py-3 text-sm">
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-slate-950">{text(item, ['name', 'title', 'productName', 'serviceName', 'courseName'], 'Untitled item')}</p>
                        <p className="truncate text-xs text-slate-500">{String(item.id || '')}</p>
                      </div>
                      <StatusBadge tone="slate">{text(item, ['listingType', 'itemType', 'type'], 'item')}</StatusBadge>
                      <StatusBadge tone={missingCatalogFields(item) > 0 ? 'yellow' : 'green'}>{missingCatalogFields(item)}</StatusBadge>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </SectionCard>
        </div>

        <div className="space-y-6">
          <SectionCard title="Billing and marketplace">
            <div className="grid gap-3">
              <DetailRow label="Payment status" value={text(identity, ['paymentStatus', 'status'])} />
              <DetailRow label="Provider" value={text(identity, ['paymentProvider'], nestedText(identity, ['billing', 'provider']))} />
              <DetailRow label="Plan" value={nestedText(identity, ['billing', 'planKey'])} />
              <DetailRow label="Contract status" value={text(identity, ['contractStatus'])} />
              <DetailRow label="Contract end" value={formatDate(identity.contractEnd || nested(identity, ['billing', 'currentPeriodEnd']))} />
              <DetailRow label="Last payment" value={formatDate(nested(identity, ['billing', 'lastPaymentAt']))} />
              <DetailRow label="Paystack customer" value={nestedText(identity, ['billing', 'paystackCustomerCode'])} />
            </div>
          </SectionCard>

          <SectionCard title="Google / integration setup">
            <div className="grid gap-3">
              <DetailRow label="Google Shopping" value={shoppingConnected ? 'Connected' : 'Not connected'} />
              <DetailRow label="Merchant ID" value={nestedText(result.settings, ['googleShopping', 'connection', 'merchantId'])} />
              <DetailRow label="Auto sync" value={autoSyncEnabled ? 'Enabled' : 'Disabled'} />
              <DetailRow label="Integration base URL" value={nestedText(result.settings, ['googleShopping', 'catalogSync', 'integrationBaseUrl'])} />
              <DetailRow label="Catalog synced" value={formatDate(identity.publicCatalogLastSyncedAt)} />
              <DetailRow label="Catalog issues" value={catalogIssuesCount} />
            </div>
          </SectionCard>

          <SectionCard title="Quick actions">
            <div className="grid gap-3">
              <Link href={`/admin/stores/${encodeURIComponent(decodedStoreId)}/edit`} className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-indigo-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-indigo-500">
                <Edit3 className="h-4 w-4" /> Edit this store
              </Link>
              <Link href="/admin/catalog-repair" className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">
                <Hammer className="h-4 w-4" /> Open Catalog Repair
              </Link>
              {text(identity, ['websiteUrl', 'websiteLink', 'storeWebsiteUrl'], '') ? (
                <a href={text(identity, ['websiteUrl', 'websiteLink', 'storeWebsiteUrl'], '')} target="_blank" rel="noreferrer" className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">
                  <ExternalLink className="h-4 w-4" /> Open website
                </a>
              ) : null}
              <Link href="/api/admin/firestore/store-settings?limit=100" className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">
                <Database className="h-4 w-4" /> Open raw store settings
              </Link>
            </div>
          </SectionCard>

          <SectionCard title="Recent orders">
            {recentOrders.length === 0 ? (
              <p className="text-sm leading-6 text-slate-600">No recent orders found for this store.</p>
            ) : (
              <div className="space-y-3">
                {recentOrders.map((order) => (
                  <div key={String(order.id || order.path)} className="rounded-2xl bg-slate-50 p-4 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-semibold text-slate-950">{text(order, ['customerName', 'customerEmail', 'sourceLabel', 'id'], 'Order')}</p>
                      <StatusBadge tone={text(order, ['paymentStatus', 'orderStatus', 'status'], '').toLowerCase().includes('paid') ? 'green' : 'slate'}>{text(order, ['paymentStatus', 'orderStatus', 'status'], 'Unknown')}</StatusBadge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
        </div>
      </section>
    </div>
  );
}
