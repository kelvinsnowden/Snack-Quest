import 'server-only';

import type { CourierGateway } from '@/lib/integrations/types';

/**
 * The provider registry `DeliveryService` reads from — the whole
 * point of the redesign: adding a courier is an entry here (plus,
 * for an automated one, a `CourierGateway` implementation), never a
 * branch inside `DeliveryService` itself.
 *
 * `pricingMode: 'automatic'` means a real fee is computed and a real
 * shipment-creation HTTP call happens. `'manual'` means a human books
 * the courier themselves — not a placeholder for something we intend
 * to automate later. A manual provider has no `gateway`: there is
 * nothing to call.
 *
 * Fargo is the only provider, and it is manual: parcels are taken to a
 * branch and the waybill number recorded, so there is nothing to call.
 * Bolt was here until Fargo took over door delivery — it was removed
 * once the last two orders referencing it were deleted, since a
 * provider definition only has to survive as long as an order that
 * names it.
 *
 * The `automatic` branch and the `CourierGateway` seam stay because
 * they are the documented extension point, not because anything uses
 * them right now.
 */
export type DeliveryPricingMode = 'automatic' | 'manual';

export interface DeliveryProviderDefinition {
  provider: string;
  pricingMode: DeliveryPricingMode;
  gateway?: CourierGateway;
}

export const DELIVERY_PROVIDERS: Record<string, DeliveryProviderDefinition> = {
  fargo: {
    provider: 'fargo',
    pricingMode: 'manual',
  },
};

export function getDeliveryProviderDefinition(provider: string): DeliveryProviderDefinition {
  const definition = DELIVERY_PROVIDERS[provider];
  if (!definition) {
    throw new Error(`Unknown delivery provider: ${provider}`);
  }
  return definition;
}
