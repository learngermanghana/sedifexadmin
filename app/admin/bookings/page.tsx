import Link from 'next/link';
import { CalendarDays, CreditCard, Search } from 'lucide-react';
import { SectionCard, StatCard, StatusBadge } from '../../../components/admin/ui';
import { getFirebaseEnvStatus, listFirestoreDocuments } from '../../../lib/firebase-admin';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type SearchParams = Promise<{ q?: string; view?: string }>;
type Doc = Record<string, unknown> & { id?: string; path?: string; createTime?: string | null; updateTime?: string | null };

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function text(value: unknown, fallback = '') {
  if (typeof value === 'string') return value.trim() || fallback;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return fallback;
}

function numberValue(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function timestamp(value: unknown): number {
  if (!value) return 0;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  if (typeof value === 'number') return value;
  if (typeof value === 'object') {
    const candidate = value as { seconds?: unknown; _seconds?: unknown; toMillis?: () => number };
    if (typeof candidate.toMillis === 'function') return candidate.toMillis();
    const seconds = typeof candidate.seconds === 'number' ? candidate.seconds : typeof candidate._seconds === 'number' ? candidate._seconds : 0;
    return Number(seconds) * 1000;
  }
  return 0;
}

function createdAt(row: Doc) {
  return timestamp(row.createdAt ?? row.createdAtServer ?? row.updatedAt ?? row.createTime ?? row.updateTime);
}

function formatDate(value: number) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function bookingStatus(row: Doc) {
  const booking = record(row.booking);
  return text(row.bookingStatus ?? row.booking_status ?? row.status ?? booking.status, 'pending').toLowerCase().replace(/[\s-]+/g, '_');
}

function paymentStatus(row: Doc) {
  const payment = record(row.payment);
  return text(row.paymentStatus ?? row.payment_status ?? payment.status, 'pending').toLowerCase().replace(/[\s-]+/g, '_');
}

function isPaid(row: Doc) {
  return ['paid', 'confirmed', 'success', 'succeeded', 'captured', 'completed'].includes(paymentStatus(row));
}

function isPaymentConfirmed(row: Doc) {
  const payment = record(row.payment);
  return Boolean(row.paymentConfirmedAt ?? row.payment_confirmed_at ?? payment.confirmedAt ?? payment.confirmed_at);
}

function customerName(row: Doc) {
  const customer = record(row.customer);
  return text(row.customerName ?? row.name ?? customer.name, 'Customer');
}

function customerContact(row: Doc) {
  const customer = record(row.customer);
  return text(row.customerEmail ?? customer.email) || text(row.customerPhone ?? customer.phone, 'No contact');
}

function serviceName(row: Doc) {
  const booking = record(row.booking);
  return text(row.serviceName ?? row.itemName ?? row.productName ?? booking.serviceName, 'Service booking');
}

function amount(row: Doc) {
  const payment = record(row.payment);
  return numberValue(row.paymentAmount ?? row.amount ?? row.total ?? payment.amount);
}

function storeId(row: Doc) {
  const metadata = record(row.metadata);
  return text(row.storeId ?? row.store_id ?? row.merchantId ?? metadata.storeId, '');
}

function reference(row: Doc) {
  const payment = record(row.payment);
  return text(row.reference ?? row.bookingReference ?? row.paymentReference ?? payment.reference ?? row.id, row.id || '—');
}

function schedule(row: Doc) {
  const booking = record(row.booking);
  const date = text(row.bookingDate ?? row.date ?? booking.preferredDate);
  const time = text(row.bookingTime ?? row.time ?? booking.preferredTime);
  return [date, time].filter(Boolean).join(' · ') || 'Not scheduled';
}

function paymentLabel(row: Doc) {
  const status = paymentStatus(row);
  if (isPaid(row) && isPaymentConfirmed(row)) return 'Paid · confirmed';
  if (status === 'checkout_created') return 'Checkout created';
  if (['failed', 'declined', 'cancelled', 'canceled'].includes(status)) return 'Payment failed';
  if (status === 'awaiting_verification' || status === 'manual_review') return 'Needs payment review';
  return status.replace(/_/g, ' ');
}

function paymentTone(row: Doc): 'green' | 'yellow' | 'red' | 'blue' | 'slate' {
  const status = paymentStatus(row);
  if (isPaid(row) && isPaymentConfirmed(row)) return 'green';
  if (['failed', 'declined', 'cancelled', 'canceled'].includes(status)) return 'red';
  if (status === 'checkout_created') return 'blue';
  if (status === 'awaiting_verification' || status === 'manual_review') return 'yellow';
  return 'slate';
}

function bookingLabel(row: Doc) {
  const status = bookingStatus(row);
  if (status === 'pending_approval') return 'Needs confirmation';
  return status.replace(/_/g, ' ');
}

function notificationSummary(rows: Doc[], bookingReference: string) {
  const matching = rows
    .filter((row) => text(row.reference) === bookingReference)
    .sort((a, b) => createdAt(b) - createdAt(a));

  if (!matching.length) return { label: 'No email record', tone: 'slate' as const, detail: 'No matching notification outbox record.' };

  const customer = matching.find((row) => text(row.recipientType).toLowerCase() === 'customer');
  const store = matching.find((row) => text(row.recipientType).toLowerCase() === 'store');
  const latest = customer || store || matching[0];
  const status = text(latest.status, 'queued').toLowerCase();
  const reason = text(latest.deliveryReason ?? latest.errorMessage ?? latest.deliveryStatus, '');

  const statusLabel = (value: string) => {
    if (value === 'delivery_accepted') return 'Accepted by sender';
    if (value === 'delivery_failed' || value === 'webhook_error') return 'Delivery failed';
    if (value === 'queued_no_live_sender') return 'No live sender';
    if (value === 'queued') return 'Queued';
    return value.replace(/_/g, ' ');
  };

  const parts = [
    customer ? `Customer: ${statusLabel(text(customer.status, 'queued').toLowerCase())}` : '',
    store ? `Store: ${statusLabel(text(store.status, 'queued').toLowerCase())}` : '',
  ].filter(Boolean);

  return {
    label: statusLabel(status),
    tone: status === 'delivery_accepted' ? ('green' as const) : status === 'delivery_failed' || status === 'webhook_error' ? ('red' as const) : status === 'queued_no_live_sender' ? ('yellow' as const) : ('blue' as const),
    detail: [parts.join(' · '), reason].filter(Boolean).join(' · '),
  };
}

async function loadData() {
  if (!getFirebaseEnvStatus().ready) return { bookings: [] as Doc[], notifications: [] as Doc[], stores: new Map<string, string>(), error: 'Firebase environment variables are not ready.' };
  try {
    const [bookingsResult, notificationsResult, storesResult, settingsResult] = await Promise.all([
      listFirestoreDocuments('integrationBookings', 1000),
      listFirestoreDocuments('notification_outbox', 1000).catch(() => ({ documents: [] as Doc[] })),
      listFirestoreDocuments('stores', 500).catch(() => ({ documents: [] as Doc[] })),
      listFirestoreDocuments('storeSettings', 500).catch(() => ({ documents: [] as Doc[] })),
    ]);
    const stores = new Map<string, string>();
    [...(settingsResult.documents as Doc[]), ...(storesResult.documents as Doc[])].forEach((store) => {
      const id = text(store.id ?? store.storeId);
      if (!id) return;
      stores.set(id, text(store.displayName ?? store.storeName ?? store.businessName ?? store.name, id));
    });
    return { bookings: bookingsResult.documents as Doc[], notifications: notificationsResult.documents as Doc[], stores, error: null as string | null };
  } catch (error) {
    return { bookings: [] as Doc[], notifications: [] as Doc[], stores: new Map<string, string>(), error: error instanceof Error ? error.message : 'Unable to load bookings.' };
  }
}

export default async function AdminBookingsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const query = (params.q || '').trim().toLowerCase();
  const view = ['attention', 'paid', 'checkout', 'all'].includes(params.view || '') ? params.view! : 'attention';
  const data = await loadData();

  const all = [...data.bookings].sort((a, b) => createdAt(b) - createdAt(a));
  const searched = query
    ? all.filter((row) => [
        reference(row), customerName(row), customerContact(row), serviceName(row), storeId(row), data.stores.get(storeId(row)) || '',
      ].join(' ').toLowerCase().includes(query))
    : all;

  const attention = (row: Doc) => bookingStatus(row) === 'pending_approval' || ['awaiting_verification', 'manual_review'].includes(paymentStatus(row));
  const filtered = searched.filter((row) => {
    if (view === 'paid') return isPaid(row) && isPaymentConfirmed(row);
    if (view === 'checkout') return paymentStatus(row) === 'checkout_created';
    if (view === 'attention') return attention(row);
    return true;
  });

  const stats = [
    { label: 'Needs confirmation', value: String(all.filter(attention).length), delta: 'Booking or payment review' },
    { label: 'Checkout created', value: String(all.filter((row) => paymentStatus(row) === 'checkout_created').length), delta: 'Not yet Paystack-confirmed' },
    { label: 'Paid confirmed', value: String(all.filter((row) => isPaid(row) && isPaymentConfirmed(row)).length), delta: 'Payment confirmation recorded' },
    { label: 'All bookings', value: String(all.length), delta: 'Root booking mirror' },
  ];

  const views = [
    ['attention', 'Needs confirmation'],
    ['checkout', 'Checkout created'],
    ['paid', 'Paid confirmed'],
    ['all', 'All'],
  ];

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-slate-200 bg-slate-950 p-6 text-white shadow-sm sm:p-8">
        <div className="inline-flex items-center gap-2 rounded-full border border-indigo-300/20 bg-indigo-400/10 px-3 py-1 text-xs font-semibold text-indigo-100">
          <CalendarDays className="h-4 w-4" /> Client bookings
        </div>
        <h2 className="mt-5 text-3xl font-bold tracking-tight sm:text-4xl">See website bookings without digging through activity logs.</h2>
        <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-300">
          This page reads the Sedifex booking mirror directly. “Checkout created” means checkout was opened; it is not proof of payment. A Paystack-confirmed booking must show a paid status with a payment confirmation timestamp.
        </p>
      </section>

      {data.error ? <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{data.error}</div> : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => <StatCard key={stat.label} {...stat} />)}
      </section>

      <SectionCard title="Booking records">
        <form action="/admin/bookings" className="mb-4 flex flex-col gap-3 lg:flex-row">
          <label className="relative flex-1">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input name="q" defaultValue={params.q || ''} placeholder="Search booking reference, customer, store, phone, or email" className="w-full rounded-2xl border border-slate-200 bg-white py-3 pl-11 pr-4 text-sm" />
          </label>
          <input type="hidden" name="view" value={view} />
          <button className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-bold text-white">Search</button>
        </form>

        <div className="mb-4 flex flex-wrap gap-2">
          {views.map(([key, label]) => (
            <Link key={key} href={`/admin/bookings?view=${key}${query ? `&q=${encodeURIComponent(query)}` : ''}`} className={`rounded-full border px-4 py-2 text-xs font-semibold ${view === key ? 'border-slate-950 bg-slate-950 text-white' : 'border-slate-200 bg-white text-slate-700'}`}>
              {label}
            </Link>
          ))}
        </div>

        <div className="overflow-x-auto rounded-2xl border border-slate-200">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Created</th>
                <th className="px-4 py-3">Booking</th>
                <th className="px-4 py-3">Client workspace</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Schedule</th>
                <th className="px-4 py-3 text-right">Amount</th>
                <th className="px-4 py-3">Payment</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Booking state</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {filtered.length ? filtered.slice(0, 200).map((row) => {
                const owner = storeId(row);
                const emailState = notificationSummary(data.notifications, reference(row));
                return (
                  <tr key={row.id || reference(row)}>
                    <td className="px-4 py-3 text-xs text-slate-500">{formatDate(createdAt(row))}</td>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-950">{serviceName(row)}</p>
                      <p className="font-mono text-xs text-slate-500">{reference(row)}</p>
                    </td>
                    <td className="px-4 py-3">
                      {owner ? <Link href={`/admin/stores/${encodeURIComponent(owner)}`} className="font-semibold text-indigo-600 hover:text-indigo-500">{data.stores.get(owner) || owner}</Link> : <span className="text-slate-500">Unknown</span>}
                      {owner ? <p className="text-xs text-slate-400">{owner}</p> : null}
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-900">{customerName(row)}</p>
                      <p className="text-xs text-slate-500">{customerContact(row)}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{schedule(row)}</td>
                    <td className="px-4 py-3 text-right font-semibold">GHS {amount(row).toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td className="px-4 py-3"><StatusBadge tone={paymentTone(row)}>{paymentLabel(row)}</StatusBadge></td>
                    <td className="px-4 py-3">
                      <StatusBadge tone={emailState.tone}>{emailState.label}</StatusBadge>
                      <p className="mt-1 max-w-56 text-xs text-slate-500">{emailState.detail}</p>
                    </td>
                    <td className="px-4 py-3"><StatusBadge tone={bookingStatus(row) === 'confirmed' ? 'green' : bookingStatus(row) === 'pending_approval' ? 'yellow' : 'slate'}>{bookingLabel(row)}</StatusBadge></td>
                  </tr>
                );
              }) : (
                <tr><td colSpan={9} className="px-4 py-10 text-center text-slate-500">No bookings match this view.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex items-start gap-3 rounded-2xl bg-blue-50 p-4 text-sm text-blue-900">
          <CreditCard className="mt-0.5 h-5 w-5 shrink-0" />
          <p><strong>Payment rule:</strong> “Checkout created” only means the Paystack checkout session exists. Treat the booking as paid only after Sedifex records a successful payment and confirmation timestamp.</p>
        </div>
      </SectionCard>
    </div>
  );
}
