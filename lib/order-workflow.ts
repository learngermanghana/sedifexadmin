import { payoutPresentation } from './record-status';
export type OrderWorkflowRecord = {
  source?: unknown;
  sourceChannel?: unknown;
  source_channel?: unknown;
  sourceLabel?: unknown;
  source_label?: unknown;
  platform?: unknown;
  platformType?: unknown;
  platform_type?: unknown;
  channel?: unknown;
  origin?: unknown;
  metadata?: unknown;
};

export type OrderWorkflowOwner = 'sedifexmarket' | 'store';

export type OrderWorkflowClassification = {
  owner: OrderWorkflowOwner;
  label: string;
  description: string;
  allowsAdminFulfillment: boolean;
};

function text(value: unknown) {
  return typeof value === 'string' ? value.trim().toLowerCase().replace(/[\s-]+/g, '_') : '';
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

/**
 * Sedifex Admin owns fulfillment only when the order explicitly identifies
 * SedifexMarket as its source. Website, integration, and unknown orders remain
 * store-managed so Admin only audits payment receipt and store payout.
 */
export function classifyOrderWorkflow(order: OrderWorkflowRecord): OrderWorkflowClassification {
  const metadata = record(order.metadata);
  const sourceValues = [
    order.source,
    order.sourceChannel,
    order.source_channel,
    order.sourceLabel,
    order.source_label,
    order.platform,
    order.platformType,
    order.platform_type,
    order.channel,
    order.origin,
    metadata.source,
    metadata.sourceChannel,
    metadata.source_channel,
    metadata.platform,
    metadata.platformType,
    metadata.platform_type,
    metadata.channel,
    metadata.origin,
  ].map(text).filter(Boolean);

  const isSedifexMarket = sourceValues.some((value) => /(^|_)sedifex_?market($|_)/.test(value));

  if (isSedifexMarket) {
    return {
      owner: 'sedifexmarket',
      label: 'SedifexMarket managed',
      description: 'Sedifex Admin must verify payment and follow this order through product delivery or service completion.',
      allowsAdminFulfillment: true,
    };
  }

  return {
    owner: 'store',
    label: 'Store managed',
    description: 'Sedifex Admin confirms payment and records the store payout. Booking, follow-up, delivery, and completion are handled in the store UI.',
    allowsAdminFulfillment: false,
  };
}

/** Explain unavailable actions without treating payment or payout as fulfillment. */
export function unavailableOrderActionReason(order: OrderWorkflowRecord & Record<string, unknown>, action: string, paymentConfirmed: boolean) {
  const workflow = classifyOrderWorkflow(order);
  if (action === 'confirm_payment') return paymentConfirmed ? 'Payment receipt is already confirmed.' : null;
  if (action === 'mark_store_paid') {
    if (workflow.allowsAdminFulfillment) return 'Manage this payout on the Settlements page.';
    const settlement = payoutPresentation(order).state;
    if (settlement === 'paid') return 'The store payout is already recorded.';
    if (settlement === 'not_applicable') return 'Payment goes directly to the store; no platform payout is required.';
    if (!paymentConfirmed) return 'Confirm payment received before recording the store payout.';
    return null;
  }
  if (!workflow.allowsAdminFulfillment) return 'Booking, delivery, and completion are managed in the store workspace.';
  if (['delivered', 'service_completed', 'complete_manual'].includes(action) && !paymentConfirmed) return 'Confirm payment received before marking this order completed.';
  return null;
}
