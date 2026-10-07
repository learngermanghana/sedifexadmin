import Link from 'next/link';
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  Eye,
  ImageIcon,
  PackageSearch,
  Save,
  Store,
  Tag,
  WalletCards,
} from 'lucide-react';
import { CatalogItemFields, type CatalogItemEditorDefaults } from '../../../components/admin/catalog-item-fields';
import { SectionCard, StatCard, StatusBadge } from '../../../components/admin/ui';
import { getFirebaseEnvStatus, listFirestoreDocuments, setFirestoreDocument } from '../../../lib/firebase-admin';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type CatalogItem = Record<string, unknown> & {
  id?: string;
  path?: string;
  updateTime?: string | null;
  createTime?: string | null;
  collectionName: 'product' | 'service' | 'course' | 'catalog';
  collectionPath: 'products' | 'services' | 'courses' | 'catalogItems';
};

type StoreRecord = Record<string, unknown> & { id?: string; path?: string };

type CollectionRead<T> = {
  ok: boolean;
  error: string | null;
  documents: T[];
};

type CatalogData = {
  connected: boolean;
  error: string | null;
  stores: StoreRecord[];
  items: CatalogItem[];
  collectionErrors: Record<string, string>;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function nestedValue(record: Record<string, unknown>, path: string[]) {
  let current: unknown = record;
  for (const key of path) {
    const object = asRecord(current);
    if (!object) return undefined;
    current = object[key];
  }
  return current;
}

function fieldText(record: Record<string, unknown>, fields: string[], fallback = '') {
  for (const field of fields) {
    const value = record[field];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number') return String(value);
  }
  return fallback;
}

function cleanText(value: FormDataEntryValue | null) {
  return typeof value === 'string' ? value.trim() : '';
}

function parseMoney(value: FormDataEntryValue | null) {
  const raw = cleanText(value).replace(/[^0-9.]/g, '');
  if (!raw) return null;
  const amount = Number(raw);
  return Number.isFinite(amount) && amount >= 0 ? amount : null;
}

function timestampToMillis(value: unknown): number | null {
  if (!value) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  if (typeof value === 'object') {
    const candidate = value as { seconds?: unknown; _seconds?: unknown; toMillis?: unknown };
    if (typeof candidate.toMillis === 'function') {
      const millis = candidate.toMillis();
      return typeof millis === 'number' && Number.isFinite(millis) ? millis : null;
    }
    const seconds = typeof candidate.seconds === 'number' ? candidate.seconds : typeof candidate._seconds === 'number' ? candidate._seconds : null;
    return seconds !== null ? seconds * 1000 : null;
  }
  return null;
}

function recordTime(record: Record<string, unknown>) {
  return timestampToMillis(record.updatedAt) ?? timestampToMillis(record.updateTime) ?? timestampToMillis(record.createdAt) ?? timestampToMillis(record.createTime);
}

function formatDate(value: unknown) {
  const millis = timestampToMillis(value);
  if (millis === null) return 'Not available';
  return new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(millis));
}

function safeCatalogPath(path: string) {
  return /^(products|services|courses|catalogItems)\/[^/]+$/.test(path);
}

function getItemName(item: CatalogItem) {
  return fieldText(item, ['name', 'title', 'productName', 'serviceName', 'courseName'], 'Untitled item');
}

function getItemType(item: CatalogItem) {
  const serviceKind = fieldText(item, ['serviceKind'], '').toLowerCase();
  if (serviceKind === 'tour_package') return 'tour_package';
  const raw = fieldText(item, ['itemType', 'type', 'kind'], item.collectionName).toLowerCase();
  if (raw === 'tour_package') return 'tour_package';
  if (raw === 'made_to_order') return 'made_to_order';
  if (raw === 'digital_item') return 'digital_item';
  if (raw.includes('service')) return 'service';
  if (raw.includes('course')) return 'course';
  if (raw.includes('catalog')) return item.collectionName === 'catalog' ? 'product' : item.collectionName;
  return raw || 'product';
}

function getStoreId(item: CatalogItem) {
  const direct = fieldText(item, ['storeId', 'ownerStoreId', 'businessId', 'tenantStoreId'], '');
  if (direct) return direct;
  const nested = nestedValue(item, ['store', 'id']) || nestedValue(item, ['merchant', 'id']) || nestedValue(item, ['business', 'id']);
  return typeof nested === 'string' ? nested : '';
}

function getCategory(item: CatalogItem) {
  return fieldText(item, ['category', 'categoryName', 'categoryId', 'serviceCategory', 'courseCategory'], '');
}

function getPriceText(item: CatalogItem) {
  return fieldText(item, ['price', 'amount', 'salePrice', 'regularPrice', 'finalPrice', 'courseFee', 'servicePrice'], '');
}

function getImageUrl(item: CatalogItem) {
  return fieldText(item, ['image', 'imageUrl', 'imageURL', 'photo', 'photoUrl', 'thumbnail', 'coverImage', 'mainImage'], '');
}

function getDescription(item: CatalogItem) {
  return fieldText(item, ['description', 'summary', 'shortDescription'], '');
}

function optionalNumberText(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : fieldText({ value } as Record<string, unknown>, ['value'], '');
}

function booleanValue(value: unknown) {
  return value === true;
}

function stringArray(value: unknown) {
  if (!Array.isArray(value)) return [] as string[];
  return value.map((entry) => typeof entry === 'string' ? entry.trim() : '').filter(Boolean);
}

function itineraryArray(value: unknown) {
  if (!Array.isArray(value)) return [] as Array<{ day: number; title: string; description: string }>;
  return value.map((entry, index) => {
    const record = asRecord(entry) || {};
    return {
      day: Math.max(1, Number(record.day) || index + 1),
      title: typeof record.title === 'string' ? record.title : '',
      description: typeof record.description === 'string' ? record.description : '',
    };
  });
}

function dateInputValue(value: unknown) {
  const millis = timestampToMillis(value);
  if (millis === null) return '';
  return new Date(millis).toISOString().slice(0, 10);
}

function catalogEditorDefaults(item: CatalogItem): CatalogItemEditorDefaults {
  const itemType = getItemType(item) as CatalogItemEditorDefaults['itemType'];
  const serviceKindRaw = fieldText(item, ['serviceKind'], '');
  const serviceKind: CatalogItemEditorDefaults['serviceKind'] =
    itemType === 'tour_package' || serviceKindRaw === 'tour_package'
      ? 'tour_package'
      : serviceKindRaw === 'quote_request'
        ? 'quote_request'
        : 'consultation';

  const courseModeRaw = fieldText(item, ['courseMode'], 'in_person');
  const courseMode: CatalogItemEditorDefaults['courseMode'] =
    courseModeRaw === 'online' || courseModeRaw === 'hybrid' ? courseModeRaw : 'in_person';

  const imageUrls = Array.isArray(item.imageUrls)
    ? stringArray(item.imageUrls)
    : stringArray(item.images);

  return {
    name: getItemName(item) === 'Untitled item' ? '' : getItemName(item),
    storeId: getStoreId(item),
    itemType,
    category: getCategory(item),
    subcategory: fieldText(item, ['subcategory'], ''),
    price: getPriceText(item),
    currency: fieldText(item, ['currency'], 'GHS').toUpperCase() === 'USD' ? 'USD' : 'GHS',
    description: getDescription(item),
    imageUrl: getImageUrl(item),
    imageUrls,
    websiteVisible: websiteVisible(item),
    sku: fieldText(item, ['sku', 'barcode'], ''),
    brand: fieldText(item, ['brand', 'manufacturerName'], ''),
    costPrice: optionalNumberText(item.costPrice),
    openingStock: optionalNumberText(item.stockCount),
    reorderPoint: optionalNumberText(item.reorderPoint ?? item.reorderLevel),
    expiryDate: dateInputValue(item.expiryDate),
    serviceKind,
    durationMinutes: optionalNumberText(item.durationMinutes),
    location: fieldText(item, ['location', 'branch'], ''),
    destination: fieldText(item, ['destination'], ''),
    tourStyle: fieldText(item, ['tourStyle'], ''),
    durationDays: optionalNumberText(item.durationDays),
    durationNights: optionalNumberText(item.durationNights),
    startingCity: fieldText(item, ['startingCity'], ''),
    endingCity: fieldText(item, ['endingCity'], ''),
    capacity: optionalNumberText(item.capacity),
    shortSummary: fieldText(item, ['shortSummary'], ''),
    itinerary: itineraryArray(item.itinerary),
    inclusions: stringArray(item.inclusions),
    exclusions: stringArray(item.exclusions),
    allowDepositPayment: booleanValue(item.allowDepositPayment),
    depositAmount: optionalNumberText(item.depositAmount),
    branch: fieldText(item, ['branch', 'location'], ''),
    preferredTimes: fieldText(item, ['preferredTimes', 'classTimes'], ''),
    startDate: dateInputValue(item.startDate),
    registrationFee: optionalNumberText(item.registrationFee),
    fullFee: optionalNumberText(item.fullFee),
    duration: fieldText(item, ['duration'], ''),
    courseLevel: fieldText(item, ['courseLevel'], ''),
    courseMode,
    requirements: fieldText(item, ['requirements'], ''),
    starterItems: fieldText(item, ['starterItems'], ''),
    certificateIncluded: booleanValue(item.certificateIncluded),
    Agreement: fieldText(item, ['Agreement'], ''),
  };
}

function hasImage(item: CatalogItem) {
  if (getImageUrl(item)) return true;
  return [item.images, item.gallery, item.photos].some((value) => Array.isArray(value) && value.length > 0);
}

function hasPrice(item: CatalogItem) {
  const value = getPriceText(item);
  return value !== '' && Number(String(value).replace(/[^0-9.]/g, '')) > 0;
}

function hasCategory(item: CatalogItem) {
  return Boolean(getCategory(item));
}

function websiteVisible(item: CatalogItem) {
  if (item.isWebsiteVisible === true || item.websiteVisible === true) return true;
  if (item.isWebsiteVisible === false || item.websiteVisible === false) return false;

  const legacyMarketplaceVisible =
    item.marketplaceVisible === true ||
    item.showOnMarket === true ||
    item.isMarketplaceVisible === true;

  // Marketplace-only visibility is not evidence that an item is published on a
  // client website. Keep the two publication channels independent.
  if (legacyMarketplaceVisible) return false;

  const status = fieldText(item, ['status', 'visibility', 'state'], '').toLowerCase();
  if (['draft', 'hidden', 'private', 'inactive'].includes(status)) return false;
  if (item.isPublished === false || item.active === false) return false;

  return item.isPublished === true || item.active === true || ['active', 'published', 'visible', 'live'].includes(status);
}

function catalogIssues(item: CatalogItem) {
  return [
    getItemName(item) === 'Untitled item' ? 'Missing name' : null,
    !getStoreId(item) ? 'Missing store ID' : null,
    !hasImage(item) ? 'Missing image' : null,
    !hasPrice(item) ? 'Missing price' : null,
    !hasCategory(item) ? 'Missing category' : null,
    !websiteVisible(item) ? 'Not published to website' : null,
  ].filter(Boolean) as string[];
}

function storeName(store: StoreRecord) {
  return fieldText(store, ['storeName', 'name', 'businessName', 'displayName', 'merchantName', 'id'], 'Unnamed store');
}

function buildStoreMap(stores: StoreRecord[]) {
  return new Map(stores.filter((store) => store.id).map((store) => [String(store.id), storeName(store)]));
}

function itemStatusTone(item: CatalogItem) {
  const issues = catalogIssues(item);
  if (issues.some((issue) => issue === 'Missing store ID' || issue === 'Missing price')) return 'red' as const;
  if (issues.length > 0) return 'yellow' as const;
  return 'green' as const;
}

async function readCollection<T extends Record<string, unknown>>(collectionPath: string): Promise<CollectionRead<T>> {
  try {
    const result = await listFirestoreDocuments(collectionPath, 100);
    return { ok: true, error: null, documents: result.documents as unknown as T[] };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : `Unable to read ${collectionPath}.`,
      documents: [],
    };
  }
}

async function loadCatalog(): Promise<CatalogData> {
  const env = getFirebaseEnvStatus();
  if (!env.ready) {
    return {
      connected: false,
      error: 'Firebase environment variables are not ready in this deployment.',
      stores: [],
      items: [],
      collectionErrors: {},
    };
  }

  const [stores, products, services, courses, catalogItems] = await Promise.all([
    readCollection<StoreRecord>('storeSettings'),
    readCollection<Record<string, unknown>>('products'),
    readCollection<Record<string, unknown>>('services'),
    readCollection<Record<string, unknown>>('courses'),
    readCollection<Record<string, unknown>>('catalogItems'),
  ]);

  const collectionErrors: Record<string, string> = {};
  Object.entries({ storeSettings: stores, products, services, courses, catalogItems }).forEach(([key, result]) => {
    if (!result.ok && result.error) collectionErrors[key] = result.error;
  });

  const items: CatalogItem[] = [
    ...products.documents.map((item) => ({ ...item, collectionName: 'product' as const, collectionPath: 'products' as const })),
    ...services.documents.map((item) => ({ ...item, collectionName: 'service' as const, collectionPath: 'services' as const })),
    ...courses.documents.map((item) => ({ ...item, collectionName: 'course' as const, collectionPath: 'courses' as const })),
    ...catalogItems.documents.map((item) => ({ ...item, collectionName: 'catalog' as const, collectionPath: 'catalogItems' as const })),
  ];

  return {
    connected: stores.ok,
    error: stores.error,
    stores: stores.documents,
    items,
    collectionErrors,
  };
}

async function updateCatalogItem(itemPath: string, formData: FormData) {
  'use server';

  if (!safeCatalogPath(itemPath)) {
    throw new Error('Unsafe catalog path. Only products, services, courses, and catalogItems can be edited here.');
  }

  const now = new Date().toISOString();
  const name = cleanText(formData.get('name'));
  const storeId = cleanText(formData.get('storeId'));
  const rawItemType = cleanText(formData.get('itemType')) || 'product';
  const rawServiceKind = cleanText(formData.get('serviceKind')) || 'consultation';
  const itemType = rawItemType === 'tour_package' || rawServiceKind === 'tour_package'
    ? 'tour_package'
    : ['product', 'service', 'made_to_order', 'course', 'digital_item'].includes(rawItemType)
      ? rawItemType
      : 'product';

  const isTourPackage = itemType === 'tour_package';
  const isCourse = itemType === 'course';
  const isService = itemType === 'service' || itemType === 'made_to_order' || isTourPackage;
  const behavesLikeService = isService || isCourse;

  const category = cleanText(formData.get('category'));
  const subcategory = cleanText(formData.get('subcategory'));
  const imageUrl = cleanText(formData.get('imageUrl'));
  const imageUrls = cleanText(formData.get('imageUrls')).split(/\r?\n/).map((value) => value.trim()).filter(Boolean);
  const normalizedImageUrls = Array.from(new Set([imageUrl, ...imageUrls].filter(Boolean)));
  const description = cleanText(formData.get('description'));
  const price = parseMoney(formData.get('price'));
  const currency = cleanText(formData.get('currency')).toUpperCase() === 'USD' ? 'USD' : 'GHS';
  const visible = formData.get('websiteVisible') === 'on';
  const serviceKind = isTourPackage
    ? 'tour_package'
    : isCourse
      ? 'course_enrollment'
      : rawServiceKind === 'quote_request'
        ? 'quote_request'
        : 'consultation';
  const listingType = isCourse ? 'course' : isService ? 'service' : 'product';
  const salesMode = isCourse ? 'register' : isService ? (serviceKind === 'quote_request' ? 'request_quote' : 'book_now') : 'buy_now';

  const itineraryDays = formData.getAll('itineraryDay');
  const itineraryTitles = formData.getAll('itineraryTitle');
  const itineraryDescriptions = formData.getAll('itineraryDescription');
  const itinerary = itineraryTitles.map((value, index) => ({
    day: Math.max(1, Number(cleanText(itineraryDays[index] ?? null)) || index + 1),
    title: cleanText(value),
    description: cleanText(itineraryDescriptions[index] ?? null),
  })).filter((entry) => entry.title || entry.description);

  const inclusions = formData.getAll('inclusions').map((value) => cleanText(value)).filter(Boolean);
  const exclusions = formData.getAll('exclusions').map((value) => cleanText(value)).filter(Boolean);

  const update: Record<string, unknown> = {
    itemType,
    type: itemType,
    listingType,
    serviceKind,
    salesMode,
    enrollmentMode: isCourse ? 'always_open' : isTourPackage ? 'scheduled' : null,
    category: category || null,
    categoryName: category || null,
    categoryKey: category ? category.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') : null,
    subcategory: subcategory || null,
    description: description || null,
    price,
    currency,
    imageUrl: normalizedImageUrls[0] || null,
    image: normalizedImageUrls[0] || null,
    imageUrls: normalizedImageUrls,
    imageAlt: name || null,
    isWebsiteVisible: visible,
    websiteVisible: visible,
    isPublished: true,
    active: true,
    status: 'published',
    adminUpdatedAt: now,
    adminUpdatedFrom: 'sedifexadmin-client-catalog-review',

    costPrice: behavesLikeService ? null : parseMoney(formData.get('costPrice')),
    sku: behavesLikeService ? null : cleanText(formData.get('sku')) || null,
    barcode: behavesLikeService ? null : cleanText(formData.get('sku')) || null,
    stockCount: behavesLikeService ? null : parseMoney(formData.get('openingStock')),
    reorderPoint: behavesLikeService ? null : parseMoney(formData.get('reorderPoint')),
    expiryDate: behavesLikeService || !cleanText(formData.get('expiryDate')) ? null : cleanText(formData.get('expiryDate')),
    brand: behavesLikeService ? null : cleanText(formData.get('brand')) || null,
    manufacturerName: behavesLikeService ? null : cleanText(formData.get('brand')) || null,

    durationMinutes: isService && !isTourPackage ? parseMoney(formData.get('durationMinutes')) : null,
    location: isService && !isTourPackage ? cleanText(formData.get('location')) || null : null,

    destination: isTourPackage ? cleanText(formData.get('destination')) || null : null,
    tourStyle: isTourPackage ? cleanText(formData.get('tourStyle')) || null : null,
    durationDays: isTourPackage ? parseMoney(formData.get('durationDays')) : null,
    durationNights: isTourPackage ? parseMoney(formData.get('durationNights')) : null,
    startingCity: isTourPackage ? cleanText(formData.get('startingCity')) || null : null,
    endingCity: isTourPackage ? cleanText(formData.get('endingCity')) || null : null,
    shortSummary: isTourPackage ? cleanText(formData.get('shortSummary')) || null : null,
    itinerary: isTourPackage ? itinerary : [],
    inclusions: isTourPackage ? inclusions : [],
    exclusions: isTourPackage ? exclusions : [],
    allowDepositPayment: isTourPackage ? formData.get('allowDepositPayment') === 'on' : false,
    depositAmount: isTourPackage ? parseMoney(formData.get('depositAmount')) : null,

    branch: isCourse ? cleanText(formData.get('branch')) || null : null,
    preferredTimes: isCourse ? cleanText(formData.get('preferredTimes')) || null : null,
    classTimes: isCourse ? cleanText(formData.get('preferredTimes')) || null : null,
    startDate: isCourse ? cleanText(formData.get('startDate')) || null : null,
    registrationFee: isCourse ? parseMoney(formData.get('registrationFee')) : null,
    fullFee: isCourse ? parseMoney(formData.get('fullFee')) ?? price : null,
    duration: isCourse ? cleanText(formData.get('duration')) || null : null,
    capacity: isCourse || isTourPackage ? parseMoney(formData.get('capacity')) : null,
    courseLevel: isCourse ? cleanText(formData.get('courseLevel')) || null : null,
    courseMode: isCourse ? cleanText(formData.get('courseMode')) || 'in_person' : null,
    requirements: isCourse ? cleanText(formData.get('requirements')) || null : null,
    starterItems: isCourse ? cleanText(formData.get('starterItems')) || null : null,
    certificateIncluded: isCourse ? formData.get('certificateIncluded') === 'on' : null,
    Agreement: isCourse ? cleanText(formData.get('Agreement')) || null : null,
  };

  if (name) {
    update.name = name;
    update.title = name;
  }
  if (storeId) update.storeId = storeId;
  if (currency === 'GHS' && price !== null) update.priceGhs = price;
  if (currency === 'USD' && price !== null) update.priceUsd = price;

  await setFirestoreDocument(itemPath, update);

  if (storeId) {
    await setFirestoreDocument(`storeSettings/${storeId}/adminAudit/${Date.now()}`, {
      action: 'catalog_item_updated_from_catalog_review',
      actor: 'sedifexadmin',
      createdAt: now,
      itemPath,
      changedFields: Object.keys(update),
    });
  }
}


export default async function ProductsPage() {
  const catalog = await loadCatalog();
  const storeMap = buildStoreMap(catalog.stores);
  const items = [...catalog.items].sort((a, b) => {
    const issueDiff = catalogIssues(b).length - catalogIssues(a).length;
    if (issueDiff !== 0) return issueDiff;
    return (recordTime(b) || 0) - (recordTime(a) || 0);
  });

  const itemsWithIssues = items.filter((item) => catalogIssues(item).length > 0);
  const missingStore = items.filter((item) => !getStoreId(item)).length;
  const missingImage = items.filter((item) => !hasImage(item)).length;
  const missingPrice = items.filter((item) => !hasPrice(item)).length;
  const missingCategory = items.filter((item) => !hasCategory(item)).length;
  const hiddenItems = items.filter((item) => !websiteVisible(item)).length;
  const readyItems = items.length - itemsWithIssues.length;

  const stats = [
    { label: 'Catalog items', value: catalog.connected ? String(items.length) : 'Setup', delta: catalog.connected ? 'Products, services, courses' : 'Check Firebase envs' },
    { label: 'Need review', value: catalog.connected ? String(itemsWithIssues.length) : '—', delta: 'Items with one or more issues' },
    { label: 'Website ready', value: catalog.connected ? String(readyItems) : '—', delta: 'Ready for client website use' },
    { label: 'Missing store ID', value: catalog.connected ? String(missingStore) : '—', delta: 'Cannot reliably show under store' },
  ];

  const issueCards = [
    { title: 'Missing images', value: missingImage, description: 'Items without image, imageUrl, thumbnail, gallery, or photos.', icon: ImageIcon, tone: missingImage > 0 ? ('yellow' as const) : ('green' as const) },
    { title: 'Missing prices', value: missingPrice, description: 'Items that cannot be sold because price is missing or zero.', icon: WalletCards, tone: missingPrice > 0 ? ('red' as const) : ('green' as const) },
    { title: 'Missing categories', value: missingCategory, description: 'Items that may fail grouping, filtering, and homepage sections.', icon: Tag, tone: missingCategory > 0 ? ('yellow' as const) : ('green' as const) },
    { title: 'Not on website', value: hiddenItems, description: 'Items not yet marked published or visible for the client website.', icon: Eye, tone: hiddenItems > 0 ? ('yellow' as const) : ('green' as const) },
  ];

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-slate-200 bg-slate-950 p-6 text-white shadow-sm sm:p-8">
        <div className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-indigo-300/20 bg-indigo-400/10 px-3 py-1 text-xs font-semibold text-indigo-100">
              <PackageSearch className="h-4 w-4" /> Catalog Review
            </div>
            <h2 className="mt-5 max-w-3xl text-3xl font-bold tracking-tight sm:text-4xl">
              Review product, service, and course data before it appears on client Sedifex websites.
            </h2>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-300">
              Review missing client workspace IDs, images, prices, categories, item types, and website publishing state from one admin page.
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
            <p className="text-sm font-semibold text-slate-200">Catalog health</p>
            <div className="mt-4 space-y-3 text-sm text-slate-300">
              <div className="flex items-center justify-between gap-3">
                <span>Ready items</span>
                <StatusBadge tone="green">{catalog.connected ? readyItems : '—'}</StatusBadge>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span>Need review</span>
                <StatusBadge tone={itemsWithIssues.length > 0 ? 'yellow' : 'green'}>{catalog.connected ? itemsWithIssues.length : '—'}</StatusBadge>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span>Stores loaded</span>
                <StatusBadge tone="blue">{catalog.connected ? catalog.stores.length : '—'}</StatusBadge>
              </div>
            </div>
          </div>
        </div>
      </section>

      {catalog.error ? (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <div className="flex gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <p className="font-semibold">Catalog data is not fully available.</p>
              <p className="mt-1 leading-6">{catalog.error}</p>
            </div>
          </div>
        </section>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => <StatCard key={stat.label} {...stat} />)}
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {issueCards.map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.title} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <span className="rounded-2xl bg-slate-50 p-3 text-indigo-600 ring-1 ring-slate-200"><Icon className="h-5 w-5" /></span>
                <StatusBadge tone={card.tone}>{card.value}</StatusBadge>
              </div>
              <h3 className="mt-4 text-sm font-semibold text-slate-950">{card.title}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">{card.description}</p>
            </div>
          );
        })}
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.4fr_0.6fr]">
        <SectionCard title="Repair catalog items">
          {items.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm leading-6 text-slate-600">
              No catalog items were found yet. This page checks products, services, courses, and catalogItems when those collections exist.
            </div>
          ) : (
            <div className="space-y-4">
              {items.slice(0, 80).map((item) => {
                const itemPath = String(item.path || `${item.collectionPath}/${item.id || ''}`);
                const issues = catalogIssues(item);
                const updateAction = updateCatalogItem.bind(null, itemPath);
                const storeId = getStoreId(item);
                const linkedStoreName = storeId ? storeMap.get(storeId) || storeId : 'No store linked';

                return (
                  <form key={itemPath} action={updateAction} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-sm font-semibold text-slate-950">{getItemName(item)}</h3>
                          <StatusBadge tone="blue">{getItemType(item)}</StatusBadge>
                          <StatusBadge tone={itemStatusTone(item)}>{issues.length > 0 ? `${issues.length} issues` : 'Ready'}</StatusBadge>
                        </div>
                        <p className="mt-1 truncate text-xs text-slate-500">{itemPath}</p>
                        <p className="mt-1 flex items-center gap-1 text-xs text-slate-500"><Store className="h-3.5 w-3.5" /> {linkedStoreName}</p>
                      </div>
                      {storeId ? (
                        <Link href={`/admin/stores/${encodeURIComponent(storeId)}`} className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-500">
                          Open store <ArrowUpRight className="h-3.5 w-3.5" />
                        </Link>
                      ) : null}
                    </div>

                    {issues.length > 0 ? (
                      <div className="mb-4 flex flex-wrap gap-2">
                        {issues.map((issue) => <StatusBadge key={`${itemPath}-${issue}`} tone={issue === 'Missing store ID' || issue === 'Missing price' ? 'red' : 'yellow'}>{issue}</StatusBadge>)}
                      </div>
                    ) : (
                      <div className="mb-4 flex items-center gap-2 rounded-2xl bg-emerald-50 p-3 text-sm text-emerald-700">
                        <CheckCircle2 className="h-4 w-4" /> This item has no detected catalog errors.
                      </div>
                    )}

                    <CatalogItemFields
                      defaults={catalogEditorDefaults(item)}
                      fieldIdPrefix={itemPath.replace(/[^a-zA-Z0-9_-]/g, '-')}
                    />

                    <div className="mt-4 flex justify-end">
                      <button className="inline-flex items-center justify-center gap-2 rounded-2xl bg-indigo-500 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-indigo-400">
                        <Save className="h-4 w-4" /> Save item
                      </button>
                    </div>
                  </form>
                );
              })}
            </div>
          )}
        </SectionCard>

        <div className="space-y-6">
          <SectionCard title="How to use this page">
            <div className="space-y-3 text-sm leading-6 text-slate-600">
              <div className="rounded-2xl bg-slate-50 p-4">
                <div className="mb-2 flex items-center gap-2 font-semibold text-slate-950"><Store className="h-4 w-4 text-indigo-600" /> Link to store</div>
                Every item should have a valid storeId so Sedifex can serve it to the correct client website.
              </div>
              <div className="rounded-2xl bg-slate-50 p-4">
                <div className="mb-2 flex items-center gap-2 font-semibold text-slate-950"><WalletCards className="h-4 w-4 text-indigo-600" /> Add price</div>
                Items without price cannot create a clean checkout preview.
              </div>
              <div className="rounded-2xl bg-slate-50 p-4">
                <div className="mb-2 flex items-center gap-2 font-semibold text-slate-950"><Tag className="h-4 w-4 text-indigo-600" /> Add category</div>
                Categories help the homepage, search, and tabs separate products, services, and courses.
              </div>
              <div className="rounded-2xl bg-slate-50 p-4">
                <div className="mb-2 flex items-center gap-2 font-semibold text-slate-950"><Eye className="h-4 w-4 text-indigo-600" /> Publish to client website</div>
                Turn this on when the item is ready to appear on the client’s connected Sedifex website.
              </div>
            </div>
          </SectionCard>

          {Object.keys(catalog.collectionErrors).length > 0 ? (
            <SectionCard title="Collection notices">
              <div className="space-y-2 text-xs leading-5 text-slate-500">
                {Object.entries(catalog.collectionErrors).map(([key, error]) => (
                  <p key={key} className="rounded-xl bg-slate-50 p-3">
                    <span className="font-semibold text-slate-700">{key}:</span> {error}
                  </p>
                ))}
              </div>
            </SectionCard>
          ) : null}
        </div>
      </section>
    </div>
  );
}
