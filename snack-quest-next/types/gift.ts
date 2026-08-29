/**
 * An order bought for somebody else (§ send a box as a gift).
 *
 * The distinction this draws is between who *pays* and who *receives*,
 * two things the checkout had silently treated as one person. The
 * paying number is the one the M-Pesa prompt goes to and the one every
 * order update is sent to; the recipient's is the one the rider calls
 * on the doorstep. Collapsing them means a gift arrives at the right
 * address with the buyer's number attached, so the courier phones
 * someone who is not there and, on a failed delivery, phones them
 * again to say the surprise did not arrive.
 *
 * Only the recipient's side lives here. The buyer stays exactly where
 * it already is on the snapshot and the order, so nothing that reads
 * `customerName` or the conversation's phone number has to learn about
 * gifting to keep being right about who bought this.
 *
 * The surprise is a real constraint, not a flourish. Order
 * notifications keep going to the buyer and never to the recipient:
 * a "your box is on the way" text is exactly what a gift is not
 * supposed to send. The recipient's number reaches the courier and
 * nowhere else.
 */
export interface GiftDetails {
  /** Who the box is for. Goes on the waybill, not on the order's customer record. */
  recipientName: string;
  /** Normalized Kenyan number. The rider's contact for this delivery, and never a destination for order updates. */
  recipientPhone: string;
  /**
   * A note to pack in the box. Null when the buyer left it blank.
   *
   * Handwritten by a packer off the warehouse screen, which is why it
   * is capped at something a person will actually copy out and why
   * line breaks are preserved: a two-line message is two lines on the
   * card.
   */
  message: string | null;
}

/** What a packer can reasonably hand-write onto a card, and a bound on what a buyer can type into an order record. */
export const GIFT_MESSAGE_MAX_LENGTH = 200;
