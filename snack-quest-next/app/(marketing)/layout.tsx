import Script from 'next/script';
import { getCurrentBusiness } from '@/lib/business/currentBusiness';
import { MarketingHeader } from '@/components/marketing/MarketingHeader';
import { MarketingFooter } from '@/components/marketing/MarketingFooter';
import { ActiveBoxNameProvider } from '@/components/marketing/design/ActiveBoxContext';
import { getSiteUrl } from '@/lib/seo/siteUrl';
import { WHATSAPP_CTA_NUMBER } from '@/lib/config/whatsapp';
import { SOCIAL_LINKS } from '@/lib/config/socialLinks';
import { META_PIXEL_ID } from '@/lib/config/metaPixel';

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

  // A `@graph` rather than two separate `<script>` tags: `WebSite`
  // references the `Organization` as its `publisher`, which only
  // resolves correctly when both nodes share one JSON-LD document.
  const jsonLdGraph = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': `${siteUrl}/#organization`,
        name: businessName,
        url: siteUrl,
        logo: `${siteUrl}/logo.png`,
        areaServed: 'KE',
        contactPoint: [
          {
            '@type': 'ContactPoint',
            telephone: `+${WHATSAPP_CTA_NUMBER}`,
            contactType: 'customer service',
          },
        ],
        sameAs: Object.values(SOCIAL_LINKS),
      },
      {
        '@type': 'WebSite',
        '@id': `${siteUrl}/#website`,
        name: businessName,
        url: siteUrl,
        inLanguage: 'en-KE',
        publisher: { '@id': `${siteUrl}/#organization` },
      },
    ],
  };

  return (
    <ActiveBoxNameProvider>
      <div className="flex min-h-full flex-col">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLdGraph) }}
        />
        {/* Meta Pixel — public marketing pages only, never the internal Admin/Finance/Warehouse/Agent/Creator portals. */}
        <Script id="meta-pixel" strategy="afterInteractive">
          {`
            !function(f,b,e,v,n,t,s)
            {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
            n.callMethod.apply(n,arguments):n.queue.push(arguments)};
            if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
            n.queue=[];t=b.createElement(e);t.async=!0;
            t.src=v;s=b.getElementsByTagName(e)[0];
            s.parentNode.insertBefore(t,s)}(window, document,'script',
            'https://connect.facebook.net/en_US/fbevents.js');
            fbq('init', '${META_PIXEL_ID}');
            fbq('track', 'PageView');
          `}
        </Script>
        <noscript>
          {/* eslint-disable-next-line @next/next/no-img-element -- 1x1 tracking beacon from Meta's own domain, not an optimizable content image. */}
          <img
            height={1}
            width={1}
            style={{ display: 'none' }}
            alt=""
            src={`https://www.facebook.com/tr?id=${META_PIXEL_ID}&ev=PageView&noscript=1`}
          />
        </noscript>
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
