import { beforeEach, describe, expect, it } from 'vitest';
import { adminFirestore } from '@/lib/firebase/admin';
import { referralLinkRepository } from '@/repositories/referralLinkRepository';

/** `referralLinkRepository`'s admin-facing surface (§ Admin: Referrals) — create/update/list/existsByCode, against the real emulator. */

const BUSINESS_ID = 'biz-referral-link-repo-test';
const OTHER_BUSINESS_ID = 'biz-referral-link-repo-other';

async function seedLink(overrides: Partial<Parameters<typeof referralLinkRepository.create>[0]> = {}) {
  return referralLinkRepository.create(
    {
      businessId: BUSINESS_ID,
      code: 'SAVE10',
      ownerId: 'creator-1',
      discountKes: 100,
      commissionKes: 50,
      isActive: true,
      clickCount: 0,
      conversionCount: 0,
      ...overrides,
    },
    'staff-1',
  );
}

beforeEach(async () => {
  await adminFirestore.recursiveDelete(adminFirestore.collection('referralLinks'));
});

describe('referralLinkRepository.create / findById', () => {
  it('creates and reads back a link scoped to its business', async () => {
    const linkId = await seedLink();

    const found = await referralLinkRepository.findById(BUSINESS_ID, linkId);
    expect(found?.code).toBe('SAVE10');

    const wrongBusiness = await referralLinkRepository.findById(OTHER_BUSINESS_ID, linkId);
    expect(wrongBusiness).toBeNull();
  });
});

describe('referralLinkRepository.update', () => {
  it('patches fields and stamps the actor', async () => {
    const linkId = await seedLink({ isActive: true });

    await referralLinkRepository.update(linkId, { isActive: false }, 'staff-2');

    const found = await referralLinkRepository.findById(BUSINESS_ID, linkId);
    expect(found?.isActive).toBe(false);
    expect(found?.updatedBy).toBe('staff-2');
  });
});

describe('referralLinkRepository.existsByCode', () => {
  it('is true for an active or inactive match, scoped to the business', async () => {
    await seedLink({ code: 'RETIRED', isActive: false });
    await seedLink({ businessId: OTHER_BUSINESS_ID, code: 'OTHERBIZ' });

    await expect(referralLinkRepository.existsByCode(BUSINESS_ID, 'RETIRED')).resolves.toBe(true);
    await expect(referralLinkRepository.existsByCode(BUSINESS_ID, 'OTHERBIZ')).resolves.toBe(false);
    await expect(referralLinkRepository.existsByCode(BUSINESS_ID, 'NEVERUSED')).resolves.toBe(false);
  });
});

describe('referralLinkRepository.listByBusiness', () => {
  it('lists only the given business, newest first, with pagination', async () => {
    await seedLink({ businessId: OTHER_BUSINESS_ID, code: 'OTHER' });
    const first = await seedLink({ code: 'FIRST' });
    await new Promise((resolve) => setTimeout(resolve, 5));
    const second = await seedLink({ code: 'SECOND' });

    const { links, nextCursor } = await referralLinkRepository.listByBusiness(BUSINESS_ID);

    expect(links.map((l) => l.id)).toEqual([second, first]);
    expect(nextCursor).toBeNull();
  });
});

describe('referralLinkRepository.listByOwner', () => {
  it('lists only the given owner’s links within the business', async () => {
    await seedLink({ code: 'MINE', ownerId: 'creator-1' });
    await seedLink({ code: 'THEIRS', ownerId: 'creator-2' });
    await seedLink({ businessId: OTHER_BUSINESS_ID, code: 'OTHERBIZ', ownerId: 'creator-1' });

    const { links } = await referralLinkRepository.listByOwner(BUSINESS_ID, 'creator-1');

    expect(links).toHaveLength(1);
    expect(links[0].data.code).toBe('MINE');
  });
});

describe('referralLinkRepository.incrementClickCount', () => {
  it('increments clickCount by 1 each call', async () => {
    const linkId = await seedLink();

    await referralLinkRepository.incrementClickCount(linkId);
    await referralLinkRepository.incrementClickCount(linkId);

    const found = await referralLinkRepository.findById(BUSINESS_ID, linkId);
    expect(found?.clickCount).toBe(2);
  });
});
