import { describe, expect, it } from 'vitest';
import { isActiveNavPath } from '@/lib/creator/navigation';

describe('isActiveNavPath', () => {
  it('matches on the apex host, where paths carry the /creator prefix', () => {
    expect(isActiveNavPath('/creator/referrals', '/creator/referrals')).toBe(
      true,
    );
    expect(isActiveNavPath('/creator', '/creator')).toBe(true);
  });

  it('matches on the creators subdomain, where the prefix is stripped', () => {
    // Same screen, different host — the same nav item must light up.
    expect(isActiveNavPath('/referrals', '/creator/referrals')).toBe(true);
    expect(isActiveNavPath('/', '/creator')).toBe(true);
  });

  it('keeps the portal root from matching every other route', () => {
    expect(isActiveNavPath('/creator/earnings', '/creator')).toBe(false);
    expect(isActiveNavPath('/earnings', '/creator')).toBe(false);
  });

  it('treats a nested route as belonging to its section', () => {
    expect(
      isActiveNavPath('/creator/campaigns/abc123', '/creator/campaigns'),
    ).toBe(true);
    expect(isActiveNavPath('/campaigns/abc123', '/creator/campaigns')).toBe(
      true,
    );
  });

  it('does not match a sibling whose name shares a prefix', () => {
    expect(
      isActiveNavPath('/creator/referrals-archive', '/creator/referrals'),
    ).toBe(false);
  });

  it('ignores a trailing slash', () => {
    expect(isActiveNavPath('/creator/earnings/', '/creator/earnings')).toBe(
      true,
    );
  });

  it('does not confuse two different sections', () => {
    expect(isActiveNavPath('/creator/earnings', '/creator/withdrawals')).toBe(
      false,
    );
  });
});
