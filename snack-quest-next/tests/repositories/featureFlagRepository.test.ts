import { beforeEach, describe, expect, it } from 'vitest';
import { adminFirestore } from '@/lib/firebase/admin';
import { featureFlagRepository } from '@/repositories/featureFlagRepository';

const BUSINESS_ID = 'biz-feature-flag-repo-test';
const OTHER_BUSINESS_ID = 'biz-feature-flag-repo-other';

beforeEach(async () => {
  await Promise.all(
    [BUSINESS_ID, OTHER_BUSINESS_ID].map((id) =>
      adminFirestore.recursiveDelete(adminFirestore.collection('businesses').doc(id).collection('featureFlags')),
    ),
  );
});

describe('FeatureFlagRepository', () => {
  it('returns null for a flag that has never been set', async () => {
    expect(await featureFlagRepository.get(BUSINESS_ID, 'global_search')).toBeNull();
  });

  it('creates a flag on first set, and preserves createdAt across updates', async () => {
    await featureFlagRepository.set(
      BUSINESS_ID,
      { key: 'global_search', name: 'Global search', description: 'desc', enabled: false },
      'staff-1',
    );
    const first = await featureFlagRepository.get(BUSINESS_ID, 'global_search');
    expect(first).toMatchObject({ key: 'global_search', enabled: false, updatedBy: 'staff-1' });

    await featureFlagRepository.setEnabled(BUSINESS_ID, 'global_search', true, 'staff-2');
    const second = await featureFlagRepository.get(BUSINESS_ID, 'global_search');
    expect(second).toMatchObject({ enabled: true, updatedBy: 'staff-2' });
    expect(second?.createdAt).toEqual(first?.createdAt);
  });

  it('keeps two businesses fully isolated', async () => {
    await featureFlagRepository.set(
      BUSINESS_ID,
      { key: 'global_search', name: 'Global search', description: 'desc', enabled: true },
      'staff-1',
    );

    expect(await featureFlagRepository.get(OTHER_BUSINESS_ID, 'global_search')).toBeNull();
    const list = await featureFlagRepository.listByBusiness(OTHER_BUSINESS_ID);
    expect(list).toHaveLength(0);
  });

  it('listByBusiness returns every stored flag, sorted by key', async () => {
    await featureFlagRepository.set(
      BUSINESS_ID,
      { key: 'global_search', name: 'Global search', description: 'desc', enabled: true },
      'staff-1',
    );
    await featureFlagRepository.set(
      BUSINESS_ID,
      { key: 'customer_balance_command', name: 'Balance command', description: 'desc', enabled: false },
      'staff-1',
    );

    const list = await featureFlagRepository.listByBusiness(BUSINESS_ID);
    expect(list.map((f) => f.data.key)).toEqual(['customer_balance_command', 'global_search']);
  });
});
