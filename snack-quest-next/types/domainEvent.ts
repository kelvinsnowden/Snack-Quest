import type { Timestamp } from 'firebase/firestore';

/**
 * `domainEvents/{eventId}` — a durable log of the events named in
 * PLATFORM_ARCHITECTURE_V2.md §14's Event Catalog. Cloud Functions
 * (not yet scaffolded — tracked in §19/§20) will eventually trigger
 * off Firestore writes to the collections these events describe;
 * until then, this log is the honest, real substitute: every event a
 * Service fires is durably recorded here, so nothing is silently lost
 * while the real trigger-based event bus doesn't exist yet, and
 * consumers can be added by querying this collection before Functions
 * exist to push to them automatically.
 */

export type ConversationEventType =
  | 'ConversationStarted'
  | 'CustomerIdentified'
  | 'ReferralClicked'
  | 'ConversationCheckoutSnapshotCreated'
  | 'ConversationCheckoutSnapshotExpired'
  | 'HumanTakeoverRequested';

export interface DomainEvent<TPayload = Record<string, unknown>> {
  businessId: string;
  type: ConversationEventType | string;
  aggregateType: string;
  aggregateId: string;
  payload: TPayload;
  occurredAt: Timestamp;
}
