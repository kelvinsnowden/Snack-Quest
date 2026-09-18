import { describe, expect, it } from 'vitest';
import {
  ALLOCATIONS,
  AVERAGE_ORDER_KES,
  formatKsh,
  INTEREST_DISCLAIMER,
  RAISE_HEADLINE,
  RAISE_TOTAL_KES,
  TRACTION,
} from '@/lib/invest/raise';
import { INVEST_FAQ } from '@/lib/invest/faq';

/**
 * The investor page's arithmetic and its language (§ investor interest
 * page).
 *
 * Both halves are here for the same reason: they are the two ways this
 * page can be wrong in a way nobody notices. A total that no longer
 * matches its breakdown is the bug that left "KSh 5M" scattered
 * through the decks after the raise changed, and a phrase like "buy
 * shares" slipping into the copy would turn an expression of interest
 * into something that reads as an offer of securities.
 */
describe('the raise adds up', () => {
  it('totals exactly KSh 6,000,000', () => {
    expect(RAISE_TOTAL_KES).toBe(6_000_000);
  });

  it('is made of the five stated allocations', () => {
    expect(ALLOCATIONS.map((item) => item.amountKes)).toEqual([
      2_500_000, 1_000_000, 1_500_000, 800_000, 200_000,
    ]);
  });

  /*
   * The headline is derived from the total rather than typed beside
   * it. If someone edits an allocation and the headline does not move,
   * the page would state two different raises on one screen.
   */
  it('derives the headline from the total', () => {
    expect(RAISE_HEADLINE).toBe('KSh 6M');
  });

  it('never mentions the superseded KSh 5M raise anywhere', () => {
    const everything = [
      RAISE_HEADLINE,
      formatKsh(RAISE_TOTAL_KES),
      ...ALLOCATIONS.flatMap((item) => [item.label, item.body, formatKsh(item.amountKes)]),
      ...INVEST_FAQ.flatMap((item) => [item.question, item.answer]),
    ].join(' ');

    expect(everything).not.toMatch(/KSh\s*5M\b/);
    expect(everything).not.toMatch(/5,000,000/);
    expect(everything).not.toMatch(/\b5000000\b/);
  });
});

describe('the traction figures', () => {
  /* Counted from production orders on the stated date — see `raise.ts`. */
  it('are the ones measured, not the ones from the old deck', () => {
    expect(TRACTION.paidOrders).toBe(22);
    expect(TRACTION.revenueKes).toBe(93_650);
  });

  it('derives the average order rather than stating it separately', () => {
    expect(AVERAGE_ORDER_KES).toBe(Math.round(93_650 / 22));
  });

  /*
   * Every order so far came from a different person. The page says so
   * plainly, and this guards the claim: if the two ever diverge, the
   * sentence about nobody having ordered twice becomes false.
   */
  it('reports one customer per order, which the copy depends on', () => {
    expect(TRACTION.customers).toBe(TRACTION.paidOrders);
  });
});

describe('the page is an expression of interest, not an offer', () => {
  const copy = [
    INTEREST_DISCLAIMER,
    ...INVEST_FAQ.flatMap((item) => [item.question, item.answer]),
    ...ALLOCATIONS.map((item) => item.body),
  ]
    .join(' ')
    .toLowerCase();

  /*
   * The exact phrases ruled out. Each one would imply a visitor can
   * transact on this page, which they cannot — there is no payment
   * path in the route this form posts to.
   */
  it.each([
    'buy shares',
    'purchase equity',
    'guaranteed return',
    'guaranteed investment',
    'secure your allocation',
    'shares available now',
    'invest now',
  ])('never says "%s"', (phrase) => {
    expect(copy).not.toContain(phrase);
  });

  it('states the non-binding disclaimer in full', () => {
    expect(INTEREST_DISCLAIMER).toContain('non-binding expression of interest');
    expect(INTEREST_DISCLAIMER).toContain('does not constitute an offer');
    expect(INTEREST_DISCLAIMER).toContain('purchase of securities');
  });

  /* The FAQ has to answer this one unambiguously, in the negative. */
  it('answers "is this an investment offer?" with no', () => {
    const entry = INVEST_FAQ.find((item) => /is this an investment offer/i.test(item.question));
    expect(entry).toBeDefined();
    expect(entry!.answer).toMatch(/^No\./);
    expect(entry!.answer).toContain('not a public offer of securities');
  });
});
