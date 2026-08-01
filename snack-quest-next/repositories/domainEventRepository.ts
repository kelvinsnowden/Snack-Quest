import 'server-only';

import { adminFirestore } from '@/lib/firebase/admin';
import type { DomainEvent } from '@/types';

const COLLECTION = 'domainEvents';

/**
 * The curated set of `DomainEvent.type` values that represent a real
 * failure worth surfacing on the Operations dashboard (§ Phase 5) —
 * not every published event is a failure (`ConversationStarted`,
 * `ReferralClicked`, etc. are ordinary lifecycle events). Grown
 * alongside whichever `publishEvent(...)` call sites actually exist;
 * see `lib/events/eventBus.ts`'s own doc comment for why this log
 * exists at all (no real Cloud Functions trigger infrastructure yet).
 */
export const FAILURE_EVENT_TYPES = [
  'ShipmentCreationFailed',
  'AgentAssignmentSyncFailed',
  'ConversationStatusSyncFailed',
  'ReferralAwardFailed',
  'WalletRedemptionFailed',
  'WalletMilestoneAwardFailed',
  'ConversionDispatchFailed',
  'ProductCatalogSyncFailed',
  'RefundFailed',
  'RefundOrderStatusSyncFailed',
  'WithdrawalFailed',
] as const;

const FAILURE_TYPE_SET = new Set<string>(FAILURE_EVENT_TYPES);

class DomainEventRepository {
  /**
   * Recent failure-flavored events for a business, newest first — an
   * in-memory filter over a `businessId`-scoped scan (same discipline
   * as `pickupStationRepository.search()`'s own precedent) rather than
   * a composite index per failure type, since the failure-type set
   * changes as new event types are added and this is a low-frequency
   * admin read, not a request-path query.
   */
  async listRecentFailures(businessId: string, limit = 50): Promise<{ id: string; data: DomainEvent }[]> {
    const snapshot = await adminFirestore
      .collection(COLLECTION)
      .where('businessId', '==', businessId)
      .orderBy('occurredAt', 'desc')
      .limit(500)
      .get();

    const failures = snapshot.docs
      .map((doc) => ({ id: doc.id, data: doc.data() as DomainEvent }))
      .filter((event) => FAILURE_TYPE_SET.has(event.data.type));

    return failures.slice(0, limit);
  }
}

export const domainEventRepository = new DomainEventRepository();
