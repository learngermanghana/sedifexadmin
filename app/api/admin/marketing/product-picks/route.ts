import { NextResponse } from 'next/server';
import { authorizeAdminRequest } from '@/lib/admin-api-auth';
import { adminFirestore } from '../../../../../lib/firebase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RawRecord = Record<string, unknown>;

type ProductPick = {
  id: string;
  name: string;
  price: string;
  priceNumber: number;
  currency: string;
  storeId: string;
  storeName: string;
  imageUrl: string;
  productUrl: string;
  category: string;
  score: number;
  verificationSource: string;
};

const LISTING_COLLECTIONS = ['publicListings', 'publicProducts'] as const;
const MARKET_BASE_URL = (process.env.SEDIFEX_MARKET_URL || process.env.NEXT_PUBLIC_SEDIFEX_MARKET_URL || 'https://www.sedifexmarket.com').replace(/\/+$/, '');


function text(value: unknown, fallback = '') {
  if (typeof value === 'string') return value.trim() || fallback;
  if (typeof value === 'number') return String(value);
  return fallback;
}

function numberValue(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/[^0-9.-]/g, ''));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function booleanValue(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'verified', 'approved'].includes(normalized)) return true;
    if (['false', '0', 'no', 'draft', 'hidden', 'rejected', 'suspended', 'inactive', 'unverified', 'pending'].includes(normalized)) return false;
  }
  return null;
}

function isTrue(value: unknown) {
  return booleanValue(value) === true;
}

function isFalse(value: unknown) {
  return booleanValue(value) === false;
}

function decodeImageValues(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(decodeImageValues);
  if (typeof value !== 'string') return [];
  const trimmed = value.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return parsed.flatMap(decodeImageValues);
    } catch {}
  }
  return [trimmed];
}

function normalizeImageCandidate(value: string) {
  const trimmed = value.trim().replace(/^['\"]+|['\"]+$/g, '').replace(/\\u002F/gi, '/').replace(/\\\//g, '/');
  if (!trimmed.toLowerCase().startsWith('gs://')) return trimmed;
  const withoutPrefix = trimmed.slice(5);
  const slashIndex = withoutPrefix.indexOf('/');
  if (slashIndex === -1) return '';
  return `https://storage.googleapis.com/${withoutPrefix.slice(0, slashIndex)}/${withoutPrefix.slice(slashIndex + 1)}`;
}

function isDisplayableImageUrl(value: string) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function firstImage(record: RawRecord) {
  const candidates = [record.imageUrls, record.imageUrl, record.image, record.thumbnailUrl, record.photoUrl, record.images, record.serviceImageUrl, record.serviceImageUrls]
    .flatMap(decodeImageValues)
    .map(normalizeImageCandidate)
    .filter(isDisplayableImageUrl);
  return Array.from(new Set(candidates))[0] || '';
}

function cleanName(record: RawRecord) {
  return text(record.productName || record.name || record.title)
    .replace(/\*\*/g, '')
    .replace(/^(product\s*name|item\s*name|name|title)\s*:\s*/i, '')
    .replace(/^[-–—:\s]+/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function slug(value: string) {
  return value.trim().toLowerCase().replace(/['\"]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function productUrl(productId: string, productName: string) {
  const token = slug(productName) ? `${slug(productName)}--${productId}` : productId;
  return `${MARKET_BASE_URL}/products/${encodeURIComponent(token)}`;
}

function timestampScore(value: unknown) {
  if (!value) return 0;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (typeof value === 'object') {
    const maybe = value as { seconds?: unknown; _seconds?: unknown; toDate?: unknown };
    if (typeof maybe.seconds === 'number') return maybe.seconds * 1000;
    if (typeof maybe._seconds === 'number') return maybe._seconds * 1000;
    if (typeof maybe.toDate === 'function') {
      const date = maybe.toDate();
      return date instanceof Date ? date.getTime() : 0;
    }
  }
  return 0;
}

function isPublicListing(record: RawRecord) {
  if (isTrue(record.deleted) || isTrue(record.isDeleted) || isTrue(record.hidden) || isTrue(record.isHidden)) return false;
  if (isFalse(record.visible) || isFalse(record.isVisible) || isFalse(record.isMarketplaceVisible) || isFalse(record.isPublished)) return false;
  const status = text(record.status).toLowerCase();
  if (['draft', 'hidden', 'deleted', 'suspended', 'inactive'].includes(status)) return false;
  return true;
}

function listingType(record: RawRecord) {
  return text(record.listingType || record.itemType, 'product').toLowerCase();
}

function verificationSource(store: RawRecord | undefined) {
  if (!store) return '';

  const directFields = ['verified', 'isVerified', 'verifiedStore', 'isApproved', 'isStoreVerified', 'marketplaceVerified'];
  for (const field of directFields) {
    if (isTrue(store[field])) return field;
  }

  const statusFields = ['verificationStatus', 'approvalStatus', 'storeVerificationStatus', 'marketplaceVerificationStatus'];
  for (const field of statusFields) {
    const status = text(store[field]).toLowerCase();
    if (['verified', 'approved'].includes(status)) return field;
  }

  // Important: status=active/published means the store is live, not verified.
  return '';
}

function isVerifiedStore(store: RawRecord | undefined) {
  return Boolean(verificationSource(store));
}

function storeNameFrom(store: RawRecord | undefined, listing: RawRecord) {
  return text(store?.displayName || store?.storeName || store?.name || store?.businessName || store?.merchantName || listing.storeName || listing.merchantName, 'Verified Sedifex store');
}

function formatPrice(amount: number, currency: string) {
  const normalizedCurrency = (currency || 'GHS').toUpperCase();
  const prefix = normalizedCurrency === 'GHS' || normalizedCurrency === 'GHC' ? 'GHS' : normalizedCurrency;
  return `${prefix} ${amount.toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

async function loadStores(storeIds: string[]) {
  const db = adminFirestore();
  const map = new Map<string, RawRecord>();
  await Promise.all(Array.from(new Set(storeIds.filter(Boolean))).map(async (storeId) => {
    try {
      const storesSnapshot = await db.collection('stores').doc(storeId).get();
      const settingsSnapshot = await db.collection('storeSettings').doc(storeId).get();
      const storesData = storesSnapshot.exists ? storesSnapshot.data() || {} : {};
      const settingsData = settingsSnapshot.exists ? settingsSnapshot.data() || {} : {};
      if (storesSnapshot.exists || settingsSnapshot.exists) {
        map.set(storeId, { ...settingsData, ...storesData, id: storeId, storeRecordFound: true });
      }
    } catch {}
  }));
  return map;
}

function scoreProduct(record: RawRecord, imageUrl: string, price: number) {
  let score = 0;
  score += 10;
  if (imageUrl) score += 5;
  if (price > 0) score += 4;
  if (text(record.description).length > 20) score += 1;
  if (numberValue(record.rankingScore)) score += Number(numberValue(record.rankingScore));
  if (numberValue(record.featuredRank)) score += Number(numberValue(record.featuredRank));
  score += Math.min(5, timestampScore(record.publishedAt || record.updatedAt) / 1000000000000);
  return score;
}

export async function GET(req: Request) {
  const session = await authorizeAdminRequest(req, { roles: ['super_admin', 'ops_admin', 'support'] });
  if (!session) {
    return NextResponse.json({ ok: false, error: 'Only super_admin, ops_admin, or support can generate product marketing picks.', currentRole: role || null }, { status: 403 });
  }

  try {
    const url = new URL(req.url);
    const requestedLimit = Math.min(Math.max(Number(url.searchParams.get('limit') || 5), 1), 12);
    const db = adminFirestore();
    const rawListings: RawRecord[] = [];

    for (const collectionName of LISTING_COLLECTIONS) {
      try {
        const snapshot = await db.collection(collectionName).limit(300).get();
        snapshot.docs.forEach((doc) => rawListings.push({ id: doc.id, collectionName, ...(doc.data() || {}) }));
      } catch {}
    }

    const storeIds = rawListings.map((record) => text(record.storeId || record.merchantId)).filter(Boolean);
    const stores = await loadStores(storeIds);
    const seen = new Set<string>();
    const candidates: ProductPick[] = [];
    const skipped = {
      noStoreId: 0,
      storeRecordMissing: 0,
      unverifiedStore: 0,
      missingImage: 0,
      missingPrice: 0,
      nonProduct: 0,
      notPublic: 0,
    };

    rawListings.forEach((record) => {
      const id = text(record.id);
      if (!id || seen.has(id)) return;
      seen.add(id);
      if (listingType(record) !== 'product') {
        skipped.nonProduct += 1;
        return;
      }
      if (!isPublicListing(record)) {
        skipped.notPublic += 1;
        return;
      }

      const storeId = text(record.storeId || record.merchantId);
      if (!storeId) {
        skipped.noStoreId += 1;
        return;
      }

      const store = stores.get(storeId);
      if (!store) {
        skipped.storeRecordMissing += 1;
        return;
      }

      const verified = isVerifiedStore(store);
      if (!verified) {
        skipped.unverifiedStore += 1;
        return;
      }

      const name = cleanName(record);
      const imageUrl = firstImage(record);
      const price = numberValue(record.price || record.salePrice || record.finalPrice);
      if (!imageUrl) {
        skipped.missingImage += 1;
        return;
      }
      if (!price || price <= 0) {
        skipped.missingPrice += 1;
        return;
      }
      if (!name) return;

      const currency = text(record.currency, 'GHS').toUpperCase();
      const source = verificationSource(store);
      candidates.push({
        id,
        name,
        price: formatPrice(price, currency),
        priceNumber: price,
        currency,
        storeId,
        storeName: storeNameFrom(store, record),
        imageUrl,
        productUrl: productUrl(id, name),
        category: text(record.categoryName || record.categoryKey || record.category, 'Product'),
        score: scoreProduct(record, imageUrl, price),
        verificationSource: source,
      });
    });

    const perStore = new Map<string, number>();
    const selected = candidates
      .sort((a, b) => b.score - a.score)
      .filter((item) => {
        const key = item.storeId || item.storeName;
        const count = perStore.get(key) || 0;
        if (count >= 2) return false;
        perStore.set(key, count + 1);
        return true;
      })
      .slice(0, requestedLimit);

    return NextResponse.json({
      ok: true,
      source: 'sedifex_products_strict_verified_store_records',
      requestedLimit,
      scanned: rawListings.length,
      eligible: candidates.length,
      skipped,
      products: selected,
      generatedAt: new Date().toISOString(),
      note: 'Strict mode: product emails only include products whose store document exists in stores/storeSettings and has verified/isVerified/verifiedStore/isApproved/isStoreVerified/marketplaceVerified=true or verificationStatus/approvalStatus=verified|approved. status=active/published is not enough.',
    });
  } catch (error) {
    console.error('[marketing-product-picks] failed', error);
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : 'Unable to generate product picks.' }, { status: 500 });
  }
}
