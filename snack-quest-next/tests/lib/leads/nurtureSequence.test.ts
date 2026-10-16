import { describe, expect, it } from 'vitest';
import { DEFAULT_NURTURE_SEQUENCE as SEQ, dueNurtureEmail, personalise, validateNurtureSequence } from '@/lib/leads/nurtureSequence';

const DAY = 24 * 60 * 60 * 1000;
const IN = Date.parse('2026-10-01T09:00:00+03:00');

describe('dueNurtureEmail', () => {
  it('sends the first email straight away', () => {
    expect(dueNurtureEmail(SEQ, { sent: 0, lastSentAtMs: null }, IN, IN)).toBe(SEQ[0]);
  });

  it('waits for the next email’s day', () => {
    expect(dueNurtureEmail(SEQ, { sent: 1, lastSentAtMs: IN }, IN, IN + DAY)).toBeNull();
    expect(dueNurtureEmail(SEQ, { sent: 1, lastSentAtMs: IN }, IN, IN + 2 * DAY)).toBe(SEQ[1]);
  });

  it('spaces out emails for a lead enrolled long after they came in', () => {
    const late = IN + 30 * DAY;
    expect(dueNurtureEmail(SEQ, { sent: 1, lastSentAtMs: late }, IN, late + DAY)).toBeNull();
    expect(dueNurtureEmail(SEQ, { sent: 1, lastSentAtMs: late }, IN, late + 2 * DAY)).toBe(SEQ[1]);
  });

  it('tolerates a daily job running a little early', () => {
    const sent = IN + 2 * DAY;
    // Email 3 is due on day 5; the job fires ten minutes before that.
    expect(dueNurtureEmail(SEQ, { sent: 2, lastSentAtMs: sent }, IN - 10 * 60 * 1000, IN + 5 * DAY - 10 * 60 * 1000)).toBe(SEQ[2]);
  });

  it('stops after the last email', () => {
    expect(dueNurtureEmail(SEQ, { sent: SEQ.length, lastSentAtMs: IN }, IN, IN + 90 * DAY)).toBeNull();
  });
});

describe('personalise', () => {
  it('uses the first name, or "there" without one', () => {
    expect(personalise('Hi {firstName}', 'Amina Wanjiru')).toBe('Hi Amina');
    expect(personalise('Hi {firstName}', '  ')).toBe('Hi there');
  });
});

describe('validateNurtureSequence', () => {
  const email = { day: 0, subject: 'Hi', heading: 'Hello', body: 'Text', ctaLabel: 'Book', imageUrl: null };

  it('accepts the built-in sequence', () => {
    expect(validateNurtureSequence(SEQ).ok).toBe(true);
  });

  it('names the email and the missing field', () => {
    expect(validateNurtureSequence([email, { ...email, day: 2, subject: ' ' }])).toEqual({ ok: false, error: 'Email 2 needs a subject.' });
  });

  it('keeps the days in order', () => {
    const result = validateNurtureSequence([{ ...email, day: 3 }, { ...email, day: 1 }]);
    expect(result.ok).toBe(false);
  });

  it('accepts uploaded pictures only', () => {
    const uploaded = 'https://abc.public.blob.vercel-storage.com/marketing/biz/a.jpg';
    expect(validateNurtureSequence([{ ...email, imageUrl: uploaded }]).ok).toBe(true);
    expect(validateNurtureSequence([{ ...email, imageUrl: 'https://example.com/a.jpg' }]).ok).toBe(false);
    expect(validateNurtureSequence([{ ...email, imageUrl: 'http://abc.public.blob.vercel-storage.com/a.jpg' }]).ok).toBe(false);
  });

  it('refuses an empty sequence', () => {
    expect(validateNurtureSequence([]).ok).toBe(false);
  });
});
