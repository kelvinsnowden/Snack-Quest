import type { Timestamp } from 'firebase/firestore';

/**
 * The machine screen in the field (§ KIOSK SERVICE MODE, § KIOSK
 * OBSERVABILITY, § KIOSK ANALYTICS).
 */

/**
 * `machineServiceCodes` — a one-time code a technician types on the
 * machine's screen to open service mode. Only a salted hash is stored; the
 * code itself is shown once, to the person who issued it.
 */
export interface MachineServiceCode {
  businessId: string;
  machineId: string;
  codeHash: string;
  salt: string;
  reason: string;
  status: 'issued' | 'used' | 'superseded';
  issuedBy: string;
  issuedAt: Timestamp;
  expiresAt: Timestamp;
  usedAt: Timestamp | null;
}

/** `machineServiceAttempts/{machineId}` — wrong codes typed recently, for the lockout. */
export interface MachineServiceAttempts {
  businessId: string;
  windowStart: Timestamp;
  failures: number;
}

/** What the screen counts between reports. Counts only — nothing about who the customer is. */
export const KIOSK_METRICS = [
  'session_started',
  'product_viewed',
  'added_to_cart',
  'checkout_started',
  'payment_requested',
  'order_succeeded',
  'order_failed',
  'cart_abandoned',
  'service_opened',
  'content_activated',
  'ad_media_rejected',
] as const;
export type KioskMetric = (typeof KIOSK_METRICS)[number];

export const KIOSK_METRIC_LABEL: Record<KioskMetric, string> = {
  session_started: 'Customers who started browsing',
  product_viewed: 'Snacks opened',
  added_to_cart: 'Added to an order',
  checkout_started: 'Went to pay',
  payment_requested: 'Sent an M-Pesa request',
  order_succeeded: 'Orders fully dispensed',
  order_failed: 'Orders with a problem',
  cart_abandoned: 'Orders left behind',
  service_opened: 'Service mode opened',
  content_activated: 'New screen content applied',
  ad_media_rejected: 'Ad files refused (checksum mismatch)',
};

/** `kioskDailyStats/{businessId}_{date}_{machineId}` — one machine's screen activity for a Nairobi day. */
export type KioskDailyStat = { businessId: string; machineId: string; date: string; updatedAt: Timestamp } & Partial<Record<KioskMetric, number>>;

/** `kioskDeviceStates/{machineId}` — what the screen last said about itself. */
export interface KioskDeviceState {
  businessId: string;
  machineId: string;
  packageVersion: string | null;
  catalogVersion: string | null;
  runtimeState: string | null;
  pendingAdEvents: number;
  cachedCreatives: number;
  reportedAt: Timestamp;
}
