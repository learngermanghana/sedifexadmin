import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { AlertTriangle, CheckCircle2, PackagePlus, ShieldCheck, Store } from 'lucide-react';
import { SectionCard, StatusBadge } from '../../../components/admin/ui';
import { adminFirestore, getFirebaseEnvStatus } from '../../../lib/firebase-admin';
import { getAuthenticatedAdminSession } from '../../../lib/admin-session-server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type SearchParams = Promise<{ status?: string; message?: string }>;
type ItemType = 'product' | 'service' | 'course';
type StoreOption = { id: string; name: string; email: string };

const ALLOWED_ROLES = new Set(['super_admin', 'ops_admin', 'support']);
const COLLECTION_BY_TYPE: Record<ItemType, 'products' | 'services' | 'courses'> = {
  product: 'products',
  service: 'services',
  course: 'courses',
};

function text(value: unknown, fallback = '') {
  if (typeof value === 'string') return value.trim() || fallback;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return fallback;
}

function cleanForm(formData: FormData, name: string) {
  return text(formData.get(name));
}

function numberOrNull(value: string) {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function intOrNull(value: string) {
  const parsed = numberOrNull(value);
  return parsed === null ? null : Math.max(0, Math.floor(parsed));
}

function validHttpsUrl(value: string) {
  if (!value) return true;
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

async function assertClientItemAccess() {
  const session = await getAuthenticatedAdminSession();
  if (!session || session.scope !== 'platform' || !ALLOWED_ROLES.has(session.role)) {
    throw new Error('Only authenticated platform super admins, operations admins, and support staff can create client items.');
  }
  return session;
}

async function loadStores(): Promise<StoreOption[]> {
  if (!getFirebaseEnvStatus().ready) return [];
  const db = adminFirestore();
  const [profiles, settings] = await Promise.all([
    db.collection('stores').limit(500).get(),
    db.collection('storeSettings').limit(500).get(),
  ]);

  const merged = new Map<string, Record<string, unknown>>();
  profiles.docs.forEach((doc) => merged.set(doc.id, { ...(doc.data() as Record<string, unknown>), id: doc.id }));
  settings.docs.forEach((doc) => merged.set(doc.id, { ...(doc.data() as Record<string, unknown>), ...(merged.get(doc.id) || {}), id: doc.id }));

  return Array.from(merged.entries())
    .map(([id, record]) => ({
      id,
      name: text(record.displayName ?? record.storeName ?? record.businessName ?? record.name, id),
      email: text(record.publicEmail ?? record.email ?? record.ownerEmail ?? record.adminEmail, ''),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

async function createClientItem(formData: FormData) {
  'use server';

  let status: 'success' | 'error' = 'success';
  let message = '';

  try {
    const session = await assertClientItemAccess();
    const storeId = cleanForm(formData, 'storeId');
    const itemType = cleanForm(formData, 'itemType').toLowerCase() as ItemType;
    const name = cleanForm(formData, 'name');
    const category = cleanForm(formData, 'category');
    const description = cleanForm(formData, 'description');
    const imageUrl = cleanForm(formData, 'imageUrl');
    const currency = (cleanForm(formData, 'currency') || 'GHS').toUpperCase();
    const price = numberOrNull(cleanForm(formData, 'price'));
    const stockCount = intOrNull(cleanForm(formData, 'stockCount'));
    const durationMinutes = intOrNull(cleanForm(formData, 'durationMinutes'));
    const publishStatus = cleanForm(formData, 'publishStatus') === 'published' ? 'published' : 'draft';

    if (!storeId) throw new Error('Select a client workspace.');
    if (!COLLECTION_BY_TYPE[itemType]) throw new Error('Choose product, service, or course.');
    if (!name) throw new Error('Enter an item name.');
    if (price === null || price < 0) throw new Error('Enter a valid price of 0 or more.');
    if (!/^[A-Z]{3,5}$/.test(currency)) throw new Error('Currency must be a 3–5 letter code such as GHS, USD, EUR, GBP, or ZAR.');
    if (!validHttpsUrl(imageUrl)) throw new Error('Image URL must be a valid HTTPS URL.');

    const db = adminFirestore();
    const storeRef = db.collection('stores').doc(storeId);
    const settingsRef = db.collection('storeSettings').doc(storeId);
    const collectionName = COLLECTION_BY_TYPE[itemType];
    const itemRef = db.collection(collectionName).doc();
    const storeItemRef = storeRef.collection(collectionName).doc(itemRef.id);
    const auditRef = db.collection('adminAuditLogs').doc();
    const storeAuditRef = settingsRef.collection('adminAudit').doc(auditRef.id);
    const now = new Date().toISOString();
    const isPublished = publishStatus === 'published';

    const baseRecord: Record<string, unknown> = {
      storeId,
      name,
      title: name,
      itemType,
      item_type: itemType,
      type: itemType.toUpperCase(),
      category: category || null,
      categoryName: category || null,
      description: description || null,
      price,
      priceMinor: Math.round(price * 100),
      currency,
      imageUrl: imageUrl || null,
      image: imageUrl || null,
      imageUrls: imageUrl ? [imageUrl] : [],
      status: publishStatus,
      active: isPublished,
      isPublished,
      isWebsiteVisible: isPublished,
      websiteVisible: isPublished,
      marketplaceVisible: false,
      showOnMarket: false,
      isMarketplaceVisible: false,
      stockCount: itemType === 'product' ? stockCount : null,
      durationMinutes: itemType !== 'product' ? durationMinutes : null,
      createdAt: now,
      updatedAt: now,
      adminCreatedAt: now,
      adminCreatedByRole: session.role,
      adminCreatedBy: session.email,
      adminCreatedFrom: 'sedifexadmin-client-items',
    };

    if (itemType === 'product') baseRecord.productName = name;
    if (itemType === 'service') baseRecord.serviceName = name;
    if (itemType === 'course') baseRecord.courseName = name;

    await db.runTransaction(async (tx) => {
      const [storeSnapshot, settingsSnapshot] = await Promise.all([
        tx.get(storeRef),
        tx.get(settingsRef),
      ]);
      if (!storeSnapshot.exists && !settingsSnapshot.exists) {
        throw new Error('The selected client workspace no longer exists.');
      }

      tx.set(itemRef, baseRecord);
      tx.set(storeItemRef, baseRecord);
      const audit = {
        action: 'client_item_created',
        actor: 'sedifexadmin',
        actorRole: session.role,
        actorEmail: session.email,
        storeId,
        itemId: itemRef.id,
        itemType,
        collection: collectionName,
        itemName: name,
        publishStatus,
        credentialAccessed: false,
        createdAt: now,
      };
      tx.set(auditRef, audit);
      tx.set(storeAuditRef, audit);
    });

    revalidatePath('/admin/client-items');
    revalidatePath('/admin/products');
    revalidatePath('/admin/stores');
    message = `${name} was created for the selected client workspace.`;
  } catch (error) {
    status = 'error';
    message = error instanceof Error ? error.message : 'Unable to create the client item.';
  }

  redirect(`/admin/client-items?status=${status}&message=${encodeURIComponent(message)}`);
}

function ResultAlert({ status, message }: { status?: string; message?: string }) {
  if (!status || !message) return null;
  const success = status === 'success';
  return (
    <div className={`rounded-2xl border p-4 text-sm ${success ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-rose-200 bg-rose-50 text-rose-800'}`}>
      <div className="flex gap-3">
        {success ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" /> : <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />}
        <p className="font-semibold">{message}</p>
      </div>
    </div>
  );
}

export default async function ClientItemsPage({ searchParams }: { searchParams: SearchParams }) {
  try {
    await assertClientItemAccess();
  } catch {
    redirect('/admin');
  }

  const params = await searchParams;
  const env = getFirebaseEnvStatus();
  const stores = env.ready ? await loadStores() : [];

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-slate-200 bg-slate-950 p-6 text-white shadow-sm sm:p-8">
        <div className="inline-flex items-center gap-2 rounded-full border border-indigo-300/20 bg-indigo-400/10 px-3 py-1 text-xs font-semibold text-indigo-100">
          <PackagePlus className="h-4 w-4" /> Password-free client item creation
        </div>
        <h2 className="mt-5 max-w-4xl text-3xl font-bold tracking-tight sm:text-4xl">
          Add an item for a client without signing into their workspace.
        </h2>
        <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-300">
          Select the client workspace and create a product, service, or course. Sedifex writes the item directly to the correct catalog collections and records the action in the admin audit log. Client passwords are never read or stored.
        </p>
      </section>

      <ResultAlert status={params.status} message={params.message} />

      {!env.ready ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Firebase is not configured for this admin deployment.
        </div>
      ) : null}

      <section className="grid gap-6 xl:grid-cols-[1.4fr_0.6fr]">
        <SectionCard title="Create client item">
          <form action={createClientItem} className="grid gap-4 md:grid-cols-2">
            <label className="md:col-span-2">
              <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">Client workspace</span>
              <select name="storeId" required className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-indigo-300 focus:ring-4 focus:ring-indigo-100">
                <option value="">Select a workspace…</option>
                {stores.map((store) => (
                  <option key={store.id} value={store.id}>{store.name}{store.email ? ` · ${store.email}` : ''}</option>
                ))}
              </select>
            </label>

            <label>
              <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">Item type</span>
              <select name="itemType" required className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm">
                <option value="product">Product</option>
                <option value="service">Service</option>
                <option value="course">Course</option>
              </select>
            </label>

            <label>
              <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">Status</span>
              <select name="publishStatus" className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm">
                <option value="draft">Draft</option>
                <option value="published">Published on client website</option>
              </select>
            </label>

            <label className="md:col-span-2">
              <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">Name</span>
              <input name="name" required maxLength={220} placeholder="Item name" className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-indigo-300 focus:ring-4 focus:ring-indigo-100" />
            </label>

            <label>
              <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">Category</span>
              <input name="category" maxLength={180} placeholder="Consultation, Beauty, Course…" className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm" />
            </label>

            <label>
              <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">Currency</span>
              <input name="currency" defaultValue="GHS" list="client-item-currencies" maxLength={5} className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm uppercase" />
              <datalist id="client-item-currencies">
                <option value="GHS" /><option value="USD" /><option value="EUR" /><option value="GBP" /><option value="ZAR" />
              </datalist>
            </label>

            <label>
              <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">Price</span>
              <input name="price" type="number" min="0" step="0.01" required placeholder="0.00" className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm" />
            </label>

            <label>
              <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">Stock (products)</span>
              <input name="stockCount" type="number" min="0" step="1" placeholder="Optional" className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm" />
            </label>

            <label>
              <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">Duration minutes (services/courses)</span>
              <input name="durationMinutes" type="number" min="0" step="1" placeholder="Optional" className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm" />
            </label>

            <label className="md:col-span-2">
              <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">Image URL</span>
              <input name="imageUrl" type="url" placeholder="https://…" className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm" />
            </label>

            <label className="md:col-span-2">
              <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">Description</span>
              <textarea name="description" rows={5} maxLength={4000} placeholder="Describe the item for the client website." className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm leading-6" />
            </label>

            <div className="md:col-span-2">
              <button disabled={!env.ready || stores.length === 0} className="inline-flex items-center gap-2 rounded-2xl bg-indigo-600 px-5 py-3 text-sm font-bold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50">
                <PackagePlus className="h-4 w-4" /> Add client item
              </button>
            </div>
          </form>
        </SectionCard>

        <div className="space-y-6">
          <SectionCard title="Security">
            <div className="space-y-3 text-sm leading-6 text-slate-600">
              <div className="rounded-2xl bg-emerald-50 p-4 text-emerald-900">
                <div className="flex items-center gap-2 font-semibold"><ShieldCheck className="h-4 w-4" /> No client password</div>
                <p className="mt-2">This workflow uses Sedifex Admin server authorization and Firestore. It never asks for or records client credentials.</p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-4">
                <div className="flex items-center gap-2 font-semibold text-slate-950"><Store className="h-4 w-4 text-indigo-600" /> Workspace scoped</div>
                <p className="mt-2">Every item is tagged with the selected store ID and mirrored into that store’s catalog collection.</p>
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Publishing rule">
            <p className="text-sm leading-6 text-slate-600">
              Draft items stay hidden. Published items are marked for the client Sedifex website. This page does not publish anything to the retired Sedifex Market.
            </p>
            <div className="mt-3"><StatusBadge tone="blue">Website first</StatusBadge></div>
          </SectionCard>
        </div>
      </section>
    </div>
  );
}
