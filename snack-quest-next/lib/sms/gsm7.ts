/**
 * Typography that is safe to put in a text message
 * (§ customer communications move to SMS).
 *
 * SMS bills per segment, and the segment size depends on the encoding
 * of the *whole* message: 160 characters while every character is in
 * the GSM-7 alphabet, and 70 once a single one is not. So one em dash
 * in a 250-character message does not cost a little more — it takes it
 * from two segments to four, doubling the price of every message that
 * carries it.
 *
 * The conversation copy is full of them: 118 em dashes across the
 * replies this shop sends. Rather than strip the typography out of the
 * source — where it is correct, and where the next person writing a
 * message would reintroduce it — the substitution happens once, here,
 * at the boundary where the text stops being prose and becomes
 * billable segments.
 *
 * Only characters with an unambiguous ASCII equivalent are mapped. A
 * snack name in Japanese is left exactly as written: it genuinely
 * needs the wider encoding, and quietly mangling somebody's product
 * name to save a shilling is not a trade worth making.
 */

const SUBSTITUTIONS: [RegExp, string][] = [
  // Dashes. The spaced em dash is how this codebase writes an aside,
  // and it is by far the most common offender.
  [/[—–]/g, '-'],
  // Quotes, both directions of both kinds.
  [/[‘’‚‛]/g, "'"],
  [/[“”„‟]/g, '"'],
  // An ellipsis is three characters that bill as one, but only in the
  // encoding it forces on everything around it.
  [/…/g, '...'],
  // Non-breaking and thin spaces, which look like spaces and are not.
  [/[    ]/g, ' '],
  // A lone bullet, used in a couple of lists.
  [/[•·]/g, '*'],
];

export function toSmsSafeText(text: string): string {
  return SUBSTITUTIONS.reduce(
    (current, [pattern, replacement]) => current.replace(pattern, replacement),
    text,
  );
}
