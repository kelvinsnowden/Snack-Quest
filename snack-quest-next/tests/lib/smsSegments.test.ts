import { describe, expect, it } from 'vitest';
import { calculateSmsCost, campaignSegmentTotal } from '@/lib/sms/segments';

describe('calculateSmsCost — GSM-7', () => {
  it('bills an empty message as one segment, not zero', () => {
    expect(calculateSmsCost('')).toMatchObject({ encoding: 'GSM-7', characters: 0, segments: 1 });
  });

  it('fits 160 plain characters in one segment', () => {
    const cost = calculateSmsCost('a'.repeat(160));

    expect(cost).toMatchObject({ encoding: 'GSM-7', characters: 160, segments: 1, charactersUntilNextSegment: 0 });
  });

  /** The whole reason this module exists: one character past the line doubles what the campaign costs. */
  it('bills 161 characters as two segments', () => {
    expect(calculateSmsCost('a'.repeat(161))).toMatchObject({ segments: 2 });
  });

  it('uses the smaller 153-character segment once a message is concatenated', () => {
    expect(calculateSmsCost('a'.repeat(306))).toMatchObject({ segments: 2 });
    expect(calculateSmsCost('a'.repeat(307))).toMatchObject({ segments: 3 });
  });

  it('counts a GSM-7 extended character as the two it is actually billed as', () => {
    // '€' is reachable in GSM-7 only behind an escape byte.
    expect(calculateSmsCost('€')).toMatchObject({ encoding: 'GSM-7', characters: 2, segments: 1 });
    expect(calculateSmsCost('€'.repeat(80))).toMatchObject({ characters: 160, segments: 1 });
    expect(calculateSmsCost('€'.repeat(81))).toMatchObject({ segments: 2 });
  });

  it('reports the room left before the next segment starts costing money', () => {
    expect(calculateSmsCost('a'.repeat(150)).charactersUntilNextSegment).toBe(10);
  });

  it('treats a realistic campaign with an opt-out link as one segment', () => {
    const body =
      'Snack Quest: New Japan box just landed - 12 snacks you cannot buy in Nairobi. Order today, delivered in 24h.\nStop snackquests.shop/s/71234567812ab34c';

    expect(calculateSmsCost(body)).toMatchObject({ encoding: 'GSM-7', segments: 1 });
  });

  /**
   * The same campaign written in a word processor. An em dash is not in
   * GSM-7, looks almost identical to a hyphen, and on its own turns a
   * one-segment send into a three-segment one — tripling the bill for a
   * character nobody chose deliberately. This is the single most likely
   * way a real campaign gets expensive by accident.
   */
  it('catches an em dash turning a one-segment campaign into three', () => {
    const withHyphen =
      'Snack Quest: New Japan box just landed - 12 snacks you cannot buy in Nairobi. Order today, delivered in 24h.\nStop snackquests.shop/s/71234567812ab34c';
    const withEmDash = withHyphen.replace(' - ', ' — ');

    expect(calculateSmsCost(withHyphen)).toMatchObject({ encoding: 'GSM-7', segments: 1 });
    expect(calculateSmsCost(withEmDash)).toMatchObject({ encoding: 'UCS-2', segments: 3, forcedUcs2By: '—' });
  });
});

describe('calculateSmsCost — UCS-2', () => {
  /**
   * The expensive surprise. A 150-character message is one segment; the
   * same message with an emoji is three, because the emoji forces every
   * character in it into UCS-2.
   */
  it('drops the whole message to 70-character segments when one emoji appears', () => {
    const plain = 'a'.repeat(150);

    expect(calculateSmsCost(plain).segments).toBe(1);
    expect(calculateSmsCost(`${plain}🎉`).segments).toBe(3);
  });

  it('names the character that forced UCS-2, so the composer can explain the jump', () => {
    expect(calculateSmsCost('Great news 🎉').forcedUcs2By).toBe('🎉');
    expect(calculateSmsCost('Great news').forcedUcs2By).toBeNull();
  });

  /** A curly quote pasted from a document looks identical to a straight one and is not in GSM-7 — the most common way this happens by accident. */
  it('catches a curly quote pasted from a document', () => {
    expect(calculateSmsCost('Don’t miss out')).toMatchObject({ encoding: 'UCS-2', forcedUcs2By: '’' });
    expect(calculateSmsCost("Don't miss out")).toMatchObject({ encoding: 'GSM-7' });
  });

  it('fits 70 UCS-2 characters in one segment and 71 in two', () => {
    expect(calculateSmsCost(`🎉${'a'.repeat(68)}`).segments).toBe(1);
    expect(calculateSmsCost(`🎉${'a'.repeat(69)}`).segments).toBe(2);
  });

  it('counts an emoji as the two UTF-16 code units it is billed as', () => {
    expect(calculateSmsCost('🎉')).toMatchObject({ encoding: 'UCS-2', characters: 2 });
  });
});

describe('campaignSegmentTotal', () => {
  it('multiplies segments by recipients — the number that meets the per-segment rate', () => {
    expect(campaignSegmentTotal('a'.repeat(161), 250)).toBe(500);
    expect(campaignSegmentTotal('a'.repeat(160), 250)).toBe(250);
  });
});
