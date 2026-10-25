import 'server-only';

import { FieldValue } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase/admin';
import type {
  OwnerInvoice,
  OwnerInvoiceCheckout,
  OwnerInvoiceCheckoutOutcome,
  OwnerInvoicePayment,
  OwnerInvoicePendingPrompt,
} from '@/types';

const COLLECTION = 'ownerInvoices';
const CHECKOUTS = 'ownerInvoiceCheckouts';
/** `ownerInvoiceCounters/{businessId}` — `{ next }`, the number the next invoice gets. */
const COUNTERS = 'ownerInvoiceCounters';

export type OwnerInvoiceInput = Omit<OwnerInvoice, 'number' | 'createdAt' | 'updatedAt'>;

export class OwnerInvoiceChangeRefusedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OwnerInvoiceChangeRefusedError';
  }
}

export function invoiceNumber(sequence: number): string {
  return `INV-${String(sequence).padStart(6, '0')}`;
}

/** What Safaricom said about one prompt, from its callback or a status query. */
export interface PromptResult {
  resultCode: number;
  resultDesc: string;
  mpesaReceiptNumber: string | null;
  /** Absent from a status query, which carries no amount. */
  amountKes: number | null;
  phone: string | null;
  by: 'callback' | 'status_query';
}

class OwnerInvoiceRepository {
  /**
   * Creates the invoice under `id` with the business's next number, in one
   * transaction — unless an invoice with that id already exists, which is
   * how the same delivery or fee period is never invoiced twice.
   */
  async createIfAbsent(id: string, input: OwnerInvoiceInput): Promise<{ created: boolean; invoice: OwnerInvoice }> {
    const ref = adminFirestore.collection(COLLECTION).doc(id);
    const counterRef = adminFirestore.collection(COUNTERS).doc(input.businessId);
    return adminFirestore.runTransaction(async (tx) => {
      const [existing, counter] = await Promise.all([tx.get(ref), tx.get(counterRef)]);
      if (existing.exists) return { created: false, invoice: existing.data() as OwnerInvoice };
      const sequence = ((counter.data() as { next?: number } | undefined)?.next ?? 1);
      const now = FieldValue.serverTimestamp();
      const record = { ...input, number: invoiceNumber(sequence), createdAt: now, updatedAt: now };
      tx.set(counterRef, { next: sequence + 1 }, { merge: true });
      tx.set(ref, record);
      return { created: true, invoice: record as unknown as OwnerInvoice };
    });
  }

  async findById(businessId: string, id: string): Promise<OwnerInvoice | null> {
    const snapshot = await adminFirestore.collection(COLLECTION).doc(id).get();
    const data = snapshot.data() as OwnerInvoice | undefined;
    return data && data.businessId === businessId ? data : null;
  }

  /** One owner's invoices, newest first. Equality filters only, so no composite index. */
  async listByPartner(businessId: string, partnerId: string): Promise<{ id: string; data: OwnerInvoice }[]> {
    const snapshot = await adminFirestore.collection(COLLECTION).where('businessId', '==', businessId).where('partnerId', '==', partnerId).get();
    return newestFirst(snapshot.docs.map((doc) => ({ id: doc.id, data: doc.data() as OwnerInvoice })));
  }

  /** Every unpaid invoice in the business, newest first. */
  async listOpen(businessId: string): Promise<{ id: string; data: OwnerInvoice }[]> {
    const snapshot = await adminFirestore.collection(COLLECTION).where('businessId', '==', businessId).where('status', '==', 'open').get();
    return newestFirst(snapshot.docs.map((doc) => ({ id: doc.id, data: doc.data() as OwnerInvoice })));
  }

  /** Invoices issued since `sinceMs`, newest first. Single-field range, so no composite index. */
  async listIssuedSince(businessId: string, sinceMs: number): Promise<{ id: string; data: OwnerInvoice }[]> {
    const snapshot = await adminFirestore.collection(COLLECTION).where('issuedAtMs', '>=', sinceMs).orderBy('issuedAtMs', 'desc').get();
    return snapshot.docs.map((doc) => ({ id: doc.id, data: doc.data() as OwnerInvoice })).filter(({ data }) => data.businessId === businessId);
  }

  /**
   * Reserves the invoice for a new M-Pesa prompt, so two taps never send two
   * prompts: refused when it isn't open, or when another prompt went out
   * less than `minGapMs` ago and hasn't been answered.
   */
  async claimPrompt(businessId: string, id: string, phone: string, nowMs: number, minGapMs: number): Promise<OwnerInvoice> {
    const ref = adminFirestore.collection(COLLECTION).doc(id);
    return adminFirestore.runTransaction(async (tx) => {
      const invoice = (await tx.get(ref)).data() as OwnerInvoice | undefined;
      if (!invoice || invoice.businessId !== businessId) throw new OwnerInvoiceChangeRefusedError('Invoice not found.');
      if (invoice.status !== 'open') throw new OwnerInvoiceChangeRefusedError(invoice.status === 'paid' ? 'This invoice is already paid.' : 'This invoice was cancelled.');
      if (invoice.pendingPrompt && nowMs - invoice.pendingPrompt.requestedAtMs < minGapMs) {
        throw new OwnerInvoiceChangeRefusedError('An M-Pesa prompt was just sent for this invoice. Check your phone, or try again in a minute.');
      }
      const claim: OwnerInvoicePendingPrompt = { checkoutRequestId: '', phone, requestedAtMs: nowMs };
      tx.update(ref, { pendingPrompt: claim, updatedAt: FieldValue.serverTimestamp() });
      return invoice;
    });
  }

  /** The prompt reached Safaricom: remember its id on the invoice and open its checkout record, together. */
  async recordPrompt(id: string, prompt: OwnerInvoicePendingPrompt, checkout: Omit<OwnerInvoiceCheckout, 'outcome' | 'resultCode' | 'resultDesc' | 'mpesaReceiptNumber' | 'paidAmountKes' | 'resolvedAtMs' | 'resolvedBy'>): Promise<void> {
    const batch = adminFirestore.batch();
    batch.update(adminFirestore.collection(COLLECTION).doc(id), { pendingPrompt: prompt, updatedAt: FieldValue.serverTimestamp() });
    batch.create(adminFirestore.collection(CHECKOUTS).doc(prompt.checkoutRequestId), {
      ...checkout,
      outcome: 'pending',
      resultCode: null,
      resultDesc: null,
      mpesaReceiptNumber: null,
      paidAmountKes: null,
      resolvedAtMs: null,
      resolvedBy: null,
    } satisfies OwnerInvoiceCheckout);
    await batch.commit();
  }

  /** Claims the next status query for a prompt: false when it was asked within `minGapMs`, or the prompt is no longer the invoice's current one. */
  async claimPromptQuery(id: string, checkoutRequestId: string, nowMs: number, minGapMs: number): Promise<boolean> {
    const ref = adminFirestore.collection(COLLECTION).doc(id);
    return adminFirestore.runTransaction(async (tx) => {
      const prompt = ((await tx.get(ref)).data() as OwnerInvoice | undefined)?.pendingPrompt;
      if (!prompt || prompt.checkoutRequestId !== checkoutRequestId) return false;
      if (prompt.lastQueriedAtMs && nowMs - prompt.lastQueriedAtMs < minGapMs) return false;
      tx.update(ref, { pendingPrompt: { ...prompt, lastQueriedAtMs: nowMs } });
      return true;
    });
  }

  /** The prompt never reached Safaricom: free the invoice for another try straight away. */
  async releasePrompt(id: string): Promise<void> {
    await adminFirestore.collection(COLLECTION).doc(id).update({ pendingPrompt: null, updatedAt: FieldValue.serverTimestamp() });
  }

  async findCheckout(checkoutRequestId: string): Promise<OwnerInvoiceCheckout | null> {
    const snapshot = await adminFirestore.collection(CHECKOUTS).doc(checkoutRequestId).get();
    return snapshot.exists ? (snapshot.data() as OwnerInvoiceCheckout) : null;
  }

  async listCheckouts(invoiceId: string): Promise<OwnerInvoiceCheckout[]> {
    const snapshot = await adminFirestore.collection(CHECKOUTS).where('invoiceId', '==', invoiceId).get();
    return snapshot.docs.map((doc) => doc.data() as OwnerInvoiceCheckout).sort((a, b) => b.requestedAtMs - a.requestedAtMs);
  }

  /** Prompts whose money arrived but couldn't pay their invoice (already paid or cancelled, or a different amount) — for staff to return or apply. */
  async listCheckoutsNeedingStaff(businessId: string): Promise<{ id: string; data: OwnerInvoiceCheckout }[]> {
    const snapshot = await adminFirestore.collection(CHECKOUTS).where('outcome', 'in', ['already_settled', 'amount_mismatch']).get();
    return snapshot.docs.map((doc) => ({ id: doc.id, data: doc.data() as OwnerInvoiceCheckout })).filter(({ data }) => data.businessId === businessId);
  }

  /**
   * Settles one prompt exactly once, whether its callback or a status query
   * gets here first; the second caller changes nothing. Marks the invoice
   * paid only when it is still open and the amount is the invoice's —
   * money for an invoice already paid or cancelled is kept on the checkout
   * as `already_settled` for staff to return. Null when the prompt isn't
   * an invoice's; `settled: false` when it was already settled.
   */
  async resolveCheckout(
    checkoutRequestId: string,
    result: PromptResult,
    nowMs: number,
  ): Promise<{ settled: boolean; outcome: OwnerInvoiceCheckoutOutcome; invoiceId: string; invoice: OwnerInvoice } | null> {
    const checkoutRef = adminFirestore.collection(CHECKOUTS).doc(checkoutRequestId);
    return adminFirestore.runTransaction(async (tx) => {
      const checkout = (await tx.get(checkoutRef)).data() as OwnerInvoiceCheckout | undefined;
      if (!checkout) return null;
      const invoiceRef = adminFirestore.collection(COLLECTION).doc(checkout.invoiceId);
      const invoice = (await tx.get(invoiceRef)).data() as OwnerInvoice;
      if (checkout.outcome !== 'pending') return { settled: false, outcome: checkout.outcome, invoiceId: checkout.invoiceId, invoice };

      const outcome: OwnerInvoiceCheckoutOutcome =
        result.resultCode !== 0
          ? 'failed'
          : invoice.status !== 'open'
            ? 'already_settled'
            : result.amountKes !== null && result.amountKes !== invoice.totalKes
              ? 'amount_mismatch'
              : 'paid';
      tx.update(checkoutRef, {
        outcome,
        resultCode: result.resultCode,
        resultDesc: result.resultDesc,
        mpesaReceiptNumber: result.mpesaReceiptNumber,
        paidAmountKes: result.resultCode === 0 ? (result.amountKes ?? checkout.amountKes) : null,
        resolvedAtMs: nowMs,
        resolvedBy: result.by,
      });

      const update: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
      if (invoice.pendingPrompt?.checkoutRequestId === checkoutRequestId) update.pendingPrompt = null;
      let after = invoice;
      if (outcome === 'paid') {
        const payment: OwnerInvoicePayment = {
          method: 'mpesa',
          reference: result.mpesaReceiptNumber,
          amountKes: result.amountKes ?? checkout.amountKes,
          phone: result.phone ?? checkout.phone,
          paidAtMs: nowMs,
          recordedBy: null,
        };
        update.status = 'paid';
        update.payment = payment;
        after = { ...invoice, status: 'paid', payment, pendingPrompt: null };
      }
      tx.update(invoiceRef, update);
      return { settled: true, outcome, invoiceId: checkout.invoiceId, invoice: after };
    });
  }

  /** Staff record a payment made outside the portal. Only an open invoice, and only in full. */
  async recordPayment(businessId: string, id: string, payment: OwnerInvoicePayment): Promise<OwnerInvoice> {
    const ref = adminFirestore.collection(COLLECTION).doc(id);
    return adminFirestore.runTransaction(async (tx) => {
      const invoice = (await tx.get(ref)).data() as OwnerInvoice | undefined;
      if (!invoice || invoice.businessId !== businessId) throw new OwnerInvoiceChangeRefusedError('Invoice not found.');
      if (invoice.status !== 'open') throw new OwnerInvoiceChangeRefusedError(`This invoice is already ${invoice.status === 'paid' ? 'paid' : 'cancelled'}.`);
      if (payment.amountKes !== invoice.totalKes) throw new OwnerInvoiceChangeRefusedError(`Record the full KES ${invoice.totalKes.toLocaleString('en-KE')}; part payments aren’t supported.`);
      tx.update(ref, { status: 'paid', payment, pendingPrompt: null, updatedAt: FieldValue.serverTimestamp() });
      return { ...invoice, status: 'paid', payment, pendingPrompt: null };
    });
  }

  /** Cancels the charge. Only an open invoice, and not while an M-Pesa prompt for it may still be answered. */
  async void(businessId: string, id: string, reason: string, nowMs: number, promptGapMs: number): Promise<OwnerInvoice> {
    const ref = adminFirestore.collection(COLLECTION).doc(id);
    return adminFirestore.runTransaction(async (tx) => {
      const invoice = (await tx.get(ref)).data() as OwnerInvoice | undefined;
      if (!invoice || invoice.businessId !== businessId) throw new OwnerInvoiceChangeRefusedError('Invoice not found.');
      if (invoice.status !== 'open') throw new OwnerInvoiceChangeRefusedError(`This invoice is already ${invoice.status === 'paid' ? 'paid' : 'cancelled'}.`);
      if (invoice.pendingPrompt && nowMs - invoice.pendingPrompt.requestedAtMs < promptGapMs) {
        throw new OwnerInvoiceChangeRefusedError('The owner was just sent an M-Pesa prompt for this invoice. Wait a few minutes, then try again.');
      }
      tx.update(ref, { status: 'void', voidReason: reason, pendingPrompt: null, updatedAt: FieldValue.serverTimestamp() });
      return { ...invoice, status: 'void', voidReason: reason, pendingPrompt: null };
    });
  }
}

function newestFirst<T extends { data: { issuedAtMs: number } }>(rows: T[]): T[] {
  return rows.sort((a, b) => b.data.issuedAtMs - a.data.issuedAtMs);
}

export const ownerInvoiceRepository = new OwnerInvoiceRepository();
export { OwnerInvoiceRepository };
