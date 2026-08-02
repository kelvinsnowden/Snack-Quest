/**
 * Request/response contracts for `POST /api/checkout/start` and
 * `POST /api/checkout/pay` (§ Product Catalog checkout hand-off).
 * Pure API I/O shapes, not Firestore documents — deliberately not
 * exported through `types/index.ts`'s domain-type barrel.
 *
 * There is no separate `checkoutSessions` Firestore collection: "the
 * conversation IS the checkout" (see `types/conversation.ts`) already
 * holds for this platform, so `checkoutSessionId` in this API *is*
 * `conversationId` under a name an external caller (Whatchimp) doesn't
 * need to know is conversation-shaped.
 */

export interface CheckoutStartRequest {
  /** The WhatsApp Cloud API phone_number_id the selection came in on — same tenant-resolution signal the message webhook already uses. */
  phoneNumberId: string;
  customerPhone: string;
  /** The Snack Quest OS package id — the same identifier synced to the Product Catalog as its retailer_id (§ product identifier consistency). */
  productId: string;
  /** Always 1 today — no multi-item cart exists in this codebase. */
  quantity?: number;
  referralCode?: string | null;
  /** Maps to StartOptions.referralLinkId when the click came from a creator's own link. */
  creatorAttributionId?: string | null;
}

export interface CheckoutStartResponse {
  checkoutSessionId: string;
  nextStep: string;
  product: { id: string; name: string; priceKes: number };
  /** Exactly what was just sent to the customer over WhatsApp — for Whatchimp's own logging/UI, not something it needs to re-render. */
  message: string;
}

export interface CheckoutPayRequest {
  checkoutSessionId: string;
}

export type CheckoutPayStatus = 'stk_sent' | 'price_changed' | 'error';

export interface CheckoutPayResponse {
  status: CheckoutPayStatus;
  message: string;
}
