import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { bookCallUrl, buildLeadToken, verifyLeadToken } from '@/lib/leads/leadLinks';

describe('lead links', () => {
  beforeEach(() => {
    process.env.LEAD_LINK_SECRET = 'test-secret';
  });
  afterEach(() => {
    delete process.env.LEAD_LINK_SECRET;
  });

  it('round-trips a lead id', () => {
    expect(verifyLeadToken(buildLeadToken('meta_123'))).toBe('meta_123');
  });

  it('rejects a token for another lead or a tampered signature', () => {
    const token = buildLeadToken('meta_123');
    expect(verifyLeadToken(token.replace('meta_123', 'meta_124'))).toBeNull();
    expect(verifyLeadToken(`${token.slice(0, -1)}x`)).toBeNull();
    expect(verifyLeadToken('garbage')).toBeNull();
  });

  it('rejects everything once the secret changes', () => {
    const token = buildLeadToken('meta_123');
    process.env.LEAD_LINK_SECRET = 'rotated';
    expect(verifyLeadToken(token)).toBeNull();
  });

  it('builds a /call link', () => {
    expect(bookCallUrl('https://www.snackquests.shop/', 'own_x')).toMatch(/^https:\/\/www\.snackquests\.shop\/call\/own_x\.[A-Za-z0-9_-]+$/);
  });
});
