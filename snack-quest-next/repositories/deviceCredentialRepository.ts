import 'server-only';

import { randomBytes, createHash } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase/admin';
import type { DeviceCredential, IssuedDeviceCredential } from '@/types';

const COLLECTION = 'deviceCredentials';
const SECRET_BYTES = 32;
const PREFIX_LENGTH = 8;

/** SHA-256 hex digest — the same one-way hashing `investorInterestService` already uses, never reversible. */
export function hashDeviceSecret(secret: string): string {
  return createHash('sha256').update(secret).digest('hex');
}

/**
 * `deviceCredentials` reads/writes (§ DEVICE SECURITY). Persistence
 * only — `machineService.provisionDevice()`/`revokeDeviceCredential()`
 * own the business rules; this generates the actual secret, because
 * generation and hashing belong next to each other, not split across
 * a Service that would otherwise have to import a crypto primitive
 * itself.
 */
class DeviceCredentialRepository {
  /**
   * Issues a brand-new credential for a machine, returning the
   * plaintext secret exactly once. Nothing else in this repository
   * can ever produce that value again — only `secretHash` is
   * persisted.
   */
  async issue(input: {
    businessId: string;
    machineId: string;
    issuedBy: string;
  }): Promise<IssuedDeviceCredential> {
    const secret = randomBytes(SECRET_BYTES).toString('hex');
    const now = FieldValue.serverTimestamp();
    const ref = await adminFirestore.collection(COLLECTION).add({
      businessId: input.businessId,
      machineId: input.machineId,
      secretHash: hashDeviceSecret(secret),
      secretPrefix: secret.slice(0, PREFIX_LENGTH),
      issuedAt: now,
      issuedBy: input.issuedBy,
      revokedAt: null,
      revokedBy: null,
      revokedReason: null,
      lastUsedAt: null,
    } satisfies Omit<DeviceCredential, 'issuedAt'> & { issuedAt: FieldValue });

    return {
      credentialId: ref.id,
      machineId: input.machineId,
      secret,
      issuedAt: new Date().toISOString(),
    };
  }

  /**
   * Every credential ever issued to a machine — active or revoked —
   * for the audit list (§ auditability). Never returns a secret,
   * because none is stored.
   */
  async listByMachine(
    businessId: string,
    machineId: string,
  ): Promise<{ id: string; data: DeviceCredential }[]> {
    const snapshot = await adminFirestore
      .collection(COLLECTION)
      .where('businessId', '==', businessId)
      .where('machineId', '==', machineId)
      .orderBy('issuedAt', 'desc')
      .get();
    return snapshot.docs.map((doc) => ({ id: doc.id, data: doc.data() as DeviceCredential }));
  }

  /**
   * The currently-active credential(s) for a machine — normally one,
   * but a rotation briefly overlaps an old credential with a new one
   * rather than leaving the machine unable to authenticate at all
   * between issuing the new secret and the device picking it up.
   */
  async listActiveByMachine(
    businessId: string,
    machineId: string,
  ): Promise<{ id: string; data: DeviceCredential }[]> {
    const snapshot = await adminFirestore
      .collection(COLLECTION)
      .where('businessId', '==', businessId)
      .where('machineId', '==', machineId)
      .where('revokedAt', '==', null)
      .get();
    return snapshot.docs.map((doc) => ({ id: doc.id, data: doc.data() as DeviceCredential }));
  }

  /**
   * Every active credential, across every machine — an admin/audit
   * listing, never the authentication path itself. Authenticating one
   * request uses `listActiveByMachine` instead, scoped to the single
   * machine the bearer token already claims to be
   * (`<machineId>:<secret>`, see `lib/vending/deviceAuth.ts`) — bounded
   * to that machine's one or two active credentials rather than a
   * fleet-wide scan on every request.
   */
  async listAllActive(businessId: string): Promise<{ id: string; data: DeviceCredential }[]> {
    const snapshot = await adminFirestore
      .collection(COLLECTION)
      .where('businessId', '==', businessId)
      .where('revokedAt', '==', null)
      .get();
    return snapshot.docs.map((doc) => ({ id: doc.id, data: doc.data() as DeviceCredential }));
  }

  async findById(businessId: string, credentialId: string): Promise<DeviceCredential | null> {
    const snapshot = await adminFirestore.collection(COLLECTION).doc(credentialId).get();
    if (!snapshot.exists) {
      return null;
    }
    const data = snapshot.data() as DeviceCredential;
    return data.businessId === businessId ? data : null;
  }

  async recordUse(credentialId: string): Promise<void> {
    await adminFirestore.collection(COLLECTION).doc(credentialId).update({
      lastUsedAt: FieldValue.serverTimestamp(),
    });
  }

  async revoke(
    businessId: string,
    credentialId: string,
    revokedBy: string,
    reason: string,
  ): Promise<void> {
    const ref = adminFirestore.collection(COLLECTION).doc(credentialId);
    const snapshot = await ref.get();
    const data = snapshot.data() as DeviceCredential | undefined;
    if (!data || data.businessId !== businessId) {
      return;
    }
    await ref.update({
      revokedAt: FieldValue.serverTimestamp(),
      revokedBy,
      revokedReason: reason,
    });
  }
}

export const deviceCredentialRepository = new DeviceCredentialRepository();
