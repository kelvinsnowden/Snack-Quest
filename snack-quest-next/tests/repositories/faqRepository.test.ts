import { beforeEach, describe, expect, it } from 'vitest';
import { adminFirestore } from '@/lib/firebase/admin';
import { faqRepository } from '@/repositories/faqRepository';

const BUSINESS_ID = 'biz-faq-repo-test';
const OTHER_BUSINESS_ID = 'biz-faq-repo-other';

beforeEach(async () => {
  await adminFirestore.recursiveDelete(adminFirestore.collection('faqs'));
});

describe('faqRepository.listActive', () => {
  it('only returns active FAQs scoped to the business, oldest first', async () => {
    await faqRepository.create(
      { businessId: OTHER_BUSINESS_ID, question: 'Other biz?', answer: 'x', isActive: true },
      'system',
    );
    const first = await faqRepository.create(
      { businessId: BUSINESS_ID, question: 'First?', answer: 'x', isActive: true },
      'system',
    );
    const hidden = await faqRepository.create(
      { businessId: BUSINESS_ID, question: 'Hidden?', answer: 'x', isActive: false },
      'system',
    );
    const second = await faqRepository.create(
      { businessId: BUSINESS_ID, question: 'Second?', answer: 'x', isActive: true },
      'system',
    );

    const active = await faqRepository.listActive(BUSINESS_ID);

    expect(active.map((f) => f.id)).toEqual([first, second]);
    expect(active.map((f) => f.id)).not.toContain(hidden);
  });

  it('excludes soft-deleted FAQs even if still marked active', async () => {
    const faqId = await faqRepository.create(
      { businessId: BUSINESS_ID, question: 'Deleted?', answer: 'x', isActive: true },
      'system',
    );
    await faqRepository.softDelete(faqId, 'staff-1');

    const active = await faqRepository.listActive(BUSINESS_ID);

    expect(active.map((f) => f.id)).not.toContain(faqId);
  });
});

describe('faqRepository.listAllByBusiness', () => {
  it('includes inactive FAQs but excludes soft-deleted ones', async () => {
    const active = await faqRepository.create(
      { businessId: BUSINESS_ID, question: 'Active?', answer: 'x', isActive: true },
      'system',
    );
    const hidden = await faqRepository.create(
      { businessId: BUSINESS_ID, question: 'Hidden?', answer: 'x', isActive: false },
      'system',
    );
    const deleted = await faqRepository.create(
      { businessId: BUSINESS_ID, question: 'Deleted?', answer: 'x', isActive: true },
      'system',
    );
    await faqRepository.softDelete(deleted, 'staff-1');

    const all = await faqRepository.listAllByBusiness(BUSINESS_ID);

    expect(all.map((f) => f.id)).toEqual([active, hidden]);
  });
});

describe('faqRepository.findById', () => {
  it('returns null for a FAQ belonging to a different business', async () => {
    const faqId = await faqRepository.create(
      { businessId: OTHER_BUSINESS_ID, question: 'Q?', answer: 'A', isActive: true },
      'system',
    );

    const found = await faqRepository.findById(BUSINESS_ID, faqId);

    expect(found).toBeNull();
  });

  it('returns null for a soft-deleted FAQ', async () => {
    const faqId = await faqRepository.create(
      { businessId: BUSINESS_ID, question: 'Q?', answer: 'A', isActive: true },
      'system',
    );
    await faqRepository.softDelete(faqId, 'staff-1');

    const found = await faqRepository.findById(BUSINESS_ID, faqId);

    expect(found).toBeNull();
  });
});

describe('faqRepository.update', () => {
  it('applies a partial patch', async () => {
    const faqId = await faqRepository.create(
      { businessId: BUSINESS_ID, question: 'Old question?', answer: 'Old answer', isActive: true },
      'system',
    );

    await faqRepository.update(faqId, { answer: 'New answer' }, 'staff-1');
    const updated = await faqRepository.findById(BUSINESS_ID, faqId);

    expect(updated?.question).toBe('Old question?');
    expect(updated?.answer).toBe('New answer');
    expect(updated?.updatedBy).toBe('staff-1');
  });
});
