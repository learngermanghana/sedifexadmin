import Link from 'next/link';
import {
  Activity, AlertTriangle, ArrowUpRight, BarChart3, CalendarDays,
  CheckCircle2, CreditCard, Database, Mail, Store, WalletCards, Webhook,
} from 'lucide-react';
import { SectionCard, StatusBadge } from '../../components/admin/ui';
import {
  changedTime, field, isFailedPayment, isFailedWebhook, isPaidPayment,
  loadAdminOperations, money, numericField, pendingManualSettlement,
} from '../../lib/admin-operations';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const shortcuts = [
  { title: 'Businesses', description: 'Profiles, subscription status and business setup.', href: '/admin/stores', icon: Store },
  { title: 'Settlements', description: 'Manual payouts, references and amounts owed to businesses.', href: '/admin/settlements', icon: WalletCards },
  { title: 'Analytics', description: 'Business activity, payments and recorded platform fees.', href: '/admin/analytics', icon: BarChart3 },
  { title: 'Marketing', description: 'Manage Sedifex marketing contacts and campaigns.', href: '/admin/marketing', icon: Mail },
];

export default async function AdminDashboardPage() {
  const data = await loadAdminOperations();
  const pendingPayouts = data.settlements.filter(pendingManualSettlement);
  const paidPayouts = data.settlements.filter((row) => !pendingManualSettlement(row));
  const failedPayments = data.orders.filter(isFailedPayment);
  const failedWebhooks = data.deliveries.filter(isFailedWebhook);
  const paidOrderRecords = data.orders.filter(isPaidPayment);

  const payoutAmount = pendingPayouts.reduce((sum, row) => sum + numericField(row, 'storePayable'), 0);
  const recordedFees = data.settlements.reduce((sum, row) => sum + numericField(row, 'sedifexFee'), 0);
  const paidMerchantValue = paidOrderRecords.reduce((sum, row) => sum + numericField(row, 'finalTotal', 'final_total', 'amountPaid', 'amount'), 0);
  const recentStores = [...data.stores].sort((a, b) => (changedTime(b) || 0) - (changedTime(a) || 0)).slice(0, 5);

  const alerts = [
    ...(data.error ? [{ label: 'Business records unavailable', description: data.error, href: '/admin/stores', urgency: 'red' as const }] : []),
    ...(data.collectionErrors.manualSettlements ? [{
      label: 'Settlement records unavailable', description: 'Payout figures cannot be trusted until the ledger connection is restored.',
      href: '/admin/settlements', urgency: 'red' as const,
    }] : []),
    ...(failedPayments.length ? [{
      label: failedPayments.length + ' failed payment records', description: 'Investigate payment failures. Businesses remain responsible for fulfilling their orders.',
      href: '/admin/orders', urgency: 'red' as const,
    }] : []),
    ...(pendingPayouts.length ? [{
      label: pendingPayouts.length + ' manual payouts pending', description: 'Review store payable balances and transfer confirmations.',
      href: '/admin/settlements', urgency: 'yellow' as const,
    }] : []),
    ...(failedWebhooks.length ? [{
      label: failedWebhooks.length + ' webhook failures', description: 'Review failed integration events and safe retries.',
      href: '/admin/deliveries', urgency: 'yellow' as const,
    }] : []),
  ];

  const metrics = [
    { label: 'Business workspaces', value: data.ready ? String(data.stores.length) : '—', hint: 'Business records loaded', href: '/admin/stores' },
    { label: 'Manual payouts pending', value: data.collectionErrors.manualSettlements || !data.ready ? '—' : String(pendingPayouts.length), hint: 'Settlement ledger', href: '/admin/settlements' },
    { label: 'Amount to settle', value: data.collectionErrors.manualSettlements || !data.ready ? '—' : money(payoutAmount), hint: 'Pending manual store payouts', href: '/admin/settlements' },
    { label: 'Payment issues', value: data.collectionErrors.integrationOrders || !data.ready ? '—' : String(failedPayments.length), hint: 'Failed payment records', href: '/admin/orders' },
    { label: 'Bookings recorded', value: data.collectionErrors.integrationBookings || !data.ready ? '—' : String(data.bookings.length), hint: 'Client website bookings', href: '/admin/bookings' },
    { label: 'Webhook failures', value: data.collectionErrors.webhookDeliveries || !data.ready ? '—' : String(failedWebhooks.length), hint: 'Integration events to review', href: '/admin/deliveries' },
  ];

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-slate-200 bg-slate-950 p-6 text-white shadow-sm sm:p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-indigo-200">Sedifex · Platform overview</p>
            <h2 className="mt-4 max-w-3xl text-3xl font-bold tracking-tight sm:text-4xl">Business operations, payments and growth in one place.</h2>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-300">
              Oversee Sedifex client workspaces, transactions, manual settlements and technical issues. Merchants manage their own fulfillment and delivery.
            </p>
          </div>
          <div className="min-w-60 rounded-2xl border border-white/10 bg-white/5 p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-300">Operations requiring review</p>
            <p className="mt-2 text-4xl font-bold">{alerts.length}</p>
            <p className="mt-1 text-xs text-slate-400">Based on the records loaded below</p>
          </div>
        </div>
      </section>

      {!data.ready ? (
        <div role="alert" className="flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <Database className="h-5 w-5 shrink-0" /> {data.error || 'Could not load business records. Check Firestore configuration.'}
        </div>
      ) : null}

      <section aria-label="Operations snapshot" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {metrics.map((metric) => (
          <Link key={metric.label} href={metric.href} className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-indigo-300 hover:shadow-md">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{metric.label}</p>
            <p className="mt-3 text-2xl font-bold tracking-tight text-slate-950">{metric.value}</p>
            <div className="mt-2 flex items-center justify-between gap-3 text-xs text-slate-500"><span>{metric.hint}</span><ArrowUpRight className="h-4 w-4 group-hover:text-indigo-600" /></div>
          </Link>
        ))}
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.3fr_0.7fr]">
        <div className="space-y-6">
          <SectionCard title="What needs attention">
            <div className="space-y-3">
              {alerts.length === 0 ? (
                <div className="flex items-start gap-3 rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-800">
                  <CheckCircle2 className="h-5 w-5 shrink-0" />
                  <span>No issues found in the loaded records. This does not replace a full payment or integration audit.</span>
                </div>
              ) : alerts.map((alert) => (
                <Link key={alert.label} href={alert.href} className="flex items-start gap-3 rounded-2xl border border-slate-200 p-4 transition hover:bg-slate-50">
                  <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
                  <span className="min-w-0 flex-1"><strong className="block text-sm text-slate-900">{alert.label}</strong><span className="mt-1 block text-xs leading-5 text-slate-600">{alert.description}</span></span>
                  <StatusBadge tone={alert.urgency}>Review</StatusBadge>
                </Link>
              ))}
            </div>
          </SectionCard>

          <SectionCard title="Financial overview · loaded records">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs text-slate-600">Merchant paid-order value</p><p className="mt-2 text-xl font-bold text-slate-950">{data.collectionErrors.integrationOrders || !data.ready ? '—' : money(paidMerchantValue)}</p><p className="mt-1 text-xs text-slate-500">Not Sedifex revenue</p></div>
              <div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs text-slate-600">Recorded Sedifex fees</p><p className="mt-2 text-xl font-bold text-slate-950">{data.collectionErrors.manualSettlements || !data.ready ? '—' : money(recordedFees)}</p><p className="mt-1 text-xs text-slate-500">Manual ledgers only, not all platform income</p></div>
              <div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs text-slate-600">Payouts marked paid</p><p className="mt-2 text-xl font-bold text-slate-950">{data.collectionErrors.manualSettlements || !data.ready ? '—' : String(paidPayouts.length)}</p><p className="mt-1 text-xs text-slate-500">Manual settlement ledger</p></div>
            </div>
            <p className="mt-4 text-xs leading-5 text-slate-500">
              These figures cover loaded records only. Merchant sales are not Sedifex earnings, and split payouts handled directly by Paystack are not included in manual settlement totals.
            </p>
            <Link href="/admin/settlements" className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-indigo-700">Open settlement ledger <ArrowUpRight className="h-4 w-4" /></Link>
          </SectionCard>

          <SectionCard title="Business workspaces">
            <div className="divide-y divide-slate-100">
              {recentStores.length === 0 ? <p className="py-5 text-sm text-slate-500">No business profiles were loaded.</p> : recentStores.map((store) => (
                <Link key={store.id || store.path} href={store.id ? '/admin/stores/' + encodeURIComponent(store.id) : '/admin/stores'} className="flex items-center gap-3 py-3 hover:bg-slate-50">
                  <span className="rounded-xl bg-indigo-50 p-2 text-indigo-600"><Store className="h-4 w-4" /></span>
                  <span className="min-w-0 flex-1"><strong className="block truncate text-sm text-slate-900">{field(store, 'displayName', 'storeName', 'name', 'businessName') || store.id || 'Unnamed business'}</strong><span className="block truncate text-xs text-slate-500">{store.id}</span></span>
                  <ArrowUpRight className="h-4 w-4 text-slate-400" />
                </Link>
              ))}
            </div>
          </SectionCard>
        </div>

        <div className="space-y-6">
          <SectionCard title="Quick access">
            <div className="grid gap-3">
              {shortcuts.map((shortcut) => {
                const Icon = shortcut.icon;
                return (
                  <Link key={shortcut.href} href={shortcut.href} className="flex gap-3 rounded-2xl bg-slate-50 p-4 hover:bg-indigo-50">
                    <Icon className="mt-0.5 h-5 w-5 shrink-0 text-indigo-700" />
                    <span><strong className="block text-sm text-slate-900">{shortcut.title}</strong><span className="mt-1 block text-xs leading-5 text-slate-600">{shortcut.description}</span></span>
                  </Link>
                );
              })}
            </div>
          </SectionCard>

          <SectionCard title="Platform responsibility">
            <div className="space-y-3 text-sm text-slate-600">
              <p className="flex items-center gap-2"><CreditCard className="h-4 w-4 text-indigo-600" /> Monitor payment processing and reconciliation.</p>
              <p className="flex items-center gap-2"><CalendarDays className="h-4 w-4 text-indigo-600" /> View booking records and payment exceptions.</p>
              <p className="flex items-center gap-2"><Webhook className="h-4 w-4 text-indigo-600" /> Resolve technical integrations and webhooks.</p>
              <p className="flex items-center gap-2"><Activity className="h-4 w-4 text-indigo-600" /> Track business adoption and platform activity.</p>
            </div>
          </SectionCard>

          {(data.limitedCollections.length > 0 || Object.keys(data.collectionErrors).length > 0) && (
            <SectionCard title="Data coverage">
              {data.limitedCollections.length > 0 && <p className="text-xs leading-5 text-amber-800">Some collections exceed the per-collection read limit: {data.limitedCollections.join(', ')}. Counts and amounts are partial snapshots, not totals.</p>}
              {Object.entries(data.collectionErrors).map(([name, error]) => <p key={name} className="mt-2 text-xs leading-5 text-rose-700">{name}: {error}</p>)}
            </SectionCard>
          )}
        </div>
      </div>
    </div>
  );
}
