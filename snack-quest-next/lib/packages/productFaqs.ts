import type { Faq } from '@/types';

/**
 * Picks the handful of real FAQs worth answering on a box page
 * (§ Mission 2 — product pages).
 *
 * A box page should answer the questions standing between reading and
 * buying — what actually arrives, how payment works, how it gets to
 * me — not restate the whole `/faq` page, which is one click away and
 * already linked. So this ranks the business's own live FAQ entries by
 * how close they sit to a purchase objection and takes the top few.
 *
 * It selects from real content and never writes any: an entry only
 * appears here because a staff member published it in Admin. If none
 * match, the caller shows nothing rather than filler.
 */

/**
 * Ordered by how directly each theme blocks a purchase — earlier
 * groups win. The words are matched against the question text, which
 * is how these FAQs are actually phrased today (see
 * `scripts/faqContent.mjs`).
 */
const PURCHASE_INTENT_KEYWORDS: readonly (readonly string[])[] = [
  // "What am I actually getting?" — the mystery-box objection.
  // Deliberately narrow: a broad word like "included" also appears in
  // "Is delivery included in the price?", which is a delivery
  // question, and letting it match here crowded the whole section
  // with one theme (caught in browser verification).
  ['what is in', "what's in", 'choose', 'what is snack quest', 'snacks come from'],
  // "Can I pay, and is it safe?"
  ['pay', 'm-pesa', 'mpesa', 'prompt', 'account', 'app'],
  // "Will it reach me, when, and at what cost?"
  ['deliver', 'delivery', 'shipping', 'pickup', 'how long', 'where do you'],
  // "What if it goes wrong?"
  ['damaged', 'wrong', 'cancel', 'change', 'refund'],
];

function themeOf(question: string): number {
  const haystack = question.toLowerCase();
  for (let index = 0; index < PURCHASE_INTENT_KEYWORDS.length; index += 1) {
    if (PURCHASE_INTENT_KEYWORDS[index].some((keyword) => haystack.includes(keyword))) {
      return index;
    }
  }
  return PURCHASE_INTENT_KEYWORDS.length;
}

export function selectProductFaqs<T extends Pick<Faq, 'question' | 'answer'>>(
  faqs: T[],
  limit = 4,
): T[] {
  // Grouped by theme, each group keeping the order staff arranged them
  // in, so the section is stable between renders.
  const byTheme = new Map<number, T[]>();
  for (const faq of faqs) {
    const theme = themeOf(faq.question);
    // Unmatched entries are dropped rather than padding the list with
    // whatever happened to be next — a box page carrying an off-topic
    // FAQ is worse than carrying one fewer.
    if (theme >= PURCHASE_INTENT_KEYWORDS.length) {
      continue;
    }
    const group = byTheme.get(theme) ?? [];
    group.push(faq);
    byTheme.set(theme, group);
  }

  // One question per theme before a second from any of them. Taking
  // the top four by rank alone filled every slot with the same theme
  // and left payment and delivery — two of the biggest reasons someone
  // doesn't finish — unanswered on the page (caught in browser
  // verification). Four answers to four different worries beats four
  // answers to one.
  const selected: T[] = [];
  for (let round = 0; selected.length < limit; round += 1) {
    let addedThisRound = false;
    for (let theme = 0; theme < PURCHASE_INTENT_KEYWORDS.length && selected.length < limit; theme += 1) {
      const candidate = byTheme.get(theme)?.[round];
      if (candidate) {
        selected.push(candidate);
        addedThisRound = true;
      }
    }
    if (!addedThisRound) {
      break;
    }
  }

  return selected;
}
