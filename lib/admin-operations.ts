import { getFirebaseEnvStatus, listFirestoreDocuments } from './firebase-admin';

export type OperationRecord = Record<string, unknown> & {
  id?: string;
  path?: string;
  createTime?: string | null;
  updateTime?: string | null;
};

type CollectionSnapshot = {
  documents: OperationRecord[];
  error: string | null;
  hasMore: boolean;
};

export type OperationsData = {
  ready: boolean;
  error: string | null;
  stores: OperationRecord[];
  orders: OperationRecord[];
  bookings: OperationRecord[];
  settlements: OperationRecord[];
  deliveries: OperationRecord[];
  collectionErrors: Record<string, string>;
  limitedCollections: string[];
};

export function stringValue(value: unknown) {
  return typeof value === 'string' ? value.trim() : typeof value === 'number' ? String(value) : '';
}

export function field(record: OperationRecord, ...keys: string[]) {
  for (const key of keys) {
    const value = stringValue(record[key]);
    if (value) return value;
  }
  return '';
}

export function numericField(record: OperationRecord, ...keys: string[]): number {
  for (const key of keys) {
    const raw = record[key];
    const value = typeof raw === 'number' ? raw : typeof raw === 'string' && raw.trim() ? Number(raw) : NaN;
    if (Number.isFinite(value)) return value;
  }
  return 0;
}

export function millis(value: unknown): number | null {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.getTime() : null;
  if (typeof value === 'number') return Number.isFinite(value) ? (value < 1e11 ? value * 1000 : value) : null;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (value && typeof value === 'object') {
    const stamp = value as { _seconds?: unknown; seconds?: unknown; toDate?: unknown };
    if (typeof stamp.toDate === 'function') {
      const date = stamp.toDate();
      return date instanceof Date && Number.isFinite(date.getTime()) ? date.getTime() : null;
    }
    const seconds = typeof stamp.seconds === 'number' ? stamp.seconds : stamp._seconds;
    if (typeof seconds === 'number' && Number.isFinite(seconds)) return seconds * 1000;
  }
  return null;
}

export function createdTime(record: OperationRecord) {
  return millis(record.createdAtServer) ?? millis(record.createdAtIso) ??
    millis(record.createdAt) ?? millis(record.created_at) ?? millis(record.createTime);
}

export function changedTime(record: OperationRecord) {
  return millis(record.updatedAt) ?? millis(record.updateTime) ?? createdTime(record);
}

export function normalizedStatus(record: OperationRecord, ...keys: string[]) {
  return field(record, ...keys).toLowerCase().replace(/[ -]/g, '_');
}

export function isPaidPayment(record: OperationRecord) {
  return ['paid', 'paid_online', 'paid_cash', 'success', 'successful', 'succeeded', 'captured', 'settled', 'completed']
    .includes(normalizedStatus(record, 'paymentStatus', 'payment_status'));
}

export function isFailedPayment(record: OperationRecord) {
  return ['failed', 'error', 'declined', 'chargeback'].includes(
    normalizedStatus(record, 'paymentStatus', 'payment_status')
  );
}

export function pendingManualSettlement(record: OperationRecord) {
  return !['paid', 'settled', 'completed'].includes(normalizedStatus(record, 'payoutStatus'));
}

export function isFailedWebhook(record: OperationRecord) {
  return ['failed', 'error', 'retrying'].includes(normalizedStatus(record, 'status', 'deliveryStatus', 'state'));
}

export function money(value: number) {
  return 'GHS ' + value.toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

async function readCollection(collection: string, limit: number): Promise<CollectionSnapshot> {
  try {
    const result = await listFirestoreDocuments(collection, limit);
    return {
      documents: result.documents as OperationRecord[],
      error: null,
      hasMore: Boolean(result.nextPageToken),
    };
  } catch (error) {
    return {
      documents: [],
      error: error instanceof Error ? error.message : 'Unable to read ' + collection,
      hasMore: false,
    };
  }
}

/**
 * A bounded operational snapshot, not an accounting ledger or an all-time total.
 * Firestore pagination uses document ID ordering, so always label time-window totals
 * derived from these records as a sample. Never call store sales Sedifex revenue.
 */
export async function loadAdminOperations(limit = 250): Promise<OperationsData> {
  if (!getFirebaseEnvStatus().ready) {
    return {
      ready: false,
      error: 'Firebase is not configured in this deployment.',
      stores: [],
      orders: [],
      bookings: [],
      settlements: [],
      deliveries: [],
      collectionErrors: {},
      limitedCollections: [],
    };
  }

  const names = ['stores', 'storeSettings', 'integrationOrders', 'integrationBookings', 'manualSettlements', 'webhookDeliveries'] as const;
  const snapshots = await Promise.all(names.map((name) => readCollection(name, limit)));
  const errors: Record<string, string> = {};
  const limitedCollections: string[] = [];
  names.forEach((name, index) => {
    const snapshot = snapshots[index];
    if (snapshot.error) errors[name] = snapshot.error;
    if (snapshot.hasMore) limitedCollections.push(name);
  });

  const storeMap = new Map<string, OperationRecord>();
  snapshots[1].documents.forEach((doc) => { if (doc.id) storeMap.set(doc.id, doc); });
  snapshots[0].documents.forEach((doc) => {
    if (doc.id) storeMap.set(doc.id, { ...(storeMap.get(doc.id) || {}), ...doc });
  });

  return {
    ready: snapshots[0].error === null || snapshots[1].error === null,
    error: snapshots[0].error && snapshots[1].error ? 'Could not load businesses from Firestore.' : null,
    stores: [...storeMap.values()],
    orders: snapshots[2].documents,
    bookings: snapshots[3].documents,
    settlements: snapshots[4].documents,
    deliveries: snapshots[5].documents,
    collectionErrors: errors,
    limitedCollections,
  };
}
