import type { Timestamp } from 'firebase/firestore';

/**
 * `conversationCheckoutSnapshots/{snapshotId}` — a frozen, priced
 * snapshot taken the moment a conversation's selections are confirmed
 * and ready for payment (PLATFORM_ARCHITECTURE_V2.md §6). Replaces
 * what the deleted draft called `checkoutSessions`. `PaymentService`
 * verifies a Daraja callback against this snapshot's `totalKes`, never
 * against a value re-read from `packages` at callback time — a price
 * can change mid-conversation, and the customer paid the frozen price.
 */

export type ConversationCheckoutSnapshotStatus =
  | 'ready'
  | 'payment_pending'
  | 'completed'
  | 'abandoned'
  | 'expired';

export interface ConversationCheckoutSnapshot {
  businessId: string;
  conversationId: string;
  customerId: string | null;
  phoneNumber: string;
  packageId: string;
  packageLabel: string;
  customerName: string;
  county: string;
  deliveryMethod: 'door_delivery' | 'jumia_pickup';
  pickupStationId: string | null;
  /** Denormalized alongside the id so the order/admin view never needs a join back to `pickupStations`. */
  pickupStationName: string | null;
  /** Always 'Nairobi' today (§ business rule: Snack Quest ships only from Nairobi) — a string, not a boolean, so a second origin is a data change, not a migration. */
  shippingOrigin: string;
  addressText: string | null;
  referralCode: string | null;
  /** Resolved by `ReferralService.validateCode()` at freeze time — null if no code, or the code was invalid/expired. */
  referralLinkId: string | null;
  /** Frozen alongside the price, for the same reason the price is frozen — a commission rate change mid-conversation shouldn't change what was already promised. */
  referralOwnerId: string | null;
  referralCommissionKes: number;
  subtotalKes: number;
  discountKes: number;
  shippingKes: number;
  totalKes: number;
  status: ConversationCheckoutSnapshotStatus;
  expiresAt: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
