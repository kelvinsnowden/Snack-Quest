import { describe, expect, it } from 'vitest';
import { Timestamp } from 'firebase-admin/firestore';
import { daysUntilDeadline, isVideoAsset, urgencyLabel } from '@/lib/creator/campaignPresentation';

describe('isVideoAsset', () => {
  it('recognises common video extensions regardless of query string', () => {
    expect(isVideoAsset('https://blob.example.com/x/y.mp4?token=abc')).toBe(true);
    expect(isVideoAsset('https://blob.example.com/x/y.MOV')).toBe(true);
    expect(isVideoAsset('https://blob.example.com/x/y.webm')).toBe(true);
  });

  it('treats image extensions as not video', () => {
    expect(isVideoAsset('https://blob.example.com/x/y.jpg')).toBe(false);
    expect(isVideoAsset('https://blob.example.com/x/y.png?w=800')).toBe(false);
  });
});

describe('daysUntilDeadline', () => {
  it('returns null for an unset deadline', () => {
    expect(daysUntilDeadline(null)).toBeNull();
    expect(daysUntilDeadline(undefined)).toBeNull();
  });

  it('rounds up to whole days remaining', () => {
    const deadline = Timestamp.fromMillis(Date.now() + 1000 * 60 * 60 * 24 * 2.1);
    expect(daysUntilDeadline(deadline)).toBe(3);
  });

  it('returns a non-positive number for a deadline already passed', () => {
    const deadline = Timestamp.fromMillis(Date.now() - 1000 * 60 * 60 * 24);
    expect(daysUntilDeadline(deadline)).toBeLessThanOrEqual(0);
  });
});

describe('urgencyLabel', () => {
  it('labels today, tomorrow, and further out distinctly', () => {
    expect(urgencyLabel(0)).toBe('Ends today');
    expect(urgencyLabel(-1)).toBe('Ends today');
    expect(urgencyLabel(1)).toBe('1 day left');
    expect(urgencyLabel(5)).toBe('5 days left');
  });
});
