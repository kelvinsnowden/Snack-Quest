import 'server-only';

import { createHash, randomBytes } from 'node:crypto';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase/admin';
import { decryptSecret, encryptSecret } from '@/lib/secrets/secretCipher';
import { secretFingerprint } from '@/lib/vending/credentialLifecycle';
import type {
  IntegrationCredential,
  IntegrationCredentialKind,
  IntegrationCredentialScope,
  IssuedIntegrationCredential,
  MachineIntegrationEnvironment,
} from '@/types';

const COLLECTION = 'integrationCredentials';
const NONCES = 'integrationRequestNonces';

export const KEY_ID_PATTERN = /^sqk_(live|test)_[A-Za-z0-9_-]{8,32}$/;

function isAlreadyExistsError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 6;
}

export class CredentialRotationConflictError extends Error {
  constructor(keyId: string, reason: string) {
    super(`Credential ${keyId} cannot be rotated: ${reason}`);
    this.name = 'CredentialRotationConflictError';
  }
}

interface IssueInput {
  businessId: string;
  manufacturerId: string;
  kind: IntegrationCredentialKind;
  environment: MachineIntegrationEnvironment;
  /** Defaults to manufacturer-wide. */
  scope?: IntegrationCredentialScope;
  label: string;
  issuedBy: string;
  expiresAt: Date | null;
  rateLimitPerMinute?: number | null;
}

function newKeyMaterial(environment: MachineIntegrationEnvironment): { keyId: string; secret: string } {
  const envTag = environment === 'production' ? 'live' : 'test';
  return { keyId: `sqk_${envTag}_${randomBytes(12).toString('base64url')}`, secret: `sqs_${randomBytes(32).toString('base64url')}` };
}

function newDocument(input: IssueInput, keyId: string, secret: string, now: Timestamp, rotatedFrom: string | null) {
  return {
    businessId: input.businessId,
    manufacturerId: input.manufacturerId,
    kind: input.kind,
    environment: input.environment,
    scope: input.scope ?? { type: 'manufacturer' },
    keyId,
    secretEncrypted: encryptSecret(secret),
    secretFingerprint: secretFingerprint(secret),
    label: input.label,
    issuedAt: now,
    issuedBy: input.issuedBy,
    expiresAt: input.expiresAt ? Timestamp.fromDate(input.expiresAt) : null,
    revokedAt: null,
    revokedBy: null,
    revokedReason: null,
    lastUsedAt: null,
    firstUsedAt: null,
    supersededBy: null,
    supersededAt: null,
    graceEndsAt: null,
    rotatedFrom,
    rateLimitPerMinute: input.rateLimitPerMinute ?? null,
  };
}

/** `integrationCredentials` + the request nonce ledger. Persistence only — `integrationCredentialService` owns issuing rules; `lib/vending/integrationAuth.ts` owns verification. */
class IntegrationCredentialRepository {
  async issue(input: IssueInput): Promise<IssuedIntegrationCredential> {
    const { keyId, secret } = newKeyMaterial(input.environment);
    const now = Timestamp.now();
    await adminFirestore.collection(COLLECTION).doc(keyId).create(newDocument(input, keyId, secret, now, null));
    return {
      keyId,
      secret,
      kind: input.kind,
      environment: input.environment,
      scope: input.scope ?? { type: 'manufacturer' },
      secretFingerprint: secretFingerprint(secret),
      issuedAt: now.toDate().toISOString(),
    };
  }

  /**
   * Issues a successor with the same kind, environment, scope and label,
   * and marks this key superseded — atomically, so there is never a
   * moment with two "current" keys and no record of which replaced
   * which. The old key keeps authenticating until `graceEndsAt`.
   */
  async rotate(businessId: string, keyId: string, graceEndsAt: Date, rotatedBy: string): Promise<IssuedIntegrationCredential> {
    const oldRef = adminFirestore.collection(COLLECTION).doc(keyId);
    const now = Timestamp.now();
    return adminFirestore.runTransaction(async (tx) => {
      const snapshot = await tx.get(oldRef);
      const old = snapshot.data() as IntegrationCredential | undefined;
      if (!old || old.businessId !== businessId) {
        throw new CredentialRotationConflictError(keyId, 'not found');
      }
      if (old.revokedAt) {
        throw new CredentialRotationConflictError(keyId, 'it has been revoked');
      }
      if (old.supersededBy) {
        throw new CredentialRotationConflictError(keyId, `it was already rotated to ${old.supersededBy}`);
      }
      if (old.expiresAt && old.expiresAt.toMillis() <= now.toMillis()) {
        throw new CredentialRotationConflictError(keyId, 'it has expired');
      }
      const { keyId: newKeyId, secret } = newKeyMaterial(old.environment);
      const input: IssueInput = {
        businessId,
        manufacturerId: old.manufacturerId,
        kind: old.kind,
        environment: old.environment,
        scope: old.scope ?? { type: 'manufacturer' },
        label: old.label,
        issuedBy: rotatedBy,
        expiresAt: null,
        rateLimitPerMinute: old.rateLimitPerMinute ?? null,
      };
      tx.create(adminFirestore.collection(COLLECTION).doc(newKeyId), newDocument(input, newKeyId, secret, now, keyId));
      tx.update(oldRef, { supersededBy: newKeyId, supersededAt: now, graceEndsAt: Timestamp.fromDate(graceEndsAt) });
      return {
        keyId: newKeyId,
        secret,
        kind: input.kind,
        environment: input.environment,
        scope: input.scope ?? { type: 'manufacturer' },
        secretFingerprint: secretFingerprint(secret),
        issuedAt: now.toDate().toISOString(),
        rotatedFrom: keyId,
        previousKeyGraceEndsAt: graceEndsAt.toISOString(),
      };
    });
  }

  async findByKeyId(keyId: string): Promise<IntegrationCredential | null> {
    if (!KEY_ID_PATTERN.test(keyId)) {
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

  /** Called at most once a minute per credential per instance (see `shouldRecordUse`). `firstUsedAt` is written once, ever. */
  async recordUse(keyId: string, firstUse: boolean): Promise<void> {
    await adminFirestore
      .collection(COLLECTION)
      .doc(keyId)
      .update({ lastUsedAt: FieldValue.serverTimestamp(), ...(firstUse ? { firstUsedAt: FieldValue.serverTimestamp() } : {}) });
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
