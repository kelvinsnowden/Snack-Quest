import 'server-only';

import { jumiaGateway } from '@/lib/integrations/jumia/jumiaGateway';
import type { CourierGateway } from '@/lib/integrations/types';

/**
 * The provider registry `DeliveryService` reads from — the whole
 * point of the redesign: adding a courier is an entry here (plus,
 * for an automated one, a `CourierGateway` implementation), never a
 * branch inside `DeliveryService` itself.
 *
 * `pricingMode: 'automatic'` means a real fee is computed and a real
 * shipment-creation HTTP call happens (Jumia today). `'manual'` means
 * a human prices and books the courier themselves — Bolt's real
 * workflow (dynamic, distance/traffic pricing with no merchant API
 * this codebase has credentials for), not a placeholder for one we
 * intend to automate later. A manual provider has no `gateway`: there
 * is nothing to call.
 */
export type DeliveryPricingMode = 'automatic' | 'manual';

export interface DeliveryProviderDefinition {
  provider: string;
  pricingMode: DeliveryPricingMode;
  gateway?: CourierGateway;
}

export const DELIVERY_PROVIDERS: Record<string, DeliveryProviderDefinition> = {
  jumia: {
    provider: 'jumia',
    pricingMode: 'automatic',
    gateway: jumiaGateway,
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
