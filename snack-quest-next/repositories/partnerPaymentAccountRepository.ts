import 'server-only';

import { FieldValue } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase/admin';
import { decryptSecret, encryptSecret } from '@/lib/secrets/secretCipher';
import type { PartnerPaymentAccount } from '@/types';

const COLLECTION = 'partnerPaymentAccounts';
const SECRET_FIELDS = ['consumerKey', 'consumerSecret', 'passkey'] as const;

export type PartnerPaymentAccountInput = Omit<PartnerPaymentAccount, 'createdAt' | 'updatedAt'>;

/** `partnerPaymentAccounts` — an owner's own M-Pesa account. Keys are encrypted on the way in and decrypted on the way out. */
class PartnerPaymentAccountRepository {
  async find(businessId: string, partnerId: string): Promise<PartnerPaymentAccount | null> {
    const data = (await adminFirestore.collection(COLLECTION).doc(partnerId).get()).data() as PartnerPaymentAccount | undefined;
    if (!data || data.businessId !== businessId) return null;
    const decrypted = { ...data };
    for (const field of SECRET_FIELDS) decrypted[field] = decryptSecret(data[field]);
    return decrypted;
  }

  async save(input: PartnerPaymentAccountInput): Promise<void> {
    const ref = adminFirestore.collection(COLLECTION).doc(input.partnerId);
    const encrypted = { ...input };
    for (const field of SECRET_FIELDS) encrypted[field] = encryptSecret(input[field]);
    const now = FieldValue.serverTimestamp();
    await adminFirestore.runTransaction(async (tx) => {
      const existing = await tx.get(ref);
      tx.set(ref, { ...encrypted, updatedAt: now, ...(existing.exists ? {} : { createdAt: now }) }, { merge: true });
    });
  }

  /** Records a failed check without touching the keys — sales stop using the account until a check passes again. */
  async markFailed(partnerId: string, lastError: string, lastErrorDetail: string | null, nowMs: number): Promise<void> {
    await adminFirestore.collection(COLLECTION).doc(partnerId).update({ status: 'failed', lastError, lastErrorDetail, lastCheckedAtMs: nowMs, updatedAt: FieldValue.serverTimestamp() });
  }

  /** Disconnecting removes the keys entirely rather than keeping them switched off. */
  async delete(businessId: string, partnerId: string): Promise<boolean> {
    const ref = adminFirestore.collection(COLLECTION).doc(partnerId);
    return adminFirestore.runTransaction(async (tx) => {
      const data = (await tx.get(ref)).data() as PartnerPaymentAccount | undefined;
      if (!data || data.businessId !== businessId) return false;
      tx.delete(ref);
      return true;
    });
  }
}

export const partnerPaymentAccountRepository = new PartnerPaymentAccountRepository();
export { PartnerPaymentAccountRepository };
