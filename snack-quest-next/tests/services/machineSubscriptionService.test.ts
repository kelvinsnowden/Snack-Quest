import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  machineSubscriptionService,
  MachineAlreadyHasActiveSubscriptionError,
  SubscriptionRefusedError,
} from '@/services/machineSubscriptionService';
import { machineSubscriptionRepository, IllegalSubscriptionTransitionError } from '@/repositories/machineSubscriptionRepository';
import { machineService } from '@/services/machineService';
import { partnerRepository } from '@/repositories/partnerRepository';
import { adminFirestore } from '@/lib/firebase/admin';

/** A subscription is charged to the machine's owner, so the machine is given to that owner first (as it would be in real use). */
async function subscribeAsOwner(input: Parameters<typeof machineSubscriptionService.createSubscription>[0]) {
  await adminFirestore.collection('machines').doc(input.machineId).update({ ownerPartnerId: input.partnerId });
  return machineSubscriptionService.createSubscription(input);
}


const BUSINESS_ID = 'biz-subscription-test';

async function cleanCollections() {
  for (const collection of ['machines', 'machineSubscriptions', 'partners', 'deviceCredentials']) {
    const snapshot = await adminFirestore.collection(collection).where('businessId', '==', BUSINESS_ID).get();
    await Promise.all(snapshot.docs.map((doc) => doc.ref.delete()));
  }
}

beforeEach(cleanCollections);
afterEach(cleanCollections);

async function provisionMachine(machineCode: string) {
  const { machineId } = await machineService.provisionDevice({
    businessId: BUSINESS_ID,
    machineCode,
    serialNumber: `SN-${machineCode}`,
    manufacturer: 'mock',
    model: 'test',
    actor: 'staff-1',
  });
  return machineId;
}

async function createPartner(name: string) {
  return partnerRepository.create({ businessId: BUSINESS_ID, name, contactEmail: null, contactPhone: null, status: 'active', note: null, authUid: null, availableCashKes: 0, lifetimeEarnedKes: 0, createdBy: 'staff-1' });
}

describe('MachineSubscriptionService.createSubscription', () => {
  it('creates an active subscription with a real, configurable amount', async () => {
    const machineId = await provisionMachine('SQ-SUB-1');
    const partnerId = await createPartner('Owner One');
    const subscriptionId = await subscribeAsOwner({
      businessId: BUSINESS_ID,
      machineId,
      partnerId,
      planName: 'Standard',
      amountKes: 5_000,
      frequency: 'monthly',
    });
    const subscription = await machineSubscriptionRepository.findById(BUSINESS_ID, subscriptionId);
    expect(subscription?.status).toBe('active');
    expect(subscription?.amountKes).toBe(5_000);
    expect(subscription?.lastPaymentStatus).toBe('unpaid');
    expect(subscription?.arrearsKes).toBe(0);
  });

  it('refuses a subscription for anyone but the machine’s owner, and a fractional amount', async () => {
    const machineId = await provisionMachine('SQ-SUB-OWNER');
    const owner = await createPartner('Owner');
    const stranger = await createPartner('Stranger');
    await adminFirestore.collection('machines').doc(machineId).update({ ownerPartnerId: owner });
    await expect(machineSubscriptionService.createSubscription({ businessId: BUSINESS_ID, machineId, partnerId: stranger, planName: 'Standard', amountKes: 5_000, frequency: 'monthly' })).rejects.toBeInstanceOf(SubscriptionRefusedError);
    await expect(machineSubscriptionService.createSubscription({ businessId: BUSINESS_ID, machineId, partnerId: owner, planName: 'Standard', amountKes: 12.5, frequency: 'monthly' })).rejects.toThrow('whole number');
    const unowned = await provisionMachine('SQ-SUB-UNOWNED');
    await expect(machineSubscriptionService.createSubscription({ businessId: BUSINESS_ID, machineId: unowned, partnerId: owner, planName: 'Standard', amountKes: 5_000, frequency: 'monthly' })).rejects.toBeInstanceOf(SubscriptionRefusedError);
  });

  it('refuses a second active subscription on the same machine', async () => {
    const machineId = await provisionMachine('SQ-SUB-2');
    const partnerId = await createPartner('Owner Two');
    await subscribeAsOwner({ businessId: BUSINESS_ID, machineId, partnerId, planName: 'Standard', amountKes: 5_000, frequency: 'monthly' });
    await expect(
      subscribeAsOwner({ businessId: BUSINESS_ID, machineId, partnerId, planName: 'Standard', amountKes: 5_000, frequency: 'monthly' }),
    ).rejects.toThrow(MachineAlreadyHasActiveSubscriptionError);
  });
});

describe('MachineSubscriptionService.recordPeriodPayment', () => {
  it('marks the period paid and rolls the window forward, clearing arrears', async () => {
    const machineId = await provisionMachine('SQ-SUB-3');
    const partnerId = await createPartner('Owner Three');
    const subscriptionId = await subscribeAsOwner({
      businessId: BUSINESS_ID,
      machineId,
      partnerId,
      planName: 'Standard',
      amountKes: 5_000,
      frequency: 'weekly',
      startDate: new Date('2026-01-01T00:00:00.000Z'),
    });
    await adminFirestore.collection('machineSubscriptions').doc(subscriptionId).update({ arrearsKes: 5_000 });

    await machineSubscriptionService.recordPeriodPayment(BUSINESS_ID, subscriptionId);

    const subscription = await machineSubscriptionRepository.findById(BUSINESS_ID, subscriptionId);
    expect(subscription?.lastPaymentStatus).toBe('paid');
    expect(subscription?.arrearsKes).toBe(0);
    expect(subscription?.status).toBe('active');
    expect(subscription?.currentPeriodStart.toMillis()).toBe(new Date('2026-01-08T00:00:00.000Z').getTime());
    expect(subscription?.currentPeriodEnd.toMillis()).toBe(new Date('2026-01-15T00:00:00.000Z').getTime());
  });
});

describe('MachineSubscriptionService.reconcileArrears', () => {
  it('opens a grace window on the first sweep past a missed period', async () => {
    const machineId = await provisionMachine('SQ-SUB-4');
    const partnerId = await createPartner('Owner Four');
    const subscriptionId = await subscribeAsOwner({
      businessId: BUSINESS_ID,
      machineId,
      partnerId,
      planName: 'Standard',
      amountKes: 5_000,
      frequency: 'weekly',
      startDate: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000), // period ended yesterday
    });

    const result = await machineSubscriptionService.reconcileArrears(BUSINESS_ID);
    expect(result.enteredGrace).toBe(1);
    expect(result.movedToArrears).toBe(0);

    const subscription = await machineSubscriptionRepository.findById(BUSINESS_ID, subscriptionId);
    expect(subscription?.graceUntil).not.toBeNull();
    expect(subscription?.status).toBe('active'); // still active — grace, not yet in arrears
    expect(subscription?.arrearsKes).toBe(0);
  });

  it('the daily reconcile-subscription-arrears job runs this sweep, under a lease, and records the run', async () => {
    const { scheduledJobService } = await import('@/services/scheduledJobService');
    const { loadJobBody } = await import('@/services/jobs/registry');
    const machineId = await provisionMachine('SQ-SUB-JOB');
    const partnerId = await createPartner('Owner Job');
    const subscriptionId = await subscribeAsOwner({
      businessId: BUSINESS_ID,
      machineId,
      partnerId,
      planName: 'Standard',
      amountKes: 5_000,
      frequency: 'weekly',
      startDate: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000),
    });
    const body = await loadJobBody('reconcile-subscription-arrears');
    const outcome = await scheduledJobService.run(BUSINESS_ID, 'reconcile-subscription-arrears', (job) => body(BUSINESS_ID, job, 'system:test'));
    expect(outcome.runId).toBeTruthy();
    expect(outcome.summary).toMatchObject({ enteredGrace: 1, movedToArrears: 0 });
    expect((await machineSubscriptionRepository.findById(BUSINESS_ID, subscriptionId))?.graceUntil).not.toBeNull();
  });

  it('moves to in_arrears and accrues the missed amount once grace has passed', async () => {
    const machineId = await provisionMachine('SQ-SUB-5');
    const partnerId = await createPartner('Owner Five');
    const subscriptionId = await subscribeAsOwner({
      businessId: BUSINESS_ID,
      machineId,
      partnerId,
      planName: 'Standard',
      amountKes: 5_000,
      frequency: 'weekly',
      startDate: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000),
    });
    // Simulate an already-opened grace window that has since passed.
    await adminFirestore.collection('machineSubscriptions').doc(subscriptionId).update({
      graceUntil: new Date(Date.now() - 60 * 60 * 1000),
    });

    const result = await machineSubscriptionService.reconcileArrears(BUSINESS_ID);
    expect(result.movedToArrears).toBe(1);

    const subscription = await machineSubscriptionRepository.findById(BUSINESS_ID, subscriptionId);
    expect(subscription?.status).toBe('in_arrears');
    expect(subscription?.arrearsKes).toBe(5_000);
  });

  it('never touches a subscription whose period was already paid', async () => {
    const machineId = await provisionMachine('SQ-SUB-6');
    const partnerId = await createPartner('Owner Six');
    const subscriptionId = await subscribeAsOwner({
      businessId: BUSINESS_ID,
      machineId,
      partnerId,
      planName: 'Standard',
      amountKes: 5_000,
      frequency: 'weekly',
      startDate: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000),
    });
    await machineSubscriptionService.recordPeriodPayment(BUSINESS_ID, subscriptionId);
    // recordPeriodPayment already rolled the period forward to next week — not past due, so the sweep should find nothing regardless.
    const result = await machineSubscriptionService.reconcileArrears(BUSINESS_ID);
    expect(result.enteredGrace).toBe(0);
    expect(result.movedToArrears).toBe(0);
  });
});

describe('MachineSubscriptionService status transitions', () => {
  it('pause -> resume -> cancel, and refuses cancel -> active', async () => {
    const machineId = await provisionMachine('SQ-SUB-7');
    const partnerId = await createPartner('Owner Seven');
    const subscriptionId = await subscribeAsOwner({ businessId: BUSINESS_ID, machineId, partnerId, planName: 'Standard', amountKes: 5_000, frequency: 'monthly' });

    await machineSubscriptionService.pauseSubscription(BUSINESS_ID, subscriptionId);
    expect((await machineSubscriptionRepository.findById(BUSINESS_ID, subscriptionId))?.status).toBe('paused');

    await machineSubscriptionService.resumeSubscription(BUSINESS_ID, subscriptionId);
    expect((await machineSubscriptionRepository.findById(BUSINESS_ID, subscriptionId))?.status).toBe('active');

    await machineSubscriptionService.cancelSubscription(BUSINESS_ID, subscriptionId);
    expect((await machineSubscriptionRepository.findById(BUSINESS_ID, subscriptionId))?.status).toBe('cancelled');

    await expect(machineSubscriptionService.resumeSubscription(BUSINESS_ID, subscriptionId)).rejects.toThrow(IllegalSubscriptionTransitionError);
  });
});
