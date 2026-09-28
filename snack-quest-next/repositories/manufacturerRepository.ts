import 'server-only';

import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase/admin';
import type { Manufacturer, ManufacturerOnboardingStage, ManufacturerStatus } from '@/types';

const COLLECTION = 'manufacturers';

export class ManufacturerNotFoundError extends Error {
  constructor(manufacturerId: string) {
    super(`Manufacturer ${manufacturerId} not found`);
    this.name = 'ManufacturerNotFoundError';
  }
}

export type ManufacturerInput = Omit<Manufacturer, 'createdAt' | 'updatedAt' | 'updatedBy' | 'deletedAt' | 'stageHistory' | 'onboardingStage' | 'status'>;

export type ManufacturerUpdate = Partial<Pick<Manufacturer, 'name' | 'integrationType' | 'defaultAdapterKey' | 'apiVersion' | 'documentationUrl' | 'supportContact' | 'notes'>>;

/** `manufacturers` reads/writes. Persistence only — `manufacturerRegistryService` owns the onboarding rules. */
const webhookOutcomeWrites = new Map<string, number>();

class ManufacturerRepository {
  async create(input: ManufacturerInput): Promise<string> {
    const now = FieldValue.serverTimestamp();
    const ref = await adminFirestore.collection(COLLECTION).add({
      ...input,
      status: 'active' satisfies ManufacturerStatus,
      onboardingStage: 'application' satisfies ManufacturerOnboardingStage,
      // serverTimestamp() isn't allowed inside arrays — the stage entry
      // takes the write's own wall-clock time instead.
      stageHistory: [{ stage: 'application', at: Timestamp.now(), by: input.createdBy }],
      createdAt: now,
      updatedAt: now,
      updatedBy: input.createdBy,
      deletedAt: null,
    });
    return ref.id;
  }

  async findById(businessId: string, manufacturerId: string): Promise<Manufacturer | null> {
    const snapshot = await adminFirestore.collection(COLLECTION).doc(manufacturerId).get();
    if (!snapshot.exists) {
      return null;
    }
    const data = snapshot.data() as Manufacturer;
    return data.businessId === businessId ? data : null;
  }

  async findBySlug(businessId: string, slug: string): Promise<{ id: string; data: Manufacturer } | null> {
    const snapshot = await adminFirestore
      .collection(COLLECTION)
      .where('businessId', '==', businessId)
      .where('slug', '==', slug)
      .limit(1)
      .get();
    return snapshot.empty ? null : { id: snapshot.docs[0].id, data: snapshot.docs[0].data() as Manufacturer };
  }

  /**
   * Records how an authenticated webhook delivery went. At most one write
   * per manufacturer and outcome per minute from each server, so a flood
   * of deliveries can't turn into a flood of writes.
   */
  async noteWebhookOutcome(manufacturerId: string, outcome: 'accepted' | 'rejected', code: string | null = null, now = Date.now()): Promise<void> {
    const throttleKey = `${manufacturerId}:${outcome}`;
    if ((webhookOutcomeWrites.get(throttleKey) ?? 0) > now - 60_000) {
      return;
    }
    webhookOutcomeWrites.set(throttleKey, now);
    const update = outcome === 'accepted'
      ? { 'webhookHealth.lastAcceptedAt': Timestamp.fromMillis(now) }
      : { 'webhookHealth.lastRejectedAt': Timestamp.fromMillis(now), 'webhookHealth.lastRejectedCode': code };
    await adminFirestore.collection(COLLECTION).doc(manufacturerId).update(update).catch(() => undefined);
  }

  async listByBusiness(businessId: string): Promise<{ id: string; data: Manufacturer }[]> {
    const snapshot = await adminFirestore.collection(COLLECTION).where('businessId', '==', businessId).get();
    return snapshot.docs
      .map((doc) => ({ id: doc.id, data: doc.data() as Manufacturer }))
      .sort((a, b) => a.data.name.localeCompare(b.data.name));
  }

  async update(businessId: string, manufacturerId: string, update: ManufacturerUpdate, actor: string): Promise<void> {
    const ref = await this.requireRef(businessId, manufacturerId);
    await ref.update({ ...update, updatedAt: FieldValue.serverTimestamp(), updatedBy: actor });
  }

  async setStage(businessId: string, manufacturerId: string, stage: ManufacturerOnboardingStage, actor: string): Promise<void> {
    const ref = await this.requireRef(businessId, manufacturerId);
    await ref.update({
      onboardingStage: stage,
      stageHistory: FieldValue.arrayUnion({ stage, at: Timestamp.now(), by: actor }),
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: actor,
    });
  }

  async setStatus(businessId: string, manufacturerId: string, status: ManufacturerStatus, actor: string): Promise<void> {
    const ref = await this.requireRef(businessId, manufacturerId);
    await ref.update({ status, updatedAt: FieldValue.serverTimestamp(), updatedBy: actor });
  }

  private async requireRef(businessId: string, manufacturerId: string) {
    const ref = adminFirestore.collection(COLLECTION).doc(manufacturerId);
    const snapshot = await ref.get();
    if (!snapshot.exists || (snapshot.data() as Manufacturer).businessId !== businessId) {
      throw new ManufacturerNotFoundError(manufacturerId);
    }
    return ref;
  }
}

export const manufacturerRepository = new ManufacturerRepository();
