import type { Timestamp } from 'firebase/firestore';

/**
 * `machineSubscriptions/{subscriptionId}` — the recurring maintenance/
 * operations charge a machine owner pays Snack Quest
 * (§ SUBSCRIPTION, docs/MACHINE_COMMERCE.md §5).
 *
 * Deliberately not wired to an automatic Daraja charge — see this
 * type's own doc in `docs/MACHINE_COMMERCE.md` §5 for why collecting
 * a recurring charge *from* an owner is a real payments decision this
 * pass doesn't make. `lastPaymentStatus`/`markPeriodPaid` are
 * staff-recorded facts (mirroring `Withdrawal.manualPayment`'s "an
 * admin recorded what actually happened" pattern), not the output of
 * an integration.
 */
export type MachineSubscriptionFrequency = 'weekly' | 'monthly';
export type MachineSubscriptionStatus = 'active' | 'paused' | 'cancelled' | 'in_arrears';
export type MachineSubscriptionPaymentStatus = 'paid' | 'unpaid' | 'waived';

export interface MachineSubscription {
  businessId: string;
  machineId: string;
  partnerId: string;
  planName: string;
  /** Configurable — never hard-coded (§ SUBSCRIPTION: "do not hard-code one price"). */
  amountKes: number;
  frequency: MachineSubscriptionFrequency;
  status: MachineSubscriptionStatus;
  startDate: Timestamp;
  currentPeriodStart: Timestamp;
  currentPeriodEnd: Timestamp;
  renewalDate: Timestamp;
  lastPaymentStatus: MachineSubscriptionPaymentStatus;
  lastPaidAt: Timestamp | null;
  /** Accumulated unpaid amount across past periods — never silently absorbed or waived without `lastPaymentStatus: 'waived'` recording that it was. */
  arrearsKes: number;
  /** Set only while a machine is inside its own grace window after a missed period — null once outside grace (§ SUBSCRIPTION: "grace period if applicable"). */
  graceUntil: Timestamp | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export const MACHINE_SUBSCRIPTION_STATUS_TRANSITIONS: Record<MachineSubscriptionStatus, MachineSubscriptionStatus[]> = {
  active: ['paused', 'cancelled', 'in_arrears'],
  paused: ['active', 'cancelled'],
  in_arrears: ['active', 'cancelled'],
  cancelled: [],
};
