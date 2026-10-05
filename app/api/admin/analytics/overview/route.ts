import { NextResponse } from 'next/server';
import { authorizeAdminRequest } from '@/lib/admin-api-auth';
import { adminFirestore } from '../../../../../lib/firebase-admin';

export const runtime = 'nodejs';
export const maxDuration = 60;

type AnalyticsEvent = {
  id?: string;
  eventName?: string;
  sessionId?: string | null;
  visitorId?: string | null;
  pagePath?: string | null;
  pageUrl?: string | null;
  trafficSource?: string | null;
  country?: string | null;
  device?: string | null;
  storeId?: string | null;
  storeName?: string | null;
  productId?: string | null;
  productName?: string | null;
  searchTerm?: string | null;
  actionTarget?: string | null;
  createdAtIso?: string | null;
  createdAt?: unknown;
};

type OrderRecord = {
  id?: string;
  paymentStatus?: string;
  payment_status?: string;
  orderStatus?: string;
  order_status?: string;
  storeId?: string;
  storeName?: string;
  amount?: number;
  amountPaid?: number;
  finalTotal?: number;
  final_total?: number;
  createdAtIso?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
};


function text(value: unknown, fallback = '') {
  if (typeof value === 'string') return value.trim() || fallback;
  if (typeof value === 'number') return String(value);
  return fallback;
}

function timestampToMillis(value: unknown): number | null {
  if (!value) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.getTime();
  if (typeof value === 'object') {
    const candidate = value as { toDate?: unknown; seconds?: unknown; _seconds?: unknown };
    if (typeof candidate.toDate === 'function') {
      const date = candidate.toDate();
      return date instanceof Date && !Number.isNaN(date.getTime()) ? date.getTime() : null;
    }
    const seconds = typeof candidate.seconds === 'number' ? candidate.seconds : typeof candidate._seconds === 'number' ? candidate._seconds : null;
    return seconds !== null ? seconds * 1000 : null;
  }
  return null;
}

function eventMillis(event: AnalyticsEvent) {
  return timestampToMillis(event.createdAtIso) ?? timestampToMillis(event.createdAt) ?? 0;
}

function orderMillis(order: OrderRecord) {
  return timestampToMillis(order.createdAtIso) ?? timestampToMillis(order.updatedAt) ?? timestampToMillis(order.createdAt) ?? 0;
}

function isPaidOrder(order: OrderRecord) {
  const status = `${text(order.paymentStatus)} ${text(order.payment_status)} ${text(order.orderStatus)} ${text(order.order_status)}`.toLowerCase();
  return /paid|success|successful|completed|complete/.test(status);
}

function amountNumber(order: OrderRecord) {
  const values = [order.finalTotal, order.final_total, order.amountPaid, order.amount];
  const amount = values.find((value) => typeof value === 'number' && Number.isFinite(value));
  return typeof amount === 'number' ? amount : 0;
}

function topBy<T>(items: T[], keyFn: (item: T) => string, labelFn?: (item: T) => string, limit = 10) {
  const map = new Map<string, { key: string; label: string; count: number }>();
  for (const item of items) {
    const key = keyFn(item).trim();
    if (!key) continue;
    const label = labelFn?.(item).trim() || key;
    const existing = map.get(key) || { key, label, count: 0 };
    existing.count += 1;
    if (label && label !== key) existing.label = label;
    map.set(key, existing);
  }
  return Array.from(map.values()).sort((a, b) => b.count - a.count).slice(0, limit);
}

function eventCount(events: AnalyticsEvent[], name: string) {
  return events.filter((event) => event.eventName === name).length;
}

function dateRangeFromUrl(req: Request) {
  const url = new URL(req.url);
  const days = Math.min(Math.max(Number(url.searchParams.get('days') || 30), 1), 365);
  const since = Date.now() - days * 24 * 60 * 60 * 1000;
  return { days, since };
}

export async function GET(req: Request) {
  const session = await authorizeAdminRequest(req, { roles: ['super_admin', 'ops_admin', 'support'] });
  if (!session) {
    return NextResponse.json({ ok: false, error: 'Only super_admin, ops_admin, or support can view analytics.', currentRole: role || null }, { status: 403 });
  }

  try {
    const { days, since } = dateRangeFromUrl(req);
    const db = adminFirestore();

    const [eventsSnap, ordersSnap] = await Promise.all([
      db.collection('analyticsEvents').orderBy('createdAt', 'desc').limit(2500).get().catch(async () => db.collection('analyticsEvents').limit(2500).get()),
      db.collection('integrationOrders').limit(1000).get(),
    ]);

    const events = eventsSnap.docs
      .map((doc) => ({ id: doc.id, ...(doc.data() as AnalyticsEvent) }))
      .filter((event) => eventMillis(event) >= since || !eventMillis(event));
    const orders = ordersSnap.docs
      .map((doc) => ({ id: doc.id, ...(doc.data() as OrderRecord) }))
      .filter((order) => orderMillis(order) >= since || !orderMillis(order));

    const visitors = new Set(events.map((event) => text(event.visitorId)).filter(Boolean)).size;
    const sessions = new Set(events.map((event) => text(event.sessionId)).filter(Boolean)).size;
    const productViews = eventCount(events, 'product_view');
    const storeViews = eventCount(events, 'store_view');
    const pageViews = eventCount(events, 'page_view') + productViews + storeViews;
    const checkoutStarted = eventCount(events, 'checkout_started');
    const paymentInitialized = eventCount(events, 'payment_initialized');
    const paidOrdersFromEvents = eventCount(events, 'order_paid');
    const paidOrdersFromOrders = orders.filter(isPaidOrder).length;
    const paidOrders = Math.max(paidOrdersFromEvents, paidOrdersFromOrders);
    const whatsappClicks = eventCount(events, 'whatsapp_click');
    const phoneClicks = eventCount(events, 'phone_click');
    const addToCart = eventCount(events, 'add_to_cart');
    const sellerProfileClicks = eventCount(events, 'seller_profile_click');
    const searches = events.filter((event) => event.eventName === 'search');
    const conversionRate = checkoutStarted > 0 ? (paidOrders / checkoutStarted) * 100 : 0;
    const revenue = orders.filter(isPaidOrder).reduce((sum, order) => sum + amountNumber(order), 0);

    return NextResponse.json({
      ok: true,
      days,
      generatedAt: new Date().toISOString(),
      totals: {
        visitors,
        sessions,
        pageViews,
        productViews,
        storeViews,
        searchEvents: searches.length,
        addToCart,
        checkoutStarted,
        paymentInitialized,
        paidOrders,
        conversionRate,
        whatsappClicks,
        phoneClicks,
        sellerProfileClicks,
        revenue,
      },
      topTrafficSources: topBy(events, (event) => text(event.trafficSource, 'direct')),
      topCountries: topBy(events, (event) => text(event.country, 'unknown')),
      topDevices: topBy(events, (event) => text(event.device, 'unknown')),
      topPages: topBy(events, (event) => text(event.pagePath || event.pageUrl), undefined, 12),
      topProducts: topBy(events.filter((event) => event.productId || event.productName || event.eventName === 'product_view'), (event) => text(event.productId || event.productName), (event) => text(event.productName || event.productId), 12),
      topStores: topBy(events.filter((event) => event.storeId || event.storeName || event.eventName === 'store_view'), (event) => text(event.storeId || event.storeName), (event) => text(event.storeName || event.storeId), 12),
      topSearchTerms: topBy(searches, (event) => text(event.searchTerm).toLowerCase(), (event) => text(event.searchTerm), 12),
      recentEvents: events.slice(0, 50).map((event) => ({
        id: event.id,
        eventName: event.eventName,
        pagePath: event.pagePath,
        trafficSource: event.trafficSource,
        country: event.country,
        device: event.device,
        storeName: event.storeName,
        productName: event.productName,
        searchTerm: event.searchTerm,
        actionTarget: event.actionTarget,
        createdAtIso: event.createdAtIso,
      })),
    });
  } catch (error) {
    console.error('[analytics-overview] failed', error);
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : 'Unable to load analytics.' }, { status: 500 });
  }
}
