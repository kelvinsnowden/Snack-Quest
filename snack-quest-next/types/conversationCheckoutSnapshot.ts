import type { Timestamp } from 'firebase/firestore';
import type { DeliveryDetails } from './delivery';

/**
 * `conversationCheckoutSnapshots/{snapshotId}` — a frozen, priced
 * snapshot taken the moment a conversation's selections are confirmed
 * and ready for payment (PLATFORM_ARCHITECTURE_V2.md §6). Replaces
 * what the deleted draft called `checkoutSessions`. `PaymentService`
 * verifies a Daraja callback against this snapshot's `totalKes`, never
 * against a value re-read from `packages` at callback time — a price
 * can change mid-conversation, and the customer paid the frozen price.
 *
 * Created from exactly two paths (redesign: multi-delivery-method
 * checkout): the automated Jumia-pickup flow freezes it the instant
 * the customer replies YES to the order summary; the Nairobi
 * door-delivery flow freezes it only once a human agent has priced
 * the (dynamic, Bolt) delivery fee — both paths converge on this same
 * shape, `delivery` carrying whichever method/provider applies.
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
  delivery: DeliveryDetails;
  referralCode: string | null;
  /** Resolved by `ReferralService.validateCode()` at freeze time — null if no code, or the code was invalid/expired. */
  referralLinkId: string | null;
  /** Frozen alongside the price, for the same reason the price is frozen — a commission rate change mid-conversation shouldn't change what was already promised. */
  referralOwnerId: string | null;
  referralCommissionKes: number;
  subtotalKes: number;
  discountKes: number;
  deliveryFeeKes: number;
  totalKes: number;
  status: ConversationCheckoutSnapshotStatus;
  expiresAt: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
