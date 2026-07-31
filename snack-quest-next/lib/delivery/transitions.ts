import type { ShipmentStatus } from '@/types';

/**
 * Admin: Delivery monitoring status actions (§ Admin: Delivery
 * monitoring). `pending_manual_booking -> created` is the manual-
 * booking queue's real action (an agent booked the courier
 * themselves and records the reference here). Every other transition
 * is a manual status override — the only way a shipment reaches
 * `delivered` at all right now, since no courier tracking webhook is
 * wired up yet (§ Logistics: wire tracking webhook consumption).
 */
export const VALID_SHIPMENT_TRANSITIONS: Record<ShipmentStatus, ShipmentStatus[]> = {
  pending: ['in_transit', 'delivered', 'failed'],
  pending_manual_booking: ['created', 'failed'],
  created: ['in_transit', 'delivered', 'failed'],
  in_transit: ['delivered', 'failed'],
  delivered: [],
  failed: [],
};

export const SHIPMENT_STATUS_LABELS: Record<ShipmentStatus, string> = {
  pending: 'Pending',
  pending_manual_booking: 'Awaiting manual booking',
  created: 'Booked',
  in_transit: 'In transit',
  delivered: 'Delivered',
  failed: 'Failed',
};
