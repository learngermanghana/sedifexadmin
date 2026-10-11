const assert = require('node:assert/strict');
const { test } = require('node:test');
const path = require('node:path');
const load = require('./helpers/load-typescript.cjs');
const status = load(path.join(__dirname, '../lib/record-status.ts'));
const audit = load(path.join(__dirname, '../lib/payment-audit.ts'), { './record-status': status });
const workflow = load(path.join(__dirname, '../lib/order-workflow.ts'), { './record-status': status });

test('booking completion and store payout never imply customer payment', () => {
  const row = { bookingStatus: 'completed', settlementStatus: 'paid', payment_status: 'unpaid' };
  assert.equal(status.bookingPresentation(row).label, 'Completed');
  assert.equal(status.payoutPresentation(row).label, 'Store paid');
  assert.equal(status.paymentPresentation(row).state, 'pending');
});
test('partial payment retains its amount and original currency', () => {
  const row = { payment_status: 'deposit-paid', paymentAmount: 100, depositAmount: 30, currency: 'USD' };
  assert.equal(status.paymentPresentation(row).label, 'Partially paid');
  assert.equal(status.recordAmounts(row).received, 30);
  assert.equal(status.recordAmounts(row).outstanding, 70);
  assert.equal(status.recordAmounts(row).currency, 'USD');
});
test('refunds supersede old confirmation flags', () => {
  const row = { payment_status: 'refunded', payment: { confirmed: true }, paymentReceiptConfirmed: true, cashConfirmed: true };
  assert.equal(status.paymentPresentation(row).state, 'refunded');
  assert.equal(audit.isPaymentConfirmed(row), false);
});
test('legacy paid statuses are recognized without relabeling currencies', () => {
  for (const paymentStatus of ['settled', 'succeeded', 'paid-cash', 'successful']) assert.equal(status.paymentPresentation({ paymentStatus }).state, 'paid');
  assert.equal(status.recordAmounts({ paymentStatus: 'settled', total: 20, currency: 'EUR' }).received, 20);
});
test('missing amounts are not silently treated as zero or as the full total', () => {
  const result = status.recordAmounts({ amountPaid: 30, currency: 'GBP' });
  assert.equal(result.total, null);
  assert.equal(result.received, 30);
  assert.equal(result.outstanding, null);
});
test('completion and payout actions explain their payment prerequisites', () => {
  assert.match(workflow.unavailableOrderActionReason({ source: 'sedifexmarket' }, 'delivered', false), /Confirm payment/);
  assert.match(workflow.unavailableOrderActionReason({ source: 'website', settlementStatus: 'excluded_cash' }, 'mark_store_paid', true), /no platform payout/);
  assert.equal(workflow.unavailableOrderActionReason({ source: 'website' }, 'mark_store_paid', true), null);
});
