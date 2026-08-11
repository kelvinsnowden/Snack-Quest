import { beforeEach, describe, expect, it } from 'vitest';
import { adminFirestore } from '@/lib/firebase/admin';
import { marketingSpendRepository } from '@/repositories/marketingSpendRepository';

const BUSINESS_ID = 'biz-marketing-spend-repo-test';

beforeEach(async () => {
  await adminFirestore.recursiveDelete(adminFirestore.collection('marketingSpendEntries'));
});

describe('marketingSpendRepository', () => {
  it('returns null for a month with no entry', async () => {
    await expect(marketingSpendRepository.findByMonth(BUSINESS_ID, '2026-01')).resolves.toBeNull();
  });

  it('sets and reads back a month, scoped per business', async () => {
    await marketingSpendRepository.set(BUSINESS_ID, '2026-01', 15000, 'staff-1');

    const entry = await marketingSpendRepository.findByMonth(BUSINESS_ID, '2026-01');
    expect(entry?.amountKes).toBe(15000);
    expect(entry?.updatedBy).toBe('staff-1');

    await expect(marketingSpendRepository.findByMonth('other-biz', '2026-01')).resolves.toBeNull();
  });

  it('overwrites an existing month on a second set()', async () => {
    await marketingSpendRepository.set(BUSINESS_ID, '2026-01', 10000, 'staff-1');
    await marketingSpendRepository.set(BUSINESS_ID, '2026-01', 12000, 'staff-2');

    const entry = await marketingSpendRepository.findByMonth(BUSINESS_ID, '2026-01');
    expect(entry?.amountKes).toBe(12000);
  });

  it('listByMonths returns only the months that have an entry', async () => {
    await marketingSpendRepository.set(BUSINESS_ID, '2026-01', 10000, 'staff-1');

    const byMonth = await marketingSpendRepository.listByMonths(BUSINESS_ID, ['2025-12', '2026-01']);

    expect(byMonth.has('2025-12')).toBe(false);
    expect(byMonth.get('2026-01')?.amountKes).toBe(10000);
  });

  it('stores the optional per-channel spend split', async () => {
    await marketingSpendRepository.set(BUSINESS_ID, '2026-01', 10000, 'staff-1', {
      metaSpendKes: 4000,
      tiktokSpendKes: 6000,
    });

    const entry = await marketingSpendRepository.findByMonth(BUSINESS_ID, '2026-01');
    expect(entry?.metaSpendKes).toBe(4000);
    expect(entry?.tiktokSpendKes).toBe(6000);
  });

  it('never clobbers a previously-set channel split when a later save omits it (merge, not replace)', async () => {
    await marketingSpendRepository.set(BUSINESS_ID, '2026-01', 10000, 'staff-1', { metaSpendKes: 4000, tiktokSpendKes: 6000 });
    // A later save that only touches the blended total — the Analytics page's own
    // form always sends all three, but the repository itself must be safe either way.
    await marketingSpendRepository.set(BUSINESS_ID, '2026-01', 11000, 'staff-2');

    const entry = await marketingSpendRepository.findByMonth(BUSINESS_ID, '2026-01');
    expect(entry?.amountKes).toBe(11000);
    expect(entry?.metaSpendKes).toBe(4000);
    expect(entry?.tiktokSpendKes).toBe(6000);
  });
});
