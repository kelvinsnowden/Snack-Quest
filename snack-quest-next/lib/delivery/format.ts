import type { DeliveryDetails } from '@/types';

/**
 * The one place a `DeliveryDetails` object becomes a human-readable
 * line — used by admin notifications, the order's stored address
 * label, and anywhere else that previously had its own ad hoc
 * ternary. Pure, no I/O, so it's usable from both the state machine's
 * message builders and the Services.
 */
export function formatDeliveryLabel(delivery: DeliveryDetails): string {
  if (delivery.method === 'pickup') {
    return delivery.pickupStationName
      ? `${delivery.pickupStationName}, ${delivery.county} (Jumia pickup)`
      : `${delivery.county} — Jumia pickup station`;
  }
  const parts = [delivery.addressText, delivery.estate, delivery.landmark].filter(Boolean);
  return `${parts.join(', ')} (door delivery, ${delivery.county})`;
}
