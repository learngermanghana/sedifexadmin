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

/**
 * Sedifex no longer operates the marketplace or fulfills orders.
 * All historic and current order fulfillment belongs to the business.
 * Preserve old source metadata for audit, but do not grant admin delivery actions.
 */
export function classifyOrderWorkflow(_order: OrderWorkflowRecord): OrderWorkflowClassification {
  return {
    owner: 'store',
    label: 'Business managed',
    description: 'The business handles confirmation, preparation, delivery and completion. Sedifex Admin reviews payment records and settlement issues.',
    allowsAdminFulfillment: false,
  };
}

/** Guard direct admin status API calls as well as hiding deprecated UI buttons. */
export function unavailableOrderActionReason(
  order: OrderWorkflowRecord & Record<string, unknown>, action: string, paymentConfirmed: boolean
): string | null {
  if (action === 'confirm_payment') {
    return paymentConfirmed ? 'Payment receipt is already confirmed.' : null;
  }
  if (action === 'mark_store_paid') return 'Record and verify merchant payouts on the Settlements page.';
  return 'Order preparation, delivery and service completion are managed in the business workspace.';
}
