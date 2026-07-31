import 'server-only';

import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase/admin';
import type { ConversationCheckoutSnapshot, ConversationCheckoutSnapshotStatus } from '@/types';

const COLLECTION = 'conversationCheckoutSnapshots';
const SNAPSHOT_TTL_MINUTES = 30;

export type ConversationCheckoutSnapshotInput = Omit<
  ConversationCheckoutSnapshot,
  'status' | 'expiresAt' | 'createdAt' | 'updatedAt'
>;

class ConversationCheckoutSnapshotRepository {
  async create(input: ConversationCheckoutSnapshotInput): Promise<string> {
    const now = FieldValue.serverTimestamp();
    const expiresAt = Timestamp.fromMillis(
      Date.now() + SNAPSHOT_TTL_MINUTES * 60 * 1000,
    );
    const ref = await adminFirestore.collection(COLLECTION).add({
      ...input,
      status: 'ready',
      expiresAt,
      createdAt: now,
      updatedAt: now,
    });
    return ref.id;
  }

  async findById(snapshotId: string): Promise<ConversationCheckoutSnapshot | null> {
    const snapshot = await adminFirestore.collection(COLLECTION).doc(snapshotId).get();
    if (!snapshot.exists) {
      return null;
    }
    return snapshot.data() as ConversationCheckoutSnapshot;
  }

  async updateStatus(
    snapshotId: string,
    status: ConversationCheckoutSnapshotStatus,
  ): Promise<void> {
    await adminFirestore.collection(COLLECTION).doc(snapshotId).update({
      status,
      updatedAt: FieldValue.serverTimestamp(),
    });
  }
}

export const conversationCheckoutSnapshotRepository =
  new ConversationCheckoutSnapshotRepository();
