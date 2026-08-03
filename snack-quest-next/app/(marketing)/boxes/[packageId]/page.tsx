import Link from 'next/link';
import Image from 'next/image';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { getCurrentBusinessId } from '@/lib/business/currentBusinessId';
import { packageRepository } from '@/repositories/packageRepository';
import { WhatsAppOrderButton } from '@/components/marketing/WhatsAppOrderButton';
import { formatKes } from '@/lib/orders/format';
import { buildPageMetadata } from '@/lib/seo/pageMetadata';
import { getSiteUrl } from '@/lib/seo/siteUrl';

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

  const message = `Hi! I'd like to order the ${box.name} (${formatKes(box.priceKes)}).`;
  const inStock = box.stockCount === undefined || box.stockCount > 0;
  const productJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: box.name,
    description: box.description,
    ...(box.imageUrl ? { image: [box.imageUrl] } : {}),
    url: `${getSiteUrl()}/boxes/${packageId}`,
    offers: {
      '@type': 'Offer',
      priceCurrency: 'KES',
      price: box.priceKes,
      availability: inStock
        ? 'https://schema.org/InStock'
        : 'https://schema.org/OutOfStock',
      url: `${getSiteUrl()}/boxes/${packageId}`,
    },
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6 lg:px-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(productJsonLd) }}
      />
      <Link
        href="/boxes"
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        All boxes
      </Link>

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

          <div className="mt-8">
            <WhatsAppOrderButton message={message} />
          </div>

          <p className="text-muted-foreground mt-4 text-sm">
            Door delivery in Nairobi or pickup station nationwide — we&apos;ll
            confirm delivery options once you message us.
          </p>
        </div>
      </div>
    </div>
  );
}
