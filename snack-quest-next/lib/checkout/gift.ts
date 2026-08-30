import { isValidKenyanPhone, normalizeKenyanPhone } from './phone';
import { GIFT_MESSAGE_MAX_LENGTH, type GiftDetails } from '@/types/gift';

/**
 * Turning what a buyer typed into the gift block of an order
 * (§ send a box as a gift).
 *
 * Separate from the checkout service because the decisions here are
 * about a person's intent rather than about pricing: whether they
 * meant to send a gift at all, and whether what they gave is enough to
 * deliver one.
 *
 * The governing rule is that a half-filled gift is refused rather than
 * quietly dropped. Somebody who typed a recipient's name and left the
 * number blank has said plainly that this box is for someone else; the
 * cheap thing to do is ignore the whole block and ship it to the
 * buyer, and that ships a surprise to the wrong house. So a gift is
 * either complete or it is an error the buyer can see and fix.
 */

export class GiftValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GiftValidationError';
  }
}

/**
 * Normalizes a gift block, or returns null when there isn't one.
 *
 * Null means "an ordinary order" and is the only case that reaches the
 * rest of the checkout unchanged. Anything present but unusable throws,
 * carrying a message written for the buyer rather than for a log.
 */
export function parseGiftDetails(
  raw:
    | { recipientName?: string; recipientPhone?: string; message?: string }
    | null
    | undefined,
): GiftDetails | null {
  if (!raw) {
    return null;
  }

  const recipientName = (raw.recipientName ?? '').trim();
  const recipientPhoneRaw = (raw.recipientPhone ?? '').trim();
  const message = (raw.message ?? '').trim();

  /*
   * An empty block is not an error. The checkout sends the gift object
   * whenever the toggle has ever been touched, so a buyer who turned it
   * on, changed their mind and turned it off again arrives here with
   * empty strings — which means an ordinary order, not a broken gift.
   */
  if (!recipientName && !recipientPhoneRaw && !message) {
    return null;
  }

  if (!recipientName) {
    throw new GiftValidationError('Tell us who the gift is for, so we know whose name goes on it.');
  }
  if (!recipientPhoneRaw) {
    throw new GiftValidationError(
      "We need the recipient's number so the rider can reach them at the door.",
    );
  }
  if (!isValidKenyanPhone(recipientPhoneRaw)) {
    throw new GiftValidationError(
      "That recipient number doesn't look like a Kenyan number. Try it as 07… or +2547…",
    );
  }
  if (message.length > GIFT_MESSAGE_MAX_LENGTH) {
    throw new GiftValidationError(
      `Keep the gift note to ${GIFT_MESSAGE_MAX_LENGTH} characters so it fits on the card.`,
    );
  }

  return {
    recipientName,
    // Normalized to the same shape as the paying number, so the courier
    // is handed one format regardless of how either was typed.
    recipientPhone: normalizeKenyanPhone(recipientPhoneRaw),
    // Null rather than an empty string: "no note" is a real state and
    // an empty string would print a blank card.
    message: message.length > 0 ? message : null,
  };
}

/**
 * Who the courier should be told to deliver to, and call.
 *
 * Three sources, in order of how specifically each was chosen for this
 * delivery: a gift recipient is the person the box is *for*; an
 * alternate contact number is the buyer saying "call this instead";
 * and the buyer is the fallback that was previously the only option.
 *
 * `contactPhone` deserves a note. It has been collected and stored on
 * the delivery for a while, and never read — the courier always got
 * the paying number regardless. That was invisible while the two were
 * almost always the same person, and stops being invisible the moment
 * gifts exist, so it is honoured here rather than left as a field that
 * silently does nothing.
 */
export function courierContactFor(input: {
  buyerName: string;
  buyerPhone: string;
  gift?: GiftDetails | null;
  contactPhone?: string | null;
}): { name: string; phone: string } {
  if (input.gift) {
    return { name: input.gift.recipientName, phone: input.gift.recipientPhone };
  }
  return {
    name: input.buyerName,
    phone: input.contactPhone?.trim() ? input.contactPhone.trim() : input.buyerPhone,
  };
}
