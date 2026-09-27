import type { DispenseResultStatus } from '@/lib/vending/hardwareAdapter';
import type { MachineTransactionStatus } from '@/types';

/**
 * What to do when a machine reports the outcome of a vend, given where
 * the money side already stands. A pure table, so every combination is
 * enumerated and tested (tests/lib/vendOutcomeDecision.test.ts) instead
 * of being an accident of which transitions happen to be legal.
 *
 * The rules, in order of importance:
 *
 * 1. **The product physically leaving the machine is always recorded**
 *    (stock moves) — whatever the money side says. Inventory must match
 *    the physical world.
 * 2. **Money never flips silently.** A report that contradicts a
 *    decision already acted on (a refund, a completed sale) is a
 *    *conflict*: recorded, surfaced to an operator, and — where the money
 *    hasn't moved yet — parked in `manual_review` for a human.
 * 3. **Definite beats uncertain; later uncertainty never overrides.**
 *    `unknown` can move a pending vend to review, but never undoes a
 *    definite outcome.
 * 4. **Repeats are no-ops.** The same outcome reported again, however it
 *    arrives (retry, webhook + API, push + pull), changes nothing.
 */
export type VendOutcomeAction =
  /** Record the sale: transaction → dispensed, stock −1. */
  | { kind: 'complete_sale' }
  /** Nothing dispensed: transaction → paid_vend_failed (refund path). */
  | { kind: 'fail_sale' }
  /** Nobody knows: transaction → manual_review. */
  | { kind: 'review' }
  /** Already reflects this outcome (or a later, more definite one): nothing to do. */
  | { kind: 'noop'; reason: 'same_outcome' | 'already_definite' | 'already_in_review' | 'not_dispatched' }
  /** Contradiction. `moveToReview` if the money side can still be parked; `recordStock` if the product physically left. */
  | { kind: 'conflict'; moveToReview: boolean; recordStock: boolean; severity: 'critical' | 'warning'; description: string };

const PENDING: MachineTransactionStatus[] = ['paid', 'vend_authorized'];
const REFUND_PATH_NOT_YET_PAID_OUT: MachineTransactionStatus[] = ['paid_vend_failed', 'refund_requested'];

export function decideVendOutcome(current: MachineTransactionStatus, reported: DispenseResultStatus): VendOutcomeAction {
  const success = reported === 'success';
  const unknown = reported === 'unknown';

  if (current === 'pending' || current === 'payment_failed') {
    // A machine claiming an outcome for a sale that was never paid (or
    // never dispatched) — nothing here moves money, but it is not normal.
    return success
      ? { kind: 'conflict', moveToReview: false, recordStock: true, severity: 'critical', description: `machine reported a dispense for a transaction that is "${current}" — no paid dispatch exists` }
      : { kind: 'noop', reason: 'not_dispatched' };
  }

  if (PENDING.includes(current)) {
    return success ? { kind: 'complete_sale' } : unknown ? { kind: 'review' } : { kind: 'fail_sale' };
  }

  if (current === 'manual_review') {
    // A late, definite report resolves an unknown — the reason review exists.
    return success ? { kind: 'complete_sale' } : unknown ? { kind: 'noop', reason: 'already_in_review' } : { kind: 'fail_sale' };
  }

  if (current === 'dispensed') {
    if (success || unknown) {
      return { kind: 'noop', reason: success ? 'same_outcome' : 'already_definite' };
    }
    return {
      kind: 'conflict',
      moveToReview: false,
      recordStock: false,
      severity: 'warning',
      description: `machine reported "${reported}" for a vend it had already reported dispensed — the sale stands; check the slot`,
    };
  }

  if (REFUND_PATH_NOT_YET_PAID_OUT.includes(current)) {
    if (!success) {
      return { kind: 'noop', reason: unknown ? 'already_definite' : 'same_outcome' };
    }
    return {
      kind: 'conflict',
      moveToReview: true,
      recordStock: true,
      severity: 'critical',
      description: `machine reported the product dispensed after the refund decision ("${current}") — refund on hold for review`,
    };
  }

  // refunded
  if (!success) {
    return { kind: 'noop', reason: unknown ? 'already_definite' : 'same_outcome' };
  }
  return {
    kind: 'conflict',
    moveToReview: false,
    recordStock: true,
    severity: 'critical',
    description: 'machine reported the product dispensed after the customer was refunded — customer has both; recover or write off',
  };
}
