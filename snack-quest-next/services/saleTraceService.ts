import 'server-only';

import { adminFirestore } from '@/lib/firebase/admin';
import { machineRepository } from '@/repositories/machineRepository';
import { machineTransactionRepository } from '@/repositories/machineTransactionRepository';
import { machineDispenseCommandRepository } from '@/repositories/machineDispenseCommandRepository';
import { machineEventRepository } from '@/repositories/machineEventRepository';
import { machineInventoryMovementRepository } from '@/repositories/machineInventoryMovementRepository';
import { webhookEventRepository } from '@/repositories/webhookEventRepository';
import { movementDocIdFor } from '@/services/machineInventoryMovementService';
import { isCustomerSale, type MachineDispenseCommand, type MachineTransaction } from '@/types';

/**
 * "A customer paid at 14:32 and didn't get their snack" — answered from
 * one lookup. A trace stitches together everything recorded about a
 * sale across the ledgers that each hold a piece of it: the money
 * (`machineTransactions`), Safaricom's callback (`webhookEvents`), the
 * physical instruction (`machineDispenseCommands` and its status
 * history), what the machine said around that time (`machineEvents`),
 * the stock movement, and any ledger alert. It ends in a plain verdict
 * a support agent can read to the customer.
 *
 * Read-only. Staff-only (it shows payment references). Every ledger it
 * reads is keyed by ids the sale already carries, so a trace is a
 * handful of point reads plus one bounded event query per sale.
 */

export type SaleTraceQuery =
  | { transactionId: string }
  | { transactionRef: string }
  | { paymentRef: string }
  | { checkoutRequestId: string }
  | { commandRef: string }
  | { machineCode: string; at: Date; windowMinutes?: number };

export interface SaleTraceStep {
  at: string;
  source: 'payment' | 'mpesa' | 'dispense' | 'machine' | 'stock' | 'alert';
  what: string;
  detail?: Record<string, unknown>;
}

export type SaleVerdict =
  | 'delivered'
  | 'refund_owed'
  | 'refunded'
  | 'under_review'
  | 'in_progress'
  | 'payment_not_received'
  | 'not_paid';

export interface SaleTrace {
  transactionId: string;
  transactionRef: string;
  machineId: string;
  machineCode: string | null;
  amountKes: number;
  status: MachineTransaction['status'];
  verdict: SaleVerdict;
  /** One sentence a support agent can say to the customer. */
  summary: string;
  paymentRef: string | null;
  commandRef: string | null;
  commandStatus: MachineDispenseCommand['status'] | null;
  timeline: SaleTraceStep[];
}

const EVENT_WINDOW_BEFORE_MS = 5 * 60_000;
const EVENT_WINDOW_AFTER_MS = 30 * 60_000;
/** Machine events worth showing in a trace even when they don't name the sale: they explain it. */
const CONTEXT_EVENT_TYPES = new Set<string>(['MACHINE_OFFLINE', 'MACHINE_ONLINE', 'MACHINE_ERROR', 'DOOR_OPENED', 'DOOR_CLOSED', 'SLOT_EMPTY', 'INVENTORY_MISMATCH', 'PAYMENT_DEVICE_ERROR', 'FIRMWARE_CHANGED', 'DISPENSE_UNRECOGNISED']);
const LEDGER_ALERT_KINDS = ['dispensed_without_stock_movement', 'stock_moved_without_dispensed_sale', 'duplicate_stock_movement', 'command_transaction_mismatch', 'refund_owed_too_long', 'unresolved_outcome_conflict'];

const iso = (value: { toDate(): Date } | null | undefined) => (value ? value.toDate().toISOString() : null);

class SaleTraceService {
  /** Every sale matching the query, most recent first — one for an id, possibly several for "machine X around 14:32". */
  async trace(businessId: string, query: SaleTraceQuery): Promise<SaleTrace[]> {
    const sales = await this.find(businessId, query);
    return Promise.all(sales.map(({ id, data }) => this.build(businessId, id, data)));
  }

  private async find(businessId: string, query: SaleTraceQuery): Promise<{ id: string; data: MachineTransaction }[]> {
    const one = (found: { id: string; data: MachineTransaction } | null) => (found ? [found] : []);
    if ('transactionId' in query) {
      const data = await machineTransactionRepository.findById(businessId, query.transactionId);
      return data ? [{ id: query.transactionId, data }] : [];
    }
    if ('transactionRef' in query) return one(await machineTransactionRepository.findByTransactionRef(businessId, query.transactionRef));
    if ('paymentRef' in query) return one(await machineTransactionRepository.findByPaymentRef(businessId, query.paymentRef));
    if ('checkoutRequestId' in query) return machineTransactionRepository.listByCheckoutRequestId(businessId, query.checkoutRequestId);
    if ('commandRef' in query) {
      const command = await machineDispenseCommandRepository.findByCommandRef(businessId, query.commandRef);
      if (!command) return [];
      const data = await machineTransactionRepository.findById(businessId, command.transactionId);
      return data ? [{ id: command.transactionId, data }] : [];
    }
    const machine = await machineRepository.findByMachineCode(businessId, query.machineCode);
    if (!machine) return [];
    const windowMs = Math.min(Math.max(query.windowMinutes ?? 15, 1), 120) * 60_000;
    return machineTransactionRepository.listByMachineCreatedInRange(businessId, machine.id, new Date(query.at.getTime() - windowMs), new Date(query.at.getTime() + windowMs));
  }

  private async build(businessId: string, transactionId: string, sale: MachineTransaction): Promise<SaleTrace> {
    const [machine, command, callback, movement, alerts] = await Promise.all([
      machineRepository.findById(businessId, sale.machineId),
      machineDispenseCommandRepository.findByTransactionId(businessId, transactionId),
      sale.checkoutRequestId ? webhookEventRepository.findByProviderEventId(businessId, 'daraja', sale.checkoutRequestId) : Promise.resolve(null),
      machineInventoryMovementRepository.refFor(movementDocIdFor(businessId, `sale:${transactionId}`)).get(),
      adminFirestore.getAll(...LEDGER_ALERT_KINDS.map((kind) => adminFirestore.collection('alerts').doc(`ledger_${kind}_${transactionId}`))),
    ]);

    const start = sale.createdAt.toDate();
    const end = sale.updatedAt.toDate();
    const events = await machineEventRepository.listByMachineInRange(businessId, sale.machineId, new Date(start.getTime() - EVENT_WINDOW_BEFORE_MS), new Date(end.getTime() + EVENT_WINDOW_AFTER_MS));

    const timeline: SaleTraceStep[] = [];
    const push = (at: string | null, source: SaleTraceStep['source'], what: string, detail?: Record<string, unknown>) => {
      if (at) timeline.push({ at, source, what, ...(detail ? { detail } : {}) });
    };

    push(iso(sale.createdAt), 'payment', `Sale started: KES ${sale.amountKes}, slot ${sale.slotId}, ${sale.paymentMethod}`);
    if (callback) {
      const payload = callback.payload as { resultCode?: number; resultDesc?: string; amountKes?: number; mpesaReceiptNumber?: string };
      push(iso(callback.receivedAt), 'mpesa', payload.resultCode === 0 ? `M-Pesa confirmed payment ${payload.mpesaReceiptNumber ?? ''}`.trim() : `M-Pesa reported the payment failed (${payload.resultDesc ?? `code ${payload.resultCode}`})`, { resultCode: payload.resultCode, amountKes: payload.amountKes });
    }
    push(iso(sale.paidAt), 'payment', `Payment verified${sale.paymentRef ? ` (${sale.paymentRef})` : ''}`);
    for (const step of command?.statusHistory ?? []) {
      push(iso(step.at), 'dispense', `Dispense ${step.status}`, step.detail ? { detail: step.detail } : undefined);
    }
    for (const { data: event } of events) {
      const eventData = event.data ?? {};
      const aboutThisSale = eventData.transactionId === transactionId || (command && eventData.commandRef === command.commandRef);
      if (aboutThisSale || CONTEXT_EVENT_TYPES.has(event.type)) {
        push(iso(event.occurredAt), 'machine', `${event.type}${aboutThisSale ? '' : ' (machine context)'}`, { severity: event.severity, source: event.source, ...(event.slotCode ? { slotCode: event.slotCode } : {}) });
      }
    }
    push(iso(sale.dispensedAt), 'payment', 'Sale completed — product dispensed');
    if (movement.exists) {
      push(iso(movement.get('createdAt')), 'stock', `Stock decremented (${movement.get('quantityDelta') ?? -1})`);
    }
    for (const alert of alerts.filter((doc) => doc.exists)) {
      push(iso(alert.get('createdAt')), 'alert', String(alert.get('title')), { status: alert.get('status') });
    }
    if (sale.outcomeConflict) {
      push(iso(sale.outcomeConflict.reportedAt), 'machine', `Machine reported "${sale.outcomeConflict.reportedStatus}" after the sale was "${sale.outcomeConflict.previousStatus}"`, { resolved: sale.outcomeConflict.resolved });
    }
    timeline.sort((a, b) => a.at.localeCompare(b.at));

    const { verdict, summary } = this.verdict(sale, command);
    return {
      transactionId,
      transactionRef: sale.transactionRef,
      machineId: sale.machineId,
      machineCode: machine?.machineCode ?? null,
      amountKes: sale.amountKes,
      status: sale.status,
      verdict,
      summary,
      paymentRef: sale.paymentRef,
      commandRef: command?.commandRef ?? null,
      commandStatus: command?.status ?? null,
      timeline,
    };
  }

  private verdict(sale: MachineTransaction, command: MachineDispenseCommand | null): { verdict: SaleVerdict; summary: string } {
    const reason = sale.failureReason ? ` Reason: ${sale.failureReason}.` : '';
    if (!isCustomerSale(sale)) {
      // A staff test vend: nobody paid, so nothing is owed — but the physical outcome still matters.
      const physical = sale.status === 'dispensed' ? 'the machine confirmed it dispensed' : sale.status === 'manual_review' ? 'the outcome is unknown — it may have dispensed' : sale.status === 'paid' || sale.status === 'vend_authorized' ? `the dispense is ${command ? command.status : 'not yet sent'}` : 'it was not dispensed';
      return { verdict: sale.status === 'dispensed' ? 'delivered' : sale.status === 'manual_review' ? 'under_review' : sale.status === 'paid' || sale.status === 'vend_authorized' ? 'in_progress' : 'not_paid', summary: `Staff test vend (no customer, no payment): ${physical}.${reason}` };
    }
    switch (sale.status) {
      case 'dispensed':
        return { verdict: 'delivered', summary: `The machine confirmed it dispensed this item at ${iso(sale.dispensedAt)}. If the customer says otherwise, check the camera snapshot and the slot.` };
      case 'paid_vend_failed':
      case 'refund_requested':
        return { verdict: 'refund_owed', summary: `Paid, and the machine provably did not dispense. The customer is owed KES ${sale.amountKes}.${reason}` };
      case 'refunded':
        return { verdict: 'refunded', summary: `Paid, not dispensed, and refunded.${reason}` };
      case 'manual_review':
        return { verdict: 'under_review', summary: `We can't prove whether the item dropped${command ? ` (dispense ${command.status})` : ''}, so nothing was refunded or retried automatically. Someone must check the machine before refunding.${reason}` };
      case 'paid':
      case 'vend_authorized':
        return { verdict: 'in_progress', summary: `Paid; the dispense is ${command ? command.status : 'not yet sent'}. Recovery resolves this within minutes if the machine doesn't answer.` };
      case 'pending':
        return { verdict: 'payment_not_received', summary: 'We never received payment confirmation from M-Pesa for this sale. If the customer has an M-Pesa receipt, search by that receipt.' };
      default:
        return { verdict: 'not_paid', summary: `The payment did not go through (${sale.status}); no money was taken for this sale.${reason}` };
    }
  }
}

export const saleTraceService = new SaleTraceService();
export { SaleTraceService };
