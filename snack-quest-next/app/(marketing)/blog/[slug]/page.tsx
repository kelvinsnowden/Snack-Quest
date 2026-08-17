import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronRight } from 'lucide-react';
import { PageShell } from '@/components/marketing/design/PageShell';
import { SurfaceCard } from '@/components/marketing/design/SurfaceCard';
import { BuyNowButton } from '@/components/marketing/BuyNowButton';
import { BlogContent } from '@/components/marketing/blog/BlogContent';
import { buildPageMetadata } from '@/lib/seo/pageMetadata';
import { getSiteUrl } from '@/lib/seo/siteUrl';
import { safeJsonLd } from '@/lib/seo/safeJsonLd';
import { getCurrentBusiness } from '@/lib/business/currentBusiness';
import { getPostBySlug, listPosts } from '@/lib/blog/posts';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  if (!post) {
    return { title: 'Post not found' };
  }
  return buildPageMetadata({
    title: post.title,
    description: post.description,
    path: `/blog/${post.slug}`,
  });
}

function formatPublished(dateIso: string): string {
  return new Date(dateIso).toLocaleDateString('en-KE', { year: 'numeric', month: 'long', day: 'numeric' });
}

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  if (!post) {
    notFound();
  }

  const business = await getCurrentBusiness();
  const businessName = business?.name ?? 'Snack Quest';
  const siteUrl = getSiteUrl();
  const postUrl = `${siteUrl}/blog/${post.slug}`;

  const jsonLdGraph = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'BlogPosting',
        headline: post.title,
        description: post.description,
        datePublished: post.publishedAt,
        dateModified: post.publishedAt,
        author: { '@type': 'Organization', name: businessName, '@id': `${siteUrl}/#organization` },
        publisher: { '@id': `${siteUrl}/#organization` },
        mainEntityOfPage: postUrl,
        url: postUrl,
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: siteUrl },
          { '@type': 'ListItem', position: 2, name: 'Blog', item: `${siteUrl}/blog` },
          { '@type': 'ListItem', position: 3, name: post.title, item: postUrl },
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

      <nav aria-label="Breadcrumb" className="text-muted-foreground flex items-center gap-1.5 text-sm">
        <Link href="/" className="hover:text-foreground">
          Home
        </Link>
        <ChevronRight className="size-3.5 shrink-0" aria-hidden="true" />
        <Link href="/blog" className="hover:text-foreground">
          Blog
        </Link>
      </nav>

      <article className="mt-6">
        <p className="text-caption text-muted-foreground">{formatPublished(post.publishedAt)}</p>
        <h1 className="text-page-title mt-2 font-bold tracking-tight text-foreground text-balance">
          {post.title}
        </h1>

        <BlogContent blocks={post.content} />
      </article>

      <SurfaceCard className="mt-14 flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-card-title font-semibold text-foreground">Ready to try a box?</p>
          <p className="text-body mt-1 text-muted-foreground">Pay with M-Pesa, delivered anywhere in Kenya.</p>
        </div>
        <BuyNowButton>Shop boxes</BuyNowButton>
      </SurfaceCard>
    </PageShell>
  );
}

export function generateStaticParams(): { slug: string }[] {
  return listPosts().map((post) => ({ slug: post.slug }));
}
