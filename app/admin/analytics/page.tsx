import Link from 'next/link';
import {
  Activity, ArrowUpRight, BarChart3, CalendarDays, CreditCard,
  Store, TrendingUp, WalletCards,
} from 'lucide-react';
import { SectionCard, StatusBadge } from '../../../components/admin/ui';
import {
  createdTime, field, isFailedPayment, isPaidPayment, loadAdminOperations,
  money, numericField, pendingManualSettlement,
} from '../../../lib/admin-operations';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type AnalyticsSearchParams = Promise<{ days?: string }>;

function getStoreId(record: Record<string, unknown>) {
  const storeId = record.storeId ?? record.store_id ?? record.merchantId;
  return typeof storeId === 'string' ? storeId.trim() : '';
}

export default async function BusinessAnalyticsPage({ searchParams }: { searchParams: AnalyticsSearchParams }) {
  const params = await searchParams;
  const days = [7, 30, 90].includes(Number(params?.days)) ? Number(params.days) : 30;
  const now = Date.now();
  const since = now - days * 24 * 60 * 60 * 1000;
  const data = await loadAdminOperations(500);

  const periodOrders = data.orders.filter((row) => (createdTime(row) || 0) >= since);
  const periodBookings = data.bookings.filter((row) => (createdTime(row) || 0) >= since);
  const periodSettlements = data.settlements.filter((row) => (createdTime(row) || 0) >= since);
  const paidOrders = periodOrders.filter(isPaidPayment);
  const failedOrders = periodOrders.filter(isFailedPayment);
  const merchantPayments = paidOrders.reduce((sum, row) =>
    sum + numericField(row, 'finalTotal', 'final_total', 'amountPaid', 'amount'), 0);
  const recordedFees = periodSettlements.reduce((sum, row) => sum + numericField(row, 'sedifexFee'), 0);
  const pendingPayouts = data.settlements.filter(pendingManualSettlement);
  const pendingAmount = pendingPayouts.reduce((sum, row) => sum + numericField(row, 'storePayable'), 0);

  const storeNames = new Map(data.stores.map((store) => [
    field(store, 'id'), field(store, 'displayName', 'storeName', 'name', 'businessName') || field(store, 'id'),
  ]));
  const activityCounts = new Map<string, number>();
  [...periodOrders, ...periodBookings].forEach((row) => {
    const id = getStoreId(row);
    if (id) activityCounts.set(id, (activityCounts.get(id) || 0) + 1);
  });
  const topBusinesses = [...activityCounts].sort((a, b) => b[1] - a[1]).slice(0, 6);
  const highest = Math.max(1, ...topBusinesses.map((row) => row[1]));

  const daysOfWeek = Array.from({ length: 7 }, (_, index) => {
    const start = new Date(now);
    start.setUTCHours(0, 0, 0, 0);
    start.setUTCDate(start.getUTCDate() - (6 - index));
    const end = start.getTime() + 24 * 60 * 60 * 1000;
    return {
      date: start.toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' }),
      count: paidOrders.filter((row) => {
        const created = createdTime(row);
        return created !== null && created >= start.getTime() && created < end;
      }).length,
    };
  });
  const maxDay = Math.max(1, ...daysOfWeek.map((row) => row.count));
  const metrics = [
    { label: 'Paid merchant orders', value: data.collectionErrors.integrationOrders ? '—' : String(paidOrders.length), detail: 'Paid order records in the selected period', icon: CreditCard },
    { label: 'Merchant order value', value: data.collectionErrors.integrationOrders ? '—' : money(merchantPayments), detail: 'Gross merchant payments, not Sedifex earnings', icon: TrendingUp },
    { label: 'Client bookings', value: data.collectionErrors.integrationBookings ? '—' : String(periodBookings.length), detail: 'Booking records created in the period', icon: CalendarDays },
    { label: 'Businesses with activity', value: data.collectionErrors.integrationOrders && data.collectionErrors.integrationBookings ? '—' : String(activityCounts.size), detail: 'Businesses represented in loaded orders or bookings', icon: Store },
    { label: 'Recorded Sedifex fees', value: data.collectionErrors.manualSettlements ? '—' : money(recordedFees), detail: 'Manual settlement ledgers created in period only', icon: WalletCards },
    { label: 'Failed payments', value: data.collectionErrors.integrationOrders ? '—' : String(failedOrders.length), detail: 'Payment issues in loaded order records', icon: Activity },
  ];

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-slate-200 bg-slate-950 p-6 text-white shadow-sm sm:p-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-indigo-200"><BarChart3 className="h-4 w-4" /> Business analytics</p>
            <h2 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">See how Sedifex businesses are performing.</h2>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-300">
              Review client transactions, bookings, payment exceptions and manually recorded platform fees. These reports no longer depend on Sedifex Market visits or product searches.
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            {[7, 30, 90].map((option) => (
              <Link key={option} href={'/admin/analytics?days=' + option}
                className={'rounded-xl px-4 py-2 text-sm font-semibold ring-1 ring-white/20 transition ' + (days === option ? 'bg-white text-slate-950' : 'bg-white/10 text-white hover:bg-white/20')}>
                {option} days
              </Link>
            ))}
          </div>
        </div>
      </section>

      {!data.ready && <p role="alert" className="rounded-xl bg-amber-50 p-4 text-sm text-amber-800">{data.error || 'Database unavailable'}</p>}
      <p className="rounded-2xl border border-indigo-200 bg-indigo-50 p-4 text-xs leading-5 text-indigo-900">
        <strong>Reporting scope:</strong> Operational snapshot of up to 500 documents per collection, read in document-ID order. Date filters apply only to those loaded records. Counts and amounts are not audited platform-wide totals. POS and store-only cash payments are not counted as Sedifex earnings.
        {data.limitedCollections.length ? ' Truncated collections: ' + data.limitedCollections.join(', ') + '.' : ''}
      </p>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-label="Analytics metrics">
        {metrics.map((metric) => {
          const Icon = metric.icon;
          return (
            <div key={metric.label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{metric.label}</p>
                <span className="rounded-xl bg-indigo-50 p-2 text-indigo-600"><Icon className="h-4 w-4" /></span>
              </div>
              <p className="mt-3 text-2xl font-bold text-slate-950">{data.ready ? metric.value : '—'}</p>
              <p className="mt-2 text-xs leading-5 text-slate-500">{metric.detail}</p>
            </div>
          );
        })}
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.3fr_0.7fr]">
        <SectionCard title="Paid merchant orders · last seven calendar days (UTC)">
          <div className="mt-4 grid h-48 grid-cols-7 items-end gap-3">
            {daysOfWeek.map((day, index) => (
              <div key={index} className="flex h-full min-w-0 flex-col items-center justify-end gap-2">
                <strong className="text-xs text-slate-700">{day.count}</strong>
                <div className="w-full max-w-10 rounded-t-lg bg-indigo-500" style={{ height: Math.max(5, day.count / maxDay * 135) }} />
                <span className="text-xs text-slate-500">{day.date}</span>
              </div>
            ))}
          </div>
          <p className="mt-4 text-xs text-slate-500">Chart uses the same bounded record sample; it is not a payment reconciliation report.</p>
        </SectionCard>
        <SectionCard title="Manual payout position · loaded ledgers">
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3"><span className="text-sm text-slate-600">Pending payouts</span><StatusBadge tone={pendingPayouts.length ? 'yellow' : 'green'}>{data.ready && !data.collectionErrors.manualSettlements ? pendingPayouts.length : '—'}</StatusBadge></div>
            <div><p className="text-xs text-slate-500">Store payable amount</p><p className="mt-2 text-2xl font-bold text-slate-900">{data.ready && !data.collectionErrors.manualSettlements ? money(pendingAmount) : '—'}</p></div>
            <Link href="/admin/settlements" className="inline-flex items-center gap-1 text-sm font-semibold text-indigo-700">Review settlements <ArrowUpRight className="h-4 w-4" /></Link>
          </div>
        </SectionCard>
      </div>

      <SectionCard title="Most active client businesses · loaded records">
        {topBusinesses.length ? (
          <div className="grid gap-3 md:grid-cols-2">
            {topBusinesses.map(([id, count]) => (
              <Link key={id} href={'/admin/stores/' + encodeURIComponent(id)} className="rounded-xl bg-slate-50 p-4 transition hover:bg-indigo-50">
                <div className="flex items-center justify-between gap-3"><span className="truncate text-sm font-semibold text-slate-900">{storeNames.get(id) || id}</span><span className="text-sm font-bold text-slate-900">{count}</span></div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-white"><div className="h-full rounded-full bg-indigo-500" style={{ width: count / highest * 100 + '%' }} /></div>
                <p className="mt-2 text-xs text-slate-500">Orders and bookings represented</p>
              </Link>
            ))}
          </div>
        ) : <p className="text-sm text-slate-500">No dated order or booking activity found in the loaded records for this period.</p>}
      </SectionCard>

      <div className="flex flex-wrap gap-3 text-sm font-semibold">
        <Link href="/admin/platform-activity" className="inline-flex items-center gap-1 text-indigo-700">Detailed transaction activity <ArrowUpRight className="h-4 w-4" /></Link>
        <Link href="/admin/settlements" className="inline-flex items-center gap-1 text-indigo-700">Manual settlement ledger <ArrowUpRight className="h-4 w-4" /></Link>
      </div>
      {Object.entries(data.collectionErrors).length > 0 && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs leading-6 text-rose-800">
          <strong>Unavailable sources:</strong> {Object.entries(data.collectionErrors).map(([name]) => name).join(', ')}. A dash indicates a metric cannot be confirmed.
        </div>
      )}
    </div>
  );
}
