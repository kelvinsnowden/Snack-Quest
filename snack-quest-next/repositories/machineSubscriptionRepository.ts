import 'server-only';

import { FieldValue } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase/admin';
import { MACHINE_SUBSCRIPTION_STATUS_TRANSITIONS, type MachineSubscription, type MachineSubscriptionStatus } from '@/types';

const COLLECTION = 'machineSubscriptions';

export type MachineSubscriptionInput = Omit<MachineSubscription, 'createdAt' | 'updatedAt'>;

export class MachineSubscriptionNotFoundError extends Error {
  constructor(subscriptionId: string) {
    super(`Machine subscription ${subscriptionId} not found`);
    this.name = 'MachineSubscriptionNotFoundError';
  }
}

export class IllegalSubscriptionTransitionError extends Error {
  constructor(from: MachineSubscriptionStatus, to: MachineSubscriptionStatus) {
    super(`Cannot move a machine subscription from "${from}" to "${to}"`);
    this.name = 'IllegalSubscriptionTransitionError';
  }
}

/** `machineSubscriptions` reads/writes (§ SUBSCRIPTION). */
class MachineSubscriptionRepository {
  async create(input: MachineSubscriptionInput): Promise<string> {
    const now = FieldValue.serverTimestamp();
    const ref = await adminFirestore.collection(COLLECTION).add({ ...input, createdAt: now, updatedAt: now });
    return ref.id;
  }

  async findById(businessId: string, subscriptionId: string): Promise<MachineSubscription | null> {
    const snapshot = await adminFirestore.collection(COLLECTION).doc(subscriptionId).get();
    if (!snapshot.exists) {
      return null;
    }
    const data = snapshot.data() as MachineSubscription;
    return data.businessId === businessId ? data : null;
  }

  /** A machine has at most one non-cancelled subscription at a time — `machineSubscriptionService.createSubscription` enforces that before ever calling `create`. */
  async findActiveForMachine(businessId: string, machineId: string): Promise<{ id: string; data: MachineSubscription } | null> {
    const snapshot = await adminFirestore
      .collection(COLLECTION)
      .where('businessId', '==', businessId)
      .where('machineId', '==', machineId)
      .where('status', 'in', ['active', 'paused', 'in_arrears'])
      .limit(1)
      .get();
    return snapshot.empty ? null : { id: snapshot.docs[0].id, data: snapshot.docs[0].data() as MachineSubscription };
  }

  async listByPartner(businessId: string, partnerId: string): Promise<{ id: string; data: MachineSubscription }[]> {
    const snapshot = await adminFirestore
      .collection(COLLECTION)
      .where('businessId', '==', businessId)
      .where('partnerId', '==', partnerId)
      .get();
    return snapshot.docs.map((doc) => ({ id: doc.id, data: doc.data() as MachineSubscription }));
  }

  /** Every subscription whose current period ended before `before` and hasn't been marked paid — the arrears sweep's own read. */
  async listPastDuePeriods(businessId: string, before: Date): Promise<{ id: string; data: MachineSubscription }[]> {
    const snapshot = await adminFirestore
      .collection(COLLECTION)
      .where('businessId', '==', businessId)
      .where('status', 'in', ['active', 'in_arrears'])
      .where('currentPeriodEnd', '<', before)
      .get();
    return snapshot.docs.map((doc) => ({ id: doc.id, data: doc.data() as MachineSubscription }));
  }

  async moveStatus(businessId: string, subscriptionId: string, to: MachineSubscriptionStatus): Promise<void> {
    const ref = adminFirestore.collection(COLLECTION).doc(subscriptionId);
    const snapshot = await ref.get();
    const data = snapshot.data() as MachineSubscription | undefined;
    if (!data || data.businessId !== businessId) {
      throw new MachineSubscriptionNotFoundError(subscriptionId);
    }
    const allowed = MACHINE_SUBSCRIPTION_STATUS_TRANSITIONS[data.status] ?? [];
    if (!allowed.includes(to)) {
      throw new IllegalSubscriptionTransitionError(data.status, to);
    }
    await ref.update({ status: to, updatedAt: FieldValue.serverTimestamp() });
  }

  /** Records a period payment and rolls the period window forward — the one write path that touches `lastPaymentStatus`/`lastPaidAt`/`currentPeriodStart`/`currentPeriodEnd`/`renewalDate`/`arrearsKes`/`graceUntil` together, so they can never disagree. */
  async recordPeriodOutcome(
    businessId: string,
    subscriptionId: string,
    fields: Pick<MachineSubscription, 'lastPaymentStatus' | 'lastPaidAt' | 'currentPeriodStart' | 'currentPeriodEnd' | 'renewalDate' | 'arrearsKes' | 'graceUntil' | 'status'>,
  ): Promise<void> {
    const ref = adminFirestore.collection(COLLECTION).doc(subscriptionId);
    const snapshot = await ref.get();
    const data = snapshot.data() as MachineSubscription | undefined;
    if (!data || data.businessId !== businessId) {
      throw new MachineSubscriptionNotFoundError(subscriptionId);
    }
    await ref.update({ ...fields, updatedAt: FieldValue.serverTimestamp() });
  }
}

export const machineSubscriptionRepository = new MachineSubscriptionRepository();
