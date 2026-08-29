import type { FargoServiceLevel } from '@/lib/delivery/deliveryPricing';
import type { StkFailureCategory } from '@/lib/payments/stkFailureReason';
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
  /**
   * More than one box, each with its own quantity (§ more than one box
   * per order). Ids and counts only — like every other field here it
   * says *what* the customer chose, and the server re-reads the
   * catalogue for the price.
   *
   * `packageId`/`quantity` above stay required and stay authoritative
   * when this is absent, so an older client, the WhatsApp path and
   * every existing test keep working unchanged.
   */
  items?: {
    packageId: string;
    quantity: number;
    /**
     * The snacks chosen for *this* box (§ Premium: choose 5, discover
     * the rest). On the line rather than at the top of the order,
     * because two pick-offering boxes need two sets of picks and one
     * list cannot say which box it belongs to.
     */
    guaranteedSnackIds?: string[];
  }[];
  customerName: string;
  /** Any Kenyan form — `0712…`, `+254712…`, `254712…`. Normalized server-side. */
  phone: string;
  /**
   * Optional. Every order is reachable by phone already, so an address
   * is an extra for receipts and updates rather than a requirement —
   * an unusable one is dropped server-side instead of failing the
   * checkout, because losing the sale is the worse outcome.
   */
  email?: string;
  county: string;
  deliveryMethod: DeliveryMethod;
  /**
   * Door delivery only. Absent means next-day, the service every
   * address in the area can have. Same-day is refused server-side once
   * Tushop's cut-off has passed, rather than downgraded — a customer
   * who chose it is buying the arrival guarantee.
   */
  serviceLevel?: FargoServiceLevel;
  /** Required when `deliveryMethod` is `'pickup'` — which Fargo Courier pickup point to ship to. */
  pickupStationId?: string;
  /** Required when `deliveryMethod` is `'door'`. Collected so Fargo has a number to call on the doorstep when it differs from the paying one. */
  addressText?: string;
  estate?: string;
  landmark?: string;
  /** Optional alternate number for the rider to call, when it differs from the paying number. */
  contactPhone?: string;
  /**
   * Set when the box is for somebody else (§ send a box as a gift).
   *
   * The recipient's name and number, and the note to pack with it. The
   * buyer stays `customerName`/`phone` above — they are who paid and
   * who every order update goes to. Absent on an ordinary order.
   */
  gift?: {
    recipientName?: string;
    /** Any Kenyan form, normalized server-side like the paying number. */
    recipientPhone?: string;
    message?: string;
  };
  referralCode?: string;
  /**
   * The snacks chosen as guaranteed picks, on a box that offers them
   * (§ Premium: choose 5, discover the rest). Ids only — like every
   * other field here it says *what the customer chose*, and the server
   * re-reads the catalogue for the rest. A request naming the wrong
   * number of snacks, a duplicate, or one that is out of stock is
   * refused rather than trimmed to fit.
   */
  guaranteedSnackIds?: string[];
}

/**
 * What the customer is actually about to be charged, itemized. The
 * checkout UI renders this rather than any figure it computed itself.
 *
 * Both methods carry a real `deliveryFeeKes` now. Door delivery used to
 * price at zero because the old courier's fare was settled between customer and
 * rider after checkout; Fargo quotes a fixed price for it, so it is
 * charged here like any other line.
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
  /** Door delivery only — which Fargo speed was bought. Null on pickup, which has one service. */
  serviceLevel: FargoServiceLevel | null;
}

/**
 * What `POST /api/checkout/web/quote` answers — the same figures the
 * charge will use, computed the same way, but with nothing frozen and
 * nothing charged. Lets the checkout page show a real pickup fee and a
 * real referral discount before the customer commits.
 */
export interface WebCheckoutQuote {
  pricing: WebCheckoutPricing;
  /** True when the code the customer typed resolved to a live referral link. */
  referralCodeApplied: boolean;
  /** True when they typed something that isn't a working code — worth telling them before they pay, not after. */
  referralCodeRejected: boolean;
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
  /** The human-friendly reference (§ order references) shown on the success screen and and in the WhatsApp follow-up message — null until `orderId` is set. */
  orderNumber: number | null;
  totalKes: number | null;
  /** Set once an order exists — the success page words its delivery line differently for door and pickup. */
  deliveryMethod: DeliveryMethod | null;
  customerName: string | null;
  packageLabel: string | null;
  /**
   * The snacks the customer chose, echoed back on the confirmation
   * screen (§ Premium: choose 5, discover the rest) — seeing them
   * listed is the reassurance that the picks actually stuck. Empty for
   * a fully-curated box.
   */
  guaranteedPicks: { name: string; origin: string | null }[];
  /**
   * When the order was created, ISO-8601, for the confirmation
   * screen's receipt line. Null until an order exists. A string rather
   * than a Timestamp because this crosses the wire to a client poll,
   * and formatting happens where the customer's locale is known.
   */
  paidAt: string | null;
  /**
   * Why the payment failed, when Safaricom said something this app
   * recognises (§ accurate payment failure feedback).
   *
   * Null covers two different situations that the screen treats the
   * same way on purpose: the payment has not failed, and it failed for
   * a reason not in the known set. Neither is an invitation to guess —
   * the screen says only that it did not go through and nothing was
   * charged.
   *
   * The raw `resultCode` rides along so support can quote it back
   * without opening Firestore; it is deliberately not shown to the
   * customer, who has no use for "1037".
   */
  /**
   * Set when this order is a gift (§ send a box as a gift) — the
   * recipient's name only, so the confirmation screen can tell the
   * buyer it is going to the right person. The number is deliberately
   * not here: nothing customer-facing needs it, and it belongs to
   * somebody who did not visit this page.
   */
  giftRecipientName: string | null;
  paymentFailure: {
    resultCode: number;
    category: StkFailureCategory;
    message: string;
    nextStep: string | null;
  } | null;
}
