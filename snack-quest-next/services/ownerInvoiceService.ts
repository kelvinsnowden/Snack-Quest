import 'server-only';

import { darajaGateway } from '@/lib/integrations/daraja/darajaGateway';
import type { PaymentCallbackResult } from '@/lib/integrations/types';
import { textSmsGateway } from '@/lib/integrations/sms/textSmsGateway';
import { normalizeKenyanPhone } from '@/lib/checkout/phone';
import { toSmsSafeText } from '@/lib/sms/gsm7';
import { logger } from '@/lib/observability/logger';
import { OwnerInvoiceChangeRefusedError, ownerInvoiceRepository, type PromptResult } from '@/repositories/ownerInvoiceRepository';
import { stockTransferRepository } from '@/repositories/stockTransferRepository';
import { machineSubscriptionRepository } from '@/repositories/machineSubscriptionRepository';
import { partnerMachineAgreementRepository } from '@/repositories/partnerMachineAgreementRepository';
import { partnerRepository } from '@/repositories/partnerRepository';
import { machineRepository } from '@/repositories/machineRepository';
import { snackItemRepository } from '@/repositories/snackItemRepository';
import { packageRepository } from '@/repositories/packageRepository';
import { machineSubscriptionService } from '@/services/machineSubscriptionService';
import { resolveTerms } from '@/services/machineEconomicProfileService';
import type { OwnerInvoice, OwnerInvoiceLine, OwnerInvoicePendingPrompt, OwnerWholesaleSale } from '@/types';

export { OwnerInvoiceChangeRefusedError };

/** M-Pesa couldn't be reached to send the prompt; nothing was charged. */
export class OwnerInvoicePaymentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OwnerInvoicePaymentError';
  }
}

const DAY_MS = 24 * 60 * 60 * 1000;
/** Days an owner has to pay. */
export const INVOICE_DUE_DAYS = 7;
/** A prompt expires on the phone after about a minute; no second one goes out for the same invoice inside this window. */
const PROMPT_GAP_MS = 2 * 60 * 1000;
/** How long to wait for Safaricom's callback before asking it directly how a prompt ended, and how often to ask after that. */
const STATUS_QUERY_AFTER_MS = 60 * 1000;
const STATUS_QUERY_EVERY_MS = 15 * 1000;
/** How far back the daily sweep looks for deliveries whose invoice wasn't issued at the time. */
const DELIVERY_LOOKBACK_MS = 30 * DAY_MS;

export function deliveryInvoiceId(ownerWholesaleSaleId: string): string {
  return `stock_${ownerWholesaleSaleId}`;
}

export function feeInvoiceId(subscriptionId: string, periodStartMs: number): string {
  return `fee_${subscriptionId}_${periodStartMs}`;
}

const shortDate = new Intl.DateTimeFormat('en-KE', { timeZone: 'Africa/Nairobi', day: 'numeric', month: 'short' });
const kes = (amount: number) => amount.toLocaleString('en-KE');

/**
 * Owner invoices (§ OWNER BILLING): for an owner on invoice billing, each
 * delivery of stock and each management-fee period becomes an invoice in
 * their portal, which they pay by M-Pesa into Snack Quest's own shortcode.
 * Settlement skips both for these owners (`machineSettlementService`), so
 * nothing is charged twice. Paying a fee invoice moves the machine's
 * subscription on a period, exactly as staff recording it by hand does.
 */
class OwnerInvoiceService {
  /**
   * The invoice for one received delivery, at the owner's cost basis frozen
   * on it. Units with no price are left off and counted, never charged at
   * zero; a delivery with nothing priced gets no invoice. Null when the
   * delivery isn't invoiced.
   */
  async issueForDelivery(businessId: string, ownerWholesaleSaleId: string, nowMs = Date.now()): Promise<{ id: string; created: boolean } | null> {
    const sale = await stockTransferRepository.findWholesaleSale(businessId, ownerWholesaleSaleId);
    if (!sale || sale.billing !== 'invoice') return null;
    const id = deliveryInvoiceId(ownerWholesaleSaleId);
    const { lines, unpricedUnits } = await deliveryLines(businessId, sale);
    const totalKes = lines.reduce((sum, line) => sum + line.amountKes, 0);
    if (totalKes <= 0) {
      logger.warn('delivery not invoiced: none of its products has a price', { businessId, ownerWholesaleSaleId, unpricedUnits });
      return null;
    }
    const { created, invoice } = await ownerInvoiceRepository.createIfAbsent(id, {
      businessId,
      partnerId: sale.partnerId,
      machineId: sale.machineId,
      kind: 'stock',
      ownerWholesaleSaleId,
      subscriptionId: null,
      periodStartMs: null,
      periodEndMs: null,
      lines,
      totalKes,
      unpricedUnits,
      status: 'open',
      issuedAtMs: nowMs,
      dueAtMs: nowMs + INVOICE_DUE_DAYS * DAY_MS,
      payment: null,
      pendingPrompt: null,
      voidReason: null,
    });
    if (created) await this.notifyOwner(businessId, invoice);
    return { id, created };
  }

  /**
   * The management fee for each invoiced machine's current subscription
   * period, once that period has started — one invoice per period. Also
   * finishes a payment whose subscription update was interrupted: a paid
   * invoice for the period that is still current moves it on.
   */
  async issueFeeInvoices(businessId: string, nowMs = Date.now()): Promise<{ issued: number }> {
    let issued = 0;
    for (const { id: subscriptionId, data: subscription } of await machineSubscriptionRepository.listByBusiness(businessId)) {
      if (subscription.status !== 'active' && subscription.status !== 'in_arrears') continue;
      const periodStartMs = subscription.currentPeriodStart.toMillis();
      if (periodStartMs > nowMs) continue;
      const agreement = await partnerMachineAgreementRepository.findActiveForMachine(businessId, subscription.machineId);
      if (!agreement || agreement.data.partnerId !== subscription.partnerId || resolveTerms(agreement.data.terms).ownerBilling !== 'invoice') continue;

      const id = feeInvoiceId(subscriptionId, periodStartMs);
      const existing = await ownerInvoiceRepository.findById(businessId, id);
      if (existing) {
        if (existing.status === 'paid') await this.afterPaid(businessId, existing);
        continue;
      }
      const periodEndMs = subscription.currentPeriodEnd.toMillis();
      const { created, invoice } = await ownerInvoiceRepository.createIfAbsent(id, {
        businessId,
        partnerId: subscription.partnerId,
        machineId: subscription.machineId,
        kind: 'management_fee',
        ownerWholesaleSaleId: null,
        subscriptionId,
        periodStartMs,
        periodEndMs,
        lines: [{ description: `${subscription.planName}, ${shortDate.format(periodStartMs)} to ${shortDate.format(periodEndMs)}`, quantity: null, unitKes: null, amountKes: subscription.amountKes }],
        totalKes: subscription.amountKes,
        unpricedUnits: 0,
        status: 'open',
        issuedAtMs: nowMs,
        dueAtMs: nowMs + INVOICE_DUE_DAYS * DAY_MS,
        payment: null,
        pendingPrompt: null,
        voidReason: null,
      });
      if (created) {
        issued += 1;
        await this.notifyOwner(businessId, invoice);
      }
    }
    return { issued };
  }

  /** Everything due an invoice and not yet given one: fee periods, and the last month's invoiced deliveries. Safe to run any number of times. */
  async issueDue(businessId: string, nowMs = Date.now()): Promise<{ feeInvoices: number; deliveryInvoices: number }> {
    const { issued: feeInvoices } = await this.issueFeeInvoices(businessId, nowMs);
    let deliveryInvoices = 0;
    for (const { id, data } of await stockTransferRepository.listWholesaleSalesSince(businessId, new Date(nowMs - DELIVERY_LOOKBACK_MS))) {
      if (data.billing !== 'invoice' || (await ownerInvoiceRepository.findById(businessId, deliveryInvoiceId(id)))) continue;
      if ((await this.issueForDelivery(businessId, id, nowMs))?.created) deliveryInvoices += 1;
    }
    return { feeInvoices, deliveryInvoices };
  }

  async listForPartner(businessId: string, partnerId: string): Promise<{ id: string; data: OwnerInvoice }[]> {
    return ownerInvoiceRepository.listByPartner(businessId, partnerId);
  }

  /** One of this owner's invoices, after checking on any prompt that should have been answered by now. */
  async findForPartner(businessId: string, partnerId: string, invoiceId: string, nowMs = Date.now()): Promise<OwnerInvoice | null> {
    const invoice = await ownerInvoiceRepository.findById(businessId, invoiceId);
    if (!invoice || invoice.partnerId !== partnerId) return null;
    if (invoice.status === 'open' && invoice.pendingPrompt?.checkoutRequestId && (await this.checkPendingPrompt(businessId, invoiceId, invoice.pendingPrompt, nowMs))) {
      return ownerInvoiceRepository.findById(businessId, invoiceId);
    }
    return invoice;
  }

  /**
   * Sends the owner an M-Pesa prompt for the whole invoice. The amount and
   * account come from the invoice, never the request. A prompt still
   * unanswered is checked with Safaricom first, so an invoice that was in
   * fact paid is never prompted again.
   */
  async startPayment(input: { businessId: string; partnerId: string; invoiceId: string; phone: string }, nowMs = Date.now()): Promise<{ checkoutRequestId: string; customerMessage: string }> {
    const invoice = await this.findForPartner(input.businessId, input.partnerId, input.invoiceId, nowMs);
    if (!invoice) throw new OwnerInvoiceChangeRefusedError('Invoice not found.');
    const claimed = await ownerInvoiceRepository.claimPrompt(input.businessId, input.invoiceId, input.phone, nowMs, PROMPT_GAP_MS);
    let push;
    try {
      push = await darajaGateway.initiateStkPush({
        businessId: input.businessId,
        phone: input.phone,
        amountKes: claimed.totalKes,
        accountReference: claimed.number,
        transactionDesc: 'Invoice',
      });
    } catch (error) {
      logger.error('owner invoice STK push failed', { businessId: input.businessId, invoiceId: input.invoiceId, error });
      await ownerInvoiceRepository.releasePrompt(input.invoiceId);
      throw new OwnerInvoicePaymentError('We couldn’t reach M-Pesa just now. Nothing was charged; please try again.');
    }
    await ownerInvoiceRepository.recordPrompt(
      input.invoiceId,
      { checkoutRequestId: push.checkoutRequestId, phone: input.phone, requestedAtMs: nowMs },
      { businessId: input.businessId, invoiceId: input.invoiceId, phone: input.phone, amountKes: claimed.totalKes, requestedAtMs: nowMs },
    );
    return { checkoutRequestId: push.checkoutRequestId, customerMessage: push.customerMessage };
  }

  /**
   * Safaricom's callback for a prompt. `handled: false` when the prompt
   * isn't an invoice's, so the Daraja route passes it on to vending and
   * orders unchanged.
   */
  async handleMpesaCallback(businessId: string, callback: PaymentCallbackResult, nowMs = Date.now()): Promise<{ handled: boolean }> {
    const checkout = await ownerInvoiceRepository.findCheckout(callback.checkoutRequestId);
    if (!checkout) return { handled: false };
    if (checkout.businessId !== businessId) {
      logger.error('owner invoice callback arrived on another business’s URL; ignored', { businessId, checkoutRequestId: callback.checkoutRequestId });
      return { handled: true };
    }
    await this.settle(
      businessId,
      callback.checkoutRequestId,
      {
        resultCode: callback.resultCode,
        resultDesc: callback.resultDesc,
        mpesaReceiptNumber: callback.mpesaReceiptNumber ?? null,
        amountKes: callback.amountKes ?? null,
        phone: callback.phoneNumber ?? null,
        by: 'callback',
      },
      nowMs,
    );
    return { handled: true };
  }

  /** Staff record a payment made outside the portal (bank, cash). */
  async recordPayment(businessId: string, invoiceId: string, input: { reference: string; amountKes: number; actor: string }, nowMs = Date.now()): Promise<OwnerInvoice> {
    const reference = input.reference.trim();
    if (!reference || reference.length > 120) throw new OwnerInvoiceChangeRefusedError('Give the payment reference (120 characters at most).');
    const invoice = await ownerInvoiceRepository.recordPayment(businessId, invoiceId, {
      method: 'recorded',
      reference,
      amountKes: input.amountKes,
      phone: null,
      paidAtMs: nowMs,
      recordedBy: input.actor,
    });
    await this.afterPaid(businessId, invoice);
    return invoice;
  }

  /** Cancels an invoice's charge. A cancelled fee invoice waives that period on the subscription. */
  async voidInvoice(businessId: string, invoiceId: string, reason: string, nowMs = Date.now()): Promise<OwnerInvoice> {
    const why = reason.trim();
    if (why.length < 3 || why.length > 300) throw new OwnerInvoiceChangeRefusedError('Say why it is cancelled (3 to 300 characters).');
    const invoice = await ownerInvoiceRepository.void(businessId, invoiceId, why, nowMs, PROMPT_GAP_MS);
    if (invoice.kind === 'management_fee' && invoice.subscriptionId && invoice.periodStartMs !== null) {
      await machineSubscriptionService.recordPeriodPayment(businessId, invoice.subscriptionId, { waived: true, expectedPeriodStartMs: invoice.periodStartMs });
    }
    return invoice;
  }

  /**
   * Staff marked a subscription period paid or waived on the subscription
   * itself: settle that period's open invoice the same way, so the owner
   * isn't left with an invoice for a period already dealt with. False when
   * the period has no open invoice (the caller records it as before).
   */
  async settleCurrentFee(businessId: string, subscriptionId: string, input: { waived: boolean; actor: string }, nowMs = Date.now()): Promise<boolean> {
    const subscription = await machineSubscriptionRepository.findById(businessId, subscriptionId);
    if (!subscription) return false;
    const id = feeInvoiceId(subscriptionId, subscription.currentPeriodStart.toMillis());
    const invoice = await ownerInvoiceRepository.findById(businessId, id);
    if (!invoice || invoice.status !== 'open') return false;
    if (input.waived) await this.voidInvoice(businessId, id, 'Waived on the subscription', nowMs);
    else await this.recordPayment(businessId, id, { reference: 'Recorded on the subscription', amountKes: invoice.totalKes, actor: input.actor }, nowMs);
    return true;
  }

  /** Every unpaid invoice, and those issued in the last `days` — the admin's view of who owes what. */
  async listForStaff(businessId: string, days: number, nowMs = Date.now()) {
    const [open, recent, needsStaff] = await Promise.all([
      ownerInvoiceRepository.listOpen(businessId),
      ownerInvoiceRepository.listIssuedSince(businessId, nowMs - days * DAY_MS),
      ownerInvoiceRepository.listCheckoutsNeedingStaff(businessId),
    ]);
    return { open, settled: recent.filter(({ data }) => data.status !== 'open'), needsStaff };
  }

  /** The prompts sent for an invoice and how each ended — what staff look at when an owner says they paid. */
  async listAttempts(invoiceId: string) {
    return ownerInvoiceRepository.listCheckouts(invoiceId);
  }

  /** Asks Safaricom how a prompt ended, once its callback is overdue. True when that settled it. */
  private async checkPendingPrompt(businessId: string, invoiceId: string, prompt: OwnerInvoicePendingPrompt, nowMs: number): Promise<boolean> {
    if (nowMs - prompt.requestedAtMs < STATUS_QUERY_AFTER_MS) return false;
    // The owner's screen polls every few seconds; Safaricom is asked at most once per interval.
    if (!(await ownerInvoiceRepository.claimPromptQuery(invoiceId, prompt.checkoutRequestId, nowMs, STATUS_QUERY_EVERY_MS))) return false;
    const query = await darajaGateway.queryStkStatus({ businessId, checkoutRequestId: prompt.checkoutRequestId }).catch((error) => {
      logger.warn('owner invoice STK status query failed', { businessId, checkoutRequestId: prompt.checkoutRequestId, error });
      return null;
    });
    // No verdict yet is not an answer; ask again next time.
    if (!query || query.responseCode !== '0') return false;
    await this.settle(businessId, prompt.checkoutRequestId, { resultCode: query.resultCode, resultDesc: query.resultDesc, mpesaReceiptNumber: null, amountKes: null, phone: null, by: 'status_query' }, nowMs);
    return true;
  }

  private async settle(businessId: string, checkoutRequestId: string, result: PromptResult, nowMs: number): Promise<void> {
    const resolved = await ownerInvoiceRepository.resolveCheckout(checkoutRequestId, result, nowMs);
    if (!resolved?.settled) return;
    if (resolved.outcome === 'paid') await this.afterPaid(businessId, resolved.invoice);
    if (resolved.outcome === 'already_settled' || resolved.outcome === 'amount_mismatch') {
      logger.error('owner invoice payment needs staff: money arrived that the invoice could not take', { businessId, checkoutRequestId, invoiceId: resolved.invoiceId, outcome: resolved.outcome });
    }
  }

  /** A paid fee invoice moves its subscription on a period — only while that period is still the current one. */
  private async afterPaid(businessId: string, invoice: OwnerInvoice): Promise<void> {
    if (invoice.kind !== 'management_fee' || !invoice.subscriptionId || invoice.periodStartMs === null) return;
    await machineSubscriptionService
      .recordPeriodPayment(businessId, invoice.subscriptionId, { expectedPeriodStartMs: invoice.periodStartMs })
      .catch((error) => logger.error('fee invoice paid but the subscription was not moved on; the daily sweep will retry', { businessId, subscriptionId: invoice.subscriptionId, error }));
  }

  /** A text to the owner that a new invoice is in their portal. Best effort: the invoice stands whether or not it sends. */
  private async notifyOwner(businessId: string, invoice: OwnerInvoice): Promise<void> {
    try {
      const [partner, machine] = await Promise.all([partnerRepository.findById(businessId, invoice.partnerId), machineRepository.findById(businessId, invoice.machineId)]);
      if (!partner?.contactPhone) return;
      const what = invoice.kind === 'stock' ? `snacks delivered to ${machine?.machineCode ?? 'your machine'}` : `the management fee for ${machine?.machineCode ?? 'your machine'}`;
      await textSmsGateway.send({
        businessId,
        to: normalizeKenyanPhone(partner.contactPhone),
        body: toSmsSafeText(`Snack Quest: invoice ${invoice.number}, KSh ${kes(invoice.totalKes)} for ${what}. Pay by M-Pesa in your portal: snackquests.shop/partner/invoices`),
      });
    } catch (error) {
      logger.warn('owner invoice text not sent', { businessId, invoice: invoice.number, error });
    }
  }
}

/** A delivery's lines at the frozen cost basis, one line per product and price. */
async function deliveryLines(businessId: string, sale: OwnerWholesaleSale): Promise<{ lines: OwnerInvoiceLine[]; unpricedUnits: number }> {
  const basis = sale.ownerCostBasis ?? 'wholesale_price';
  const names = await productNames(businessId, sale.lines);
  const byKey = new Map<string, OwnerInvoiceLine>();
  let unpricedUnits = 0;
  for (const line of sale.lines) {
    const unitKes = basis === 'wholesale_price' ? line.unitWholesaleKes : line.unitLandedKes;
    if (unitKes === null || line.quantity <= 0) {
      unpricedUnits += Math.max(line.quantity, 0);
      continue;
    }
    const key = `${line.productCatalogue}:${line.productId ?? line.slotId}:${unitKes}`;
    const existing = byKey.get(key);
    const quantity = (existing?.quantity ?? 0) + line.quantity;
    byKey.set(key, {
      description: (line.productId && names.get(line.productId)) || `Slot ${line.slotId}`,
      quantity,
      unitKes,
      amountKes: Math.round(quantity * unitKes),
    });
  }
  return { lines: [...byKey.values()], unpricedUnits };
}

async function productNames(businessId: string, lines: OwnerWholesaleSale['lines']): Promise<Map<string, string>> {
  const snackIds = [...new Set(lines.filter((line) => line.productCatalogue === 'snackItem' && line.productId).map((line) => line.productId!))];
  const packageIds = [...new Set(lines.filter((line) => line.productCatalogue === 'package' && line.productId).map((line) => line.productId!))];
  const [snacks, packages] = await Promise.all([
    snackIds.length > 0 ? snackItemRepository.findManyById(snackIds) : Promise.resolve(new Map()),
    Promise.all(packageIds.map((id) => packageRepository.findById(businessId, id).then((found) => [id, found?.name ?? null] as const))),
  ]);
  const names = new Map<string, string>();
  for (const [id, item] of snacks) names.set(id, item.name);
  for (const [id, name] of packages) if (name) names.set(id, name);
  return names;
}

export const ownerInvoiceService = new OwnerInvoiceService();
export { OwnerInvoiceService };
