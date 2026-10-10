import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { NextResponse } from 'next/server';
import { adminFirestore, listFirestoreDocuments } from '@/lib/firebase-admin';
import { isAcceptedWithoutPayment, isPaymentPending, paymentAuditPatch } from '@/lib/payment-audit';
import { sendPaymentNotConfirmedEmail } from '@/lib/payment-audit-email';

type RawRecord = Record<string, unknown>;

function text(value: unknown, fallback = '') {
  if (typeof value === 'string') return value.trim() || fallback;
  if (typeof value === 'number') return String(value);
  return fallback;
}

function storeIdFromOrder(order: RawRecord) {
  return text(order.storeId || order.store_id || order.merchantId || order.merchant_id || order.businessId || order.business_id);
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

function orderTime(order: RawRecord) {
  return timestampToMillis(order.paymentUpdatedAt) ?? timestampToMillis(order.updatedAt) ?? timestampToMillis(order.updateTime) ?? timestampToMillis(order.createdAt) ?? timestampToMillis(order.createTime) ?? 0;
}

function paymentEmailPatch(reason: string) {
  return {
    paymentNotConfirmedEmailSent: true,
    paymentNotConfirmedEmailSentAt: Timestamp.now(),
    paymentNotConfirmedEmailCount: FieldValue.increment(1),
    lastPaymentNotConfirmedEmailReason: reason,
  };
}

function shouldSendDelayedPaymentEmail(order: RawRecord) {
  if (order.paymentNotConfirmedEmailSent === true) return false;
  if (!isPaymentPending(order)) return false;
  const created = orderTime(order);
  return Boolean(created && Date.now() - created >= 10 * 60 * 1000);
}

function storeNameFromRecord(store: RawRecord | undefined, fallback = '') {
  if (!store) return fallback;
  return text(store.displayName || store.storeName || store.name || store.businessName || store.merchantName || store.publicName, fallback);
}

async function loadStoresById(storeIds: string[]) {
  const uniqueStoreIds = Array.from(new Set(storeIds.filter(Boolean)));
  const db = adminFirestore();
  const storesById = new Map<string, RawRecord>();

  await Promise.all(uniqueStoreIds.map(async (storeId) => {
    try {
      const snapshot = await db.collection('stores').doc(storeId).get();
      if (snapshot.exists) storesById.set(storeId, snapshot.data() || {});
    } catch {
      // Keep order loading resilient even if one store lookup fails.
    }
  }));

  return storesById;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const limit = Number(url.searchParams.get('limit') || 50);

  try {
    const data = await listFirestoreDocuments('integrationOrders', Number.isFinite(limit) ? limit : 100, url.searchParams.get('pageToken') || undefined);
    const orders = data.documents as RawRecord[];
    const storesById = await loadStoresById(orders.map(storeIdFromOrder));

    const auditBatch = adminFirestore().batch();
    let auditWrites = 0;

    const enrichedOrders = await Promise.all(orders.map(async (order) => {
      const storeId = storeIdFromOrder(order);
      const store = storesById.get(storeId);
      const storeName = storeNameFromRecord(store, text(order.storeName || order.merchantName));
      const enriched = {
        ...order,
        storeId: storeId || order.storeId,
        storeName,
        storeDisplayName: storeName || storeId || 'Unknown store',
      };

      const auditPatch = paymentAuditPatch(enriched, Timestamp.now());
      const visible = { ...enriched, ...auditPatch };

      if (isAcceptedWithoutPayment(enriched) && auditWrites < 450) {
        auditBatch.set(adminFirestore().collection('integrationOrders').doc(text(order.id)), auditPatch, { merge: true });
        auditWrites += 1;
        if (storeId) {
          auditBatch.set(adminFirestore().collection('stores').doc(storeId).collection('integrationOrders').doc(text(order.id)), auditPatch, { merge: true });
          auditWrites += 1;
        }
      }

      if (shouldSendDelayedPaymentEmail(enriched) && auditWrites < 450) {
        try {
          const emailResult = await sendPaymentNotConfirmedEmail(enriched, store || {});
          if (emailResult.sent) {
            const emailPatch = paymentEmailPatch('pending_after_10_minutes');
            auditBatch.set(adminFirestore().collection('integrationOrders').doc(text(order.id)), emailPatch, { merge: true });
            auditWrites += 1;
            if (storeId) {
              auditBatch.set(adminFirestore().collection('stores').doc(storeId).collection('integrationOrders').doc(text(order.id)), emailPatch, { merge: true });
              auditWrites += 1;
            }
            Object.assign(visible, { paymentNotConfirmedEmailSent: true, lastPaymentNotConfirmedEmailReason: 'pending_after_10_minutes' });
          }
        } catch (error) {
          console.error('[integration-orders] delayed payment audit email failed', error);
        }
      }

      return visible;
    }));

    if (auditWrites > 0) await auditBatch.commit();

    return NextResponse.json({
      ok: true,
      collection: 'integrationOrders',
      count: enrichedOrders.length,
      data: enrichedOrders,
      nextPageToken: data.nextPageToken,
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : 'Unable to read integrationOrders from Firestore.' }, { status: 500 });
  }
}
