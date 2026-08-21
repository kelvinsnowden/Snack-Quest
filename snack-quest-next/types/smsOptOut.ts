import type { Timestamp } from 'firebase/firestore';

/**
 * How a number came to be on the opt-out register. Kept because the
 * three are not equivalent evidence: a customer following the link in
 * their own message is the person themselves, an admin entry is a staff
 * member acting on a phone call or a complaint, and an inbound reply is
 * only possible once the business holds a real short code (an
 * alphanumeric promotional sender ID cannot receive replies at all —
 * see `lib/sms/optOutLink.ts`).
 */
export type SmsOptOutSource = 'customer_link' | 'admin' | 'inbound_reply';

/**
 * `smsOptOuts/{businessId}:{phoneNumber}` — the register of customers
 * who have asked not to receive marketing SMS.
 *
 * A separate collection rather than a flag on a customer record because
 * there is no customer record to put it on: `customerProfiles` is dead
 * (nothing has ever written to it) and the real customer is a guest
 * shopper reconstructed from `orders` by `CustomerService`. The phone
 * number is the identity that always exists, so it is what the register
 * is keyed by — the same reasoning `customerWallets` already follows.
 *
 * Presence of the document IS the opt-out; there is no status field to
 * get out of step with it. Opting a number back in deletes the document
 * and writes an `auditLogs` entry, so the reversal keeps its paper
 * trail without the register itself having to model two states.
 *
 * Marketing sends consult this. Transactional sends deliberately do
 * not: an order confirmation and a dispatch notice are service messages
 * about a purchase the customer chose to make, and suppressing those
 * would withhold information they need rather than respect a
 * preference. See `MarketingSmsService` for where that line is enforced.
 */
export interface SmsOptOut {
  businessId: string;
  /** Normalised to bare `254XXXXXXXXX` by `normalizeKenyanPhone` before it ever reaches here, so a number can never be on the register under two spellings. */
  phoneNumber: string;
  optedOutAt: Timestamp;
  source: SmsOptOutSource;
  /** The staff uid, when `source === 'admin'`. Null for a customer-initiated opt-out, which has no staff actor by definition. */
  recordedBy: string | null;
  /** Free text an admin can attach when recording on someone's behalf (e.g. "asked on the phone, 12 Aug"). */
  note: string | null;
}
