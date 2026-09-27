import 'server-only';

import { machineTransactionRepository, IllegalTransactionTransitionError } from '@/repositories/machineTransactionRepository';
import { machineDispenseCommandRepository, IllegalDispenseCommandTransitionError } from '@/repositories/machineDispenseCommandRepository';
import { machineTransactionService, type MachineTransactionService } from '@/services/machineTransactionService';
import { dispenseCommandService, type DispenseCommandService } from '@/services/dispenseCommandService';
import { findAdapterRegistration } from '@/lib/vending/adapterRegistry';
import { logger } from '@/lib/observability/logger';
import type { MachineDispenseCommand, MachineTransaction, MachineTransactionStatus } from '@/types';

/** A paid sale not yet dispatched after this long is no longer worth dispatching — the customer has gone. */
export const DISPATCH_WINDOW_MS = 2 * 60 * 1000;
/** A command stuck mid-dispatch (claimed/authorized, never sent) this long means its dispatcher died. */
const STALE_DISPATCH_MS = 60 * 1000;
/** Acknowledged or dispensing with no outcome after this long: may have dispensed — to a human, and ask the machine. */
const STALE_IN_FLIGHT_MS = 5 * 60 * 1000;

export type RecoveryAction =
  | 'dispatched'
  | 'refunded_never_dispatched'
  | 'refunded_never_sent'
  | 'refunded_never_collected'
  | 'review_maybe_delivered'
  | 'review_no_outcome'
  | 'aligned_money_side';

export interface RecoveryResult {
  transactionId: string;
  action: RecoveryAction;
}

const WAITING: MachineTransactionStatus[] = ['paid', 'vend_authorized'];

/**
 * Fast recovery for sales stuck between payment and outcome
 * (docs/MACHINE_INTEGRATION_LAYER.md §7). Every rule here resolves only
 * what is **provable**:
 *
 * | Stuck state                                   | Provable?                                  | Action                         |
 * |-----------------------------------------------|--------------------------------------------|--------------------------------|
 * | paid, no command, within 2 min                | nothing was sent                           | dispatch now                   |
 * | paid, no command, after 2 min                 | nothing was sent; customer gone            | refund path                    |
 * | command `requested` > 60 s                    | dispatcher died before contacting anything | refund path                    |
 * | command `authorized` > 60 s, inbound adapter  | never queued — machine can't have seen it  | refund path                    |
 * | command `authorized` > 60 s, outbound adapter | request may have gone out                  | unknown → review (+ pull)      |
 * | queued command expired uncollected            | machine never acknowledged                 | refund path                    |
 * | acknowledged/dispensing > 5 min, no outcome   | may have dispensed                         | timeout → review (+ ask machine) |
 * | command resolved, money side lagging (crash)  | the command is authoritative               | align money side               |
 *
 * Idempotent and safe to run from anywhere, any number of times, in
 * parallel: every write is a compare-and-set transition, so a second
 * runner (or a late machine report) that got there first simply wins.
 * It never retries a dispense that may have been delivered.
 */
class DispenseRecoveryService {
  constructor(
    private readonly transactions: Pick<MachineTransactionService, 'authorizeVend'> = machineTransactionService,
    private readonly dispenser: Pick<DispenseCommandService, 'expireUncollected'> = dispenseCommandService,
  ) {}

  async recoverTransaction(businessId: string, transactionId: string, now: number = Date.now()): Promise<RecoveryResult | null> {
    const transaction = await machineTransactionRepository.findById(businessId, transactionId);
    if (!transaction || !WAITING.includes(transaction.status)) {
      return null;
    }
    try {
      const command = await machineDispenseCommandRepository.findByTransactionId(businessId, transactionId);
      const action = command ? await this.recoverCommand(businessId, transaction, command, now) : await this.recoverUndispatched(businessId, transactionId, transaction, now);
      if (action) {
        logger.info('dispense recovery', { transactionId, machineId: transaction.machineId, action });
        return { transactionId, action };
      }
      return null;
    } catch (error) {
      if (error instanceof IllegalTransactionTransitionError || error instanceof IllegalDispenseCommandTransitionError) {
        // Something else resolved it between our read and our write — the desired outcome.
        return null;
      }
      throw error;
    }
  }

  /** Every stuck sale in the tenant, bounded per run. The fast-recovery cron and the admin "recover now" action call this. */
  async sweep(businessId: string, now: number = Date.now()): Promise<{ examined: number; recovered: Record<RecoveryAction, number> }> {
    const recovered: Record<RecoveryAction, number> = {
      dispatched: 0,
      refunded_never_dispatched: 0,
      refunded_never_sent: 0,
      refunded_never_collected: 0,
      review_maybe_delivered: 0,
      review_no_outcome: 0,
      aligned_money_side: 0,
    };
    const candidates = new Set<string>();
    const cutoff = new Date(now - STALE_DISPATCH_MS);
    for (const { id } of await machineTransactionRepository.listByStatusUpdatedBefore(businessId, 'paid', cutoff)) {
      candidates.add(id);
    }
    for (const status of ['requested', 'authorized', 'sent', 'acknowledged', 'dispensing', 'timeout', 'unknown', 'rejected'] as const) {
      for (const command of await machineDispenseCommandRepository.listByStatusUpdatedBefore(businessId, status, cutoff, 200)) {
        candidates.add(command.transactionId);
      }
    }
    for (const transactionId of candidates) {
      const result = await this.recoverTransaction(businessId, transactionId, now);
      if (result) {
        recovered[result.action] += 1;
      }
    }
    return { examined: candidates.size, recovered };
  }

  private async recoverUndispatched(businessId: string, transactionId: string, transaction: MachineTransaction, now: number): Promise<RecoveryAction | null> {
    if (transaction.status !== 'paid') {
      return null;
    }
    const paidAt = transaction.paidAt?.toMillis() ?? transaction.updatedAt.toMillis();
    if (now - paidAt < DISPATCH_WINDOW_MS) {
      // Nothing was ever sent, and the customer is still within the window: dispatch (claim-before-act makes this safe to race).
      await this.transactions.authorizeVend(businessId, transactionId);
      return 'dispatched';
    }
    await machineTransactionRepository.moveStatus(
      businessId,
      transactionId,
      'paid_vend_failed',
      { failureReason: 'Payment confirmed but the dispense was never started; the customer window passed', dispenseFailureStatus: 'machine_offline' },
      { expectedFrom: ['paid'] },
    );
    return 'refunded_never_dispatched';
  }

  private async recoverCommand(businessId: string, transaction: MachineTransaction, command: MachineDispenseCommand, now: number): Promise<RecoveryAction | null> {
    const age = now - command.updatedAt.toMillis();
    switch (command.status) {
      case 'requested':
        if (age < STALE_DISPATCH_MS) return null;
        await machineDispenseCommandRepository.moveStatus(businessId, command.transactionId, 'rejected', { failureCode: 'business.integration_inactive', failureReason: 'dispatch never completed; nothing was sent' }, 'recovered: claimed but never sent');
        await this.toRefund(businessId, command.transactionId, 'The dispense was never sent to the machine');
        return 'refunded_never_sent';

      case 'authorized': {
        if (age < STALE_DISPATCH_MS) return null;
        const inbound = findAdapterRegistration(command.adapterKey)?.direction === 'inbound';
        if (inbound) {
          // For a queued (inbound) integration, "sending" *is* writing `sent`; a command still `authorized` was never visible to the machine.
          await machineDispenseCommandRepository.moveStatus(businessId, command.transactionId, 'rejected', { failureCode: 'business.integration_inactive', failureReason: 'never queued for the machine' }, 'recovered: authorized but never queued');
          await this.toRefund(businessId, command.transactionId, 'The dispense was never queued for the machine');
          return 'refunded_never_sent';
        }
        await machineDispenseCommandRepository.moveStatus(
          businessId,
          command.transactionId,
          'unknown',
          { vendRef: command.vendRef ?? command.commandRef, failureCode: 'unknown.outcome_undetermined', failureReason: 'dispatcher stopped after contacting the manufacturer; outcome unknown', dispenseResultStatus: 'unknown' },
          'recovered: may have been delivered',
        );
        await this.toReview(businessId, command.transactionId, 'The dispense may have reached the machine; checking with the manufacturer', command.vendRef ?? command.commandRef);
        return 'review_maybe_delivered';
      }

      case 'sent':
        if (command.delivery === 'queued' && command.expiresAt.toMillis() + 30_000 < now) {
          return (await this.dispenser.expireUncollected(businessId, command)) ? 'refunded_never_collected' : null;
        }
        if (transaction.status === 'paid') {
          await machineTransactionRepository.moveStatus(businessId, command.transactionId, 'vend_authorized', { vendRef: command.vendRef }, { expectedFrom: ['paid'] });
          return 'aligned_money_side';
        }
        return null;

      case 'acknowledged':
      case 'dispensing':
        if (transaction.status === 'paid') {
          await machineTransactionRepository.moveStatus(businessId, command.transactionId, 'vend_authorized', { vendRef: command.vendRef }, { expectedFrom: ['paid'] });
          return 'aligned_money_side';
        }
        if (age < STALE_IN_FLIGHT_MS) return null;
        await machineDispenseCommandRepository.moveStatus(businessId, command.transactionId, 'timeout', { failureCode: 'transport.timeout', failureReason: `no outcome ${Math.round(age / 60000)} minutes after the machine ${command.status === 'dispensing' ? 'started dispensing' : 'acknowledged'}`, dispenseResultStatus: 'timeout' }, 'recovered: in flight too long');
        await this.toReview(businessId, command.transactionId, 'The machine took the dispense but never reported the outcome', command.vendRef ?? command.commandRef);
        return 'review_no_outcome';

      case 'timeout':
      case 'unknown':
        await this.toReview(businessId, command.transactionId, command.failureReason ?? 'Dispense outcome unknown', command.vendRef ?? command.commandRef);
        return 'aligned_money_side';

      case 'rejected':
        await this.toRefund(businessId, command.transactionId, command.failureReason ?? 'The machine refused the dispense');
        return 'aligned_money_side';

      default:
        return null;
    }
  }

  private async toRefund(businessId: string, transactionId: string, reason: string): Promise<void> {
    await machineTransactionRepository.moveStatus(businessId, transactionId, 'paid_vend_failed', { failureReason: reason }, { expectedFrom: WAITING, allowNoop: true });
  }

  private async toReview(businessId: string, transactionId: string, reason: string, vendRef: string): Promise<void> {
    await machineTransactionRepository.moveStatus(businessId, transactionId, 'manual_review', { failureReason: reason, vendRef, dispenseFailureStatus: 'unknown' }, { expectedFrom: WAITING, allowNoop: true });
  }
}

export const dispenseRecoveryService = new DispenseRecoveryService();
export { DispenseRecoveryService };
