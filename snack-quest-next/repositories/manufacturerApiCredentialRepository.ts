import 'server-only';

import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase/admin';
import type { MachineIntegrationEnvironment, ManufacturerApiCredential, ManufacturerApiCredentialVersion } from '@/types';

const COLLECTION = 'manufacturerApiCredentials';

export const manufacturerApiCredentialDocId = (manufacturerId: string, environment: MachineIntegrationEnvironment) => `${manufacturerId}__${environment}`;

export class ManufacturerApiCredentialNotFoundError extends Error {
  constructor(manufacturerId: string, environment: string) {
    super(`No API credential is configured for manufacturer ${manufacturerId} in ${environment}`);
    this.name = 'ManufacturerApiCredentialNotFoundError';
  }
}

type NewVersion = Omit<ManufacturerApiCredentialVersion, 'setAt'>;

class ManufacturerApiCredentialRepository {
  private ref(manufacturerId: string, environment: MachineIntegrationEnvironment) {
    return adminFirestore.collection(COLLECTION).doc(manufacturerApiCredentialDocId(manufacturerId, environment));
  }

  async find(businessId: string, manufacturerId: string, environment: MachineIntegrationEnvironment): Promise<ManufacturerApiCredential | null> {
    const snapshot = await this.ref(manufacturerId, environment).get();
    const data = snapshot.data() as ManufacturerApiCredential | undefined;
    return data && data.businessId === businessId ? data : null;
  }

  async listForManufacturer(businessId: string, manufacturerId: string): Promise<ManufacturerApiCredential[]> {
    const snapshots = await adminFirestore.getAll(this.ref(manufacturerId, 'sandbox'), this.ref(manufacturerId, 'production'));
    return snapshots.map((snapshot) => snapshot.data() as ManufacturerApiCredential | undefined).filter((data): data is ManufacturerApiCredential => Boolean(data && data.businessId === businessId));
  }

  /**
   * Sets the base URL and, if given, a new key. With a key and an
   * existing current version this is a rotation: the current version
   * becomes `previous`. Transactional, so two concurrent rotations can't
   * both keep the same previous.
   */
  async put(
    businessId: string,
    manufacturerId: string,
    environment: MachineIntegrationEnvironment,
    input: { baseUrl: string; version: Omit<NewVersion, 'version'> | null },
    actor: string,
  ): Promise<ManufacturerApiCredential> {
    const ref = this.ref(manufacturerId, environment);
    return adminFirestore.runTransaction(async (tx) => {
      const snapshot = await tx.get(ref);
      const existing = snapshot.data() as ManufacturerApiCredential | undefined;
      if (existing && existing.businessId !== businessId) {
        throw new ManufacturerApiCredentialNotFoundError(manufacturerId, environment);
      }
      const now = Timestamp.now();
      const nextVersion = (existing?.current?.version ?? existing?.previous?.version ?? 0) + 1;
      const current = input.version ? { ...input.version, version: nextVersion, setAt: now } : existing?.current ?? null;
      const previous = input.version && existing?.current ? { ...existing.current, retiredAt: now } : existing?.previous ?? null;
      const next = {
        businessId,
        manufacturerId,
        environment,
        baseUrl: input.baseUrl,
        status: current ? 'active' : existing?.status ?? 'active',
        current,
        previous,
        revokedAt: current ? null : existing?.revokedAt ?? null,
        revokedBy: current ? null : existing?.revokedBy ?? null,
        revokedReason: current ? null : existing?.revokedReason ?? null,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
        updatedBy: actor,
      };
      tx.set(ref, next);
      return next as unknown as ManufacturerApiCredential;
    });
  }

  /** Puts `previous` back as current — for a rotation that turned out wrong. The failed version is discarded, not kept. */
  async rollBack(businessId: string, manufacturerId: string, environment: MachineIntegrationEnvironment, actor: string): Promise<void> {
    const ref = this.ref(manufacturerId, environment);
    await adminFirestore.runTransaction(async (tx) => {
      const existing = (await tx.get(ref)).data() as ManufacturerApiCredential | undefined;
      if (!existing || existing.businessId !== businessId || !existing.previous) {
        throw new ManufacturerApiCredentialNotFoundError(manufacturerId, environment);
      }
      const restored: ManufacturerApiCredentialVersion = { version: existing.previous.version, secretEncrypted: existing.previous.secretEncrypted, fingerprint: existing.previous.fingerprint, setAt: existing.previous.setAt, setBy: existing.previous.setBy };
      tx.update(ref, { current: restored, previous: null, status: 'active', updatedAt: FieldValue.serverTimestamp(), updatedBy: actor });
    });
  }

  /** Deletes every stored secret version. The record stays, as the audit trail's anchor. */
  async revoke(businessId: string, manufacturerId: string, environment: MachineIntegrationEnvironment, reason: string, actor: string): Promise<void> {
    const ref = this.ref(manufacturerId, environment);
    await adminFirestore.runTransaction(async (tx) => {
      const existing = (await tx.get(ref)).data() as ManufacturerApiCredential | undefined;
      if (!existing || existing.businessId !== businessId) {
        throw new ManufacturerApiCredentialNotFoundError(manufacturerId, environment);
      }
      tx.update(ref, { status: 'revoked', current: null, previous: null, revokedAt: FieldValue.serverTimestamp(), revokedBy: actor, revokedReason: reason, updatedAt: FieldValue.serverTimestamp(), updatedBy: actor });
    });
  }
}

export const manufacturerApiCredentialRepository = new ManufacturerApiCredentialRepository();
