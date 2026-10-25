import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Timestamp } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase/admin';

const texts = vi.hoisted(() => [] as { to: string; body: string }[]);
const pushes = vi.hoisted(() => [] as { phone: string; amountKes: number; accountReference: string }[]);
vi.mock('@/lib/integrations/sms/textSmsGateway', () => ({
  textSmsGateway: {
    send: vi.fn(async (input: { to: string; body: string }) => {
      texts.push({ to: input.to, body: input.body });
      return { providerMessageId: 'test' };
    }),
  },
}));
vi.mock('@/lib/integrations/daraja/darajaGateway', () => ({
  darajaGateway: {
    initiateStkPush: vi.fn(async (input: { phone: string; amountKes: number; accountReference: string }) => {
      pushes.push({ phone: input.phone, amountKes: input.amountKes, accountReference: input.accountReference });
      return { merchantRequestId: 'mr', checkoutRequestId: `ws_CO_${pushes.length}`, responseCode: '0', responseDescription: 'ok', customerMessage: 'Success. Request accepted for processing' };
    }),
    queryStkStatus: vi.fn(),
  },
}));

import { ownerInvoiceService, OwnerInvoiceChangeRefusedError, OwnerInvoicePaymentError, deliveryInvoiceId, feeInvoiceId } from '@/services/ownerInvoiceService';
import { darajaGateway } from '@/lib/integrations/daraja/darajaGateway';
import type { MachineSubscription, OwnerInvoice, OwnerInvoiceCheckout } from '@/types';

/** § OWNER BILLING — against the Firestore emulator, with M-Pesa and SMS faked. */

const BUSINESS_ID = 'biz-owner-invoice-test';
const PARTNER_ID = 'partner-inv';
const MACHINE_ID = 'machine-inv';
const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse('2026-11-10T09:00:00+03:00');
const PERIOD_START = Date.parse('2026-11-01T00:00:00+03:00');
const PERIOD_END = PERIOD_START + 30 * DAY;

const COLLECTIONS = [
  'ownerInvoices',
  'ownerInvoiceCheckouts',
  'ownerInvoiceCounters',
  'ownerWholesaleSales',
  'machineSubscriptions',
  'partnerMachineAgreements',
  'partners',
  'machines',
  'snackItems',
];

beforeEach(async () => {
  texts.length = 0;
  pushes.length = 0;
  vi.mocked(darajaGateway.queryStkStatus).mockReset();
  for (const collection of COLLECTIONS) await adminFirestore.recursiveDelete(adminFirestore.collection(collection));
  await adminFirestore.collection('partners').doc(PARTNER_ID).set({ businessId: BUSINESS_ID, name: 'Amina Wanjiru', contactEmail: null, contactPhone: '0712 345 678', status: 'active', note: null, authUid: null, availableCashKes: 0, lifetimeEarnedKes: 0 });
  await adminFirestore.collection('machines').doc(MACHINE_ID).set({ businessId: BUSINESS_ID, machineCode: 'SQ-NBO-001', ownerPartnerId: PARTNER_ID });
  await adminFirestore.collection('snackItems').doc('snack-1').set({ businessId: BUSINESS_ID, name: 'Shin Ramyun Cup', expectedUnitCostKes: 120, isActive: true });
});

async function seedAgreement(billing: 'invoice' | 'settlement') {
  await adminFirestore.collection('partnerMachineAgreements').doc('agreement-1').set({
    businessId: BUSINESS_ID,
    partnerId: PARTNER_ID,
    machineId: MACHINE_ID,
    status: 'active',
    revenueSharePartnerPct: null,
    terms: { inventoryOwner: 'machine_owner', ownerCostBasis: 'wholesale_price', ownerBilling: billing },
  });
}

async function seedDelivery(id: string, billing: 'invoice' | 'settlement' = 'invoice') {
  await adminFirestore.collection('ownerWholesaleSales').doc(id).set({
    businessId: BUSINESS_ID,
    partnerId: PARTNER_ID,
    machineId: MACHINE_ID,
    restockTaskId: 'task-1',
    lines: [
      { productCatalogue: 'snackItem', productId: 'snack-1', slotId: 'A01', quantity: 10, unitWholesaleKes: 150, unitLandedKes: 120 },
      { productCatalogue: 'snackItem', productId: 'snack-1', slotId: 'A02', quantity: 4, unitWholesaleKes: 150, unitLandedKes: 120 },
      { productCatalogue: 'snackItem', productId: 'snack-2', slotId: 'B01', quantity: 3, unitWholesaleKes: null, unitLandedKes: 90 },
    ],
    totalWholesaleKes: 2100,
    totalLandedKes: 1950,
    unpricedUnits: 3,
    billing,
    ownerCostBasis: 'wholesale_price',
    actor: 'staff-1',
    createdAt: Timestamp.fromMillis(NOW - DAY),
  });
}

async function seedSubscription() {
  await adminFirestore.collection('machineSubscriptions').doc('sub-1').set({
    businessId: BUSINESS_ID,
    machineId: MACHINE_ID,
    partnerId: PARTNER_ID,
    planName: 'Managed service',
    amountKes: 4500,
    frequency: 'monthly',
    status: 'active',
    startDate: Timestamp.fromMillis(PERIOD_START),
    currentPeriodStart: Timestamp.fromMillis(PERIOD_START),
    currentPeriodEnd: Timestamp.fromMillis(PERIOD_END),
    renewalDate: Timestamp.fromMillis(PERIOD_END),
    lastPaymentStatus: 'unpaid',
    lastPaidAt: null,
    arrearsKes: 0,
    graceUntil: null,
  });
}

const invoiceOf = async (id: string) => (await adminFirestore.collection('ownerInvoices').doc(id).get()).data() as OwnerInvoice | undefined;
const subscriptionOf = async () => (await adminFirestore.collection('machineSubscriptions').doc('sub-1').get()).data() as MachineSubscription;
const checkoutOf = async (id: string) => (await adminFirestore.collection('ownerInvoiceCheckouts').doc(id).get()).data() as OwnerInvoiceCheckout | undefined;

const paidCallback = (checkoutRequestId: string, amountKes: number) => ({
  checkoutRequestId,
  merchantRequestId: 'mr',
  resultCode: 0,
  resultDesc: 'The service request is processed successfully.',
  amountKes,
  mpesaReceiptNumber: 'TKA1B2C3D4',
  phoneNumber: '254712345678',
});

const pay = (invoiceId: string, nowMs = NOW) => ownerInvoiceService.startPayment({ businessId: BUSINESS_ID, partnerId: PARTNER_ID, invoiceId, phone: '254712345678' }, nowMs);

describe('ownerInvoiceService.issueForDelivery', () => {
  it('invoices a delivery at the owner price, one line per product, leaving unpriced units off', async () => {
    await seedDelivery('sale-1');
    const result = await ownerInvoiceService.issueForDelivery(BUSINESS_ID, 'sale-1', NOW);
    expect(result).toEqual({ id: deliveryInvoiceId('sale-1'), created: true });
    const invoice = await invoiceOf(deliveryInvoiceId('sale-1'));
    expect(invoice).toMatchObject({ number: 'INV-000001', kind: 'stock', status: 'open', totalKes: 2100, unpricedUnits: 3, partnerId: PARTNER_ID, dueAtMs: NOW + 7 * DAY });
    expect(invoice?.lines).toEqual([{ description: 'Shin Ramyun Cup', quantity: 14, unitKes: 150, amountKes: 2100 }]);
    expect(texts).toHaveLength(1);
    expect(texts[0].to).toBe('254712345678');
    expect(texts[0].body).toContain('INV-000001, KSh 2,100 for snacks delivered to SQ-NBO-001');
  });

  it('issues each delivery once, and numbers the next one in sequence', async () => {
    await seedDelivery('sale-1');
    await seedDelivery('sale-2');
    await ownerInvoiceService.issueForDelivery(BUSINESS_ID, 'sale-1', NOW);
    expect(await ownerInvoiceService.issueForDelivery(BUSINESS_ID, 'sale-1', NOW)).toEqual({ id: deliveryInvoiceId('sale-1'), created: false });
    await ownerInvoiceService.issueForDelivery(BUSINESS_ID, 'sale-2', NOW);
    expect((await invoiceOf(deliveryInvoiceId('sale-2')))?.number).toBe('INV-000002');
    expect(texts).toHaveLength(2);
  });

  it('leaves a delivery paid through settlement alone', async () => {
    await seedDelivery('sale-1', 'settlement');
    expect(await ownerInvoiceService.issueForDelivery(BUSINESS_ID, 'sale-1', NOW)).toBeNull();
    expect(await invoiceOf(deliveryInvoiceId('sale-1'))).toBeUndefined();
  });

  it('the daily sweep invoices a delivery whose invoice was missed', async () => {
    await seedDelivery('sale-1');
    expect(await ownerInvoiceService.issueDue(BUSINESS_ID, NOW)).toEqual({ feeInvoices: 0, deliveryInvoices: 1 });
    expect(await ownerInvoiceService.issueDue(BUSINESS_ID, NOW)).toEqual({ feeInvoices: 0, deliveryInvoices: 0 });
  });
});

describe('ownerInvoiceService.issueFeeInvoices', () => {
  it('invoices the current fee period of an invoiced machine, once', async () => {
    await seedAgreement('invoice');
    await seedSubscription();
    expect(await ownerInvoiceService.issueFeeInvoices(BUSINESS_ID, NOW)).toEqual({ issued: 1 });
    expect(await ownerInvoiceService.issueFeeInvoices(BUSINESS_ID, NOW)).toEqual({ issued: 0 });
    const invoice = await invoiceOf(feeInvoiceId('sub-1', PERIOD_START));
    expect(invoice).toMatchObject({ kind: 'management_fee', totalKes: 4500, subscriptionId: 'sub-1', periodStartMs: PERIOD_START, periodEndMs: PERIOD_END });
    expect(invoice?.lines[0].description).toBe('Managed service, 1 Nov to 1 Dec');
  });

  it('leaves the fee of a machine billed through settlement alone', async () => {
    await seedAgreement('settlement');
    await seedSubscription();
    expect(await ownerInvoiceService.issueFeeInvoices(BUSINESS_ID, NOW)).toEqual({ issued: 0 });
  });
});

describe('ownerInvoiceService payments', () => {
  it('a paid M-Pesa prompt marks the invoice paid, and a fee invoice moves the plan on one period', async () => {
    await seedAgreement('invoice');
    await seedSubscription();
    await ownerInvoiceService.issueFeeInvoices(BUSINESS_ID, NOW);
    const id = feeInvoiceId('sub-1', PERIOD_START);

    await pay(id);
    expect(pushes).toEqual([{ phone: '254712345678', amountKes: 4500, accountReference: 'INV-000001' }]);
    expect((await invoiceOf(id))?.pendingPrompt?.checkoutRequestId).toBe('ws_CO_1');

    expect(await ownerInvoiceService.handleMpesaCallback(BUSINESS_ID, paidCallback('ws_CO_1', 4500), NOW + 30_000)).toEqual({ handled: true });
    const invoice = await invoiceOf(id);
    expect(invoice?.status).toBe('paid');
    expect(invoice?.payment).toMatchObject({ method: 'mpesa', reference: 'TKA1B2C3D4', amountKes: 4500 });
    expect(invoice?.pendingPrompt).toBeNull();
    const subscription = await subscriptionOf();
    expect(subscription.currentPeriodStart.toMillis()).toBe(PERIOD_END);
    expect(subscription.lastPaymentStatus).toBe('paid');

    // Safaricom delivers callbacks more than once: the second changes nothing.
    await ownerInvoiceService.handleMpesaCallback(BUSINESS_ID, paidCallback('ws_CO_1', 4500), NOW + 60_000);
    expect((await subscriptionOf()).currentPeriodStart.toMillis()).toBe(PERIOD_END);
    // And the sweep's repair step doesn't move it again either.
    await ownerInvoiceService.issueFeeInvoices(BUSINESS_ID, NOW + 60_000);
    expect((await subscriptionOf()).currentPeriodStart.toMillis()).toBe(PERIOD_END);
  });

  it('a callback that isn’t an invoice’s is passed on', async () => {
    expect(await ownerInvoiceService.handleMpesaCallback(BUSINESS_ID, paidCallback('ws_CO_vending', 50), NOW)).toEqual({ handled: false });
  });

  it('sends no second prompt while the first may still be answered', async () => {
    await seedDelivery('sale-1');
    await ownerInvoiceService.issueForDelivery(BUSINESS_ID, 'sale-1', NOW);
    await pay(deliveryInvoiceId('sale-1'));
    await expect(pay(deliveryInvoiceId('sale-1'), NOW + 30_000)).rejects.toBeInstanceOf(OwnerInvoiceChangeRefusedError);
    expect(pushes).toHaveLength(1);
  });

  it('only the owner can pay their invoice', async () => {
    await seedDelivery('sale-1');
    await ownerInvoiceService.issueForDelivery(BUSINESS_ID, 'sale-1', NOW);
    await expect(ownerInvoiceService.startPayment({ businessId: BUSINESS_ID, partnerId: 'someone-else', invoiceId: deliveryInvoiceId('sale-1'), phone: '254700000000' }, NOW)).rejects.toThrow('Invoice not found.');
    expect(pushes).toHaveLength(0);
  });

  it('a cancelled or failed prompt leaves the invoice open and free to pay again', async () => {
    await seedDelivery('sale-1');
    await ownerInvoiceService.issueForDelivery(BUSINESS_ID, 'sale-1', NOW);
    const id = deliveryInvoiceId('sale-1');
    await pay(id);
    await ownerInvoiceService.handleMpesaCallback(BUSINESS_ID, { checkoutRequestId: 'ws_CO_1', merchantRequestId: 'mr', resultCode: 1032, resultDesc: 'Request cancelled by user' }, NOW + 20_000);
    expect(await invoiceOf(id)).toMatchObject({ status: 'open', pendingPrompt: null });
    expect((await checkoutOf('ws_CO_1'))?.outcome).toBe('failed');
    await pay(id, NOW + 30_000);
    expect(pushes).toHaveLength(2);
  });

  it('when M-Pesa can’t be reached, nothing is held and the owner can try straight away', async () => {
    await seedDelivery('sale-1');
    await ownerInvoiceService.issueForDelivery(BUSINESS_ID, 'sale-1', NOW);
    vi.mocked(darajaGateway.initiateStkPush).mockRejectedValueOnce(new Error('Daraja down'));
    await expect(pay(deliveryInvoiceId('sale-1'))).rejects.toBeInstanceOf(OwnerInvoicePaymentError);
    expect((await invoiceOf(deliveryInvoiceId('sale-1')))?.pendingPrompt).toBeNull();
    await pay(deliveryInvoiceId('sale-1'), NOW + 1000);
    expect(pushes).toHaveLength(1);
  });

  it('when the callback is lost, asking Safaricom settles it', async () => {
    await seedDelivery('sale-1');
    await ownerInvoiceService.issueForDelivery(BUSINESS_ID, 'sale-1', NOW);
    const id = deliveryInvoiceId('sale-1');
    await pay(id);
    vi.mocked(darajaGateway.queryStkStatus).mockResolvedValue({ merchantRequestId: 'mr', checkoutRequestId: 'ws_CO_1', responseCode: '0', responseDescription: 'ok', resultCode: 0, resultDesc: 'The service request is processed successfully.' });
    // Too soon to ask: still waiting on the callback.
    expect((await ownerInvoiceService.findForPartner(BUSINESS_ID, PARTNER_ID, id, NOW + 10_000))?.status).toBe('open');
    expect(darajaGateway.queryStkStatus).not.toHaveBeenCalled();
    const invoice = await ownerInvoiceService.findForPartner(BUSINESS_ID, PARTNER_ID, id, NOW + 90_000);
    expect(invoice).toMatchObject({ status: 'paid', payment: { method: 'mpesa', reference: null, amountKes: 2100 } });
    expect((await checkoutOf('ws_CO_1'))?.resolvedBy).toBe('status_query');
  });

  it('asks Safaricom at most once every 15 seconds while the screen polls', async () => {
    await seedDelivery('sale-1');
    await ownerInvoiceService.issueForDelivery(BUSINESS_ID, 'sale-1', NOW);
    const id = deliveryInvoiceId('sale-1');
    await pay(id);
    // Still being processed: Safaricom has no verdict yet.
    vi.mocked(darajaGateway.queryStkStatus).mockResolvedValue({ merchantRequestId: 'mr', checkoutRequestId: 'ws_CO_1', responseCode: '500.001.1001', responseDescription: 'The transaction is being processed', resultCode: -1, resultDesc: '' });
    for (const atMs of [61_000, 64_000, 67_000, 70_000, 77_000]) await ownerInvoiceService.findForPartner(BUSINESS_ID, PARTNER_ID, id, NOW + atMs);
    expect(darajaGateway.queryStkStatus).toHaveBeenCalledTimes(2);
    expect((await invoiceOf(id))?.status).toBe('open');
  });

  it('money for an invoice already paid another way is flagged for staff, never applied twice', async () => {
    await seedDelivery('sale-1');
    await ownerInvoiceService.issueForDelivery(BUSINESS_ID, 'sale-1', NOW);
    const id = deliveryInvoiceId('sale-1');
    await pay(id);
    await adminFirestore.collection('ownerInvoices').doc(id).update({ status: 'paid', payment: { method: 'recorded', reference: 'BANK-1', amountKes: 2100, phone: null, paidAtMs: NOW, recordedBy: 'finance@snackquests.shop' } });
    await ownerInvoiceService.handleMpesaCallback(BUSINESS_ID, paidCallback('ws_CO_1', 2100), NOW + 30_000);
    expect((await checkoutOf('ws_CO_1'))?.outcome).toBe('already_settled');
    expect((await invoiceOf(id))?.payment?.reference).toBe('BANK-1');
    const { needsStaff } = await ownerInvoiceService.listForStaff(BUSINESS_ID, 60, NOW + 60_000);
    expect(needsStaff.map(({ id: checkoutId }) => checkoutId)).toEqual(['ws_CO_1']);
  });
});

describe('ownerInvoiceService staff actions', () => {
  it('recording a payment needs the full amount and a reference', async () => {
    await seedDelivery('sale-1');
    await ownerInvoiceService.issueForDelivery(BUSINESS_ID, 'sale-1', NOW);
    const id = deliveryInvoiceId('sale-1');
    await expect(ownerInvoiceService.recordPayment(BUSINESS_ID, id, { reference: 'BANK-1', amountKes: 1000, actor: 'finance' }, NOW)).rejects.toThrow('part payments');
    await expect(ownerInvoiceService.recordPayment(BUSINESS_ID, id, { reference: ' ', amountKes: 2100, actor: 'finance' }, NOW)).rejects.toThrow('reference');
    const invoice = await ownerInvoiceService.recordPayment(BUSINESS_ID, id, { reference: 'BANK-1', amountKes: 2100, actor: 'finance' }, NOW);
    expect(invoice.status).toBe('paid');
    await expect(pay(id, NOW + DAY)).rejects.toThrow('already paid');
  });

  it('cancelling a fee invoice waives that period on the plan', async () => {
    await seedAgreement('invoice');
    await seedSubscription();
    await ownerInvoiceService.issueFeeInvoices(BUSINESS_ID, NOW);
    await ownerInvoiceService.voidInvoice(BUSINESS_ID, feeInvoiceId('sub-1', PERIOD_START), 'First month free', NOW);
    expect((await invoiceOf(feeInvoiceId('sub-1', PERIOD_START)))).toMatchObject({ status: 'void', voidReason: 'First month free' });
    const subscription = await subscriptionOf();
    expect(subscription.lastPaymentStatus).toBe('waived');
    expect(subscription.currentPeriodStart.toMillis()).toBe(PERIOD_END);
  });

  it('marking the period paid on the plan settles its open invoice too', async () => {
    await seedAgreement('invoice');
    await seedSubscription();
    await ownerInvoiceService.issueFeeInvoices(BUSINESS_ID, NOW);
    expect(await ownerInvoiceService.settleCurrentFee(BUSINESS_ID, 'sub-1', { waived: false, actor: 'finance' }, NOW)).toBe(true);
    expect((await invoiceOf(feeInvoiceId('sub-1', PERIOD_START)))?.payment).toMatchObject({ method: 'recorded', reference: 'Recorded on the subscription', amountKes: 4500 });
    expect((await subscriptionOf()).currentPeriodStart.toMillis()).toBe(PERIOD_END);
    // The next period hasn't been invoiced yet, so there is nothing more to settle.
    expect(await ownerInvoiceService.settleCurrentFee(BUSINESS_ID, 'sub-1', { waived: false, actor: 'finance' }, NOW)).toBe(false);
  });
});
