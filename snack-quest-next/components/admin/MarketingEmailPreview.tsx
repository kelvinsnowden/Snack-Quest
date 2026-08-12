'use client';

import { useMemo } from 'react';
import { brandedEmailHtml, paragraphsToHtml } from '@/lib/notifications/brandedEmailHtml';

export interface MarketingEmailPreviewValues {
  heading: string;
  bodyText: string;
  imageUrl: string | null;
  ctaLabel: string | null;
  ctaUrl: string | null;
}

/**
 * Renders exactly the branded HTML a recipient will see, in a
 * sandboxed iframe — the same `brandedEmailHtml`/`paragraphsToHtml`
 * helpers the real send uses, so there is never a gap between what
 * staff previews and what actually goes out (§ Admin: Marketing
 * Emails).
 */
export function MarketingEmailPreview({ heading, bodyText, imageUrl, ctaLabel, ctaUrl }: MarketingEmailPreviewValues) {
  const html = useMemo(
    () =>
      brandedEmailHtml({
        heading: heading.trim() || 'Your heading goes here',
        bodyHtml: paragraphsToHtml(bodyText.trim() || 'Your message goes here.'),
        imageUrl,
        ctaLabel,
        ctaUrl,
      }),
    [heading, bodyText, imageUrl, ctaLabel, ctaUrl],
  );

  return (
    <iframe
      title="Email preview"
      srcDoc={html}
      sandbox=""
      className="h-[560px] w-full rounded-lg border border-border bg-white"
    />
  );
}
