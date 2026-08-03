import { getCurrentBusiness } from '@/lib/business/currentBusiness';
import { MarketingHeader } from '@/components/marketing/MarketingHeader';
import { MarketingFooter } from '@/components/marketing/MarketingFooter';
import { ActiveBoxNameProvider } from '@/components/marketing/design/ActiveBoxContext';
import { getSiteUrl } from '@/lib/seo/siteUrl';
import { WHATSAPP_CTA_NUMBER } from '@/lib/config/whatsapp';
import { SOCIAL_LINKS } from '@/lib/config/socialLinks';

/**
 * Every marketing page reads live data (active boxes, the business's
 * WhatsApp number) — stock and contact details can change at any
 * time, so this is never a candidate for static prerendering the way
 * a truly static page would be. Forced here, once, so it applies to
 * every page under this layout without repeating it per page.
 */
export const dynamic = 'force-dynamic';

export default async function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const business = await getCurrentBusiness();
  const businessName = business?.name ?? 'Snack Quest';
  const siteUrl = getSiteUrl();

  const organizationJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: businessName,
    url: siteUrl,
    contactPoint: [
      {
        '@type': 'ContactPoint',
        telephone: `+${WHATSAPP_CTA_NUMBER}`,
        contactType: 'customer service',
      },
    ],
    sameAs: Object.values(SOCIAL_LINKS),
  };

  return (
    <ActiveBoxNameProvider>
      <div className="flex min-h-full flex-col">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }}
        />
        <a
          href="#main-content"
          className="focus:bg-primary focus:text-primary-foreground sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:px-4 focus:py-2 focus:text-sm focus:font-medium"
        >
          Skip to content
        </a>
        <MarketingHeader businessName={businessName} />
        <main id="main-content" tabIndex={-1} className="flex-1 outline-none">
          {children}
        </main>
        <MarketingFooter businessName={businessName} />
      </div>
    </ActiveBoxNameProvider>
  );
}
