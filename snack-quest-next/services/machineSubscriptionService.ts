import 'server-only';

import { Timestamp } from 'firebase-admin/firestore';
import { machineSubscriptionRepository } from '@/repositories/machineSubscriptionRepository';
import { machineRepository, MachineNotFoundError } from '@/repositories/machineRepository';
import type { MachineSubscription, MachineSubscriptionFrequency } from '@/types';

export class MachineAlreadyHasActiveSubscriptionError extends Error {
  constructor(machineId: string) {
    super(`Machine ${machineId} already has an active subscription`);
    this.name = 'MachineAlreadyHasActiveSubscriptionError';
  }
}

const FREQUENCY_DAYS: Record<MachineSubscriptionFrequency, number> = { weekly: 7, monthly: 30 };
/** How long a missed period stays "in grace" before arrears actually accrue against the machine's own status — a real number to tune once real subscriptions exist, not fabricated precision. */
const DEFAULT_GRACE_DAYS = 5;

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

/**
 * The subscription domain (§ SUBSCRIPTION, docs/MACHINE_COMMERCE.md
 * §5). `recordPeriodPayment`/`recordPeriodMissed` are staff-recorded
 * facts — there is no automatic Daraja charge behind either, per that
 * doc's own reasoning.
 */
class MachineSubscriptionService {
  async createSubscription(input: {
    businessId: string;
    machineId: string;
    partnerId: string;
    planName: string;
    amountKes: number;
    frequency: MachineSubscriptionFrequency;
    startDate?: Date;
  }): Promise<string> {
    const machine = await machineRepository.findById(input.businessId, input.machineId);
    if (!machine) {
      throw new MachineNotFoundError(input.machineId);
    }
    const existing = await machineSubscriptionRepository.findActiveForMachine(input.businessId, input.machineId);
    if (existing) {
      throw new MachineAlreadyHasActiveSubscriptionError(input.machineId);
    }

    const start = input.startDate ?? new Date();
    const periodEnd = addDays(start, FREQUENCY_DAYS[input.frequency]);

    return machineSubscriptionRepository.create({
      businessId: input.businessId,
      machineId: input.machineId,
      partnerId: input.partnerId,
      planName: input.planName,
      amountKes: input.amountKes,
      frequency: input.frequency,
      status: 'active',
      startDate: Timestamp.fromDate(start) as unknown as MachineSubscription['startDate'],
      currentPeriodStart: Timestamp.fromDate(start) as unknown as MachineSubscription['currentPeriodStart'],
      currentPeriodEnd: Timestamp.fromDate(periodEnd) as unknown as MachineSubscription['currentPeriodEnd'],
      renewalDate: Timestamp.fromDate(periodEnd) as unknown as MachineSubscription['renewalDate'],
      lastPaymentStatus: 'unpaid',
      lastPaidAt: null,
      arrearsKes: 0,
      graceUntil: null,
    });
  }

  /**
   * A staff member recording that the current period was actually
   * paid (by hand, by bank transfer, however it really happened —
   * see this domain's own doc comment for why there's no automatic
   * charge yet). Clears any arrears the machine had accumulated —
   * paying brings the account current, the same "no partial-period
   * bookkeeping invented" simplicity `docs/MACHINE_COMMERCE.md` §5
   * commits to — and rolls the period window forward by one
   * `frequency` unit.
   */
  async recordPeriodPayment(businessId: string, subscriptionId: string, options: { waived?: boolean } = {}): Promise<void> {
    const subscription = await machineSubscriptionRepository.findById(businessId, subscriptionId);
    if (!subscription) {
      throw new Error(`Machine subscription ${subscriptionId} not found`);
    }
    const periodEnd = subscription.currentPeriodEnd.toDate();
    const nextPeriodEnd = addDays(periodEnd, FREQUENCY_DAYS[subscription.frequency]);
    const now = Timestamp.now();

    await machineSubscriptionRepository.recordPeriodOutcome(businessId, subscriptionId, {
      lastPaymentStatus: options.waived ? 'waived' : 'paid',
      lastPaidAt: now as unknown as MachineSubscription['lastPaidAt'],
      currentPeriodStart: subscription.currentPeriodEnd,
      currentPeriodEnd: Timestamp.fromDate(nextPeriodEnd) as unknown as MachineSubscription['currentPeriodEnd'],
      renewalDate: Timestamp.fromDate(nextPeriodEnd) as unknown as MachineSubscription['renewalDate'],
      arrearsKes: 0,
      graceUntil: null,
      status: 'active',
    });
  }

  /**
   * The arrears sweep (§ SUBSCRIPTION: "arrears, grace period") — a
   * subscription whose period ended with no payment recorded either
   * enters its own grace window (first time) or, once grace has
   * passed, accrues the missed amount into `arrearsKes` and moves to
   * `in_arrears`. Never touches a subscription that was actually
   * paid — `lastPaymentStatus` already says so.
   */
  async reconcileArrears(businessId: string, now: Date = new Date()): Promise<{ enteredGrace: number; movedToArrears: number }> {
    const pastDue = await machineSubscriptionRepository.listPastDuePeriods(businessId, now);
    let enteredGrace = 0;
    let movedToArrears = 0;

    for (const { id, data } of pastDue) {
      if (data.lastPaymentStatus === 'paid' || data.lastPaymentStatus === 'waived') {
        continue; // recordPeriodPayment already rolled the period forward; shouldn't be past-due at all, but never touch a paid one regardless
      }
      if (!data.graceUntil) {
        // First time this period is seen past due — open a grace window rather than penalising immediately.
        await machineSubscriptionRepository.recordPeriodOutcome(businessId, id, {
          lastPaymentStatus: data.lastPaymentStatus,
          lastPaidAt: data.lastPaidAt,
          currentPeriodStart: data.currentPeriodStart,
          currentPeriodEnd: data.currentPeriodEnd,
          renewalDate: data.renewalDate,
          arrearsKes: data.arrearsKes,
          graceUntil: Timestamp.fromDate(addDays(now, DEFAULT_GRACE_DAYS)) as unknown as MachineSubscription['graceUntil'],
          status: data.status,
        });
        enteredGrace += 1;
        continue;
      }
      if (data.graceUntil.toDate() > now) {
        continue; // still inside grace — nothing to do yet
      }
      // Grace has passed with no payment — the missed amount becomes real arrears.
      await machineSubscriptionRepository.recordPeriodOutcome(businessId, id, {
        lastPaymentStatus: data.lastPaymentStatus,
        lastPaidAt: data.lastPaidAt,
        currentPeriodStart: data.currentPeriodStart,
        currentPeriodEnd: data.currentPeriodEnd,
        renewalDate: data.renewalDate,
        arrearsKes: data.arrearsKes + data.amountKes,
        graceUntil: data.graceUntil,
        status: 'in_arrears',
      });
      movedToArrears += 1;
    }

    return { enteredGrace, movedToArrears };
  }

  async findActiveForMachine(businessId: string, machineId: string): Promise<{ id: string; data: MachineSubscription } | null> {
    return machineSubscriptionRepository.findActiveForMachine(businessId, machineId);
  }

  async pauseSubscription(businessId: string, subscriptionId: string): Promise<void> {
    await machineSubscriptionRepository.moveStatus(businessId, subscriptionId, 'paused');
  }

  async resumeSubscription(businessId: string, subscriptionId: string): Promise<void> {
    await machineSubscriptionRepository.moveStatus(businessId, subscriptionId, 'active');
  }

  async cancelSubscription(businessId: string, subscriptionId: string): Promise<void> {
    await machineSubscriptionRepository.moveStatus(businessId, subscriptionId, 'cancelled');
  }

  async listByPartner(businessId: string, partnerId: string): Promise<{ id: string; data: MachineSubscription }[]> {
    return machineSubscriptionRepository.listByPartner(businessId, partnerId);
  }
}

export const machineSubscriptionService = new MachineSubscriptionService();
export { MachineSubscriptionService };
