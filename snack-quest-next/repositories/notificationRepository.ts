import 'server-only';

import { FieldValue } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase/admin';
import type { Notification } from '@/types';

/**
 * `notifications` reads/writes — the in-app feed
 * (PLATFORM_ARCHITECTURE_V2.md §10, TDD §8). `firestore.rules`
 * already lets a recipient self-update the `read` field directly
 * (server-write-only for everything else), so `markRead` here exists
 * for parity with every other write in this codebase going through a
 * Repository/Service, not because the client path is blocked.
 *
 * No inbox UI is built in this pass — § Notification breadth's scope
 * is breadth of *channels* (email/SMS) and the retry/catalog
 * infrastructure behind them, not a notification-center screen; this
 * Repository is real, tested, and ready for that UI whenever it's
 * built.
 */

const COLLECTION = 'notifications';

export type NotificationInput = Omit<Notification, 'createdAt' | 'read'>;

class NotificationRepository {
  async create(input: NotificationInput): Promise<string> {
    const ref = await adminFirestore.collection(COLLECTION).add({
      ...input,
      read: false,
      createdAt: FieldValue.serverTimestamp(),
    });
    return ref.id;
  }

  async listForRecipient(
    recipientId: string,
    options: { limit?: number } = {},
  ): Promise<{ id: string; data: Notification }[]> {
    const snapshot = await adminFirestore
      .collection(COLLECTION)
      .where('recipientId', '==', recipientId)
      .orderBy('createdAt', 'desc')
      .limit(options.limit ?? 25)
      .get();

    return snapshot.docs.map((doc) => ({ id: doc.id, data: doc.data() as Notification }));
  }

  async markRead(id: string, recipientId: string): Promise<void> {
    const ref = adminFirestore.collection(COLLECTION).doc(id);
    const snapshot = await ref.get();
    if (!snapshot.exists || (snapshot.data() as Notification).recipientId !== recipientId) {
      return;
    }
    await ref.update({ read: true });
  }
}

export const notificationRepository = new NotificationRepository();
