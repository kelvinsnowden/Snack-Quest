import { describe, expect, it } from 'vitest';
import { selectProductFaqs } from '@/lib/packages/productFaqs';

/**
 * `selectProductFaqs` (§ Mission 2 — product pages) — picks which of
 * the business's real, live FAQ entries belong on a box page. Pure
 * selection over content someone else wrote; it never authors an
 * answer, so the tests are about ranking and exclusion.
 */

function faq(question: string, answer = 'Answer.') {
  return { question, answer };
}

describe('selectProductFaqs', () => {
  it('prefers the "what am I actually getting" question over everything else', () => {
    const selected = selectProductFaqs(
      [
        faq('What if something arrives damaged or wrong?'),
        faq('Where do you deliver?'),
        faq('Can I choose only Japanese or only Korean snacks?'),
      ],
      1,
    );

    expect(selected).toHaveLength(1);
    expect(selected[0].question).toBe('Can I choose only Japanese or only Korean snacks?');
  });

  it('orders the themes by how directly they block a purchase', () => {
    const selected = selectProductFaqs([
      faq('Can I change or cancel my order?'),
      faq('Where do you deliver?'),
      faq('How do I pay?'),
      faq('What is in a Snack Quest box?'),
    ]);

    expect(selected.map((entry) => entry.question)).toEqual([
      'What is in a Snack Quest box?',
      'How do I pay?',
      'Where do you deliver?',
      'Can I change or cancel my order?',
    ]);
  });

  it('drops questions unrelated to buying rather than padding the list', () => {
    const selected = selectProductFaqs([
      faq('How does the Creator Program work?'),
      faq('Do you have a physical shop?'),
      faq('How do I pay?'),
    ]);

    expect(selected.map((entry) => entry.question)).toEqual(['How do I pay?']);
  });

  it('keeps the order staff arranged them in when two questions rank the same', () => {
    const selected = selectProductFaqs([
      faq('How long does delivery take?'),
      faq('Where do you deliver?'),
    ]);

    expect(selected.map((entry) => entry.question)).toEqual([
      'How long does delivery take?',
      'Where do you deliver?',
    ]);
  });

  it('answers one worry per theme before a second from any of them', () => {
    // Four "what am I getting" questions and one about paying. Ranking
    // by theme alone would fill every slot from the first group and
    // never mention payment — which is what shipped before browser
    // verification caught it.
    const selected = selectProductFaqs([
      faq('What is Snack Quest?'),
      faq("Where do Snack Quest's snacks come from?"),
      faq('Can I choose only Japanese or only Korean snacks?'),
      faq("What's in a box?"),
      faq('How do I pay?'),
    ]);

    expect(selected.map((entry) => entry.question)).toContain('How do I pay?');
  });

  it('treats "Is delivery included in the price?" as a delivery question, not a contents one', () => {
    const selected = selectProductFaqs([
      faq('Is delivery included in the price?'),
      faq('What is Snack Quest?'),
    ]);

    // Both are kept, but the contents question leads — proving the
    // delivery one was classified into the later theme.
    expect(selected.map((entry) => entry.question)).toEqual([
      'What is Snack Quest?',
      'Is delivery included in the price?',
    ]);
  });

  it('never returns more than the limit', () => {
    const selected = selectProductFaqs(
      [
        faq('What is in a Snack Quest box?'),
        faq('How do I pay?'),
        faq('Where do you deliver?'),
        faq('Can I cancel my order?'),
        faq('The M-Pesa prompt did not arrive. What do I do?'),
      ],
      2,
    );

    expect(selected).toHaveLength(2);
  });

  it('returns nothing when the business has no FAQs yet', () => {
    expect(selectProductFaqs([])).toEqual([]);
  });
});
