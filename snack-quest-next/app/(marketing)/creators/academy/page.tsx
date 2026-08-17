import type { Metadata } from 'next';
import Link from 'next/link';
import { ChevronRight, GraduationCap } from 'lucide-react';
import { PageShell } from '@/components/marketing/design/PageShell';
import { PageHero } from '@/components/marketing/design/PageHero';
import { SurfaceCard } from '@/components/marketing/design/SurfaceCard';
import { Reveal } from '@/components/marketing/design/Reveal';
import { PRIMARY_CTA_CLASS } from '@/components/marketing/design/ctaStyles';
import { Button } from '@/components/ui/button';
import { buildPageMetadata } from '@/lib/seo/pageMetadata';
import { getSiteUrl } from '@/lib/seo/siteUrl';
import { safeJsonLd } from '@/lib/seo/safeJsonLd';
import { ACADEMY_ARTICLES, ACADEMY_HUB } from '@/lib/creators/academy';

export const metadata: Metadata = buildPageMetadata({
  title: 'Creator Academy',
  description: ACADEMY_HUB.description,
  path: '/creators/academy',
});

/**
 * The pillar page for the Creator Academy content cluster
 * (§ Creator Economy SEO & Authority Strategy) — orients a reader
 * into the three real guides below, with one soft, contextual link
 * into the actual Creator Program at the bottom. Deliberately not a
 * hard sell: someone landing here searched an educational question,
 * not "Snack Quest Creator Program".
 */
export default function CreatorAcademyPage() {
  const siteUrl = getSiteUrl();
  const pageUrl = `${siteUrl}/creators/academy`;

  const jsonLdGraph = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebPage',
        '@id': `${pageUrl}#page`,
        url: pageUrl,
        name: ACADEMY_HUB.title,
        description: ACADEMY_HUB.description,
        about: { '@id': `${siteUrl}/#organization` },
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: siteUrl },
          { '@type': 'ListItem', position: 2, name: 'Creator Program', item: `${siteUrl}/creators` },
          { '@type': 'ListItem', position: 3, name: 'Academy', item: pageUrl },
        ],
      },
    ],
  };

  return (
    <PageShell width="wide">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLdGraph) }}
      />

      <nav aria-label="Breadcrumb" className="text-muted-foreground flex items-center gap-1.5 text-sm">
        <Link href="/" className="hover:text-foreground">
          Home
        </Link>
        <ChevronRight className="size-3.5 shrink-0" aria-hidden="true" />
        <Link href="/creators" className="hover:text-foreground">
          Creator Program
        </Link>
        <ChevronRight className="size-3.5 shrink-0" aria-hidden="true" />
        <span className="text-foreground font-medium" aria-current="page">
          Academy
        </span>
      </nav>

      <div className="mt-6">
        <PageHero
          eyebrow="Creator Academy"
          eyebrowIcon={GraduationCap}
          title="Turn content into"
          accent="income, for real."
          subtitle="Practical, Kenya-specific guides on monetizing an audience — any size — plus a real program to put it into practice."
        />
      </div>

      <div className="mt-14 grid grid-cols-1 gap-5 md:grid-cols-3">
        {ACADEMY_ARTICLES.map((article, index) => (
          <Reveal key={article.slug} delayMs={index * 80}>
            <SurfaceCard as="article" className="flex h-full flex-col">
              <Link href={`/creators/academy/${article.slug}`} className="group flex h-full flex-col">
                <h2 className="text-card-title font-semibold text-foreground group-hover:text-primary">
                  {article.title}
                </h2>
                <p className="text-body mt-2 flex-1 text-muted-foreground">{article.description}</p>
                <span className="text-primary mt-4 inline-flex items-center gap-1 text-sm font-medium">
                  Read more
                  <ChevronRight className="size-4" aria-hidden="true" />
                </span>
              </Link>
            </SurfaceCard>
          </Reveal>
        ))}
      </div>

      <Reveal delayMs={240}>
        <SurfaceCard className="mt-10 flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-card-title font-semibold text-foreground">Ready for the real program?</p>
            <p className="text-body mt-1 text-muted-foreground">
              No minimum following. Earn commissions as a Snack Quest creator.
            </p>
          </div>
          <Button asChild size="lg" className={`${PRIMARY_CTA_CLASS} shrink-0`}>
            <Link href="/creators">See the Creator Program</Link>
          </Button>
        </SurfaceCard>
      </Reveal>
    </PageShell>
  );
}
