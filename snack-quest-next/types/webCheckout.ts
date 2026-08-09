import type { DeliveryMethod } from './delivery';
import type { OrderPaymentStatus } from './whatchimpBridge';

/**
 * The wire contract between the website checkout UI and
 * `POST /api/checkout/web` (§ Website Becomes the Primary Commerce
 * Channel). Deliberately carries no money: the client sends *what the
 * customer chose*, never what it thinks that costs. Every price on the
 * response is computed server-side from `packages` and
 * `pickupStations` at request time, so a tampered client can only ever
 * order the wrong thing, never at the wrong price.
 */

export interface WebCheckoutRequest {
  packageId: string;
  quantity: number;
  customerName: string;
  /** Any Kenyan form — `0712…`, `+254712…`, `254712…`. Normalized server-side. */
  phone: string;
  county: string;
  deliveryMethod: DeliveryMethod;
  /** Required when `deliveryMethod` is `'pickup'` — which Jumia station to ship to. */
  pickupStationId?: string;
  /** Required when `deliveryMethod` is `'door'`. Collected so the Bolt rider can be dispatched over WhatsApp after payment. */
  addressText?: string;
  estate?: string;
  landmark?: string;
  /** Optional alternate number for the rider to call, when it differs from the paying number. */
  contactPhone?: string;
  referralCode?: string;
}

/**
 * What the customer is actually about to be charged, itemized. The
 * checkout UI renders this rather than any figure it computed itself.
 *
 * For `'door'`, `deliveryFeeKes` is always 0 and `boltArrangedSeparately`
 * is true: Bolt's fare is dynamic, is quoted per-trip over WhatsApp
 * after payment, and is paid by the customer directly to the rider —
 * charging a guessed figure here would be charging for a service at a
 * price nobody has quoted yet.
 */
export interface WebCheckoutPricing {
  packageLabel: string;
  quantity: number;
  unitPriceKes: number;
  subtotalKes: number;
  discountKes: number;
  walletCreditAppliedKes: number;
  deliveryFeeKes: number;
  totalKes: number;
  boltArrangedSeparately: boolean;
}

export interface WebCheckoutResponse {
  /** The `conversations/{id}` this checkout runs on — the same session id the status poll takes. */
  checkoutSessionId: string;
  pricing: WebCheckoutPricing;
  /** True once the STK push has actually been accepted by Daraja and the customer's handset should be prompting. */
  stkPushSent: boolean;
  /** The normalized number the STK prompt went to, so the payment screen can name it without re-deriving it. */
  payingPhone: string;
}

/**
 * The payment screen's poll response. `paymentStatus` reuses the exact
 * values `ConversationService.getOrderStatus` already produces for the
 * WhatsApp bridge — one definition of "what state is this payment in",
 * not a second one for the web.
 */
export interface WebCheckoutStatusResponse {
  checkoutSessionId: string;
  paymentStatus: OrderPaymentStatus;
  orderId: string | null;
  totalKes: number | null;
  /** Set once an order exists — drives the success page's "Arrange Bolt Delivery on WhatsApp" call to action. */
  deliveryMethod: DeliveryMethod | null;
  customerName: string | null;
  packageLabel: string | null;
}
