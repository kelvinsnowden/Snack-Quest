import type { Metadata } from 'next';
import Link from 'next/link';
import { ChevronRight, Download, Mail, Newspaper } from 'lucide-react';
import { PageShell } from '@/components/marketing/design/PageShell';
import { PageHero } from '@/components/marketing/design/PageHero';
import { SurfaceCard } from '@/components/marketing/design/SurfaceCard';
import { buildPageMetadata } from '@/lib/seo/pageMetadata';
import { getSiteUrl } from '@/lib/seo/siteUrl';
import { safeJsonLd } from '@/lib/seo/safeJsonLd';
import { getCurrentBusiness } from '@/lib/business/currentBusiness';
import { SUPPORT_EMAIL_ADDRESS } from '@/lib/config/supportEmail';
import { BRAND_DESCRIPTION_LONG, FOUNDER_NAME, SOURCE_COUNTRIES } from '@/lib/seo/entity';

export const metadata: Metadata = buildPageMetadata({
  title: 'Press & partnerships',
  description: 'Brand facts, logo, and contact details for press, creators, and partners covering or working with Snack Quest.',
  path: '/press',
});

/**
 * A real, honest destination for outreach to land on — not a
 * fabricated "as seen in" page (§ Entity & Authority SEO Phase,
 * digital PR foundation). Deliberately says there's no coverage yet
 * rather than inventing any; the structure is what matters, so real
 * mentions have somewhere to be added later.
 */
export default async function PressPage() {
  const business = await getCurrentBusiness();
  const businessName = business?.name ?? 'Snack Quest';
  const siteUrl = getSiteUrl();
  const pressUrl = `${siteUrl}/press`;

  const jsonLdGraph = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebPage',
        '@id': `${pressUrl}#page`,
        url: pressUrl,
        name: `Press & partnerships — ${businessName}`,
        description: BRAND_DESCRIPTION_LONG,
        about: { '@id': `${siteUrl}/#organization` },
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: siteUrl },
          { '@type': 'ListItem', position: 2, name: 'Press', item: pressUrl },
        ],
      },
    ],
  };

  return (
    <PageShell>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLdGraph) }}
      />

      <nav aria-label="Breadcrumb" className="text-muted-foreground flex items-center gap-1.5 text-sm">
        <Link href="/" className="hover:text-foreground">
          Home
        </Link>
        <ChevronRight className="size-3.5 shrink-0" aria-hidden="true" />
        <span className="text-foreground font-medium" aria-current="page">
          Press
        </span>
      </nav>

      <div className="mt-6">
        <PageHero
          eyebrow="For press & partners"
          eyebrowIcon={Newspaper}
          title="Covering or partnering"
          accent="with Snack Quest?"
          subtitle="Brand facts, logo, and how to reach us — everything a journalist, blogger, or partner actually needs, kept accurate as the business grows."
        />
      </div>

      <div className="mt-12 flex flex-col gap-4">
        <SurfaceCard>
          <p className="text-card-title font-semibold text-foreground">The facts</p>
          <dl className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-caption font-semibold tracking-wide text-muted-foreground uppercase">Brand</dt>
              <dd className="text-body mt-1 text-foreground">{businessName}</dd>
            </div>
            <div>
              <dt className="text-caption font-semibold tracking-wide text-muted-foreground uppercase">Founder</dt>
              <dd className="text-body mt-1 text-foreground">{FOUNDER_NAME}</dd>
            </div>
            <div>
              <dt className="text-caption font-semibold tracking-wide text-muted-foreground uppercase">Market</dt>
              <dd className="text-body mt-1 text-foreground">Kenya</dd>
            </div>
            <div>
              <dt className="text-caption font-semibold tracking-wide text-muted-foreground uppercase">
                Snacks sourced from
              </dt>
              <dd className="text-body mt-1 text-foreground">{SOURCE_COUNTRIES.join(', ')}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-caption font-semibold tracking-wide text-muted-foreground uppercase">What it is</dt>
              <dd className="text-body mt-1 text-foreground">{BRAND_DESCRIPTION_LONG}</dd>
            </div>
          </dl>
        </SurfaceCard>

        <SurfaceCard>
          <p className="text-card-title font-semibold text-foreground">Logo</p>
          <p className="text-body mt-2 text-muted-foreground">
            The current Snack Quest logo, for editorial use with coverage of the brand.
          </p>
          <a
            href="/logo.png"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary mt-3 inline-flex items-center gap-1.5 text-sm font-medium hover:underline"
          >
            <Download className="size-4" aria-hidden="true" />
            Download logo.png
          </a>
        </SurfaceCard>

        <SurfaceCard>
          <p className="text-card-title font-semibold text-foreground">Get in touch</p>
          <p className="text-body mt-2 text-muted-foreground">
            For interview requests, partnership inquiries, or anything else press-related.
          </p>
          <a
            href={`mailto:${SUPPORT_EMAIL_ADDRESS}`}
            className="text-primary mt-3 inline-flex items-center gap-1.5 text-sm font-medium hover:underline"
          >
            <Mail className="size-4" aria-hidden="true" />
            {SUPPORT_EMAIL_ADDRESS}
          </a>
        </SurfaceCard>
      </div>
    </PageShell>
  );
}
