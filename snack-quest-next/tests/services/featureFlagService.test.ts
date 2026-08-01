import { beforeEach, describe, expect, it } from 'vitest';
import { adminFirestore } from '@/lib/firebase/admin';
import { featureFlagService, UnknownFeatureFlagError } from '@/services/featureFlagService';
import { FEATURE_FLAG_CATALOG } from '@/lib/featureFlags/catalog';

const BUSINESS_ID = 'biz-feature-flag-service-test';

beforeEach(async () => {
  await adminFirestore.recursiveDelete(adminFirestore.collection('businesses').doc(BUSINESS_ID).collection('featureFlags'));
});

describe('FeatureFlagService.listFlags', () => {
  it('returns every catalog flag at its default value, unoverridden', async () => {
    const flags = await featureFlagService.listFlags(BUSINESS_ID);
    expect(flags).toHaveLength(FEATURE_FLAG_CATALOG.length);
    for (const flag of flags) {
      const definition = FEATURE_FLAG_CATALOG.find((f) => f.key === flag.key)!;
      expect(flag.enabled).toBe(definition.defaultEnabled);
      expect(flag.isOverridden).toBe(false);
    }
  });

  it('reflects a stored override instead of the catalog default', async () => {
    await featureFlagService.setEnabled(BUSINESS_ID, 'global_search', false, 'staff-1');
    const flags = await featureFlagService.listFlags(BUSINESS_ID);
    const globalSearch = flags.find((f) => f.key === 'global_search')!;
    expect(globalSearch.enabled).toBe(false);
    expect(globalSearch.isOverridden).toBe(true);
    expect(globalSearch.updatedAt).not.toBeNull();
  });
});

describe('FeatureFlagService.isEnabled', () => {
  it('fails closed for an unknown key', async () => {
    expect(await featureFlagService.isEnabled(BUSINESS_ID, 'not_a_real_flag')).toBe(false);
  });

  it('returns the catalog default when never overridden', async () => {
    const definition = FEATURE_FLAG_CATALOG.find((f) => f.key === 'customer_balance_command')!;
    expect(await featureFlagService.isEnabled(BUSINESS_ID, 'customer_balance_command')).toBe(definition.defaultEnabled);
  });

  it('reflects a stored override', async () => {
    await featureFlagService.setEnabled(BUSINESS_ID, 'customer_balance_command', false, 'staff-1');
    expect(await featureFlagService.isEnabled(BUSINESS_ID, 'customer_balance_command')).toBe(false);
  });
});

describe('FeatureFlagService.setEnabled', () => {
  it('throws UnknownFeatureFlagError for a key not in the catalog', async () => {
    await expect(featureFlagService.setEnabled(BUSINESS_ID, 'not_a_real_flag', true, 'staff-1')).rejects.toBeInstanceOf(
      UnknownFeatureFlagError,
    );
  });

  it('persists the change and is reflected immediately without any rebuild-equivalent step', async () => {
    const result = await featureFlagService.setEnabled(BUSINESS_ID, 'global_search', false, 'staff-1');
    expect(result).toMatchObject({ key: 'global_search', enabled: false, isOverridden: true });
    expect(await featureFlagService.isEnabled(BUSINESS_ID, 'global_search')).toBe(false);
  });
});
