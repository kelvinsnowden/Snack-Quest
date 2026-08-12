'use client';

import { useMemo } from 'react';
import { brandedEmailHtml, paragraphsToHtml, type EmailTestimonial } from '@/lib/notifications/brandedEmailHtml';

export interface MarketingEmailPreviewValues {
  heading: string;
  bodyText: string;
  imageUrl: string | null;
  ctaLabel: string | null;
  ctaUrl: string | null;
  featurePills?: string[];
  testimonials?: EmailTestimonial[];
}

/**
 * Renders exactly the branded HTML a recipient will see, in a
 * sandboxed iframe — the same `brandedEmailHtml`/`paragraphsToHtml`
 * helpers the real send uses, so there is never a gap between what
 * staff previews and what actually goes out (§ Admin: Marketing
 * Emails). `testimonials` is the composer page's own server-fetched
 * snapshot of real published reviews — the real send re-fetches fresh
 * at send time (`MarketingEmailService.fetchTestimonials`), so this is
 * a preview of the shape, not a promise those exact reviews will
 * still be the featured ones later.
 */
export function MarketingEmailPreview({
  heading,
  bodyText,
  imageUrl,
  ctaLabel,
  ctaUrl,
  featurePills = [],
  testimonials = [],
}: MarketingEmailPreviewValues) {
  const html = useMemo(
    () =>
      brandedEmailHtml({
        heading: heading.trim() || 'Your heading goes here',
        bodyHtml: paragraphsToHtml(bodyText.trim() || 'Your message goes here.'),
        imageUrl,
        ctaLabel,
        ctaUrl,
        featurePills,
        testimonials,
      }),
    [heading, bodyText, imageUrl, ctaLabel, ctaUrl, featurePills, testimonials],
  );

  return (
    <iframe
      title="Email preview"
      srcDoc={html}
      sandbox=""
      className="h-[720px] w-full rounded-lg border border-border bg-white"
    />
  );
}
