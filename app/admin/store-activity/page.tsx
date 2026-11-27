import Link from 'next/link';
import { Activity, AlertTriangle, ArrowUpRight, Clock3, Search, Store } from 'lucide-react';
import { SectionCard, StatCard, StatusBadge } from '../../../components/admin/ui';
import { getFirebaseEnvStatus, listFirestoreDocuments, listBookingNotifications } from '../../../lib/firebase-admin';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type SearchParams = Promise<{ q?: string }>;
type RecordDoc = Record<string, unknown> & {
  id?: string;
  path?: string;
  updateTime?: string | null;
  createTime?: string | null;
};

type ActivityEvent = {
  id: string;
  storeId: string;
  moduleId: string;
  moduleLabel: string;
  action: string;
  description: string;
  recordId: string;
  bookingKeys?: string[];
  subject: string;
  amount: number;
  at: number | null;
  href: string;
  tone: 'green' | 'yellow' | 'red' | 'blue' | 'slate';
};

type StoreActivityRow = {
  id: string;
  name: string;
  contact: string;
  phone: string;
  status: 'active' | 'warm' | 'quiet' | 'empty';
  lastAt: number | null;
  totalRecords: number;
  revenue: number;
  recentEvents: ActivityEvent[];
};

const COLLECTIONS = [
  { id: 'storeProfiles', label: 'Store profile', collection: 'stores', amount: false },
  { id: 'storeSettings', label: 'Store settings', collection: 'storeSettings', amount: false },
  { id: 'orders', label: 'Orders / sales', collection: 'integrationOrders', amount: true },
  { id: 'bookings', label: 'Website bookings', collection: 'integrationBookings', amount: true },
  { id: 'customers', label: 'Customers', collection: 'customers', amount: false },
  { id: 'products', label: 'Products', collection: 'products', amount: false },
  { id: 'publicProducts', label: 'Public products', collection: 'publicProducts', amount: false },
  { id: 'publicListings', label: 'Marketplace listings', collection: 'publicListings', amount: false },
  { id: 'services', label: 'Services', collection: 'services', amount: false },
  { id: 'courses', label: 'Courses', collection: 'courses', amount: false },
  { id: 'catalogItems', label: 'Catalog items', collection: 'catalogItems', amount: false },
  { id: 'webhookDeliveries', label: 'Webhook deliveries', collection: 'webhookDeliveries', amount: false },
  { id: 'analyticsEvents', label: 'Client actions', collection: 'analyticsEvents', amount: false },
] as const;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function text(value: unknown, fallback = '') {
  if (typeof value === 'string') return value.trim() || fallback;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return fallback;
}

function field(record: RecordDoc | null | undefined, keys: string[], fallback = '') {
  if (!record) return fallback;
  for (const key of keys) {
    const value = text(record[key]);
    if (value) return value;
  }
  return fallback;
}

function millis(value: unknown): number | null {
  if (!value) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'object') {
    const candidate = value as { seconds?: unknown; _seconds?: unknown };
    const seconds =
      typeof candidate.seconds === 'number'
        ? candidate.seconds
        : typeof candidate._seconds === 'number'
          ? candidate._seconds
          : null;
    return seconds === null ? null : seconds * 1000;
  }
  return null;
}

function recordTime(record: RecordDoc) {
  return (
    millis(record.lastActivityAt) ??
    millis(record.paymentUpdatedAt) ??
    millis(record.confirmedAt) ??
    millis(record.completedAt) ??
    millis(record.updatedAt) ??
    millis(record.updated_at) ??
    millis(record.updateTime) ??
    millis(record.createdAt) ??
    millis(record.created_at) ??
    millis(record.orderDate) ??
    millis(record.createTime)
  );
}

function storeId(record: RecordDoc, moduleId: string) {
  const direct = field(record, [
    'storeId', 'store_id', 'merchantId', 'merchant_id', 'businessId', 'business_id', 'workspaceId', 'sellerId',
  ]);
  if (direct) return direct;
  const metadata = asRecord(record.metadata);
  const nested = text(metadata?.storeId ?? metadata?.store_id ?? metadata?.merchantId);
  if (nested) return nested;
  return moduleId === 'storeProfiles' || moduleId === 'storeSettings' ? text(record.id) : '';
}

function firstItem(record: RecordDoc) {
  const items = Array.isArray(record.items) ? record.items : [];
  return asRecord(items[0]);
}

function itemName(record: RecordDoc) {
  const item = firstItem(record);
  return field(record, ['itemName', 'productName', 'serviceName', 'courseName', 'name', 'title']) ||
    text(item?.name ?? item?.productName ?? item?.itemName ?? item?.serviceName) || 'Item';
}

function customerName(record: RecordDoc) {
  const customer = asRecord(record.customer);
  return field(record, ['customerName', 'buyerName', 'name', 'fullName']) || text(customer?.name) || 'Customer';
}

function statusText(record: RecordDoc) {
  return [record.paymentStatus, record.payment_status, record.bookingStatus, record.booking_status, record.orderStatus,
    record.order_status, record.fulfillmentStatus, record.deliveryStatus, record.status]
    .map((value) => text(value).toLowerCase()).filter(Boolean).join(' ');
}

function amount(record: RecordDoc) {
  const payment = asRecord(record.payment);
  const minor = record.amountMinor ?? record.amount_minor ?? payment?.amountMinor ?? payment?.amount_minor;
  if (typeof minor === 'number' && Number.isFinite(minor)) return minor / 100;
  const candidates = [
    payment?.customerTotal,
    payment?.amount,
    record.customerTotal,
    record.finalTotal,
    record.final_total,
    record.amountPaid,
    record.amount_paid,
    record.confirmedAmount,
    record.totalAmount,
    record.total_amount,
    record.grandTotal,
    record.total,
    record.amount,
  ];
  const found = candidates.find((value) => typeof value === 'number' && Number.isFinite(value));
  return typeof found === 'number' ? found : 0;
}

function paid(record: RecordDoc) {
  const status = statusText(record);
  return !/failed|cancelled|canceled|declined|abandoned|refunded/.test(status) &&
    /paid|success|successful|confirmed|delivered|completed|paid_cash/.test(status);
}

function money(value: number) {
  return `GHS ${value.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function age(value: number | null) {
  if (!value) return 'No activity';
  const minutes = Math.max(0, Math.round((Date.now() - value) / 60000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  return hours < 48 ? `${hours}h ago` : `${Math.round(hours / 24)}d ago`;
}

function date(value: number | null) {
  if (!value) return 'No activity yet';
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

function normalized(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function orderKind(record: RecordDoc) {
  const metadata = asRecord(record.metadata);
  const item = firstItem(record);
  const combined = [
    record.recordType, record.orderType, record.order_type, record.itemType, record.item_type,
    record.sourceLabel, record.sourceChannel, record.source, metadata?.quickPayType, metadata?.accountingType,
    item?.type, item?.itemType, item?.item_type,
  ].map((value) => text(value).toLowerCase()).join(' ');
  if (/booking|appointment/.test(combined)) return 'booking';
  if (/service|course|donation|registration/.test(combined)) return 'service';
  if (/store.?only|manual|cash|quick.?pay.?cash/.test(combined)) return 'manual';
  return 'product';
}

function eventFor(record: RecordDoc, moduleId: string, moduleLabel: string, ownerId: string): ActivityEvent {
  const recordId = text(record.id, text(record.path, 'record'));
  const at = recordTime(record);
  const status = statusText(record);
  const total = paid(record) ? amount(record) : 0;
  const subject = itemName(record);
  let action = moduleLabel;
  let description = `${moduleLabel} record changed.`;
  let tone: ActivityEvent['tone'] = 'slate';
  let href = `/admin/stores/${encodeURIComponent(ownerId)}`;

  if (moduleId === 'orders') {
    const kind = orderKind(record);
    const name = customerName(record);
    tone = /failed|cancelled|declined/.test(status) ? 'red' : paid(record) ? 'green' : 'blue';
    if (/failed|cancelled|declined/.test(status)) action = 'Payment or order failed';
    else if (/delivered|completed/.test(status)) action = kind === 'booking' ? 'Completed booking' : kind === 'service' ? 'Completed service sale' : kind === 'manual' ? 'Completed cash sale' : 'Completed product sale';
    else if (paid(record)) action = kind === 'booking' ? 'Received booking payment' : kind === 'service' ? 'Received service payment' : kind === 'manual' ? 'Recorded cash sale' : 'Completed product sale';
    else action = kind === 'booking' ? 'Created booking order' : kind === 'service' ? 'Created service order' : kind === 'manual' ? 'Created manual sale' : 'Created product order';
    description = `${name} ${paid(record) ? 'paid for' : 'started'} ${subject}${total ? ` · ${money(total)}` : ''}.`;
    href = '/admin/orders';
  } else if (moduleId === 'bookings') {
    tone = /failed|cancelled|declined/.test(status) ? 'red' : /completed|confirmed|paid|success/.test(status) ? 'green' : 'blue';
    action = /completed/.test(status) ? 'Completed website booking' : /confirmed|paid|success/.test(status) ? 'Confirmed website booking' : /failed|cancelled|declined/.test(status) ? 'Booking payment failed' : 'Created website booking';
    description = `${customerName(record)} booked ${subject}${total ? ` · ${money(total)}` : ''}.`;
    href = `/admin/bookings?view=all&q=${encodeURIComponent(recordId)}`;
  } else if (moduleId === 'customers') {
    action = 'Saved customer'; tone = 'blue';
    description = `${customerName(record)} was saved to the customer list.`;
    href = '/admin/customers';
  } else if (moduleId === 'products' || moduleId === 'publicProducts') {
    action = 'Updated product or inventory';
    description = `${subject} changed in the ${moduleId === 'publicProducts' ? 'public catalog' : 'store catalog'}.`;
    href = '/admin/products';
  } else if (moduleId === 'publicListings' || moduleId === 'catalogItems') {
    action = 'Updated marketplace listing'; description = `${subject} changed in marketplace records.`; href = '/admin/products';
  } else if (moduleId === 'services' || moduleId === 'courses') {
    action = moduleId === 'services' ? 'Updated service' : 'Updated course'; description = `${subject} changed in the catalog.`; href = '/admin/products';
  } else if (moduleId === 'storeProfiles') {
    action = 'Updated store profile'; tone = 'yellow';
    description = `${field(record, ['displayName', 'storeName', 'name', 'businessName'], ownerId)} profile is available in Sedifex.`;
  } else if (moduleId === 'storeSettings') {
    action = 'Updated store settings'; tone = 'yellow'; description = 'Store settings were changed.';
  } else if (moduleId === 'webhookDeliveries') {
    const deliveryStatus = field(record, ['status', 'result', 'deliveryStatus']).toLowerCase();
    tone = /fail|error|retry/.test(deliveryStatus) ? 'red' : /^(success|delivered|accepted)$/.test(deliveryStatus) ? 'green' : 'slate';
    action = tone === 'red' ? 'Webhook failed or retried' : tone === 'green' ? 'Webhook delivered' : 'Webhook processed / status unknown';
    description = `${field(record, ['eventType', 'event', 'topic', 'type'], 'Webhook event')} ${deliveryStatus || 'was processed'}. Email delivery is tracked separately.`;
    href = '/admin/deliveries';
  } else if (moduleId === 'analyticsEvents') {
    const eventName = field(record, ['eventName', 'event', 'name', 'type'], 'client_action').toLowerCase();
    action = eventName.replace(/[_.-]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
    description = `Client action recorded${subject !== 'Item' ? ` for ${subject}` : ''}.`;
    tone = /paid|checkout|cart|whatsapp|phone/.test(eventName) ? 'green' : 'blue';
    href = '/admin/analytics';
  }

  return { id: `${moduleId}-${ownerId}-${recordId}`, storeId: ownerId, moduleId, moduleLabel, action, description, recordId, bookingKeys: moduleId === 'bookings' ? [...new Set([recordId, text(record.bookingId), text(record.booking_id), text(record.reference), text(record.bookingReference)].filter(Boolean))] : undefined, subject, amount: total, at, href, tone };
}

function isTransaction(event: ActivityEvent) { return event.moduleId === 'orders' || event.moduleId === 'bookings'; }
function isCatalogNoise(event: ActivityEvent) { return ['products', 'publicProducts', 'publicListings', 'catalogItems'].includes(event.moduleId); }

function refineEvents(events: ActivityEvent[]) {
  const sorted = [...events].sort((a, b) => (b.at || 0) - (a.at || 0));
  const kept: ActivityEvent[] = [];
  for (const event of sorted) {
    if (isCatalogNoise(event)) {
      const subject = normalized(event.subject);
      const linkedSale = sorted.find((candidate) => isTransaction(candidate) && Boolean(event.at) && Boolean(candidate.at) && Math.abs((candidate.at || 0) - (event.at || 0)) <= 3 * 60_000 && Boolean(subject) && normalized(candidate.subject) === subject);
      if (linkedSale) continue;
      const duplicate = kept.some((candidate) => isCatalogNoise(candidate) && Boolean(event.at) && Boolean(candidate.at) && normalized(candidate.subject) === subject && Math.abs((candidate.at || 0) - (event.at || 0)) <= 2 * 60_000);
      if (duplicate) continue;
    }
    kept.push(event);
  }
  return kept;
}

async function safeRead(collection: string) {
  try {
    const result = await listFirestoreDocuments(collection, 600);
    return { ok: true, documents: result.documents as RecordDoc[], error: null as string | null };
  } catch (error) {
    return { ok: false, documents: [] as RecordDoc[], error: error instanceof Error ? error.message : `Unable to read ${collection}.` };
  }
}

async function loadData() {
  const env = getFirebaseEnvStatus();
  if (!env.ready) return { error: 'Firebase environment variables are not ready.', stores: [] as StoreActivityRow[], events: [] as ActivityEvent[] };
  const results = await Promise.all(COLLECTIONS.map((config) => safeRead(config.collection)));
  const profiles = new Map<string, RecordDoc>();
  const rawEvents = new Map<string, ActivityEvent[]>();
  const counts = new Map<string, number>();
  const revenue = new Map<string, number>();
  COLLECTIONS.forEach((config, index) => {
    results[index].documents.forEach((record) => {
      const ownerId = storeId(record, config.id);
      if (!ownerId) return;
      if (config.id === 'storeProfiles') profiles.set(ownerId, { ...(profiles.get(ownerId) || {}), ...record, id: ownerId });
      if (config.id === 'storeSettings') profiles.set(ownerId, { ...record, ...(profiles.get(ownerId) || {}), id: ownerId });
      const event = eventFor(record, config.id, config.label, ownerId);
      rawEvents.set(ownerId, [...(rawEvents.get(ownerId) || []), event]);
      counts.set(ownerId, (counts.get(ownerId) || 0) + 1);
      if (config.amount) revenue.set(ownerId, (revenue.get(ownerId) || 0) + event.amount);
    });
  });
  const ids = new Set([...profiles.keys(), ...rawEvents.keys()]);
  const stores = [...ids].map((id) => {
    const profile = profiles.get(id) || { id };
    const recentEvents = refineEvents(rawEvents.get(id) || []);
    const lastAt = recentEvents[0]?.at || recordTime(profile);
    const days = lastAt ? (Date.now() - lastAt) / 86_400_000 : Infinity;
    const status: StoreActivityRow['status'] = !lastAt ? 'empty' : days <= 2 ? 'active' : days <= 14 ? 'warm' : 'quiet';
    return { id, name: field(profile, ['displayName', 'storeName', 'name', 'businessName'], id), contact: field(profile, ['publicEmail', 'email', 'ownerEmail', 'contactEmail'], 'Not set'), phone: field(profile, ['publicPhone', 'phone', 'phoneNumber', 'contactPhone'], 'Not set'), status, lastAt, totalRecords: counts.get(id) || 0, revenue: revenue.get(id) || 0, recentEvents } satisfies StoreActivityRow;
  }).sort((a, b) => (b.lastAt || 0) - (a.lastAt || 0));
  return { error: results.find((result) => result.error)?.error || null, stores, events: stores.flatMap((store) => store.recentEvents.map((event) => ({ ...event, description: `${store.name}: ${event.description}` }))).sort((a, b) => (b.at || 0) - (a.at || 0)) };
}

function badgeTone(status: StoreActivityRow['status']): 'green' | 'yellow' | 'red' | 'slate' {
  if (status === 'active') return 'green'; if (status === 'warm') return 'yellow'; if (status === 'quiet') return 'red'; return 'slate';
}

export default async function StoreActivityPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const query = (params.q || '').trim().toLowerCase();
  const data = await loadData();
  const stores = query ? data.stores.filter((store) => [store.name, store.id, store.contact, store.phone, ...store.recentEvents.map((event) => `${event.action} ${event.description}`)].join(' ').toLowerCase().includes(query)) : data.stores;
  // Only query the booking events that can actually be rendered on this page.
  const visibleBookingEvents = [...stores.flatMap(store => store.recentEvents.slice(0, 5)), ...data.events.slice(0, 12)].filter(event => event.moduleId === 'bookings');
  const keys = [...new Set(visibleBookingEvents.flatMap(event => event.bookingKeys || [event.recordId]))];
  let emailRows: RecordDoc[] | null = [];
  try {
    if (keys.length) emailRows = (await listBookingNotifications(keys, keys)).documents as RecordDoc[];
  } catch { emailRows = null; }
  const bookingEmailDetail = (event: ActivityEvent) => {
    if (event.moduleId !== 'bookings') return '';
    if (!emailRows) return 'Email status unavailable';
    const ids = event.bookingKeys || [event.recordId];
    const rows = emailRows.filter(row => {
      const payload = asRecord(row.data) || {};
      return text(row.storeId) === event.storeId && [text(row.reference), text(payload.bookingId), text(payload.booking_id)].some(id => ids.includes(id));
    }).sort((a, b) => (recordTime(b) || 0) - (recordTime(a) || 0));
    const latestEvent = rows[0]?.eventType;
    const recipients = rows.filter(row => row.eventType === latestEvent);
    const describe = (kind: string) => {
      const matches = recipients.filter(row => text(row.recipientType) === kind);
      const latest = [...new Map(matches.slice().reverse().map(row => [text(row.to), row])).values()];
      if (!latest.length) return 'No email record';
      return latest.map(row => {
        const state = text(row.status, 'queued');
        const label = state === 'delivery_accepted' ? 'Accepted by sender' : state === 'queued_no_live_sender' ? 'No live sender' : state.replace(/_/g, ' ');
        return [label, text(row.deliveryReason ?? row.errorMessage)].filter(Boolean).join(' — ');
      }).join('; ');
    };
    return `Client email: ${describe('customer')} · Store email: ${describe('store')}`;
  };
  const active = data.stores.filter((store) => store.status === 'active' || store.status === 'warm').length;
  const totalRevenue = data.stores.reduce((sum, store) => sum + store.revenue, 0);
  const totalRecords = data.stores.reduce((sum, store) => sum + store.totalRecords, 0);
  return <div className="space-y-6">
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><StatCard label="Stores tracked" value={String(data.stores.length)} delta={`${active} active or warm`} /><StatCard label="Business actions" value={String(data.events.length)} delta="Sales, bookings, customers and real edits" /><StatCard label="Tracked revenue" value={money(totalRevenue)} delta="Paid order and booking records" /><StatCard label="Raw records" value={String(totalRecords)} delta="Before duplicate and sync-noise cleanup" /></section>
    {data.error ? <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800"><div className="flex gap-3"><AlertTriangle className="h-5 w-5" /><p>{data.error}</p></div></section> : null}
    <section className="grid gap-6 xl:grid-cols-[1.8fr_0.8fr]">
      <SectionCard title="What each store actually did" action={<Link href="/admin/orders" className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600">Open orders <ArrowUpRight className="h-3.5 w-3.5" /></Link>}>
        <form className="mb-4 flex flex-col gap-3 sm:flex-row" action="/admin/store-activity"><label className="relative flex-1"><Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input name="q" defaultValue={params.q || ''} placeholder="Search store, sale, booking, customer or product" className="w-full rounded-2xl border border-slate-200 bg-white py-3 pl-11 pr-4 text-sm outline-none focus:border-indigo-300 focus:ring-4 focus:ring-indigo-100" /></label><button className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-bold text-white">Search</button></form>
        <div className="divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200">{stores.length === 0 ? <div className="p-8 text-center text-sm text-slate-500">No store activity matches this search.</div> : stores.map((store) => <div key={store.id} className="grid gap-4 p-4 xl:grid-cols-[1fr_0.5fr_0.7fr_1.6fr_0.55fr]">
          <Link href={`/admin/stores/${encodeURIComponent(store.id)}`} className="flex min-w-0 gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600"><Store className="h-4 w-4" /></span><div className="min-w-0"><p className="truncate font-semibold text-slate-950">{store.name}</p><p className="truncate text-xs text-slate-500">{store.contact} · {store.phone}</p><p className="truncate text-xs text-slate-400">{store.id}</p></div></Link>
          <div><StatusBadge tone={badgeTone(store.status)}>{store.status === 'empty' ? 'No activity' : store.status}</StatusBadge></div><div><p className="font-medium text-slate-900">{age(store.lastAt)}</p><p className="text-xs text-slate-500">{date(store.lastAt)}</p><p className="mt-1 text-xs text-slate-400">{store.totalRecords} raw records</p></div>
          <div className="space-y-2">{store.recentEvents.slice(0, 5).map((event) => <Link key={event.id} href={event.href} className="block rounded-2xl bg-slate-50 p-3 hover:bg-slate-100"><div className="flex items-start justify-between gap-2"><p className="font-semibold text-slate-900">{event.action}</p><StatusBadge tone={event.tone}>{age(event.at)}</StatusBadge></div><p className="mt-1 text-xs leading-5 text-slate-600">{event.description}</p>{event.moduleId === 'bookings' ? <p className="mt-1 text-xs text-slate-600">{bookingEmailDetail(event)}</p> : null}<p className="mt-1 text-[11px] text-slate-400">{event.moduleLabel} · {event.recordId}</p></Link>)}{store.recentEvents.length > 5 ? <p className="text-xs text-slate-500">+{store.recentEvents.length - 5} more business actions</p> : null}</div><div className="font-semibold text-slate-950">{money(store.revenue)}</div></div>)}</div>
      </SectionCard>
      <div className="space-y-6"><SectionCard title="Latest business actions"><div className="space-y-3">{data.events.slice(0, 12).map((event) => <Link key={event.id} href={event.href} className="block rounded-2xl bg-slate-50 p-4 text-sm hover:bg-slate-100"><div className="flex items-start justify-between gap-3"><div><p className="font-semibold text-slate-950">{event.action}</p><p className="mt-1 text-xs leading-5 text-slate-600">{event.description}</p>{event.moduleId === 'bookings' ? <p className="mt-1 text-xs text-slate-600">{bookingEmailDetail(event)}</p> : null}</div><StatusBadge tone={event.tone}>{age(event.at)}</StatusBadge></div><p className="mt-2 flex items-center gap-1 text-[11px] text-slate-400"><Clock3 className="h-3 w-3" /> {date(event.at)}</p></Link>)}</div></SectionCard><SectionCard title="How activity is classified"><div className="flex gap-3 rounded-2xl bg-indigo-50 p-4 text-sm text-indigo-900"><Activity className="h-5 w-5 shrink-0" /><p>Paid orders and confirmed bookings are shown as sales or booking actions. Product and public-catalog writes at the same time for the same item are treated as inventory sync and hidden, while genuine standalone catalog edits remain visible.</p></div></SectionCard></div>
    </section>
  </div>;
}
