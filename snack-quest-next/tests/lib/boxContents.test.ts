import { describe, expect, it } from 'vitest';
import { boxContentsLine, boxContentsHeadline } from '@/lib/packages/boxContents';

/**
 * The five a customer picks are *part of* the box's total, not on top
 * of it (§ the picks are part of the total).
 *
 * A real customer read "choose 5" beside "15+ snacks", added them, and
 * asked on WhatsApp why the maths did not work. The property under
 * test is that the two numbers are never stated as separable facts.
 */
describe('describing what is in a box', () => {
  it('puts the picks inside the total', () => {
    expect(boxContentsLine('15+ snacks', 5)).toBe(
      'Choose 5 of the 15+ snacks — we surprise you with the rest',
    );
    expect(boxContentsHeadline('15+ snacks', 5)).toBe('15+ snacks — and you pick 5 of them');
  });

  /*
   * The exact sentence that caused the confusion must not be
   * reproducible: a total and a pick count with nothing joining them.
   */
  it('never states the two counts as separate facts', () => {
    for (const [label, picks] of [
      ['15+ snacks', 5],
      ['8 noodle packets', 5],
      ['20+ snacks', 10],
    ] as const) {
      const line = boxContentsLine(label, picks);
      expect(line).toContain(`of the ${label}`);
      expect(line).toContain(String(picks));
    }
  });

  /*
   * The label is free text an admin types, in shapes this code cannot
   * predict — so it is used verbatim rather than parsed for its
   * number. A regex that guessed wrong would state a count the shop
   * never promised.
   */
  it('uses whatever the admin typed, without parsing it', () => {
    expect(boxContentsLine('8 noodle packets', 5)).toBe(
      'Choose 5 of the 8 noodle packets — we surprise you with the rest',
    );
  });

  it('says only what it knows when a box has no pick count', () => {
    expect(boxContentsLine('10+ snacks', 0)).toBe('10+ snacks');
    expect(boxContentsHeadline('10+ snacks', 0)).toBe('10+ snacks');
  });

  it('says only what it knows when a box has no count label', () => {
    expect(boxContentsLine(null, 5)).toBe(
      'Choose 5 snacks yourself — we surprise you with the rest',
    );
    expect(boxContentsHeadline('', 5)).toBe('You pick 5. We surprise you with the rest.');
  });

  it('says nothing when it knows nothing', () => {
    expect(boxContentsLine(null, 0)).toBeNull();
    expect(boxContentsHeadline(undefined, 0)).toBeNull();
  });
});
