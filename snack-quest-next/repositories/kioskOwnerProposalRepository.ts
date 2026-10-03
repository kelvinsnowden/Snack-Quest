import 'server-only';

import { FieldValue } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase/admin';
import type { KioskExperiencePatch, KioskOwnerProposal } from '@/types';

const COLLECTION = 'kioskOwnerProposals';

export function kioskOwnerProposalId(businessId: string, partnerId: string): string {
  return `${businessId}_${partnerId}`;
}

/** `kioskOwnerProposals`, one per owner. Every read checks `businessId`. */
class KioskOwnerProposalRepository {
  async get(businessId: string, partnerId: string): Promise<KioskOwnerProposal | null> {
    const snapshot = await adminFirestore.collection(COLLECTION).doc(kioskOwnerProposalId(businessId, partnerId)).get();
    const data = snapshot.data() as KioskOwnerProposal | undefined;
    return data && data.businessId === businessId && data.partnerId === partnerId ? data : null;
  }

  async save(businessId: string, partnerId: string, patch: KioskExperiencePatch, submit: boolean, actor: string): Promise<void> {
    const now = FieldValue.serverTimestamp();
    await adminFirestore
      .collection(COLLECTION)
      .doc(kioskOwnerProposalId(businessId, partnerId))
      .set({
        businessId,
        partnerId,
        patch,
        status: submit ? 'submitted' : 'draft',
        updatedAt: now,
        updatedBy: actor,
        submittedAt: submit ? now : null,
        reviewedAt: null,
        reviewedBy: null,
        reviewNote: null,
        publishedVersionNumber: null,
      });
  }

  /** Marks a submitted proposal reviewed, in a transaction: two reviewers can't both act on it, and a proposal the owner changed since it was read is refused. */
  async review(businessId: string, partnerId: string, outcome: { status: 'declined' | 'accepted'; actor: string; note: string; publishedVersionNumber?: number }, expectUpdatedAtMillis?: number): Promise<void> {
    const ref = adminFirestore.collection(COLLECTION).doc(kioskOwnerProposalId(businessId, partnerId));
    await adminFirestore.runTransaction(async (tx) => {
      const snapshot = await tx.get(ref);
      const data = snapshot.data() as KioskOwnerProposal | undefined;
      if (!data || data.businessId !== businessId || data.status !== 'submitted') throw new Error('That proposal is no longer waiting for review.');
      if (expectUpdatedAtMillis !== undefined && data.updatedAt.toMillis() !== expectUpdatedAtMillis) throw new Error('The owner changed the proposal while it was being reviewed.');
      tx.update(ref, { status: outcome.status, reviewedAt: FieldValue.serverTimestamp(), reviewedBy: outcome.actor, reviewNote: outcome.note, publishedVersionNumber: outcome.publishedVersionNumber ?? null });
    });
  }

  /** Puts an accepted proposal back to submitted when publishing it failed, so it can be reviewed again — unless the owner has saved a newer one meanwhile. */
  async reopen(businessId: string, partnerId: string): Promise<void> {
    const ref = adminFirestore.collection(COLLECTION).doc(kioskOwnerProposalId(businessId, partnerId));
    await adminFirestore.runTransaction(async (tx) => {
      const data = (await tx.get(ref)).data() as KioskOwnerProposal | undefined;
      if (data?.status === 'accepted' && data.publishedVersionNumber === null) tx.update(ref, { status: 'submitted', reviewedAt: null, reviewedBy: null, reviewNote: null });
    });
  }

  async setPublishedVersion(businessId: string, partnerId: string, versionNumber: number): Promise<void> {
    await adminFirestore.collection(COLLECTION).doc(kioskOwnerProposalId(businessId, partnerId)).update({ publishedVersionNumber: versionNumber });
  }

  async listSubmitted(businessId: string): Promise<KioskOwnerProposal[]> {
    const snapshot = await adminFirestore.collection(COLLECTION).where('businessId', '==', businessId).where('status', '==', 'submitted').get();
    return snapshot.docs.map((doc) => doc.data() as KioskOwnerProposal);
  }
}

export const kioskOwnerProposalRepository = new KioskOwnerProposalRepository();
