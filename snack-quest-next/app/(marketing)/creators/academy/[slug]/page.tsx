import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronRight } from 'lucide-react';
import { PageShell } from '@/components/marketing/design/PageShell';
import { SurfaceCard } from '@/components/marketing/design/SurfaceCard';
import { PRIMARY_CTA_CLASS } from '@/components/marketing/design/ctaStyles';
import { Button } from '@/components/ui/button';
import { BlogContent } from '@/components/marketing/blog/BlogContent';
import { buildPageMetadata } from '@/lib/seo/pageMetadata';
import { getSiteUrl } from '@/lib/seo/siteUrl';
import { safeJsonLd } from '@/lib/seo/safeJsonLd';
import { getCurrentBusiness } from '@/lib/business/currentBusiness';
import { ACADEMY_ARTICLES, getAcademyArticle } from '@/lib/creators/academy';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const article = getAcademyArticle(slug);
  if (!article) {
    return { title: 'Article not found' };
  }
  return buildPageMetadata({
    title: article.title,
    description: article.description,
    path: `/creators/academy/${article.slug}`,
  });
}

function formatPublished(dateIso: string): string {
  return new Date(dateIso).toLocaleDateString('en-KE', { year: 'numeric', month: 'long', day: 'numeric' });
}

export default async function CreatorAcademyArticlePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const article = getAcademyArticle(slug);
  if (!article) {
    notFound();
  }

  const business = await getCurrentBusiness();
  const businessName = business?.name ?? 'Snack Quest';
  const siteUrl = getSiteUrl();
  const articleUrl = `${siteUrl}/creators/academy/${article.slug}`;

  const jsonLdGraph = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Article',
        headline: article.title,
        description: article.description,
        datePublished: article.publishedAt,
        dateModified: article.publishedAt,
        author: { '@type': 'Organization', name: businessName, '@id': `${siteUrl}/#organization` },
        publisher: { '@id': `${siteUrl}/#organization` },
        mainEntityOfPage: articleUrl,
        url: articleUrl,
      },
      {
        '@type': 'FAQPage',
        mainEntity: article.faq.map(({ q, a }) => ({
          '@type': 'Question',
          name: q,
          acceptedAnswer: { '@type': 'Answer', text: a },
        })),
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: siteUrl },
          { '@type': 'ListItem', position: 2, name: 'Creator Program', item: `${siteUrl}/creators` },
          { '@type': 'ListItem', position: 3, name: 'Academy', item: `${siteUrl}/creators/academy` },
          { '@type': 'ListItem', position: 4, name: article.title, item: articleUrl },
        ],
      },
    ],
  };

  return (
    <PageShell width="narrow">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLdGraph) }}
      />

      <nav aria-label="Breadcrumb" className="text-muted-foreground flex flex-wrap items-center gap-1.5 text-sm">
        <Link href="/" className="hover:text-foreground">
          Home
        </Link>
        <ChevronRight className="size-3.5 shrink-0" aria-hidden="true" />
        <Link href="/creators" className="hover:text-foreground">
          Creator Program
        </Link>
        <ChevronRight className="size-3.5 shrink-0" aria-hidden="true" />
        <Link href="/creators/academy" className="hover:text-foreground">
          Academy
        </Link>
      </nav>

      <article className="mt-6">
        <p className="text-caption text-muted-foreground">{formatPublished(article.publishedAt)}</p>
        <h1 className="text-page-title mt-2 font-bold tracking-tight text-foreground text-balance">
          {article.title}
        </h1>

        <BlogContent blocks={article.content} />
      </article>

      <div className="mt-12">
        <h2 className="text-card-title font-semibold text-foreground">Common questions</h2>
        <div className="border-border bg-surface divide-border mt-4 flex flex-col divide-y rounded-2xl border">
          {article.faq.map(({ q, a }) => (
            <details key={q} className="group px-5 py-4">
              <summary className="text-foreground marker:content-none flex cursor-pointer list-none items-center justify-between gap-4 text-base font-semibold">
                {q}
                <span className="text-foreground/40 shrink-0 text-2xl transition-transform group-open:rotate-45">
                  +
                </span>
              </summary>
              <p className="text-foreground/70 mt-3 text-[15px] leading-[1.65]">{a}</p>
            </details>
          ))}
        </div>
      </div>

      <SurfaceCard className="mt-14 flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-card-title font-semibold text-foreground">Ready to start earning?</p>
          <p className="text-body mt-1 text-muted-foreground">No minimum following. Free to apply.</p>
        </div>
        <Button asChild size="lg" className={`${PRIMARY_CTA_CLASS} shrink-0`}>
          <Link href="/creators">Join the Creator Program</Link>
        </Button>
      </SurfaceCard>
    </PageShell>
  );
}

export function generateStaticParams(): { slug: string }[] {
  return ACADEMY_ARTICLES.map((article) => ({ slug: article.slug }));
}
