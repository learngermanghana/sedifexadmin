import { Timestamp } from 'firebase-admin/firestore';
import { NextResponse } from 'next/server';
import { authorizeAdminRequest } from '@/lib/admin-api-auth';
import { adminFirestore } from '@/lib/firebase-admin';

export const runtime = 'nodejs';

type Body = {
  settlementId?: unknown;
  payoutMethod?: unknown;
  payoutReference?: unknown;
  payoutProofUrl?: unknown;
  payoutNote?: unknown;
};

type RecordData = Record<string, unknown>;


function clean(value: unknown, max = 500) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

export async function POST(req: Request) {
  const session = await authorizeAdminRequest(req, { roles: ['super_admin', 'ops_admin'] });
  const role = session?.role;
  if (!session) {
    return NextResponse.json({ ok: false, error: 'Only super_admin or ops_admin can mark settlements as paid.', currentRole: role || null }, { status: 403 });
  }

  try {
    const body = await req.json().catch(() => null) as Body | null;
    const settlementId = clean(body?.settlementId, 220);
    const payoutMethod = clean(body?.payoutMethod, 120) || 'manual';
    const payoutReference = clean(body?.payoutReference, 220);
    const payoutProofUrl = clean(body?.payoutProofUrl, 1000);
    const payoutNote = clean(body?.payoutNote, 1000);

    if (!settlementId) return NextResponse.json({ ok: false, error: 'settlementId is required.' }, { status: 400 });

    const db = adminFirestore();
    let orderId = '';
    let storeId = '';
    let alreadyPaid = false;
    const now = Timestamp.now();

    await db.runTransaction(async (tx) => {
      const settlementRef = db.collection('manualSettlements').doc(settlementId);
      const settlementSnap = await tx.get(settlementRef);
      if (!settlementSnap.exists) throw new Error(`Settlement not found: ${settlementId}`);

      const settlement = settlementSnap.data() as RecordData;
      orderId = clean(settlement.orderId || settlementId, 220);
      storeId = clean(settlement.storeId, 220);
      const currentStatus = clean(settlement.payoutStatus || settlement.status, 80).toLowerCase();

      if (currentStatus === 'paid') {
        alreadyPaid = true;
        return;
      }

      const patch = {
        payoutStatus: 'paid',
        status: 'paid',
        payoutMethod,
        payoutReference: payoutReference || null,
        payoutProofUrl: payoutProofUrl || null,
        payoutNote: payoutNote || null,
        paidAt: now,
        paidBy: 'sedifex_admin',
        paidByRole: role,
        updatedAt: now,
      };

      tx.set(settlementRef, patch, { merge: true });

      if (orderId) {
        tx.set(db.collection('integrationOrders').doc(orderId), {
          settlementStatus: 'paid',
          manualSettlementId: settlementId,
          settlementPaidAt: now,
          settlementUpdatedAt: now,
          updatedAt: now,
        }, { merge: true });
      }

      if (storeId && orderId) {
        tx.set(db.collection('stores').doc(storeId).collection('integrationOrders').doc(orderId), {
          settlementStatus: 'paid',
          manualSettlementId: settlementId,
          settlementPaidAt: now,
          settlementUpdatedAt: now,
          updatedAt: now,
        }, { merge: true });
      }

      tx.set(db.collection('adminAuditLogs').doc(), {
        action: 'manual_settlement_marked_paid',
        settlementId,
        orderId: orderId || null,
        storeId: storeId || null,
        payoutMethod,
        payoutReference: payoutReference || null,
        actor: 'sedifexadmin',
        actorRole: role,
        createdAt: now,
      });
    });

    return NextResponse.json({ ok: true, settlementId, orderId: orderId || settlementId, storeId: storeId || null, alreadyPaid, payoutStatus: 'paid' });
  } catch (error) {
    console.error('[manual-settlement-mark-paid] failed', error);
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : 'Unable to mark settlement as paid.' }, { status: 500 });
  }
}
