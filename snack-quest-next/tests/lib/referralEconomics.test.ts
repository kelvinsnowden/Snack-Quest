import { describe, expect, it } from 'vitest';
import {
  resolveCommissionRateKes,
  EARLY_CREATOR_LIMIT,
  EARLY_CREATOR_COMMISSION_KES,
  STANDARD_CREATOR_COMMISSION_KES,
} from '@/lib/creators/referralEconomics';

describe('resolveCommissionRateKes', () => {
  it('gives the early rate to the very first registrant', () => {
    expect(resolveCommissionRateKes(1)).toBe(EARLY_CREATOR_COMMISSION_KES);
  });

  it('gives the early rate to exactly the EARLY_CREATOR_LIMITth registrant', () => {
    expect(resolveCommissionRateKes(EARLY_CREATOR_LIMIT)).toBe(
      EARLY_CREATOR_COMMISSION_KES,
    );
  });

  it('gives the standard rate to the registrant right after the limit', () => {
    expect(resolveCommissionRateKes(EARLY_CREATOR_LIMIT + 1)).toBe(
      STANDARD_CREATOR_COMMISSION_KES,
    );
  });

  it('gives the standard rate well past the limit', () => {
    expect(resolveCommissionRateKes(1000)).toBe(
      STANDARD_CREATOR_COMMISSION_KES,
    );
  });
});
