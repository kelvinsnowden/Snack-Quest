/**
 * How many snacks are in a box, and how many of them the customer
 * chooses — said as one fact rather than two (§ the picks are part of
 * the total, not on top of it).
 *
 * These are two independent fields — `snackCountLabel` is free text an
 * admin types ("15+ snacks", "8 noodle packets") and
 * `guaranteedPickCount` is a number — and every surface rendered them
 * in separate places. A customer read "choose 5" next to "15+ snacks"
 * and reasonably concluded the box held twenty, then asked on WhatsApp
 * why the maths did not work. It took the owner four messages to
 * unpick, and only some customers bother to ask.
 *
 * So the two numbers are composed here, once, into a sentence where
 * the five are visibly *inside* the total — "of the" is the whole
 * fix — and nothing renders one without the other.
 *
 * The label is used verbatim rather than parsed for its number. It is
 * free text in a dozen shapes, and "5 of the 15+ snacks" reads
 * correctly whatever an admin typed, while a regex that guessed wrong
 * would state a number the shop never promised.
 */

export function boxContentsLine(
  snackCountLabel: string | null | undefined,
  pickCount: number,
): string | null {
  const label = snackCountLabel?.trim();

  if (label && pickCount > 0) {
    return `Choose ${pickCount} of the ${label} — we surprise you with the rest`;
  }
  if (pickCount > 0) {
    return `Choose ${pickCount} snacks yourself — we surprise you with the rest`;
  }
  return label ?? null;
}

/**
 * The same fact as a headline: total first, then the share the
 * customer controls. Leading with the total is deliberate — it is the
 * number that was being misread as a separate promise.
 */
export function boxContentsHeadline(
  snackCountLabel: string | null | undefined,
  pickCount: number,
): string | null {
  const label = snackCountLabel?.trim();

  if (label && pickCount > 0) {
    return `${label} — and you pick ${pickCount} of them`;
  }
  if (pickCount > 0) {
    return `You pick ${pickCount}. We surprise you with the rest.`;
  }
  return label ?? null;
}
