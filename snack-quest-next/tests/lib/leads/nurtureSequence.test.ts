import { describe, expect, it } from 'vitest';
import { NURTURE_SEQUENCE, dueNurtureEmail, personalise } from '@/lib/leads/nurtureSequence';

const DAY = 24 * 60 * 60 * 1000;
const IN = Date.parse('2026-10-01T09:00:00+03:00');

describe('dueNurtureEmail', () => {
  it('sends the first email straight away', () => {
    expect(dueNurtureEmail({ sent: 0, lastSentAtMs: null }, IN, IN)).toBe(NURTURE_SEQUENCE[0]);
  });

  it('waits for the next email’s day', () => {
    expect(dueNurtureEmail({ sent: 1, lastSentAtMs: IN }, IN, IN + DAY)).toBeNull();
    expect(dueNurtureEmail({ sent: 1, lastSentAtMs: IN }, IN, IN + 2 * DAY)).toBe(NURTURE_SEQUENCE[1]);
  });

  it('spaces out emails for a lead enrolled long after they came in', () => {
    const late = IN + 30 * DAY;
    expect(dueNurtureEmail({ sent: 1, lastSentAtMs: late }, IN, late + DAY)).toBeNull();
    expect(dueNurtureEmail({ sent: 1, lastSentAtMs: late }, IN, late + 2 * DAY)).toBe(NURTURE_SEQUENCE[1]);
  });

  it('tolerates a daily job running a little early', () => {
    const sent = IN + 2 * DAY;
    // Email 3 is due on day 5; the job fires ten minutes before that.
    expect(dueNurtureEmail({ sent: 2, lastSentAtMs: sent }, IN - 10 * 60 * 1000, IN + 5 * DAY - 10 * 60 * 1000)).toBe(NURTURE_SEQUENCE[2]);
  });

  it('stops after the last email', () => {
    expect(dueNurtureEmail({ sent: NURTURE_SEQUENCE.length, lastSentAtMs: IN }, IN, IN + 90 * DAY)).toBeNull();
  });
});

describe('personalise', () => {
  it('uses the first name, or "there" without one', () => {
    expect(personalise('Hi {firstName}', 'Amina Wanjiru')).toBe('Hi Amina');
    expect(personalise('Hi {firstName}', '  ')).toBe('Hi there');
  });
});
