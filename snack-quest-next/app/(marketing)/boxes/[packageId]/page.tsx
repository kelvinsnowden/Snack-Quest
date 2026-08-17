import Link from 'next/link';
import Image from 'next/image';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ChevronRight } from 'lucide-react';
import { getCurrentBusinessId } from '@/lib/business/currentBusinessId';
import { packageRepository } from '@/repositories/packageRepository';
import { WhatsAppOrderButton } from '@/components/marketing/WhatsAppOrderButton';
import { BuyNowButton } from '@/components/marketing/BuyNowButton';
import { SetActiveBoxName } from '@/components/marketing/design/ActiveBoxContext';
import { formatKes } from '@/lib/orders/format';
import { buildPageMetadata } from '@/lib/seo/pageMetadata';
import { getSiteUrl } from '@/lib/seo/siteUrl';
import { safeJsonLd } from '@/lib/seo/safeJsonLd';

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

  // The CTA next to this is "Ask a question", not "Order" — buying
  // happens at checkout now, so the message this opens with has to be
  // a question, or the thread starts with someone expecting us to take
  // an order we no longer take there.
  const message = `Hi! I have a question about the ${box.name} (${formatKes(box.priceKes)}).`;
  const inStock = box.stockCount === undefined || box.stockCount > 0;
  const siteUrl = getSiteUrl();
  const boxUrl = `${siteUrl}/boxes/${packageId}`;
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
      },
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
    <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6 lg:px-8">
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

      <div className="animate-fade-in mt-6 grid gap-10 lg:grid-cols-2 lg:items-start">
        <div className="bg-border/40 relative aspect-square w-full overflow-hidden rounded-2xl">
          {box.imageUrl ? (
            <Image
              src={box.imageUrl}
              alt={box.name}
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
          <p className="text-subtitle text-muted-foreground mt-4">
            {box.description}
          </p>
          {box.snackCountLabel ? (
            <p className="text-foreground mt-2 text-base font-medium">{box.snackCountLabel}</p>
          ) : null}
          <p className="text-muted-foreground mt-2 text-sm">
            All snacks have passed the taste test. I have tasted each of them.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <BuyNowButton packageId={packageId}>
              Buy this box
            </BuyNowButton>
            <WhatsAppOrderButton message={message}>
              Ask a question
            </WhatsAppOrderButton>
          </div>

          <p className="text-muted-foreground mt-4 text-sm">
            Pay with M-Pesa. Choose a Jumia pickup station countrywide, or door
            delivery in Nairobi — we arrange the Bolt rider with you on WhatsApp
            after checkout.
          </p>
        </div>
      </div>
    </div>
  );
}
