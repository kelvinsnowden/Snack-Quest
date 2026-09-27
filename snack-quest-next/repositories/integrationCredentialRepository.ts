import 'server-only';

import { createHash, randomBytes } from 'node:crypto';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase/admin';
import { decryptSecret, encryptSecret } from '@/lib/secrets/secretCipher';
import type {
  IntegrationCredential,
  IntegrationCredentialKind,
  IssuedIntegrationCredential,
  MachineIntegrationEnvironment,
} from '@/types';

const COLLECTION = 'integrationCredentials';
const NONCES = 'integrationRequestNonces';

function isAlreadyExistsError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 6;
}

/** `integrationCredentials` + the request nonce ledger. Persistence only — `integrationCredentialService` owns issuing rules; `lib/vending/integrationAuth.ts` owns verification. */
class IntegrationCredentialRepository {
  async issue(input: {
    businessId: string;
    manufacturerId: string;
    kind: IntegrationCredentialKind;
    environment: MachineIntegrationEnvironment;
    label: string;
    issuedBy: string;
    expiresAt: Date | null;
  }): Promise<IssuedIntegrationCredential> {
    const envTag = input.environment === 'production' ? 'live' : 'test';
    const keyId = `sqk_${envTag}_${randomBytes(9).toString('base64url')}`;
    const secret = `sqs_${randomBytes(32).toString('base64url')}`;
    const now = Timestamp.now();
    await adminFirestore
      .collection(COLLECTION)
      .doc(keyId)
      .create({
        businessId: input.businessId,
        manufacturerId: input.manufacturerId,
        kind: input.kind,
        environment: input.environment,
        keyId,
        secretEncrypted: encryptSecret(secret),
        secretPrefix: secret.slice(0, 8),
        label: input.label,
        issuedAt: now,
        issuedBy: input.issuedBy,
        expiresAt: input.expiresAt ? Timestamp.fromDate(input.expiresAt) : null,
        revokedAt: null,
        revokedBy: null,
        revokedReason: null,
        lastUsedAt: null,
      });
    return { keyId, secret, kind: input.kind, environment: input.environment, issuedAt: now.toDate().toISOString() };
  }

  async findByKeyId(keyId: string): Promise<IntegrationCredential | null> {
    if (!/^sqk_(live|test)_[A-Za-z0-9_-]{8,32}$/.test(keyId)) {
      return null;
    }
    const snapshot = await adminFirestore.collection(COLLECTION).doc(keyId).get();
    return snapshot.exists ? (snapshot.data() as IntegrationCredential) : null;
  }

  /** Decrypts in memory for signature verification. Never logged, never returned from a route. */
  revealSecret(credential: IntegrationCredential): string {
    return decryptSecret(credential.secretEncrypted);
  }

  async listByManufacturer(businessId: string, manufacturerId: string): Promise<IntegrationCredential[]> {
    const snapshot = await adminFirestore
      .collection(COLLECTION)
      .where('businessId', '==', businessId)
      .where('manufacturerId', '==', manufacturerId)
      .get();
    return snapshot.docs
      .map((doc) => doc.data() as IntegrationCredential)
      .sort((a, b) => b.issuedAt.toMillis() - a.issuedAt.toMillis());
  }

  async revoke(businessId: string, keyId: string, revokedBy: string, reason: string): Promise<boolean> {
    const ref = adminFirestore.collection(COLLECTION).doc(keyId);
    const snapshot = await ref.get();
    const data = snapshot.data() as IntegrationCredential | undefined;
    if (!data || data.businessId !== businessId) {
      return false;
    }
    if (!data.revokedAt) {
      await ref.update({ revokedAt: FieldValue.serverTimestamp(), revokedBy, revokedReason: reason });
    }
    return true;
  }

  async recordUse(keyId: string): Promise<void> {
    await adminFirestore.collection(COLLECTION).doc(keyId).update({ lastUsedAt: FieldValue.serverTimestamp() });
  }

  /**
   * Replay protection: claims a (key, nonce) pair exactly once. A
   * captured request re-sent inside the timestamp window fails here.
   * `expiresAt` is set so a Firestore TTL policy on this collection can
   * reclaim claims once they are older than any timestamp we would
   * still accept.
   */
  async claimNonce(keyId: string, nonce: string, expiresAt: Date): Promise<boolean> {
    const id = createHash('sha256').update(`${keyId}\u0000${nonce}`).digest('hex');
    try {
      await adminFirestore.collection(NONCES).doc(id).create({ keyId, expiresAt: Timestamp.fromDate(expiresAt) });
      return true;
    } catch (error) {
      if (isAlreadyExistsError(error)) {
        return false;
      }
      throw error;
    }
  }
}

export const integrationCredentialRepository = new IntegrationCredentialRepository();
