import 'server-only';

import { adminFirestore } from '@/lib/firebase/admin';
import type { NotificationTemplate } from '@/types';

/**
 * `notificationTemplates` reads/writes (§ Notification breadth,
 * PLATFORM_ARCHITECTURE_V2.md §10). `templateCode` is the doc ID
 * directly — templates are looked up by code on every send, never
 * listed/paginated in this pass, so there's no reason to mint a
 * separate auto-id and query by a `templateCode` field instead.
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

  /** § scripts/seedNotificationTemplates.mjs — idempotent by design, safe to re-run as the catalog grows. */
  async upsert(template: NotificationTemplate): Promise<void> {
    await adminFirestore.collection(COLLECTION).doc(template.templateCode).set(template);
  }
}

export const notificationTemplateRepository = new NotificationTemplateRepository();
