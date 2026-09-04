import type { Metadata } from 'next';
import Link from 'next/link';
import { MessageSquareQuote, PenLine } from 'lucide-react';
import { getCurrentBusinessId } from '@/lib/business/currentBusinessId';
import { getPublishedReviews } from '@/lib/marketing/publishedReviews';
import { Button } from '@/components/ui/button';
import { RatingSummary } from '@/components/marketing/review/RatingSummary';
import { ReviewFilterList } from '@/components/marketing/review/ReviewFilterList';
import { PRIMARY_CTA_CLASS } from '@/components/marketing/design/ctaStyles';
import { buildPageMetadata } from '@/lib/seo/pageMetadata';
import { getSiteUrl } from '@/lib/seo/siteUrl';
import { safeJsonLd } from '@/lib/seo/safeJsonLd';
import { getCurrentBusiness } from '@/lib/business/currentBusiness';

/**
 * `/reviews` (§ homepage reviews) — every published review, and the
 * destination the site's own navigation points at.
 *
 * The homepage section shows a handful and disappears entirely when
 * there are none, which is right for a storefront but makes a poor
 * menu target: a nav link that sometimes leads nowhere is a broken
 * link. This page always exists. It can also say "none yet" honestly,
 * because someone who clicked "Reviews" has asked the question and
 * deserves an answer rather than a silently missing section.
 */
export const metadata: Metadata = buildPageMetadata({
  title: 'Reviews',
  description: 'What Snack Quest customers say about their boxes, in their own words.',
  path: '/reviews',
});

const ALL_REVIEWS_LIMIT = 60;

/**
 * AggregateRating + individual Review nodes on the Organization
 * already emitted by the marketing layout (§ SEO/AEO visibility audit)
 * — same `@id`, so parsers that stitch same-page JSON-LD by identity
 * attach these to the one real Organization node rather than a
 * duplicate. Only emitted when there's at least one real published
 * review — never a fabricated rating.
 */
function buildReviewsJsonLd(
  siteUrl: string,
  businessName: string,
  averageRating: number,
  totalCount: number,
  reviews: { customerName: string; rating: number; body: string; createdAtIso: string }[],
) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': `${siteUrl}/#organization`,
    name: businessName,
    aggregateRating: {
      '@type': 'AggregateRating',
      ratingValue: Math.round(averageRating * 10) / 10,
      reviewCount: totalCount,
      bestRating: 5,
      worstRating: 1,
    },
    review: reviews.slice(0, 30).map((r) => ({
      '@type': 'Review',
      author: { '@type': 'Person', name: r.customerName },
      reviewRating: { '@type': 'Rating', ratingValue: r.rating, bestRating: 5, worstRating: 1 },
      reviewBody: r.body,
      datePublished: r.createdAtIso,
    })),
  };
}

export default async function ReviewsPage() {
  const businessId = getCurrentBusinessId();
  const [{ reviews, totalCount, averageRating, ratingCounts }, business] = await Promise.all([
    getPublishedReviews(businessId, ALL_REVIEWS_LIMIT)
      .catch(() => ({ reviews: [], totalCount: 0, averageRating: 0, ratingCounts: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } })),
    getCurrentBusiness(),
  ]);

  return (
    <div className="mx-auto max-w-6xl px-5 py-12 sm:px-6 sm:py-16 lg:px-8">
      {reviews.length > 0 ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: safeJsonLd(
              buildReviewsJsonLd(getSiteUrl(), business?.name ?? 'Snack Quest', averageRating, totalCount, reviews),
            ),
          }}
        />
      ) : null}

      <header className="flex flex-col gap-4">
        <p className="text-caption text-primary font-bold tracking-[0.3em] uppercase">The verdict</p>
        <h1 className="text-page-title text-foreground font-bold tracking-tight text-balance">
          What snackers are saying
        </h1>
      </header>

      {reviews.length > 0 ? (
        <div className="mt-8">
          <RatingSummary averageRating={averageRating} totalCount={totalCount} ratingCounts={ratingCounts} />
        </div>
      ) : null}

      {reviews.length === 0 ? (
        <div className="border-border bg-surface mt-10 flex flex-col items-center gap-5 rounded-2xl border p-10 text-center">
          <span className="bg-primary/10 text-primary flex size-14 items-center justify-center rounded-full">
            <MessageSquareQuote className="size-7" aria-hidden="true" />
          </span>
          <div>
            <p className="text-foreground text-base font-semibold">No reviews up yet</p>
            <p className="text-muted-foreground mt-2 text-sm text-pretty">
              We read every review before it goes up, so there may be some on the way. If you&apos;ve had a box,
              yours could be the first.
            </p>
          </div>
          <Button asChild size="lg" className={PRIMARY_CTA_CLASS}>
            <Link href="/review">
              <PenLine aria-hidden="true" />
              Leave a review
            </Link>
          </Button>
        </div>
      ) : (
        <>
          <ReviewFilterList reviews={reviews} />

          <div className="border-border bg-surface mt-10 flex flex-col items-center gap-4 rounded-2xl border p-6 text-center md:flex-row md:justify-between md:p-8 md:text-left">
            <div>
              <p className="text-foreground text-base font-semibold">Had a box of your own?</p>
              <p className="text-muted-foreground mt-1.5 text-sm">
                Takes a minute, and it genuinely helps the next person decide.
              </p>
            </div>
            <Button asChild size="lg" className={`${PRIMARY_CTA_CLASS} w-full shrink-0 md:w-auto`}>
              <Link href="/review">
                <PenLine aria-hidden="true" />
                Leave a review
              </Link>
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
