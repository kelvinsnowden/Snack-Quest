import 'server-only';

import { FieldValue } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase/admin';
import type { ConversationEventType } from '@/types';

const COLLECTION = 'domainEvents';

/**
 * Durably records a domain event (PLATFORM_ARCHITECTURE_V2.md §14).
 * No consumer wiring yet — Cloud Functions triggers are §19/§20 future
 * work — but every event a Service fires lands here now, so nothing is
 * silently dropped while that trigger infrastructure doesn't exist.
 */
export async function publishEvent(
  businessId: string,
  type: ConversationEventType | string,
  aggregateType: string,
  aggregateId: string,
  payload: Record<string, unknown> = {},
): Promise<void> {
  await adminFirestore.collection(COLLECTION).add({
    businessId,
    type,
    aggregateType,
    aggregateId,
    payload,
    occurredAt: FieldValue.serverTimestamp(),
  });
}
