import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { NextResponse } from 'next/server';
import { authorizeAdminRequest } from '@/lib/admin-api-auth';
import { adminFirestore } from '@/lib/firebase-admin';
import { isPaymentConfirmed, paymentAuditPatch, isOnlineCheckoutOrder, isCashLikePayment } from '@/lib/payment-audit';
import { sendOrderPaidEmail, sendPaymentNotConfirmedEmail } from '@/lib/payment-audit-email';
import { sendStorePayoutEmail } from '@/lib/store-payout-email';
import { classifyOrderWorkflow } from '@/lib/order-workflow';

type StatusAction =
  | 'confirm_payment'
  | 'mark_store_paid'
  | 'received'
  | 'preparing'
  | 'out_for_delivery'
  | 'delivered'
  | 'confirm_service'
  | 'service_in_progress'
  | 'service_completed'
  | 'complete_manual';

type StatusBody = {
  orderId?: unknown;
  storeId?: unknown;
  action?: unknown;
  note?: unknown;
  paymentOverride?: unknown;
};

const ACTION_LABELS: Record<StatusAction, string> = {
  confirm_payment: 'Payment receipt confirmed for audit',
  mark_store_paid: 'Store paid',
  received: 'Accepted by store',
  preparing: 'Preparing product',
  out_for_delivery: 'Out for delivery',
  delivered: 'Delivered',
  confirm_service: 'Service booking confirmed',
  service_in_progress: 'Service started',
  service_completed: 'Service completed',
  complete_manual: 'Manual entry completed',
};


function canOverridePayment(role?: string) {
  return role === 'super_admin' || role === 'support';
}

function clean(value: unknown, max = 500) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function isStatusAction(value: string): value is StatusAction {
  return value === 'confirm_payment'
    || value === 'mark_store_paid'
    || value === 'received'
    || value === 'preparing'
    || value === 'out_for_delivery'
    || value === 'delivered'
    || value === 'confirm_service'
    || value === 'service_in_progress'
    || value === 'service_completed'
    || value === 'complete_manual';
}

function storeIdFromOrder(order: FirebaseFirestore.DocumentData | undefined, fallback = '') {
  if (!order) return fallback;
  return clean(order.storeId || order.store_id || order.merchantId || order.merchant_id || order.businessId || order.business_id) || fallback;
}

function isFulfillmentAction(action: StatusAction) {
  return action !== 'confirm_payment' && action !== 'mark_store_paid';
}

function isTerminalAction(action: StatusAction) {
  return action === 'delivered' || action === 'service_completed' || action === 'complete_manual';
}

function shouldWarnForAction(action: StatusAction) {
  return action === 'received' || action === 'confirm_service' || action === 'preparing' || action === 'out_for_delivery' || action === 'service_in_progress';
}

function auditHistoryEntry(role: string | undefined) {
  return {
    action: 'payment_audit_warning',
    status: 'payment_not_confirmed',
    actor: 'sedifex_admin',
    actorRole: role,
    source: 'sedifexadmin',
    note: 'Order received/accepted but payment has not been confirmed.',
    createdAt: Timestamp.now(),
    createdAtIso: new Date().toISOString(),
  };
}

function emailSentPatch(reason: string) {
  const now = Timestamp.now();
  return {
    paymentNotConfirmedEmailSent: true,
    paymentNotConfirmedEmailSentAt: now,
    paymentNotConfirmedEmailCount: FieldValue.increment(1),
    lastPaymentNotConfirmedEmailReason: reason,
  };
}

function orderPaidEmailSentPatch(reason: string) {
  const now = Timestamp.now();
  return {
    storeOrderPaidEmailSent: true,
    storeOrderPaidEmailSentAt: now,
    storeOrderPaidEmailCount: FieldValue.increment(1),
    lastStoreOrderPaidEmailReason: reason,
  };
}

function storePayoutEmailSentPatch(reason: string) {
  const now = Timestamp.now();
  return {
    storePayoutEmailSent: true,
    storePayoutEmailSentAt: now,
    storePayoutEmailCount: FieldValue.increment(1),
    lastStorePayoutEmailReason: reason,
  };
}

function statusPatch(action: StatusAction): Record<string, unknown> {
  const now = Timestamp.now();
  const base: Record<string, unknown> = {
    adminLastStatusAction: action,
    adminLastStatusLabel: ACTION_LABELS[action],
    adminLastStatusUpdatedAt: now,
    statusUpdatedAt: now,
    updatedAt: now,
    updatedBy: 'sedifex_admin',
    updatedByRole: 'admin',
  };

  if (action === 'confirm_payment') {
    return {
      ...base,
      paymentReceiptConfirmed: true,
      payment_receipt_confirmed: true,
      paymentReceiptConfirmedAt: now,
      paymentReceiptConfirmedBy: 'sedifex_admin',
      paymentAuditStatus: 'payment_confirmed',
      paymentAuditSeverity: 'none',
      paymentAuditReason: 'Sedifex Admin confirmed receipt of payment for audit purposes.',
      paymentAuditUpdatedAt: now,
      requiresPaymentReview: false,
    };
  }

  if (action === 'mark_store_paid') {
    return {
      ...base,
      settlementStatus: 'paid',
      settlement_status: 'paid',
      settlementPaidAt: now,
      settlementPaidBy: 'sedifex_admin',
      settlementUpdatedAt: now,
    };
  }

  if (action === 'received') {
    return {
      ...base,
      orderStatus: 'confirmed_by_store',
      order_status: 'confirmed_by_store',
      fulfillmentStatus: 'accepted',
      fulfillment_status: 'accepted',
      deliveryStatus: 'not_started',
      delivery_status: 'not_started',
      receivedAt: now,
      receivedBy: 'sedifex_admin',
      storeConfirmedAt: now,
      storeConfirmedBy: 'sedifex_admin',
    };
  }

  if (action === 'preparing') {
    return {
      ...base,
      orderStatus: 'preparing',
      order_status: 'preparing',
      fulfillmentStatus: 'preparing',
      fulfillment_status: 'preparing',
      deliveryStatus: 'not_started',
      delivery_status: 'not_started',
      preparingAt: now,
      preparingBy: 'sedifex_admin',
    };
  }

  if (action === 'out_for_delivery') {
    return {
      ...base,
      orderStatus: 'out_for_delivery',
      order_status: 'out_for_delivery',
      fulfillmentStatus: 'out_for_delivery',
      fulfillment_status: 'out_for_delivery',
      deliveryStatus: 'out_for_delivery',
      delivery_status: 'out_for_delivery',
      outForDeliveryAt: now,
      outForDeliveryBy: 'sedifex_admin',
    };
  }

  if (action === 'delivered') {
    return {
      ...base,
      orderStatus: 'delivered',
      order_status: 'delivered',
      fulfillmentStatus: 'completed',
      fulfillment_status: 'completed',
      deliveryStatus: 'delivered',
      delivery_status: 'delivered',
      deliveredAt: now,
      deliveredBy: 'sedifex_admin',
      customerDeliveredEmailSent: false,
      customerDeliveryConfirmationStatus: 'pending',
    };
  }

  if (action === 'confirm_service') {
    return {
      ...base,
      orderStatus: 'booking_confirmed',
      order_status: 'booking_confirmed',
      bookingStatus: 'confirmed',
      fulfillmentStatus: 'booking_confirmed',
      fulfillment_status: 'booking_confirmed',
      deliveryStatus: 'not_applicable',
      delivery_status: 'not_applicable',
      serviceConfirmedAt: now,
      serviceConfirmedBy: 'sedifex_admin',
    };
  }

  if (action === 'service_in_progress') {
    return {
      ...base,
      orderStatus: 'service_in_progress',
      order_status: 'service_in_progress',
      bookingStatus: 'in_progress',
      fulfillmentStatus: 'service_in_progress',
      fulfillment_status: 'service_in_progress',
      deliveryStatus: 'not_applicable',
      delivery_status: 'not_applicable',
      serviceStartedAt: now,
      serviceStartedBy: 'sedifex_admin',
    };
  }

  if (action === 'service_completed') {
    return {
      ...base,
      orderStatus: 'service_completed',
      order_status: 'service_completed',
      bookingStatus: 'completed',
      fulfillmentStatus: 'completed',
      fulfillment_status: 'completed',
      deliveryStatus: 'not_applicable',
      delivery_status: 'not_applicable',
      completedAt: now,
      completedBy: 'sedifex_admin',
    };
  }

  return {
    ...base,
    orderStatus: 'manual_completed',
    order_status: 'manual_completed',
    fulfillmentStatus: 'completed',
    fulfillment_status: 'completed',
    deliveryStatus: 'not_applicable',
    delivery_status: 'not_applicable',
    completedAt: now,
    completedBy: 'sedifex_admin',
  };
}

export async function POST(req: Request) {
  const session = await authorizeAdminRequest(req, { roles: ['super_admin', 'ops_admin', 'support'] });
  const role = session?.role;
  if (!session) {
    return NextResponse.json({ ok: false, error: 'Only super_admin, ops_admin, or support can update order status.', currentRole: role || null }, { status: 403 });
  }

  try {
    const body = await req.json().catch(() => null) as StatusBody | null;
    const orderId = clean(body?.orderId, 220);
    const requestedStoreId = clean(body?.storeId, 220);
    const action = clean(body?.action, 60);
    const note = clean(body?.note, 1000);
    const paymentOverride = body?.paymentOverride === true;

    if (!orderId) return NextResponse.json({ ok: false, error: 'orderId is required.' }, { status: 400 });
    if (!isStatusAction(action)) return NextResponse.json({ ok: false, error: 'Unsupported status action.', action }, { status: 400 });

    const db = adminFirestore();
    const orderRef = db.collection('integrationOrders').doc(orderId);
    const orderSnapshot = await orderRef.get();
    const orderData = orderSnapshot.exists ? orderSnapshot.data() : undefined;
    if (!orderData) return NextResponse.json({ ok: false, error: 'Order not found.' }, { status: 404 });

    const storeId = storeIdFromOrder(orderData, requestedStoreId);
    const paymentConfirmed = isPaymentConfirmed(orderData);
    const onlineCheckout = isOnlineCheckoutOrder(orderData);
    const cashLike = isCashLikePayment(orderData);
    const workflow = classifyOrderWorkflow(orderData);

    if (isFulfillmentAction(action) && !workflow.allowsAdminFulfillment) {
      return NextResponse.json({
        ok: false,
        error: 'This order is store-managed. Sedifex Admin may confirm payment for auditing, but booking, follow-up, delivery, and completion must be handled in the store UI.',
        code: 'store_managed_fulfillment',
        workflowOwner: workflow.owner,
      }, { status: 409 });
    }

    if (action === 'mark_store_paid' && workflow.allowsAdminFulfillment) {
      return NextResponse.json({
        ok: false,
        error: 'Store payout actions on the Orders page are only available for store-managed orders.',
        code: 'sedifexmarket_payout_action',
        workflowOwner: workflow.owner,
      }, { status: 409 });
    }

    if (action === 'mark_store_paid' && !paymentConfirmed) {
      return NextResponse.json({
        ok: false,
        error: 'Confirm payment received before marking the store paid.',
        code: 'payment_not_confirmed',
        requiresPaymentReview: true,
      }, { status: 409 });
    }

    if (!paymentConfirmed && isTerminalAction(action) && !paymentOverride) {
      const blockedType = onlineCheckout ? 'online checkout order' : cashLike ? 'cash order' : 'order';
      const blockedAuditPatch = {
        ...paymentAuditPatch(orderData, Timestamp.now()),
        statusHistory: FieldValue.arrayUnion(auditHistoryEntry(role)),
      };
      const blockedBatch = db.batch();
      blockedBatch.set(orderRef, blockedAuditPatch, { merge: true });
      if (storeId) blockedBatch.set(db.collection('stores').doc(storeId).collection('integrationOrders').doc(orderId), blockedAuditPatch, { merge: true });
      await blockedBatch.commit();

      return NextResponse.json({
        ok: false,
        error: `Payment has not been confirmed for this ${blockedType}. Confirm cash received or wait for online payment verification before marking it delivered or completed.`,
        code: 'payment_not_confirmed',
        requiresPaymentReview: true,
      }, { status: 409 });
    }

    if (!paymentConfirmed && paymentOverride) {
      if (!canOverridePayment(role)) return NextResponse.json({ ok: false, error: 'Only support or super_admin can use a payment override.', code: 'payment_override_forbidden' }, { status: 403 });
      if (!note) return NextResponse.json({ ok: false, error: 'A note is required when using a payment override.', code: 'payment_override_note_required' }, { status: 400 });
    }

    let storeData: FirebaseFirestore.DocumentData = {};
    if (storeId) {
      try {
        const storeSnapshot = await db.collection('stores').doc(storeId).get();
        storeData = storeSnapshot.exists ? storeSnapshot.data() || {} : {};
      } catch {
        storeData = {};
      }
    }

    const patch = statusPatch(action);
    const historyEntry = {
      status: action,
      label: ACTION_LABELS[action],
      actor: 'sedifex_admin',
      actorRole: role,
      source: 'sedifexadmin',
      note: note || null,
      createdAt: Timestamp.now(),
      createdAtIso: new Date().toISOString(),
    };

    const now = Timestamp.now();
    const needsAuditWarning = !paymentConfirmed && (shouldWarnForAction(action) || isTerminalAction(action));
    const auditPatch = paymentAuditPatch({ ...orderData, ...patch }, now);
    const historyEntries = needsAuditWarning ? [historyEntry, auditHistoryEntry(role)] : [historyEntry];

    const overridePatch = !paymentConfirmed && paymentOverride ? {
      paymentOverrideUsed: true,
      paymentOverrideBy: 'sedifex_admin',
      paymentOverrideAt: now,
      paymentOverrideNote: note,
      requiresPaymentReview: true,
    } : {};

    let emailPatch: Record<string, unknown> = {};
    if (needsAuditWarning && orderData.paymentNotConfirmedEmailSent !== true) {
      try {
        const emailResult = await sendPaymentNotConfirmedEmail({ ...orderData, id: orderId }, storeData);
        if (emailResult.sent) emailPatch = emailSentPatch(`status_${action}`);
      } catch (emailError) {
        console.error('[integration-order-status] payment audit email failed', emailError);
      }
    }

    if (action === 'confirm_payment' && orderData.storeOrderPaidEmailSent !== true) {
      try {
        const emailResult = await sendOrderPaidEmail({ ...orderData, ...patch, id: orderId }, storeData);
        if (emailResult.sent) emailPatch = { ...emailPatch, ...orderPaidEmailSentPatch(`status_${action}`) };
      } catch (emailError) {
        console.error('[integration-order-status] order paid email failed', emailError);
      }
    }

    if (action === 'mark_store_paid' && orderData.storePayoutEmailSent !== true) {
      try {
        const emailResult = await sendStorePayoutEmail({ ...orderData, ...patch, id: orderId }, storeData);
        if (!emailResult.sent) {
          return NextResponse.json({
            ok: false,
            error: 'The store payout was not finalized because the payout email could not be queued. Please try “Mark store paid” again.',
            code: 'store_payout_email_not_queued',
            retryable: true,
            emailReason: emailResult.reason,
          }, { status: 502 });
        }
        emailPatch = { ...emailPatch, ...storePayoutEmailSentPatch(`status_${action}`) };
      } catch (emailError) {
        console.error('[integration-order-status] store payout email failed', emailError);
        return NextResponse.json({
          ok: false,
          error: 'The store payout was not finalized because the payout email failed. Please try “Mark store paid” again.',
          code: 'store_payout_email_failed',
          retryable: true,
        }, { status: 502 });
      }
    }

    const update = {
      ...patch,
      ...auditPatch,
      ...overridePatch,
      ...emailPatch,
      statusHistory: FieldValue.arrayUnion(...historyEntries),
    };

    const batch = db.batch();
    batch.set(orderRef, update, { merge: true });

    const updatedPaths = [`integrationOrders/${orderId}`];
    if (storeId) {
      const storeOrderRef = db.collection('stores').doc(storeId).collection('integrationOrders').doc(orderId);
      batch.set(storeOrderRef, update, { merge: true });
      updatedPaths.push(`stores/${storeId}/integrationOrders/${orderId}`);
    }

    await batch.commit();

    return NextResponse.json({
      ok: true,
      orderId,
      storeId: storeId || null,
      action,
      label: ACTION_LABELS[action],
      updatedPaths,
      patch: {
        orderStatus: patch.orderStatus,
        fulfillmentStatus: patch.fulfillmentStatus,
        deliveryStatus: patch.deliveryStatus,
      },
    });
  } catch (error) {
    console.error('[integration-order-status] failed', error);
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : 'Unable to update order status.' }, { status: 500 });
  }
}
