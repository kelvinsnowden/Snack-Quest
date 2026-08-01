import type { ShipmentStatus } from '@/types';

/**
 * Maps Jumia's raw tracking-webhook `status` string to this
 * codebase's own `ShipmentStatus` (§ Logistics: wire tracking webhook
 * consumption). Same honest caveat as `jumiaGateway.ts` itself: Jumia's
 * real API/webhook status vocabulary has never been verified against
 * real credentials, so this is a best-effort mapping of plausible
 * courier-tracking status strings, not a confirmed spec. `null` means
 * "a real status update was received and is recorded in
 * `Shipment.trackingEvents`, but it doesn't map to a known transition"
 * — never guessed, never silently dropped.
 *
 * `out_for_delivery`/`returned`/`cancelled` fold into the nearest
 * `ShipmentStatus` this codebase actually has (`in_transit`/`failed`)
 * rather than inventing new statuses here — see
 * `PLATFORM_ARCHITECTURE_V2.md` §12's note on this divergence from the
 * originally-drafted, richer status enum.
 */
const STATUS_MAP: Record<string, ShipmentStatus> = {
  in_transit: 'in_transit',
  out_for_delivery: 'in_transit',
  picked_up: 'in_transit',
  delivered: 'delivered',
  failed: 'failed',
  delivery_failed: 'failed',
  returned: 'failed',
  cancelled: 'failed',
};

export function mapJumiaStatusToShipmentStatus(rawStatus: string): ShipmentStatus | null {
  return STATUS_MAP[rawStatus.trim().toLowerCase()] ?? null;
}
