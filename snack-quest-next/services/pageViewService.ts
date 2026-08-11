import 'server-only';

import { pageViewRepository } from '@/repositories/pageViewRepository';

/**
 * Records one page view from `PageViewTracker.tsx`'s beacon
 * (§ Admin: Analytics, website traffic). Public and unauthenticated
 * by design — every visitor to the marketing site hits this, before
 * any sign-in of any kind exists for them.
 *
 * Validation here is deliberately light: this is a low-stakes vanity
 * metric, not money or a customer's data, so the bar is "a stray or
 * hostile request can't corrupt what a human operator reads off the
 * dashboard" rather than the rate-limiting `ReviewService` needs for
 * a form that accepts photos.
 */

const MAX_PATH_LENGTH = 300;
const MAX_REFERRER_LENGTH = 500;

export class PageViewValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PageViewValidationError';
  }
}

export interface RecordPageViewInput {
  path: string;
  visitorId: string;
  referrer: string | null;
}

class PageViewService {
  async record(businessId: string, input: RecordPageViewInput): Promise<void> {
    const path = input.path.trim();
    // Must actually be a path, not an absolute URL or something a
    // hostile client tried to inject into what the dashboard renders
    // as plain text.
    if (!path.startsWith('/') || path.includes('://') || path.length > MAX_PATH_LENGTH) {
      throw new PageViewValidationError('"path" must be a same-site path.');
    }
    if (!input.visitorId) {
      throw new PageViewValidationError('"visitorId" is required.');
    }

    const referrer = input.referrer && input.referrer.length <= MAX_REFERRER_LENGTH ? input.referrer : null;

    await pageViewRepository.create({
      businessId,
      path,
      visitorId: input.visitorId,
      referrer,
    });
  }
}

export const pageViewService = new PageViewService();
