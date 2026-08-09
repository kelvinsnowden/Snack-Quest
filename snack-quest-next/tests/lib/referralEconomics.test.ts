import { describe, expect, it } from 'vitest';
import {
  CREATOR_COMMISSION_KES,
  REFERRAL_DISCOUNT_KES,
  resolveCommissionRateKes,
} from '@/lib/creators/referralEconomics';

/**
 * The referral program's fixed economics (§ flat affiliate
 * commission). These are the numbers a creator was promised and a
 * customer was quoted, so they are worth asserting outright rather
 * than only through the services that read them.
 */

describe('resolveCommissionRateKes', () => {
  it('is the same rate for every affiliate', () => {
    expect(resolveCommissionRateKes()).toBe(CREATOR_COMMISSION_KES);
  });

  it('is KES 300', () => {
    expect(CREATOR_COMMISSION_KES).toBe(300);
  });
});

describe('REFERRAL_DISCOUNT_KES', () => {
  it('is unchanged by the commission flattening — the customer still saves KES 250', () => {
    expect(REFERRAL_DISCOUNT_KES).toBe(250);
  });
});
