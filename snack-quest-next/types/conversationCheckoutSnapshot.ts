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
  conversationId: string;
  customerId: string | null;
  packageId: string;
  packageLabel: string;
  customerName: string;
  county: string;
  deliveryMethod: 'door_delivery' | 'jumia_pickup';
  pickupStationId: string | null;
  addressText: string | null;
  referralCode: string | null;
  subtotalKes: number;
  discountKes: number;
  shippingKes: number;
  totalKes: number;
  status: ConversationCheckoutSnapshotStatus;
  expiresAt: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
