import { beforeEach, describe, expect, it } from 'vitest';
import { adminFirestore } from '@/lib/firebase/admin';
import { pageViewService, PageViewValidationError } from '@/services/pageViewService';
import { pageViewRepository } from '@/repositories/pageViewRepository';

/**
 * `PageViewService.record` (§ Admin: Analytics, website traffic) — the
 * write side `POST /api/analytics/track` calls. Validation here is
 * light on purpose (see the service's own doc comment); these tests
 * cover the one thing that actually matters: a hostile or malformed
 * request can't land something the dashboard would render as if it
 * were a real path.
 */

const BUSINESS_ID = 'biz-pageview-service-test';

beforeEach(async () => {
  await adminFirestore.recursiveDelete(adminFirestore.collection('pageViews'));
});

describe('PageViewService.record', () => {
  it('stores a real page view', async () => {
    await pageViewService.record(BUSINESS_ID, { path: '/boxes', visitorId: 'visitor-1', referrer: null });

    const views = await pageViewRepository.listSince(BUSINESS_ID, new Date(Date.now() - 60_000));
    expect(views).toHaveLength(1);
    expect(views[0]).toMatchObject({ businessId: BUSINESS_ID, path: '/boxes', visitorId: 'visitor-1', referrer: null });
  });

  it('rejects a path that is not a same-site path', async () => {
    await expect(
      pageViewService.record(BUSINESS_ID, { path: 'https://evil.example/', visitorId: 'visitor-1', referrer: null }),
    ).rejects.toBeInstanceOf(PageViewValidationError);
  });

  it('rejects a missing visitor id', async () => {
    await expect(
      pageViewService.record(BUSINESS_ID, { path: '/', visitorId: '', referrer: null }),
    ).rejects.toBeInstanceOf(PageViewValidationError);
  });

  it('drops a referrer that is unreasonably long rather than storing it', async () => {
    await pageViewService.record(BUSINESS_ID, {
      path: '/',
      visitorId: 'visitor-1',
      referrer: 'https://example.com/'.padEnd(600, 'a'),
    });

    const views = await pageViewRepository.listSince(BUSINESS_ID, new Date(Date.now() - 60_000));
    expect(views[0].referrer).toBeNull();
  });
});
