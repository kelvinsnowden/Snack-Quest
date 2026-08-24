import type { Timestamp } from 'firebase/firestore';
import type { DeliveryDetails } from './delivery';
import type { GuaranteedPick } from './guaranteedPick';

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
 * checkout): the automated Fargo-pickup flow freezes it the instant
 * the customer replies YES to the order summary; the Nairobi
 * door-delivery flow freezes it only once a human agent has priced
 * the delivery fee — both paths converge on this same
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
  /**
   * How many of `packageId` this order is for. Optional because every
   * snapshot written before the website checkout existed omits it —
   * absent means 1, which is the only quantity a WhatsApp conversation
   * can produce. `subtotalKes` is already the extended (quantity ×
   * unit) amount either way; this is here so the order's line item and
   * the stock reservation know how many units to move.
   */
  quantity?: number;
  /**
   * The snacks the customer chose to be certain of (§ Premium: choose
   * 5, discover the rest). Frozen here alongside the price, and for
   * the same reason: this is what was promised at the moment of
   * purchase, and it must survive the snack being renamed or
   * deactivated afterwards.
   *
   * Absent on every fully-curated box and on every snapshot predating
   * the field, which is what "the whole box is a surprise" looks like
   * in the data.
   */
  guaranteedPicks?: GuaranteedPick[];
  customerName: string;
  /** Optional, website checkout only (§ optional email capture). Absent on every WhatsApp order and on every snapshot predating the field. */
  customerEmail?: string | null;
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
  /** Wallet credit auto-applied at freeze time (§ Phase 4: Customer loyalty / Quest system), capped at `subtotalKes - discountKes`. Debited from the customer's wallet only once the order actually completes — see `ConversationService.completeOrder()`. */
  walletCreditAppliedKes: number;
  deliveryFeeKes: number;
  totalKes: number;
  status: ConversationCheckoutSnapshotStatus;
  expiresAt: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
