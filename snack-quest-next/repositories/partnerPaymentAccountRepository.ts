import 'server-only';

import { FieldValue } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase/admin';
import { decryptSecret, encryptSecret } from '@/lib/secrets/secretCipher';
import type { PartnerPaymentAccount } from '@/types';

const COLLECTION = 'partnerPaymentAccounts';
const SECRET_FIELDS = ['consumerKey', 'consumerSecret', 'passkey'] as const;

export type PartnerPaymentAccountInput = Omit<PartnerPaymentAccount, 'createdAt' | 'updatedAt'>;

function decrypt(data: PartnerPaymentAccount): PartnerPaymentAccount {
  const decrypted = { ...data, machineIds: data.machineIds ?? [] };
  for (const field of SECRET_FIELDS) decrypted[field] = decryptSecret(data[field]);
  return decrypted;
}

function encrypt<T extends Partial<Pick<PartnerPaymentAccount, (typeof SECRET_FIELDS)[number]>>>(input: T): T {
  const encrypted = { ...input };
  for (const field of SECRET_FIELDS) if (typeof input[field] === 'string') encrypted[field] = encryptSecret(input[field]!);
  return encrypted;
}

/** `partnerPaymentAccounts` — owners' own M-Pesa tills. Keys are encrypted on the way in and decrypted on the way out. */
class PartnerPaymentAccountRepository {
  async find(businessId: string, accountId: string): Promise<PartnerPaymentAccount | null> {
    const data = (await adminFirestore.collection(COLLECTION).doc(accountId).get()).data() as PartnerPaymentAccount | undefined;
    return data && data.businessId === businessId ? decrypt(data) : null;
  }

  /** One owner's tills, oldest first. Equality filters only, so no composite index. */
  async listByPartner(businessId: string, partnerId: string): Promise<{ id: string; data: PartnerPaymentAccount }[]> {
    const snapshot = await adminFirestore.collection(COLLECTION).where('businessId', '==', businessId).where('partnerId', '==', partnerId).get();
    return snapshot.docs
      .map((doc) => ({ id: doc.id, data: decrypt(doc.data() as PartnerPaymentAccount) }))
      .sort((a, b) => (a.data.connectedAtMs ?? a.data.lastCheckedAtMs) - (b.data.connectedAtMs ?? b.data.lastCheckedAtMs));
  }

  /** The till a machine's sales go to, if its owner chose one. */
  async findForMachine(businessId: string, partnerId: string, machineId: string): Promise<{ id: string; data: PartnerPaymentAccount } | null> {
    return (await this.listByPartner(businessId, partnerId)).find(({ data }) => data.machineIds.includes(machineId)) ?? null;
  }

  async create(input: PartnerPaymentAccountInput): Promise<string> {
    const now = FieldValue.serverTimestamp();
    const ref = await adminFirestore.collection(COLLECTION).add({ ...encrypt(input), createdAt: now, updatedAt: now });
    return ref.id;
  }

  /** Saves new details and the result of checking them. Which machines use the till is left as it is. */
  async update(accountId: string, input: Omit<PartnerPaymentAccountInput, 'businessId' | 'partnerId' | 'machineIds'>): Promise<void> {
    await adminFirestore.collection(COLLECTION).doc(accountId).update({ ...encrypt(input), updatedAt: FieldValue.serverTimestamp() });
  }

  /** Records a failed check without touching the keys — its machines stop using it until a check passes again. */
  async markFailed(accountId: string, lastError: string, lastErrorDetail: string | null, nowMs: number): Promise<void> {
    await adminFirestore.collection(COLLECTION).doc(accountId).update({ status: 'failed', lastError, lastErrorDetail, lastCheckedAtMs: nowMs, updatedAt: FieldValue.serverTimestamp() });
  }

  /**
   * Points one machine's sales at one of the owner's tills, or at none
   * (`accountId` null: Snack Quest's account), taking it off any other
   * till in the same transaction so a machine is never in two.
   */
  async assignMachine(businessId: string, partnerId: string, machineId: string, accountId: string | null): Promise<boolean> {
    const query = adminFirestore.collection(COLLECTION).where('businessId', '==', businessId).where('partnerId', '==', partnerId);
    return adminFirestore.runTransaction(async (tx) => {
      const docs = (await tx.get(query)).docs;
      if (accountId !== null && !docs.some((doc) => doc.id === accountId)) return false;
      for (const doc of docs) {
        const machineIds = ((doc.data() as PartnerPaymentAccount).machineIds ?? []).filter((id) => id !== machineId);
        if (doc.id === accountId) machineIds.push(machineId);
        tx.update(doc.ref, { machineIds, updatedAt: FieldValue.serverTimestamp() });
      }
      return true;
    });
  }

  /** Disconnecting removes the keys entirely; its machines go back to Snack Quest's account. */
  async delete(businessId: string, partnerId: string, accountId: string): Promise<boolean> {
    const ref = adminFirestore.collection(COLLECTION).doc(accountId);
    return adminFirestore.runTransaction(async (tx) => {
      const data = (await tx.get(ref)).data() as PartnerPaymentAccount | undefined;
      if (!data || data.businessId !== businessId || data.partnerId !== partnerId) return false;
      tx.delete(ref);
      return true;
    });
  }
}

export const partnerPaymentAccountRepository = new PartnerPaymentAccountRepository();
export { PartnerPaymentAccountRepository };
