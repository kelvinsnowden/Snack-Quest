import {
  ALLOCATIONS,
  AVERAGE_ORDER_KES,
  formatKsh,
  INTEREST_DISCLAIMER,
  RAISE_HEADLINE,
  RAISE_TOTAL_KES,
  TRACTION,
  TRACTION_AS_OF,
} from './raise';

/**
 * The investor FAQ, as data (§ investor interest page).
 *
 * One list, rendered twice: as the `<details>` blocks a person reads
 * and as the `FAQPage` structured data a search engine reads. Writing
 * it in both places is how the two end up disagreeing, and a rich
 * result quoting a figure the page no longer shows is worse than no
 * rich result.
 *
 * Every number here is interpolated from `raise.ts` rather than typed,
 * for the same reason — this is exactly where a stale total survives a
 * change everywhere else.
 */
export interface FaqItem {
  question: string;
  answer: string;
}

export const INVEST_FAQ: readonly FaqItem[] = [
  {
    question: 'What exactly is Snack Quest?',
    answer:
      'Snack Quest is a snack discovery brand in Kenya. We source interesting snacks from around the world and closer to home, and sell them as individual products and as curated boxes — online today, and from a physical discovery store next. The product is the discovery: people come for something they have not tried before, and the box is built around that feeling.',
  },
  {
    question: 'How much are you raising?',
    answer: `${RAISE_HEADLINE} — ${formatKsh(RAISE_TOTAL_KES)}.`,
  },
  {
    question: `What will the ${RAISE_HEADLINE} be used for?`,
    answer: ALLOCATIONS.map(
      (item) => `${formatKsh(item.amountKes)} — ${item.label}: ${item.body}`,
    ).join(' '),
  },
  {
    question: 'Why are you opening a physical store?',
    answer:
      'Because discovery is physical. Online we can sell a box to somebody who already knows they want one; a store lets somebody walk in with no intention and leave with something they have never seen before. It also gives the brand a place to be photographed, which is where most of our demand has come from so far, and a second way to buy for customers who would rather pick things up themselves.',
  },
  {
    question: 'What traction do you have?',
    answer: `As of ${TRACTION_AS_OF}: ${TRACTION.paidOrders} paid orders from ${TRACTION.customers} customers, ${formatKsh(TRACTION.revenueKes)} in revenue, and an average order of ${formatKsh(AVERAGE_ORDER_KES)}. ${TRACTION.reviewCount} customers have left public reviews, averaging ${TRACTION.reviewAverage} out of 5. We are early, and we would rather say so than dress it up — the purpose of this raise is to turn that first signal into a repeatable physical and digital business.`,
  },
  {
    question: 'Is this an investment offer?',
    answer: `No. This page is an expression-of-interest page for people who would like to learn more about a potential future investment opportunity. It is not a public offer of securities. ${INTEREST_DISCLAIMER}`,
  },
  {
    question: 'Who can express interest?',
    answer:
      'Anyone who would like to learn more — individuals, angel investors, business owners, strategic partners and creators. Submitting the form tells us you would like to be part of the conversation; it commits you to nothing.',
  },
  {
    question: 'When will the investment opportunity be available?',
    answer:
      'We are speaking with potential investors now. Timing depends on those conversations and on the legal and transaction work that has to accompany any round, so we are not putting a date on it here rather than naming one we might miss. Everyone who expresses interest will hear from us as that becomes clearer.',
  },
  {
    question: 'Can I express interest in a smaller amount?',
    answer:
      'Yes. There is no minimum set on this page, and the amount field is optional — leave it blank or tell us you are not sure yet. We would rather have the conversation and work out what makes sense together than filter people out with a number before we have spoken.',
  },
] as const;
