import 'server-only';

import { adminFirestore } from '@/lib/firebase/admin';
import type { NotificationTemplate } from '@/types';

/**
 * `notificationTemplates` reads/writes (§ Notification breadth,
 * PLATFORM_ARCHITECTURE_V2.md §10). `templateCode` is the doc ID
 * directly — templates are looked up by code on every send, so
 * there's no reason to mint a separate auto-id and query by a
 * `templateCode` field instead. `listAll()` backs § Admin:
 * Notification Templates — the catalog is small and platform-wide (no
 * `businessId`), so an unpaginated full-collection read is correct at
 * this scale, same discipline as `featureFlagService`'s own small,
 * unpaginated catalog reads.
 */

const COLLECTION = 'notificationTemplates';

class NotificationTemplateRepository {
  async findByCode(templateCode: string): Promise<NotificationTemplate | null> {
    const snapshot = await adminFirestore.collection(COLLECTION).doc(templateCode).get();
    if (!snapshot.exists) {
      return null;
    }
    return snapshot.data() as NotificationTemplate;
  }

  async listAll(): Promise<NotificationTemplate[]> {
    const snapshot = await adminFirestore.collection(COLLECTION).get();
    return snapshot.docs.map((doc) => doc.data() as NotificationTemplate);
  }

  /** § scripts/seedNotificationTemplates.mjs — idempotent by design, safe to re-run as the catalog grows. */
  async upsert(template: NotificationTemplate): Promise<void> {
    await adminFirestore.collection(COLLECTION).doc(template.templateCode).set(template);
  }

  /** § Admin: Notification Templates — a super admin's content edit; merges onto the existing doc rather than a full `set()` so `requiredParams`/`channel` (not editable in the UI) survive untouched. */
  async update(templateCode: string, partial: Partial<NotificationTemplate>): Promise<void> {
    await adminFirestore.collection(COLLECTION).doc(templateCode).update(partial);
  }
}

export const notificationTemplateRepository = new NotificationTemplateRepository();
