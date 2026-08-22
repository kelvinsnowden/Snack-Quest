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
 * No provider is automatic today. Jumia was, against an API this
 * codebase never had verified credentials for, and it went with the
 * Jumia integration. Fargo Courier is booked by taking parcels to a
 * branch and recording the waybill number, so it is genuinely manual —
 * and a flat rate needs no call to price. The `automatic` branch and
 * the `CourierGateway` seam are kept because they are the documented
 * extension point, not because anything uses them right now.
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
  bolt: {
    provider: 'bolt',
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
