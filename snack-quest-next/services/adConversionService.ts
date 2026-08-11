import 'server-only';

import { metaConversionGateway } from '@/lib/integrations/meta/metaConversionGateway';
import { tiktokConversionGateway } from '@/lib/integrations/tiktok/tiktokConversionGateway';
import { publishEvent } from '@/lib/events/eventBus';
import type { ConversionAttribution } from '@/types';

/**
 * Dispatches ad-attribution events (PLATFORM_ARCHITECTURE_V2.md §11).
 * Only `Purchase`/`CompletePayment` is wired — it's the one event a
 * real completed order actually produces today.
 *
 * `attribution` is `Conversation.attributionSnapshot`, threaded all
 * the way from `startWebCheckout` (§ close the loop: ad-conversion
 * attribution) — its presence, not the caller's say-so, is what
 * decides both platforms' behavior:
 *   - Meta always fires, but reports `action_source: 'website'` with
 *     the checkout URL when `attribution` is present, `'chat'`
 *     otherwise — an order that started on the website and gets
 *     reported as a chat conversion breaks Meta's ability to
 *     correlate it with the browser session that actually saw the ad.
 *   - TikTok only ever fires when `attribution` is present — a native
 *     WhatsApp message can't have come from a TikTok ad click, so
 *     there is nothing honest to report otherwise.
 *
 * Each platform dispatches and fails independently: a Meta outage
 * must never suppress a real TikTok event, or vice versa.
 */
class AdConversionService {
  async dispatchPurchase(input: {
    businessId: string;
    orderId: string;
    phoneNumber: string;
    amountKes: number;
    attribution: ConversionAttribution | null;
  }): Promise<void> {
    const eventSourceUrl = input.attribution?.landingUrl;

    try {
      await metaConversionGateway.sendEvent({
        businessId: input.businessId,
        eventName: 'Purchase',
        params: { currency: 'KES', value: input.amountKes },
        advancedMatching: { phone: input.phoneNumber },
        actionSource: input.attribution ? 'website' : 'chat',
        eventSourceUrl,
      });
      await publishEvent(input.businessId, 'ConversionDispatched', 'order', input.orderId, {
        eventName: 'Purchase',
        provider: 'meta',
      });
    } catch (error) {
      await publishEvent(input.businessId, 'ConversionDispatchFailed', 'order', input.orderId, {
        eventName: 'Purchase',
        provider: 'meta',
        reason: error instanceof Error ? error.message : 'unknown error',
      });
    }

    if (!input.attribution) {
      return;
    }

    try {
      await tiktokConversionGateway.sendEvent({
        businessId: input.businessId,
        eventName: 'CompletePayment',
        params: { currency: 'KES', value: input.amountKes },
        advancedMatching: { phone: input.phoneNumber },
        eventSourceUrl,
        clickId: input.attribution.ttclid,
      });
      await publishEvent(input.businessId, 'ConversionDispatched', 'order', input.orderId, {
        eventName: 'CompletePayment',
        provider: 'tiktok',
      });
    } catch (error) {
      await publishEvent(input.businessId, 'ConversionDispatchFailed', 'order', input.orderId, {
        eventName: 'CompletePayment',
        provider: 'tiktok',
        reason: error instanceof Error ? error.message : 'unknown error',
      });
    }
  }
}

export const adConversionService = new AdConversionService();
