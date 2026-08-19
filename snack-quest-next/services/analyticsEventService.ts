import 'server-only';

import { analyticsEventRepository } from '@/repositories/analyticsEventRepository';
import { RESCUE_OFFER_EVENTS } from '@/lib/analytics/rescueOfferEvents';
import { FUNNEL_EVENTS } from '@/lib/analytics/funnelEvents';

/**
 * Records one named funnel event (§ exit-intent rescue offer, extended
 * § Mission 2 — funnel analytics) — sibling to `PageViewService`, same
 * "low-stakes vanity metric, not money" validation bar. The allowlist
 * exists so a hostile or buggy client can't fill the collection with
 * arbitrary event names; it grows by adding a constant to one of the
 * event modules below, never by accepting free-form names.
 */

const KNOWN_EVENTS: readonly string[] = [
  ...Object.values(RESCUE_OFFER_EVENTS),
  ...Object.values(FUNNEL_EVENTS),
];
const MAX_METADATA_ENTRIES = 10;
const MAX_METADATA_VALUE_LENGTH = 200;

export class AnalyticsEventValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AnalyticsEventValidationError';
  }
}

export interface RecordAnalyticsEventInput {
  event: string;
  visitorId: string | null;
  metadata?: Record<string, string | number | boolean> | null;
}

class AnalyticsEventService {
  async record(businessId: string, input: RecordAnalyticsEventInput): Promise<void> {
    if (!KNOWN_EVENTS.includes(input.event)) {
      throw new AnalyticsEventValidationError(`"${input.event}" is not a recognised analytics event.`);
    }

    const metadata = this.sanitizeMetadata(input.metadata);

    await analyticsEventRepository.create({
      businessId,
      event: input.event,
      visitorId: input.visitorId || null,
      metadata,
    });
  }

  private sanitizeMetadata(
    metadata: Record<string, string | number | boolean> | null | undefined,
  ): Record<string, string | number | boolean> | null {
    if (!metadata) {
      return null;
    }
    const entries = Object.entries(metadata).slice(0, MAX_METADATA_ENTRIES);
    const sanitized: Record<string, string | number | boolean> = {};
    for (const [key, value] of entries) {
      if (typeof value === 'string') {
        sanitized[key] = value.slice(0, MAX_METADATA_VALUE_LENGTH);
      } else if (typeof value === 'number' && Number.isFinite(value)) {
        sanitized[key] = value;
      } else if (typeof value === 'boolean') {
        sanitized[key] = value;
      }
    }
    return Object.keys(sanitized).length > 0 ? sanitized : null;
  }
}

export const analyticsEventService = new AnalyticsEventService();
