import Link from 'next/link';
import Image from 'next/image';
import type { Metadata } from 'next';
import { PackageSearch } from 'lucide-react';
import { getCurrentBusinessId } from '@/lib/business/currentBusinessId';
import { packageRepository } from '@/repositories/packageRepository';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { formatKes } from '@/lib/orders/format';
import { buildPageMetadata } from '@/lib/seo/pageMetadata';
import { getSiteUrl } from '@/lib/seo/siteUrl';
import { safeJsonLd } from '@/lib/seo/safeJsonLd';

export const metadata: Metadata = buildPageMetadata({
  title: 'Our boxes',
  description: 'Browse every Snack Quest box available right now, priced in KES. Check out online and pay with M-Pesa.',
  path: '/boxes',
});

export default async function BoxesPage() {
  const businessId = getCurrentBusinessId();
  const packages = await packageRepository.listActive(businessId);
  const siteUrl = getSiteUrl();

  const itemListJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    itemListElement: packages.map(({ id, data }, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      url: `${siteUrl}/boxes/${id}`,
      name: data.name,
    })),
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-8">
      {packages.length > 0 ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: safeJsonLd(itemListJsonLd) }}
        />
      ) : null}
      <div className="max-w-2xl">
        <h1 className="text-page-title font-bold tracking-tight text-foreground">Our boxes</h1>
        <p className="mt-3 text-subtitle text-muted-foreground">
          Every box is curated and packed by hand. Tap one to see the details, then check out with M-Pesa.
        </p>
        {/*
          Said once here rather than repeated on every card, where it
          was the same sentence two or three times down a phone screen
          (§ Mission 2 — UI pass). The difference between the boxes is
          size, not care, and stating that up front is what a customer
          comparing prices actually needs.
        */}
        <p className="mt-2 text-sm text-muted-foreground">
          Every snack has passed the taste test — I have tasted each of them. The boxes differ in how
          much you get, not in how they are put together.
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          New here?{' '}
          <Link href="/blog/what-is-a-mystery-snack-box" className="text-primary hover:underline">
            Read what a mystery box actually is
          </Link>{' '}
          before you pick one.
        </p>
      </div>

      {packages.length === 0 ? (
        <div className="mt-10">
          <EmptyState icon={PackageSearch} title="No boxes available right now" description="Check back soon, we're restocking." />
        </div>
      ) : (
        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {packages.map(({ id, data }) => (
            <Link key={id} href={`/boxes/${id}`} className="group block">
              <Card className="h-full overflow-hidden p-0 transition-shadow group-hover:shadow-md">
                <div className="relative aspect-[4/3] w-full bg-border/40">
                  {data.imageUrl ? (
                    <Image src={data.imageUrl} alt={data.name} fill sizes="(min-width: 1024px) 33vw, 50vw" className="object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-4xl">🍿</div>
                  )}
                </div>
                <CardContent className="p-5">
                  <p className="text-card-title font-semibold text-foreground">{data.name}</p>
                  {/*
                    Price and quantity sit together directly under the
                    name: they are the two things someone comparing
                    boxes is actually reading, and they were previously
                    split by the description and a repeated trust line.
                  */}
                  <div className="mt-1.5 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                    <span className="text-lg font-semibold text-foreground tabular-nums">
                      {formatKes(data.priceKes)}
                    </span>
                    {data.snackCountLabel ? (
                      <span className="text-sm font-medium text-primary">{data.snackCountLabel}</span>
                    ) : null}
                  </div>
                  <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{data.description}</p>
                  <span className="mt-3 inline-block text-sm font-medium text-primary">
                    See what&apos;s inside →
                  </span>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
