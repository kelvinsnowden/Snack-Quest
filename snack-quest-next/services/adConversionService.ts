import 'server-only';

import { metaConversionGateway } from '@/lib/integrations/meta/metaConversionGateway';
import { publishEvent } from '@/lib/events/eventBus';

/**
 * Dispatches ad-attribution events (PLATFORM_ARCHITECTURE_V2.md §11).
 * Only `Purchase` is wired — it's the one event a real completed order
 * actually produces today. `InitiateCheckout`/`ViewContent` depend on
 * browser-side Pixel capture and session continuity that don't exist
 * yet (no landing page, no session tracking) — not built until those do.
 */
class AdConversionService {
  async dispatchPurchase(input: {
    orderId: string;
    phoneNumber: string;
    amountKes: number;
  }): Promise<void> {
    try {
      await metaConversionGateway.sendEvent({
        eventName: 'Purchase',
        params: { currency: 'KES', value: input.amountKes },
        advancedMatching: { phone: input.phoneNumber },
      });
      await publishEvent('ConversionDispatched', 'order', input.orderId, {
        eventName: 'Purchase',
      });
    } catch (error) {
      await publishEvent('ConversionDispatchFailed', 'order', input.orderId, {
        eventName: 'Purchase',
        reason: error instanceof Error ? error.message : 'unknown error',
      });
    }
  }
}

export const adConversionService = new AdConversionService();
