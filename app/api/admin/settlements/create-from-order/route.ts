import { Timestamp } from 'firebase-admin/firestore';
import { NextResponse } from 'next/server';
import { authorizeAdminRequest } from '@/lib/admin-api-auth';
import { adminFirestore } from '@/lib/firebase-admin';

export const runtime = 'nodejs';

type Body = {
  orderId?: unknown;
  storeSplitPercent?: unknown;
  reason?: unknown;
  note?: unknown;
};

type RecordData = Record<string, unknown>;


function clean(value: unknown, max = 500) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function numberValue(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function moneyValue(...values: unknown[]) {
  for (const value of values) {
    const parsed = numberValue(value);
    if (parsed !== null) return parsed;
  }
  return 0;
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function percentFrom(value: unknown, fallback = 97) {
  const parsed = numberValue(value);
  if (parsed === null || parsed <= 0) return fallback;
  if (parsed <= 1) return parsed * 100;
  if (parsed > 100) return fallback;
  return parsed;
}

function storeIdFrom(order: RecordData) {
  return clean(order.storeId || order.store_id || order.merchantId || order.merchant_id || order.businessId || order.business_id, 220);
}

function storeNameFrom(order: RecordData, fallback = '') {
  return clean(order.storeName || order.merchantName || order.storeDisplayName || order.businessName || order.publicName, 220) || fallback;
}

function paystackReferenceFrom(order: RecordData) {
  return clean(
    order.paystackReference || order.paymentReference || order.reference || order.transactionReference || order.transactionId || order.paystackTransactionId,
    220,
  );
}

function subaccountCodeFrom(order: RecordData) {
  return clean(order.subaccountCode || order.paystackSubaccountCode || order.subaccount || order.paystackSubaccount, 220);
}

export async function POST(req: Request) {
  const session = await authorizeAdminRequest(req, { roles: ['super_admin', 'ops_admin'] });
  const role = session?.role;
  if (!session) {
    return NextResponse.json({ ok: false, error: 'Only super_admin or ops_admin can create manual settlements.', currentRole: role || null }, { status: 403 });
  }

  try {
    const body = await req.json().catch(() => null) as Body | null;
    const orderId = clean(body?.orderId, 220);
    const reason = clean(body?.reason, 300) || 'paystack_split_not_settled_to_store';
    const note = clean(body?.note, 1000);

    if (!orderId) return NextResponse.json({ ok: false, error: 'orderId is required.' }, { status: 400 });

    const db = adminFirestore();
    let created = false;
    let settlementId = orderId;
    let settlement: RecordData | null = null;

    await db.runTransaction(async (tx) => {
      const orderRef = db.collection('integrationOrders').doc(orderId);
      const settlementRef = db.collection('manualSettlements').doc(orderId);
      const settlementSnap = await tx.get(settlementRef);

      if (settlementSnap.exists) {
        settlement = { id: settlementSnap.id, ...(settlementSnap.data() || {}) };
        return;
      }

      const orderSnap = await tx.get(orderRef);
      if (!orderSnap.exists) throw new Error(`Order not found: ${orderId}`);

      const order = orderSnap.data() || {};
      const totalPaid = roundMoney(moneyValue(order.finalTotal, order.final_total, order.amountPaid, order.amount, typeof order.amountMinor === 'number' ? order.amountMinor / 100 : undefined));
      const storeSplitPercent = percentFrom(body?.storeSplitPercent ?? order.storeSplitPercent ?? order.store_split_percent ?? order.splitPercent ?? order.split_percentage, 97);
      const storePayable = roundMoney(totalPaid * (storeSplitPercent / 100));
      const sedifexFee = roundMoney(totalPaid - storePayable);
      const storeId = storeIdFrom(order);
      const now = Timestamp.now();

      const settlementData: RecordData = {
        id: orderId,
        settlementId: orderId,
        duplicateKey: orderId,
        orderId,
        orderPath: orderRef.path,
        storeId,
        storeName: storeNameFrom(order, storeId),
        customerName: clean(order.customerName || (order.customer as RecordData | undefined)?.name, 220),
        customerEmail: clean(order.customerEmail || (order.customer as RecordData | undefined)?.email, 220),
        customerPhone: clean(order.customerPhone || (order.customer as RecordData | undefined)?.phone, 80),
        customerPaid: totalPaid,
        totalPaid,
        sedifexFee,
        storePayable,
        storeSplitPercent,
        currency: clean(order.currency, 20) || 'GHS',
        paystackReference: paystackReferenceFrom(order),
        subaccountCode: subaccountCodeFrom(order),
        subaccountStatus: clean(order.subaccountStatus || order.paystackSubaccountStatus, 80) || 'unverified',
        splitStatus: clean(order.splitStatus || order.paystackSplitStatus, 80) || 'manual_required',
        payoutStatus: 'pending',
        payoutMethod: null,
        payoutReference: null,
        payoutProofUrl: null,
        payoutNote: note || null,
        reason,
        source: 'sedifexadmin',
        createdAt: now,
        updatedAt: now,
        createdBy: 'sedifex_admin',
        createdByRole: role,
      };

      tx.set(settlementRef, settlementData, { merge: false });
      tx.set(orderRef, {
        manualSettlementId: orderId,
        settlementStatus: 'pending',
        settlementRequired: true,
        splitStatus: 'manual_required',
        settlementUpdatedAt: now,
        updatedAt: now,
      }, { merge: true });

      if (storeId) {
        tx.set(db.collection('stores').doc(storeId).collection('integrationOrders').doc(orderId), {
          manualSettlementId: orderId,
          settlementStatus: 'pending',
          settlementRequired: true,
          splitStatus: 'manual_required',
          settlementUpdatedAt: now,
          updatedAt: now,
        }, { merge: true });
      }

      tx.set(db.collection('adminAuditLogs').doc(), {
        action: 'manual_settlement_created',
        orderId,
        settlementId: orderId,
        storeId: storeId || null,
        actor: 'sedifexadmin',
        actorRole: role,
        reason,
        createdAt: now,
      });

      settlement = settlementData;
      created = true;
    });

    return NextResponse.json({ ok: true, created, settlementId, settlement });
  } catch (error) {
    console.error('[manual-settlement-create] failed', error);
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : 'Unable to create manual settlement.' }, { status: 500 });
  }
}
