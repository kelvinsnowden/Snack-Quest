import Link from 'next/link';
import Image from 'next/image';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ChevronRight, Check, HelpCircle, Smartphone, Store, Truck } from 'lucide-react';
import { getCurrentBusinessId } from '@/lib/business/currentBusinessId';
import { packageRepository } from '@/repositories/packageRepository';
import { faqRepository } from '@/repositories/faqRepository';
import { reviewService } from '@/services/reviewService';
import { WhatsAppOrderButton } from '@/components/marketing/WhatsAppOrderButton';
import { BuyNowButton } from '@/components/marketing/BuyNowButton';
import { SetActiveBoxName } from '@/components/marketing/design/ActiveBoxContext';
import { ReviewCard } from '@/components/marketing/review/ReviewCard';
import { formatKes } from '@/lib/orders/format';
import { buildPageMetadata } from '@/lib/seo/pageMetadata';
import { getSiteUrl } from '@/lib/seo/siteUrl';
import { safeJsonLd } from '@/lib/seo/safeJsonLd';
import { SNACK_CATEGORIES, SNACK_ORIGIN_COUNTRIES } from '@/lib/packages/snackCategories';
import { selectProductFaqs } from '@/lib/packages/productFaqs';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ packageId: string }>;
}): Promise<Metadata> {
  const { packageId } = await params;
  const businessId = getCurrentBusinessId();
  const box = await packageRepository.findById(businessId, packageId);
  if (!box || !box.isActive) {
    return { title: 'Box not found' };
  }
  return buildPageMetadata({
    title: box.name,
    description: box.description,
    path: `/boxes/${packageId}`,
    image: box.imageUrl ?? undefined,
  });
}

/**
 * True of every box, so it belongs here rather than in the per-box
 * comparison (§ Mission 2 — product pages). The comparison shows only
 * what genuinely differs between boxes — which, in the real product
 * data, is the price and how many snacks you get.
 */
const EVERY_BOX_INCLUDES = [
  `A mix from ${SNACK_ORIGIN_COUNTRIES.slice(0, -1).join(', ')} and ${SNACK_ORIGIN_COUNTRIES.at(-1)}`,
  'Hand-picked and personally tasted before it ships',
  'Packed and dispatched within 24 hours',
  'Pay by M-Pesa — no app to install',
];

export default async function BoxDetailPage({
  params,
}: {
  params: Promise<{ packageId: string }>;
}) {
  const { packageId } = await params;
  const businessId = getCurrentBusinessId();

  const box = await packageRepository.findById(businessId, packageId);
  if (!box || !box.isActive) {
    notFound();
  }

  // Everything else this page needs, fetched alongside rather than in
  // series. Each falls back to empty on failure: a box page must still
  // sell the box if the FAQ or review read has a bad moment.
  const [allBoxes, faqs, reviewSummary] = await Promise.all([
    packageRepository.listActive(businessId).catch(() => []),
    faqRepository.listActive(businessId).catch(() => []),
    reviewService
      .listPublished(businessId, 3)
      .catch(() => ({ reviews: [], totalCount: 0, averageRating: 0, ratingCounts: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } })),
  ]);

  // The CTA next to this is "Ask a question", not "Order" — buying
  // happens at checkout now, so the message this opens with has to be
  // a question, or the thread starts with someone expecting us to take
  // an order we no longer take there.
  const message = `Hi! I have a question about the ${box.name} (${formatKes(box.priceKes)}).`;
  const inStock = box.stockCount === undefined || box.stockCount > 0;
  const siteUrl = getSiteUrl();
  const boxUrl = `${siteUrl}/boxes/${packageId}`;

  const productFaqs = selectProductFaqs(faqs.map(({ data }) => data));
  const otherBoxes = allBoxes.filter(({ id }) => id !== packageId);

  const jsonLdGraph = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Product',
        name: box.name,
        description: box.description,
        ...(box.imageUrl ? { image: [box.imageUrl] } : {}),
        url: boxUrl,
        offers: {
          '@type': 'Offer',
          priceCurrency: 'KES',
          price: box.priceKes,
          availability: inStock
            ? 'https://schema.org/InStock'
            : 'https://schema.org/OutOfStock',
          url: boxUrl,
        },
        // Deliberately no `aggregateRating`/`review`: the reviews shown
        // further down this page are about Snack Quest as a whole, not
        // about this box, and attaching them here would tell Google
        // they rate this specific product. They don't — and the page
        // says so where they're shown.
      },
      // Only when the questions are genuinely rendered below — schema
      // for content a visitor can't see is exactly the kind of markup
      // that earns a manual action.
      ...(productFaqs.length > 0
        ? [
            {
              '@type': 'FAQPage',
              mainEntity: productFaqs.map((faq) => ({
                '@type': 'Question',
                name: faq.question,
                acceptedAnswer: { '@type': 'Answer', text: faq.answer },
              })),
            },
          ]
        : []),
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: siteUrl },
          { '@type': 'ListItem', position: 2, name: 'Our boxes', item: `${siteUrl}/boxes` },
          { '@type': 'ListItem', position: 3, name: box.name, item: boxUrl },
        ],
      },
    ],
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-16 lg:px-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLdGraph) }}
      />
      <SetActiveBoxName packageId={packageId} name={box.name} />
      <nav aria-label="Breadcrumb" className="text-muted-foreground flex items-center gap-1.5 text-sm">
        <Link href="/" className="hover:text-foreground">
          Home
        </Link>
        <ChevronRight className="size-3.5 shrink-0" aria-hidden="true" />
        <Link href="/boxes" className="hover:text-foreground">
          Our boxes
        </Link>
        <ChevronRight className="size-3.5 shrink-0" aria-hidden="true" />
        <span className="text-foreground min-w-0 truncate font-medium" aria-current="page">
          {box.name}
        </span>
      </nav>

      <div className="animate-fade-in mt-6 grid gap-8 lg:grid-cols-2 lg:items-start lg:gap-10">
        <div className="bg-border/40 relative aspect-square w-full overflow-hidden rounded-2xl lg:sticky lg:top-24">
          {box.imageUrl ? (
            <Image
              src={box.imageUrl}
              alt={`The ${box.name} — a mystery mix of imported snacks from ${SNACK_ORIGIN_COUNTRIES.join(', ')}.`}
              fill
              sizes="(min-width: 1024px) 50vw, 100vw"
              className="object-cover"
              priority
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-8xl">
              🍿
            </div>
          )}
        </div>

        <div>
          <h1 className="text-page-title text-foreground font-bold tracking-tight">
            {box.name}
          </h1>
          <p className="text-foreground mt-3 text-2xl font-semibold">
            {formatKes(box.priceKes)}
          </p>
          {box.snackCountLabel ? (
            <p className="text-primary mt-1 text-base font-semibold">{box.snackCountLabel}</p>
          ) : null}
          <p className="text-subtitle text-muted-foreground mt-4">
            {box.description}
          </p>
          <p className="text-muted-foreground mt-2 text-sm">
            All snacks have passed the taste test. I have tasted each of them.
          </p>

          <ul className="mt-6 flex flex-col gap-2.5">
            {EVERY_BOX_INCLUDES.map((line) => (
              <li key={line} className="text-foreground/80 flex items-start gap-2.5 text-sm">
                <span className="bg-primary/10 text-primary mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full">
                  <Check className="size-3" strokeWidth={3} aria-hidden="true" />
                </span>
                {line}
              </li>
            ))}
          </ul>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <BuyNowButton
              packageId={packageId}
              analyticsSource="product_page"
              analyticsPriceKes={box.priceKes}
            >
              Buy this box
            </BuyNowButton>
            <WhatsAppOrderButton message={message}>
              Ask a question
            </WhatsAppOrderButton>
          </div>

          <div className="border-border bg-surface mt-6 flex flex-col gap-3 rounded-xl border p-4">
            <p className="text-foreground flex items-center gap-2 text-sm font-semibold">
              <Smartphone className="text-primary size-4" aria-hidden="true" />
              Paying and getting it to you
            </p>
            <p className="text-muted-foreground flex items-start gap-2 text-sm">
              <Store className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span>
                Collect from a Fargo Courier pickup point anywhere in Kenya — the fee for your point is
                added to your total before you pay, so nothing is a surprise.
              </span>
            </p>
            <p className="text-muted-foreground flex items-start gap-2 text-sm">
              <Truck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span>
                In Nairobi, we can send it to your door by Bolt instead. That ride is arranged with you
                on WhatsApp after checkout and paid to the rider directly, so it is not part of the
                amount charged here.
              </span>
            </p>
          </div>
        </div>
      </div>

      <section className="mt-14" aria-labelledby="whats-inside-heading">
        <h2 id="whats-inside-heading" className="text-card-title text-foreground font-semibold">
          What&apos;s inside
        </h2>
        <p className="text-muted-foreground mt-2 text-sm">
          Every box is a mix across these kinds of snacks. Which exact items you get is the part
          we don&apos;t tell you — that is the quest.
        </p>
        <ul className="mt-4 flex flex-wrap gap-2">
          {SNACK_CATEGORIES.map((category) => (
            <li
              key={category.label}
              className="border-border bg-surface text-foreground inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-sm font-medium"
            >
              <span aria-hidden="true">{category.emoji}</span>
              {category.label}
            </li>
          ))}
        </ul>
        <p className="text-muted-foreground mt-4 text-sm">
          Curious what the snacks are actually like?{' '}
          <Link href="/blog/japan-korea-china-thailand-snack-differences" className="text-primary hover:underline">
            How Japanese, Korean, Chinese and Thai snacks differ
          </Link>{' '}
          ·{' '}
          <Link href="/blog/what-is-a-mystery-snack-box" className="text-primary hover:underline">
            What a mystery snack box actually is
          </Link>
        </p>
      </section>

      {otherBoxes.length > 0 ? (
        <section className="mt-14" aria-labelledby="compare-heading">
          <h2 id="compare-heading" className="text-card-title text-foreground font-semibold">
            How the boxes compare
          </h2>
          <p className="text-muted-foreground mt-2 text-sm">
            The difference is how much you get. Everything else — the countries, the hand-picking,
            the taste test, the delivery choices — is the same whichever you pick.
          </p>

          {/*
            Cards rather than a table: on a phone a three-column table
            either scrolls sideways or shrinks the price into
            unreadability, and there are only two real columns of data
            to show (price, how many snacks) — both of which come from
            the package record itself. Nothing here is a per-tier claim
            this platform can't back.
          */}
          <ul className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {allBoxes.map(({ id, data }) => {
              const isCurrent = id === packageId;
              return (
                <li key={id}>
                  <div
                    className={`flex h-full flex-col rounded-xl border p-4 ${
                      isCurrent ? 'border-primary bg-primary/5' : 'border-border bg-surface'
                    }`}
                  >
                    <p className="text-foreground text-sm font-semibold">
                      {data.name}
                      {isCurrent ? (
                        <span className="text-primary ml-2 text-xs font-semibold">You&apos;re viewing this</span>
                      ) : null}
                    </p>
                    <p className="text-foreground mt-1.5 text-xl font-semibold tabular-nums">
                      {formatKes(data.priceKes)}
                    </p>
                    <p className="text-muted-foreground mt-1 flex-1 text-sm">
                      {data.snackCountLabel ?? data.description}
                    </p>
                    {!isCurrent ? (
                      <Link
                        href={`/boxes/${id}`}
                        className="text-primary mt-3 text-sm font-medium hover:underline"
                      >
                        See the {data.name} →
                      </Link>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <section className="mt-14" aria-labelledby="reviews-heading">
        <h2 id="reviews-heading" className="text-card-title text-foreground font-semibold">
          What snackers say
        </h2>
        {reviewSummary.reviews.length > 0 ? (
          <>
            {/*
              Said plainly, because these are reviews of Snack Quest,
              not of this box specifically — the review form doesn't
              ask which box someone had. Labelling them honestly is
              also why no `aggregateRating` is attached to this page's
              Product schema.
            */}
            <p className="text-muted-foreground mt-2 text-sm">
              From customers across all our boxes — reviews aren&apos;t tied to a single box.
            </p>
            <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {reviewSummary.reviews.map((review) => (
                <ReviewCard key={review.id} review={review} />
              ))}
            </div>
            <Link href="/reviews" className="text-primary mt-5 inline-block text-sm font-medium hover:underline">
              Read all {reviewSummary.totalCount} reviews →
            </Link>
          </>
        ) : (
          <div className="border-border bg-surface mt-4 rounded-xl border p-6 text-center">
            <p className="text-foreground text-sm font-semibold">No reviews up yet</p>
            <p className="text-muted-foreground mx-auto mt-2 max-w-md text-sm text-pretty">
              We read every review before it goes up, so there may be some on the way. If you order
              this box, yours could be the first.
            </p>
            <Link href="/reviews" className="text-primary mt-3 inline-block text-sm font-medium hover:underline">
              See the reviews page →
            </Link>
          </div>
        )}
      </section>

      {productFaqs.length > 0 ? (
        <section className="mt-14" aria-labelledby="faq-heading">
          <h2 id="faq-heading" className="text-card-title text-foreground font-semibold">
            Before you order
          </h2>
          <div className="border-border bg-surface divide-border mt-4 flex flex-col divide-y rounded-2xl border">
            {productFaqs.map((faq) => (
              <details key={faq.question} className="group px-5 py-4">
                <summary className="text-foreground marker:content-none flex cursor-pointer list-none items-center justify-between gap-4 text-base font-semibold">
                  {faq.question}
                  <span className="text-foreground/40 shrink-0 text-2xl transition-transform group-open:rotate-45">
                    +
                  </span>
                </summary>
                <p className="text-foreground/70 mt-3 text-[15px] leading-[1.65]">{faq.answer}</p>
              </details>
            ))}
          </div>
          <Link href="/faq" className="text-primary mt-4 inline-flex items-center gap-1.5 text-sm font-medium hover:underline">
            <HelpCircle className="size-4" aria-hidden="true" />
            Every question we get asked
          </Link>
        </section>
      ) : null}

      <div className="border-border mt-14 flex flex-col items-start gap-4 border-t pt-8 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-foreground text-base font-semibold">Ready for the {box.name}?</p>
          <p className="text-muted-foreground mt-1 text-sm">
            {formatKes(box.priceKes)} · checkout takes about two minutes.
          </p>
        </div>
        <BuyNowButton
          packageId={packageId}
          analyticsSource="product_page"
          analyticsPriceKes={box.priceKes}
          className="w-full shrink-0 sm:w-auto"
        >
          Buy this box
        </BuyNowButton>
      </div>
    </div>
  );
}
