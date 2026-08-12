import 'server-only';

import type { MarketingEmailDraftInput } from '@/services/marketingEmailService';
import type { MarketingEmailSegment } from '@/types';

export interface DraftBody {
  subject?: unknown;
  preheader?: unknown;
  heading?: unknown;
  bodyText?: unknown;
  imageUrl?: unknown;
  ctaLabel?: unknown;
  ctaUrl?: unknown;
  featurePills?: unknown;
  includeTestimonials?: unknown;
  segment?: unknown;
  customRecipients?: unknown;
  specificCreatorIds?: unknown;
}

/** Shape-checks a draft body into `MarketingEmailDraftInput`, shared by the create and update routes — the Service still owns real (business-rule) validation. */
export function parseDraftBody(body: DraftBody): { input: MarketingEmailDraftInput } | { error: string } {
  if (typeof body.subject !== 'string') {
    return { error: '"subject" must be a string.' };
  }
  if (typeof body.heading !== 'string') {
    return { error: '"heading" must be a string.' };
  }
  if (typeof body.bodyText !== 'string') {
    return { error: '"bodyText" must be a string.' };
  }
  if (typeof body.segment !== 'string') {
    return { error: '"segment" must be a string.' };
  }
  if (body.preheader !== undefined && body.preheader !== null && typeof body.preheader !== 'string') {
    return { error: '"preheader" must be a string or null.' };
  }
  if (body.imageUrl !== undefined && body.imageUrl !== null && typeof body.imageUrl !== 'string') {
    return { error: '"imageUrl" must be a string or null.' };
  }
  if (body.ctaLabel !== undefined && body.ctaLabel !== null && typeof body.ctaLabel !== 'string') {
    return { error: '"ctaLabel" must be a string or null.' };
  }
  if (body.ctaUrl !== undefined && body.ctaUrl !== null && typeof body.ctaUrl !== 'string') {
    return { error: '"ctaUrl" must be a string or null.' };
  }
  if (
    body.customRecipients !== undefined &&
    body.customRecipients !== null &&
    (!Array.isArray(body.customRecipients) || body.customRecipients.some((entry) => typeof entry !== 'string'))
  ) {
    return { error: '"customRecipients" must be an array of strings or null.' };
  }
  if (
    body.specificCreatorIds !== undefined &&
    body.specificCreatorIds !== null &&
    (!Array.isArray(body.specificCreatorIds) || body.specificCreatorIds.some((entry) => typeof entry !== 'string'))
  ) {
    return { error: '"specificCreatorIds" must be an array of strings or null.' };
  }
  if (
    body.featurePills !== undefined &&
    (!Array.isArray(body.featurePills) || body.featurePills.some((entry) => typeof entry !== 'string'))
  ) {
    return { error: '"featurePills" must be an array of strings.' };
  }
  if (body.includeTestimonials !== undefined && typeof body.includeTestimonials !== 'boolean') {
    return { error: '"includeTestimonials" must be a boolean.' };
  }

  return {
    input: {
      subject: body.subject,
      preheader: (body.preheader as string | null | undefined) ?? null,
      heading: body.heading,
      bodyText: body.bodyText,
      imageUrl: (body.imageUrl as string | null | undefined) ?? null,
      ctaLabel: (body.ctaLabel as string | null | undefined) ?? null,
      ctaUrl: (body.ctaUrl as string | null | undefined) ?? null,
      featurePills: (body.featurePills as string[] | undefined) ?? [],
      includeTestimonials: (body.includeTestimonials as boolean | undefined) ?? true,
      segment: body.segment as MarketingEmailSegment,
      customRecipients: (body.customRecipients as string[] | null | undefined) ?? null,
      specificCreatorIds: (body.specificCreatorIds as string[] | null | undefined) ?? null,
    },
  };
}
