'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Bell, CheckCircle2, Clock3, Download, PackageCheck, PackageOpen, Search, ShoppingCart, Truck, XCircle } from 'lucide-react';
import { isAcceptedWithoutPayment, isPaymentConfirmed, paymentAuditLabel, paymentReferenceValue, settlementStatusForOrder } from '@/lib/payment-audit';
import { classifyOrderWorkflow } from '@/lib/order-workflow';

type OrderItem = {
  name?: string;
  productName?: string;
  itemName?: string;
  serviceName?: string;
  qty?: number;
  quantity?: number;
  item_type?: string;
  type?: string;
  price?: number;
  unitPrice?: number;
};

type OrderRecord = {
  id: string;
  path?: string;
  createTime?: string | null;
  updateTime?: string | null;
  createdAt?: unknown;
  updatedAt?: unknown;
  source?: string;
  sourceChannel?: string;
  sourceLabel?: string;
  storeId?: string;
  storeName?: string;
  merchantName?: string;
  amount?: number;
  amountMinor?: number;
  amountPaid?: number;
  finalTotal?: number;
  final_total?: number;
  paymentStatus?: string;
  payment_status?: string;
  orderStatus?: string;
  bookingStatus?: string;
  fulfillmentStatus?: string;
  deliveryStatus?: string;
  fulfillmentType?: string;
  paymentCollectionMode?: string;
  paymentMethod?: string;
  payment_method?: string;
  paymentProvider?: string;
  payment_provider?: string;
  paymentReference?: string;
  payment_reference?: string;
  reference?: string;
  paystackReference?: string;
  transactionReference?: string;
  settlementStatus?: string;
  settlement_status?: string;
  recordType?: string;
  orderType?: string;
  storeOnly?: boolean;
  cashConfirmed?: boolean;
  cash_confirmed?: boolean;
  requiresPaymentReview?: boolean;
  paymentAuditStatus?: string;
  paymentAuditSeverity?: string;
  paymentAuditReason?: string;
  paymentUpdatedAt?: unknown;
  deliveredAt?: unknown;
  completedAt?: unknown;
  cancelledAt?: unknown;
  customerEmail?: string;
  customerName?: string;
  customerPhone?: string;
  customer?: { name?: string; email?: string; phone?: string };
  items?: OrderItem[];
  itemCount?: number | string;
  lastPaymentMetadata?: { itemCount?: string | number };
  metadata?: Record<string, unknown>;
  statusHistory?: unknown[];
};

type Bucket = 'all' | 'new' | 'payment_issues' | 'accepted' | 'preparing' | 'out_for_delivery' | 'delivered' | 'problem' | 'delayed';
type StatusAction = 'confirm_payment' | 'mark_store_paid' | 'received' | 'preparing' | 'out_for_delivery' | 'delivered' | 'confirm_service' | 'service_in_progress' | 'service_completed' | 'complete_manual';
type OrderKind = 'product' | 'service' | 'manual';

type ActionOption = {
  id: StatusAction;
  label: string;
  tone: 'slate' | 'purple' | 'blue' | 'emerald' | 'amber';
};

const POLL_MS = 20000;
const BUCKET_LABELS: Record<Bucket, string> = {
  all: 'All orders',
  new: 'New / paid',
  payment_issues: 'Payment issues',
  accepted: 'Accepted',
  preparing: 'Preparing',
  out_for_delivery: 'Out for delivery',
  delivered: 'Delivered / completed',
  problem: 'Problem',
  delayed: 'Delayed',
};

const STATUS_ACTION_LABELS: Record<StatusAction, string> = {
  confirm_payment: 'Confirm payment received',
  mark_store_paid: 'Mark store paid',
  received: 'Accept order',
  preparing: 'Preparing',
  out_for_delivery: 'Out for delivery',
  delivered: 'Delivered',
  confirm_service: 'Confirm booking',
  service_in_progress: 'Service started',
  service_completed: 'Service completed',
  complete_manual: 'Mark completed',
};

const PAYMENT_ACTION: ActionOption = { id: 'confirm_payment', label: 'Confirm payment received', tone: 'emerald' };
const STORE_PAYOUT_ACTION: ActionOption = { id: 'mark_store_paid', label: 'Mark store paid', tone: 'emerald' };

const PRODUCT_ACTIONS: ActionOption[] = [
  { id: 'received', label: 'Accept order', tone: 'slate' },
  { id: 'preparing', label: 'Preparing', tone: 'purple' },
  { id: 'out_for_delivery', label: 'Out for delivery', tone: 'blue' },
  { id: 'delivered', label: 'Delivered', tone: 'emerald' },
];

const SERVICE_ACTIONS: ActionOption[] = [
  { id: 'confirm_service', label: 'Confirm booking', tone: 'slate' },
  { id: 'service_in_progress', label: 'Service started', tone: 'blue' },
  { id: 'service_completed', label: 'Service completed', tone: 'emerald' },
];

const MANUAL_ACTIONS: ActionOption[] = [
  { id: 'complete_manual', label: 'Mark completed', tone: 'emerald' },
];

function clean(value: unknown, fallback = '') {
  if (typeof value === 'string') return value.trim() || fallback;
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return fallback;
}

function lower(value: unknown) {
  return clean(value).toLowerCase().replace(/\s+/g, '_');
}

function money(order: OrderRecord) {
  const values = [order.finalTotal, order.final_total, order.amountPaid, order.amount, typeof order.amountMinor === 'number' ? order.amountMinor / 100 : undefined];
  const amount = values.find((value) => typeof value === 'number' && Number.isFinite(value));
  return typeof amount === 'number' ? `GHS ${amount.toFixed(2)}` : '—';
}

function amountNumber(order: OrderRecord) {
  const values = [order.finalTotal, order.final_total, order.amountPaid, order.amount, typeof order.amountMinor === 'number' ? order.amountMinor / 100 : undefined];
  const amount = values.find((value) => typeof value === 'number' && Number.isFinite(value));
  return typeof amount === 'number' ? amount : 0;
}

function itemCount(order: OrderRecord) {
  if (typeof order.itemCount === 'number') return order.itemCount;
  if (typeof order.itemCount === 'string' && order.itemCount.trim()) return Number(order.itemCount) || order.itemCount;
  if (order.lastPaymentMetadata?.itemCount) return order.lastPaymentMetadata.itemCount;
  return order.items?.length || 0;
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
    const candidate = value as { toMillis?: unknown; seconds?: unknown; _seconds?: unknown };
    if (typeof candidate.toMillis === 'function') {
      const ms = candidate.toMillis();
      return typeof ms === 'number' && Number.isFinite(ms) ? ms : null;
    }
    const seconds = typeof candidate.seconds === 'number' ? candidate.seconds : typeof candidate._seconds === 'number' ? candidate._seconds : null;
    return seconds !== null ? seconds * 1000 : null;
  }
  return null;
}

function orderTime(order: OrderRecord) {
  return timestampToMillis(order.paymentUpdatedAt) ?? timestampToMillis(order.updatedAt) ?? timestampToMillis(order.updateTime) ?? timestampToMillis(order.createdAt) ?? timestampToMillis(order.createTime) ?? 0;
}

function formatDate(value: unknown) {
  const millis = timestampToMillis(value);
  if (millis === null) return '—';
  return new Date(millis).toLocaleString();
}

function ageLabel(order: OrderRecord) {
  const time = orderTime(order);
  if (!time) return 'Unknown age';
  const minutes = Math.max(0, Math.round((Date.now() - time) / 60000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function buyerName(order: OrderRecord) {
  return clean(order.customer?.name || order.customerName, 'Unknown buyer');
}

function buyerEmail(order: OrderRecord) {
  return clean(order.customerEmail || order.customer?.email, 'No email');
}

function buyerPhone(order: OrderRecord) {
  return clean(order.customer?.phone || order.customerPhone, 'No phone');
}

function storeLabel(order: OrderRecord) {
  return clean(order.storeName || order.merchantName, clean(order.storeId, 'Unknown store'));
}

function paymentStatusText(order: OrderRecord) {
  return clean(order.paymentStatus || order.payment_status, 'missing');
}

function paymentMethodText(order: OrderRecord) {
  return clean(order.paymentMethod || order.payment_method || order.paymentCollectionMode, '—');
}

function paymentProviderText(order: OrderRecord) {
  return clean(order.paymentProvider || order.payment_provider, '—');
}

function paymentReferenceText(order: OrderRecord) {
  return paymentReferenceValue(order) || '—';
}

function cashConfirmedText(order: OrderRecord) {
  return order.cashConfirmed === true || order.cash_confirmed === true ? 'true' : 'false';
}

function settlementStatusText(order: OrderRecord) {
  return settlementStatusForOrder(order) || clean(order.settlementStatus || order.settlement_status, '—');
}

function statusText(order: OrderRecord) {
  const parts = [order.orderStatus, order.bookingStatus, order.fulfillmentStatus, order.deliveryStatus, order.paymentStatus]
    .map((value) => clean(value))
    .filter(Boolean);
  return parts.length ? parts.join(' / ') : 'No status';
}

function itemKindText(item?: OrderItem) {
  return lower(item?.item_type || item?.type);
}

function orderKind(order: OrderRecord): OrderKind {
  const combined = [
    order.recordType,
    order.orderType,
    order.fulfillmentType,
    order.sourceChannel,
    order.source,
    order.paymentCollectionMode,
    order.paymentMethod,
    order.paymentProvider,
    ...(order.items || []).flatMap((item) => [item.item_type, item.type, item.serviceName]),
  ].map((value) => lower(value)).join(' ');

  if (order.storeOnly || /manual_cash|manual|quick_pay_cash|cash/.test(combined)) return 'manual';
  if (/service|booking|appointment|course|student_registration|donation/.test(combined)) return 'service';
  return 'product';
}

function kindLabel(kind: OrderKind) {
  if (kind === 'manual') return 'Manual / cash entry';
  if (kind === 'service') return 'Service / booking';
  return 'Product order';
}

function actionsForOrder(order: OrderRecord): ActionOption[] {
  const paymentConfirmed = isPaymentConfirmed(order);
  const paymentActions = paymentConfirmed ? [] : [PAYMENT_ACTION];
  if (!classifyOrderWorkflow(order).allowsAdminFulfillment) {
    const payoutActions = paymentConfirmed && lower(settlementStatusForOrder(order)) !== 'paid' ? [STORE_PAYOUT_ACTION] : [];
    return [...paymentActions, ...payoutActions];
  }

  const kind = orderKind(order);
  if (kind === 'manual') return [...paymentActions, ...MANUAL_ACTIONS];
  if (kind === 'service') return [...paymentActions, ...SERVICE_ACTIONS];
  return [...paymentActions, ...PRODUCT_ACTIONS];
}

function bucketFor(order: OrderRecord): Bucket {
  const orderStatus = lower(order.orderStatus);
  const bookingStatus = lower(order.bookingStatus);
  const fulfillmentStatus = lower(order.fulfillmentStatus);
  const deliveryStatus = lower(order.deliveryStatus);
  const paymentStatus = lower(order.paymentStatus);
  const combined = [orderStatus, bookingStatus, fulfillmentStatus, deliveryStatus, paymentStatus].join(' ');

  if (/cancel|refund|failed|problem|dispute|delivery_failed/.test(combined)) return 'problem';
  if (deliveryStatus.includes('delivered') || orderStatus.includes('delivered') || orderStatus.includes('completed') || fulfillmentStatus.includes('completed') || order.deliveredAt || order.completedAt) return 'delivered';
  if (deliveryStatus.includes('out_for_delivery') || deliveryStatus.includes('in_transit')) return 'out_for_delivery';
  if (/prepar|pack|processing/.test(combined)) return 'preparing';
  if (/accepted|confirmed_by_store|booking_confirmed|service_in_progress|ready_for_pickup/.test(combined)) return 'accepted';
  if (/paid|success|successful|confirmed/.test(combined)) return 'new';
  return 'new';
}

function isDelayed(order: OrderRecord) {
  const bucket = bucketFor(order);
  if (bucket === 'delivered' || bucket === 'problem') return false;
  const time = orderTime(order);
  if (!time) return false;
  const hours = (Date.now() - time) / 36e5;
  if (bucket === 'new') return hours >= 1;
  if (bucket === 'accepted' || bucket === 'preparing') return hours >= 6;
  if (bucket === 'out_for_delivery') return hours >= 12;
  return hours >= 24;
}

function bucketTone(bucket: Bucket) {
  if (bucket === 'payment_issues') return 'bg-amber-100 text-amber-800 ring-amber-200';
  if (bucket === 'delivered') return 'bg-emerald-100 text-emerald-700 ring-emerald-200';
  if (bucket === 'problem') return 'bg-rose-100 text-rose-700 ring-rose-200';
  if (bucket === 'delayed') return 'bg-amber-100 text-amber-800 ring-amber-200';
  if (bucket === 'out_for_delivery') return 'bg-blue-100 text-blue-700 ring-blue-200';
  if (bucket === 'preparing') return 'bg-purple-100 text-purple-700 ring-purple-200';
  if (bucket === 'accepted') return 'bg-indigo-100 text-indigo-700 ring-indigo-200';
  return 'bg-slate-100 text-slate-700 ring-slate-200';
}

function bucketIcon(bucket: Bucket) {
  if (bucket === 'payment_issues') return <AlertTriangle className="h-4 w-4" />;
  if (bucket === 'delivered') return <CheckCircle2 className="h-4 w-4" />;
  if (bucket === 'problem') return <XCircle className="h-4 w-4" />;
  if (bucket === 'delayed') return <AlertTriangle className="h-4 w-4" />;
  if (bucket === 'out_for_delivery') return <Truck className="h-4 w-4" />;
  if (bucket === 'preparing') return <PackageOpen className="h-4 w-4" />;
  if (bucket === 'accepted') return <PackageCheck className="h-4 w-4" />;
  return <Clock3 className="h-4 w-4" />;
}

function actionToneClass(tone: ActionOption['tone']) {
  if (tone === 'emerald') return 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100';
  if (tone === 'blue') return 'border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100';
  if (tone === 'purple') return 'border-purple-200 bg-purple-50 text-purple-700 hover:bg-purple-100';
  if (tone === 'amber') return 'border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100';
  return 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100';
}

function csvCell(value: string | number) {
  const safe = String(value ?? '').replaceAll('"', '""');
  return `"${safe}"`;
}

function matchesSearch(order: OrderRecord, query: string) {
  if (!query) return true;
  const haystack = [
    order.id,
    order.path,
    buyerName(order),
    buyerEmail(order),
    buyerPhone(order),
    storeLabel(order),
    order.storeId,
    order.sourceLabel,
    order.sourceChannel,
    order.source,
    orderKind(order),
    statusText(order),
    paymentStatusText(order),
    paymentMethodText(order),
    paymentProviderText(order),
    paymentReferenceText(order),
    settlementStatusText(order),
    ...(order.items || []).flatMap((item) => [item.name, item.productName, item.itemName, item.serviceName]),
  ].map((value) => clean(value)).join(' ').toLowerCase();
  return haystack.includes(query.toLowerCase());
}

export default function OrdersPage() {
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeBucket, setActiveBucket] = useState<Bucket>('all');
  const [query, setQuery] = useState('');
  const [updatingOrderId, setUpdatingOrderId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const knownIds = useRef<Set<string>>(new Set());
  const requestInFlight = useRef(false);
  const actionInFlight = useRef(false);
  const [newOrderMessage, setNewOrderMessage] = useState('');
  const [page, setPage] = useState(1);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [filtersReady, setFiltersReady] = useState(false);
  const filtersHydrated = useRef(false);
  const [hasLoaded, setHasLoaded] = useState(false);

  useEffect(() => {
    if (filtersHydrated.current) return;
    filtersHydrated.current = true;
    const params = new URLSearchParams(window.location.search);
    const bucket = params.get('view') as Bucket;
    if (bucket && bucket in BUCKET_LABELS) setActiveBucket(bucket);
    setQuery(params.get('q') || '');
    const requestedPage = Number(params.get('page'));
    setPage(Number.isFinite(requestedPage) ? Math.max(1, Math.floor(requestedPage)) : 1);
    setFiltersReady(true);
  }, []);

  useEffect(() => {
    if (!filtersReady) return;
    const params = new URLSearchParams();
    if (query) params.set('q', query);
    params.set('view', activeBucket);
    params.set('page', String(page));
    window.history.replaceState(window.history.state, '', `${window.location.pathname}?${params}`);
  }, [query, activeBucket, page, filtersReady]);

  const fetchOrders = useCallback(async (initial = false) => {
    if (requestInFlight.current) return;
    requestInFlight.current = true;
    setRefreshing(true);
    try {
      const data: OrderRecord[] = [];
      let pageToken: string | null = null;
      do {
        const params = new URLSearchParams({ limit: '100' });
        if (pageToken) params.set('pageToken', pageToken);
        const res = await fetch(`/api/admin/firestore/integration-orders?${params}`, { cache: 'no-store' });
        const json = await res.json() as { ok?: boolean; data?: OrderRecord[]; error?: string; nextPageToken?: string | null };
        if (!res.ok || !json.ok) throw new Error(json.error || 'Failed to load orders');
        data.push(...(json.data || []));
        pageToken = json.nextPageToken || null;
      } while (pageToken);
      data.sort((a, b) => orderTime(b) - orderTime(a));
      if (!initial) {
        const newOrders = data.filter((order) => order.id && !knownIds.current.has(order.id));
        if (newOrders.length > 0) setNewOrderMessage(`${newOrders.length} new order${newOrders.length > 1 ? 's' : ''} received.`);
      }

      knownIds.current = new Set(data.map((order) => order.id).filter(Boolean));
      setOrders(data);
      setHasLoaded(true);
      setLastUpdated(new Date().toLocaleTimeString());
      setError(null);
      setLoading(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load orders');
      setLoading(false);
    } finally {
      requestInFlight.current = false;
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    const load = async (initial = false) => {
      if (!mounted || (!initial && (document.hidden || actionInFlight.current))) return;
      await fetchOrders(initial);
    };
    void load(true);
    const timer = setInterval(() => void load(false), POLL_MS);
    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, [fetchOrders]);

  const updateOrderStatus = async (order: OrderRecord, action: StatusAction) => {
    if (actionInFlight.current) return;
    const label = STATUS_ACTION_LABELS[action];
    const prompt = action === 'confirm_payment'
      ? 'Confirm that Sedifex received this payment? This creates an admin audit record and does not complete the order.'
      : action === 'mark_store_paid'
        ? 'Confirm that Sedifex paid this store? This records the payout and does not complete the order.'
        : `Mark this ${kindLabel(orderKind(order)).toLowerCase()} as ${label}? SedifexMarket is responsible for following this order through completion.`;
    const ok = window.confirm(prompt);
    if (!ok) return;

    actionInFlight.current = true;
    setUpdatingOrderId(`${order.id}-${action}`);
    setStatusMessage(null);
    try {
      const res = await fetch('/api/admin/firestore/integration-orders/status', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ orderId: order.id, storeId: order.storeId || '', action }),
      });
      const raw = await res.text();
      let json: { ok?: boolean; error?: string; label?: string } | null = null;
      try { json = JSON.parse(raw); } catch {}
      if (!res.ok || !json?.ok) throw new Error(json?.error || raw || 'Unable to update order status.');
      setStatusMessage(`Updated ${order.id} to ${json.label || label}.`);
      await fetchOrders(true);
    } catch (e) {
      setStatusMessage(e instanceof Error ? e.message : 'Unable to update order status.');
    } finally {
      actionInFlight.current = false;
      setUpdatingOrderId(null);
    }
  };

  const stats = useMemo(() => {
    const initial = { all: orders.length, new: 0, payment_issues: 0, accepted: 0, preparing: 0, out_for_delivery: 0, delivered: 0, problem: 0, delayed: 0 } as Record<Bucket, number>;
    orders.forEach((order) => {
      initial[bucketFor(order)] += 1;
      if (isAcceptedWithoutPayment(order)) initial.payment_issues += 1;
      if (isDelayed(order)) initial.delayed += 1;
    });
    return initial;
  }, [orders]);

  const kindStats = useMemo(() => {
    return orders.reduce((acc, order) => {
      acc[orderKind(order)] += 1;
      return acc;
    }, { product: 0, service: 0, manual: 0 } as Record<OrderKind, number>);
  }, [orders]);

  const filtered = useMemo(() => {
    return orders.filter((order) => {
      const bucket = bucketFor(order);
      const bucketMatch = activeBucket === 'all' ? true : activeBucket === 'payment_issues' ? isAcceptedWithoutPayment(order) : activeBucket === 'delayed' ? isDelayed(order) : bucket === activeBucket;
      return bucketMatch && matchesSearch(order, query.trim());
    });
  }, [orders, activeBucket, query]);

  const revenue = useMemo(() => filtered.reduce((sum, order) => sum + amountNumber(order), 0), [filtered]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / 50));
  const currentPage = Math.min(page, pageCount);
  const pageOrders = filtered.slice((currentPage - 1) * 50, currentPage * 50);

  const downloadCsv = () => {
    const headers = ['Order ID', 'Kind', 'Buyer', 'Phone', 'Customer Email', 'Store', 'Store ID', 'Amount', 'Bucket', 'Status', 'Payment status', 'Payment method', 'Payment provider', 'Payment reference', 'Cash confirmed', 'Settlement status', 'Age', 'Payment Updated At', 'Item Count', 'First Item', 'Source'];
    const lines = filtered.map((order) => {
      const firstItem = (order.items || [])[0];
      return [
        order.id,
        kindLabel(orderKind(order)),
        buyerName(order),
        buyerPhone(order),
        buyerEmail(order),
        storeLabel(order),
        clean(order.storeId),
        money(order),
        BUCKET_LABELS[bucketFor(order)],
        statusText(order),
        paymentStatusText(order),
        paymentMethodText(order),
        paymentProviderText(order),
        paymentReferenceText(order),
        cashConfirmedText(order),
        settlementStatusText(order),
        ageLabel(order),
        formatDate(order.paymentUpdatedAt || order.updatedAt || order.updateTime || order.createdAt || order.createTime),
        itemCount(order),
        clean(firstItem?.name || firstItem?.productName || firstItem?.itemName || firstItem?.serviceName),
        clean(order.sourceChannel || order.source),
      ].map((value) => csvCell(value as string | number)).join(',');
    });

    const csv = [headers.map(csvCell).join(','), ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `sedifex-orders-monitor-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-slate-200 bg-slate-950 p-6 text-white shadow-sm sm:p-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-indigo-300/20 bg-indigo-400/10 px-3 py-1 text-xs font-semibold text-indigo-100">
              <Bell className="h-4 w-4" /> Live order monitoring
            </div>
            <h2 className="mt-5 max-w-4xl text-3xl font-bold tracking-tight sm:text-4xl">Manage Sedifex orders on behalf of stores.</h2>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-300">
              Product orders, service bookings, and manual entries now keep payment status separate from fulfillment progress.
            </p>
          </div>
          <button type="button" onClick={downloadCsv} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm font-bold text-slate-950 hover:bg-slate-100">
            <Download className="h-4 w-4" /> Download CSV
          </button>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Orders loaded</p><p className="mt-2 text-2xl font-bold text-slate-950">{orders.length}</p><p className="mt-1 text-xs text-emerald-600">From integrationOrders</p></div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Order types</p><p className="mt-2 text-sm font-bold text-slate-950">P: {kindStats.product} · S: {kindStats.service} · M: {kindStats.manual}</p><p className="mt-1 text-xs text-slate-500">Product / Service / Manual</p></div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Delayed</p><p className="mt-2 text-2xl font-bold text-slate-950">{stats.delayed}</p><p className="mt-1 text-xs text-rose-600">Requires follow-up</p></div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Shown value</p><p className="mt-2 text-2xl font-bold text-slate-950">GHS {revenue.toFixed(2)}</p><p className="mt-1 text-xs text-slate-500">Current filter total</p></div>
      </section>

      {newOrderMessage ? <p role="status" className="rounded-2xl bg-blue-50 p-4 text-sm text-blue-900">{newOrderMessage} <button type="button" onClick={() => setNewOrderMessage('')} className="ml-3 underline">Dismiss</button></p> : null}
      {statusMessage ? <p role="status" className="rounded-2xl border border-indigo-200 bg-indigo-50 p-4 text-sm font-semibold text-indigo-800">{statusMessage}</p> : null}

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
            {(['all', 'new', 'payment_issues', 'accepted', 'preparing', 'out_for_delivery', 'delivered', 'problem', 'delayed'] as Bucket[]).map((bucket) => (
              <button
                key={bucket}
                type="button"
                onClick={() => { setActiveBucket(bucket); setPage(1); }}
                className={`rounded-2xl border px-3 py-2 text-left text-xs font-bold transition ${activeBucket === bucket ? 'border-indigo-300 bg-indigo-50 text-indigo-900 ring-4 ring-indigo-100' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`}
              >
                <span className="flex items-center gap-2">{bucketIcon(bucket)} {BUCKET_LABELS[bucket]}</span>
                <span className="mt-1 block text-lg text-slate-950">{stats[bucket]}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="mt-5 flex items-center rounded-2xl border border-slate-200 px-3 focus-within:border-indigo-300 focus-within:ring-4 focus-within:ring-indigo-100">
          <Search className="h-4 w-4 text-slate-400" />
          <input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Search order ID, buyer, phone, store, item, type, status" className="w-full border-0 bg-transparent px-3 py-3 text-sm outline-none" />
        </div>

        {loading ? <p className="mt-5 rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">Loading orders…</p> : null}
        {error ? <p role="alert" className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{hasLoaded ? 'Refresh failed. Showing the last loaded orders. ' : ''}{error} <button type="button" disabled={refreshing} onClick={() => void fetchOrders(true)} className="ml-3 underline">Retry</button></p> : null}
        <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
          <span>{filtered.length} matching orders · Page {currentPage} of {pageCount}</span>
          <button type="button" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>Previous</button>
          <button type="button" disabled={currentPage >= pageCount} onClick={() => setPage(currentPage + 1)}>Next</button>
          <button type="button" disabled={refreshing} onClick={() => void fetchOrders(true)}>{refreshing ? 'Refreshing…' : 'Refresh'}</button>
          {lastUpdated ? <span>Updated {lastUpdated}</span> : null}
        </div>

        {!loading && (!error || hasLoaded) ? (
          <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200">
            <div className="hidden grid-cols-[1.05fr_0.95fr_0.75fr_0.9fr_0.95fr_0.8fr_1.05fr] gap-4 border-b border-slate-200 bg-slate-50 px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-500 xl:grid">
              <span>Buyer</span><span>Store</span><span>Amount</span><span>Status</span><span>Items</span><span>Timing</span><span>Admin action</span>
            </div>
            <div className="divide-y divide-slate-100">
              {filtered.length === 0 ? <div className="p-8 text-center text-sm text-slate-500">No orders match this filter.</div> : null}
              {pageOrders.map((order) => {
                const bucket = bucketFor(order);
                const delayed = isDelayed(order);
                const shownBucket: Bucket = isAcceptedWithoutPayment(order) ? 'payment_issues' : delayed && bucket !== 'problem' && bucket !== 'delivered' ? 'delayed' : bucket;
                const paymentIssue = isAcceptedWithoutPayment(order);
                const kind = orderKind(order);
                const actionOptions = actionsForOrder(order);
                const workflow = classifyOrderWorkflow(order);
                return (
                  <div key={order.id} className="grid gap-4 px-4 py-4 text-sm xl:grid-cols-[1.05fr_0.95fr_0.75fr_0.9fr_0.95fr_0.8fr_1.05fr] xl:items-center">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-slate-950">{buyerName(order)}</p>
                      <p className="truncate text-xs text-slate-500">{buyerPhone(order)} · {buyerEmail(order)}</p>
                      <p className="mt-1 break-all text-xs text-slate-400">{order.id}</p>
                    </div>
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-slate-950">{storeLabel(order)}</p>
                      <p className="break-all text-xs text-slate-500">{order.storeId || 'No store ID'}</p>
                      <p className="text-xs text-slate-400">{order.sourceLabel || order.sourceChannel || order.source || '—'}</p>
                      <span className={`mt-2 inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold ${kind === 'product' ? 'bg-blue-50 text-blue-700' : kind === 'service' ? 'bg-indigo-50 text-indigo-700' : 'bg-amber-50 text-amber-800'}`}>{kindLabel(kind)}</span>
                      <span className={`ml-1 mt-2 inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold ${workflow.allowsAdminFulfillment ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-700'}`}>{workflow.label}</span>
                    </div>
                    <div>
                      <p className="font-bold text-slate-950">{money(order)}</p>
                      <p className="text-xs text-slate-500">{itemCount(order)} item(s)</p>
                      <div className="mt-2 space-y-1 text-[11px] text-slate-500">
                        <p><span className="font-semibold text-slate-700">Pay:</span> {paymentStatusText(order)}</p>
                        <p><span className="font-semibold text-slate-700">Method:</span> {paymentMethodText(order)}</p>
                        <p><span className="font-semibold text-slate-700">Provider:</span> {paymentProviderText(order)}</p>
                        <p className="break-all"><span className="font-semibold text-slate-700">Ref:</span> {paymentReferenceText(order)}</p>
                        <p><span className="font-semibold text-slate-700">Cash:</span> {cashConfirmedText(order)}</p>
                        <p><span className="font-semibold text-slate-700">Settlement:</span> {settlementStatusText(order)}</p>
                      </div>
                    </div>
                    <div>
                      <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ring-1 ${bucketTone(shownBucket)}`}>{bucketIcon(shownBucket)} {BUCKET_LABELS[shownBucket]}</span>
                      <p className="mt-2 text-xs text-slate-500">{statusText(order)}</p>
                      {paymentIssue ? (
                        <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
                          <p className="font-bold">{paymentAuditLabel(order)}</p>
                          <p className="mt-1 leading-5">This order was received or accepted, but Sedifex has not confirmed payment yet. Confirm cash or verify online payment before fulfillment.</p>
                        </div>
                      ) : null}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-start gap-2">
                        <ShoppingCart className="mt-0.5 h-4 w-4 text-slate-400" />
                        <div className="min-w-0">
                          {(order.items || []).slice(0, 2).map((item, index) => (
                            <p key={`${order.id}-item-${index}`} className="truncate text-xs text-slate-700">
                              {itemKindText(item) || kind} • {item.name || item.productName || item.itemName || item.serviceName || 'Item'} × {item.qty || item.quantity || 1}
                            </p>
                          ))}
                          {(order.items || []).length === 0 ? <p className="text-xs text-slate-500">No item details</p> : null}
                          {(order.items || []).length > 2 ? <p className="text-xs text-slate-500">+{(order.items || []).length - 2} more</p> : null}
                        </div>
                      </div>
                    </div>
                    <div>
                      <p className="font-semibold text-slate-700">{ageLabel(order)}</p>
                      <p className="text-xs text-slate-500">{formatDate(order.paymentUpdatedAt || order.updatedAt || order.updateTime || order.createdAt || order.createTime)}</p>
                      {order.deliveredAt ? <p className="mt-1 text-xs text-emerald-600">Delivered: {formatDate(order.deliveredAt)}</p> : null}
                      {order.completedAt ? <p className="mt-1 text-xs text-emerald-600">Completed: {formatDate(order.completedAt)}</p> : null}
                    </div>
                    <div>
                      <p className="mb-2 text-[11px] leading-4 text-slate-500">{workflow.description}</p>
                      <div className="flex flex-wrap gap-1.5">
                        {actionOptions.map((action) => (
                        <button
                          key={`${order.id}-${action.id}`}
                          type="button"
                          disabled={Boolean(updatingOrderId)}
                          onClick={() => updateOrderStatus(order, action.id)}
                          className={`rounded-full border px-2.5 py-1 text-[11px] font-bold transition disabled:cursor-not-allowed disabled:opacity-50 ${actionToneClass(action.tone)}`}
                        >
                          {updatingOrderId === `${order.id}-${action.id}` ? 'Updating…' : action.label}
                        </button>
                        ))}
                        {actionOptions.length === 0 ? <span className="text-[11px] font-semibold text-emerald-700">{workflow.allowsAdminFulfillment ? 'Payment audit complete' : 'Payment and payout complete'}</span> : null}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
