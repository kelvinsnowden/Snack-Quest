import 'server-only';

import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase/admin';
import type { CertificationCheckKey, CertificationCheckResult, MachineModel, ModelCertificationStatus } from '@/types';

const COLLECTION = 'machineModels';

export class MachineModelNotFoundError extends Error {
  constructor(modelId: string) {
    super(`Machine model ${modelId} not found`);
    this.name = 'MachineModelNotFoundError';
  }
}

export type MachineModelInput = Pick<
  MachineModel,
  'businessId' | 'manufacturerId' | 'name' | 'slug' | 'adapterKey' | 'declaredCapabilities' | 'slotCount' | 'slotIdFormat' | 'notes' | 'createdBy'
>;

export type MachineModelUpdate = Partial<Pick<MachineModel, 'name' | 'adapterKey' | 'declaredCapabilities' | 'slotCount' | 'slotIdFormat' | 'notes'>>;

/** `machineModels` reads/writes. Persistence only — `manufacturerRegistryService` owns certification rules. */
class MachineModelRepository {
  async create(input: MachineModelInput): Promise<string> {
    const now = FieldValue.serverTimestamp();
    const ref = await adminFirestore.collection(COLLECTION).add({
      ...input,
      certificationStatus: 'not_started' satisfies ModelCertificationStatus,
      certificationChecklist: {},
      certifiedAt: null,
      certifiedBy: null,
      revokedReason: null,
      createdAt: now,
      updatedAt: now,
      updatedBy: input.createdBy,
      deletedAt: null,
    });
    return ref.id;
  }

  async findById(businessId: string, modelId: string): Promise<MachineModel | null> {
    const snapshot = await adminFirestore.collection(COLLECTION).doc(modelId).get();
    if (!snapshot.exists) {
      return null;
    }
    const data = snapshot.data() as MachineModel;
    return data.businessId === businessId ? data : null;
  }

  async listByManufacturer(businessId: string, manufacturerId: string): Promise<{ id: string; data: MachineModel }[]> {
    const snapshot = await adminFirestore
      .collection(COLLECTION)
      .where('businessId', '==', businessId)
      .where('manufacturerId', '==', manufacturerId)
      .get();
    return snapshot.docs
      .map((doc) => ({ id: doc.id, data: doc.data() as MachineModel }))
      .sort((a, b) => a.data.name.localeCompare(b.data.name));
  }

  async listByBusiness(businessId: string): Promise<{ id: string; data: MachineModel }[]> {
    const snapshot = await adminFirestore.collection(COLLECTION).where('businessId', '==', businessId).get();
    return snapshot.docs.map((doc) => ({ id: doc.id, data: doc.data() as MachineModel }));
  }

  async update(businessId: string, modelId: string, update: MachineModelUpdate & Partial<Pick<MachineModel, 'certificationStatus' | 'revokedReason' | 'revokedAt'>>, actor: string): Promise<void> {
    const ref = await this.requireRef(businessId, modelId);
    await ref.update({ ...update, updatedAt: FieldValue.serverTimestamp(), updatedBy: actor });
  }

  async recordCheck(
    businessId: string,
    modelId: string,
    key: CertificationCheckKey,
    result: Omit<CertificationCheckResult, 'verifiedAt'>,
    certificationStatus: ModelCertificationStatus,
  ): Promise<void> {
    const ref = await this.requireRef(businessId, modelId);
    await ref.update({
      [`certificationChecklist.${key}`]: { ...result, verifiedAt: Timestamp.now() },
      certificationStatus,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: result.verifiedBy,
    });
  }

  async markCertified(businessId: string, modelId: string, actor: string): Promise<void> {
    const ref = await this.requireRef(businessId, modelId);
    await ref.update({
      certificationStatus: 'certified' satisfies ModelCertificationStatus,
      certifiedAt: FieldValue.serverTimestamp(),
      certifiedBy: actor,
      revokedReason: null,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: actor,
    });
  }

  private async requireRef(businessId: string, modelId: string) {
    const ref = adminFirestore.collection(COLLECTION).doc(modelId);
    const snapshot = await ref.get();
    if (!snapshot.exists || (snapshot.data() as MachineModel).businessId !== businessId) {
      throw new MachineModelNotFoundError(modelId);
    }
    return ref;
  }
}

export const machineModelRepository = new MachineModelRepository();
