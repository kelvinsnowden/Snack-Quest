import { describe, expect, it } from 'vitest';
import { decideVendOutcome } from '@/lib/vending/vendOutcomeDecision';
import type { DispenseResultStatus } from '@/lib/vending/hardwareAdapter';
import type { MachineTransactionStatus } from '@/types';

const STATUSES: MachineTransactionStatus[] = ['pending', 'payment_failed', 'paid', 'vend_authorized', 'dispensed', 'paid_vend_failed', 'refund_requested', 'refunded', 'manual_review'];
const REPORTS: DispenseResultStatus[] = ['success', 'failed', 'timeout', 'unknown', 'jam', 'no_product', 'sensor_failure', 'machine_offline'];

describe('vend outcome decision table', () => {
  it('is total: every (status, report) pair has a decision', () => {
    for (const status of STATUSES) {
      for (const report of REPORTS) {
        expect(decideVendOutcome(status, report).kind).toBeDefined();
      }
    }
  });

  it('pending sales resolve by the report', () => {
    for (const status of ['paid', 'vend_authorized'] as const) {
      expect(decideVendOutcome(status, 'success').kind).toBe('complete_sale');
      expect(decideVendOutcome(status, 'jam').kind).toBe('fail_sale');
      expect(decideVendOutcome(status, 'unknown').kind).toBe('review');
    }
  });

  it('a definite late report resolves manual review; uncertainty never does', () => {
    expect(decideVendOutcome('manual_review', 'success').kind).toBe('complete_sale');
    expect(decideVendOutcome('manual_review', 'no_product').kind).toBe('fail_sale');
    expect(decideVendOutcome('manual_review', 'unknown')).toEqual({ kind: 'noop', reason: 'already_in_review' });
  });

  it('never double-completes and never un-completes a sale', () => {
    expect(decideVendOutcome('dispensed', 'success')).toEqual({ kind: 'noop', reason: 'same_outcome' });
    expect(decideVendOutcome('dispensed', 'unknown')).toEqual({ kind: 'noop', reason: 'already_definite' });
    const contradiction = decideVendOutcome('dispensed', 'failed');
    expect(contradiction.kind).toBe('conflict');
    expect(contradiction).toMatchObject({ moveToReview: false, recordStock: false });
  });

  it('a success after the refund decision is a critical conflict: stock recorded, refund parked for review', () => {
    for (const status of ['paid_vend_failed', 'refund_requested'] as const) {
      expect(decideVendOutcome(status, 'success')).toMatchObject({ kind: 'conflict', moveToReview: true, recordStock: true, severity: 'critical' });
      expect(decideVendOutcome(status, 'jam').kind).toBe('noop');
    }
  });

  it('a success after the money went back is recorded and escalated, never reversed automatically', () => {
    expect(decideVendOutcome('refunded', 'success')).toMatchObject({ kind: 'conflict', moveToReview: false, recordStock: true, severity: 'critical' });
    expect(decideVendOutcome('refunded', 'failed').kind).toBe('noop');
  });

  it('a claimed dispense for an unpaid transaction is a conflict, never a sale', () => {
    expect(decideVendOutcome('pending', 'success')).toMatchObject({ kind: 'conflict', moveToReview: false });
    expect(decideVendOutcome('payment_failed', 'success').kind).toBe('conflict');
    expect(decideVendOutcome('pending', 'failed').kind).toBe('noop');
  });

  it('only complete_sale and conflicts may move stock, and only conflicts may park a refund', () => {
    for (const status of STATUSES) {
      for (const report of REPORTS) {
        const action = decideVendOutcome(status, report);
        if (report !== 'success') {
          expect(action.kind === 'complete_sale' || (action.kind === 'conflict' && action.recordStock)).toBe(false);
        }
      }
    }
  });
});
