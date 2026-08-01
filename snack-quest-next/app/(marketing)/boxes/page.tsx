import Link from 'next/link';
import Image from 'next/image';
import type { Metadata } from 'next';
import { PackageSearch } from 'lucide-react';
import { getCurrentBusinessId } from '@/lib/business/currentBusinessId';
import { packageRepository } from '@/repositories/packageRepository';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { formatKes } from '@/lib/orders/format';

export const metadata: Metadata = { title: 'Our boxes' };

export default async function BoxesPage() {
  const businessId = getCurrentBusinessId();
  const packages = await packageRepository.listActive(businessId);

  return (
    <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-8">
      <div className="max-w-2xl">
        <h1 className="text-page-title font-bold tracking-tight text-foreground">Our boxes</h1>
        <p className="mt-3 text-subtitle text-muted-foreground">
          Every box is curated and packed by hand. Message us on WhatsApp to order any of these.
        </p>
      </div>

      {packages.length === 0 ? (
        <div className="mt-10">
          <EmptyState icon={PackageSearch} title="No boxes available right now" description="Check back soon — we're restocking." />
        </div>
      ) : (
        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {packages.map(({ id, data }) => (
            <Link key={id} href={`/boxes/${id}`} className="group block">
              <Card className="h-full overflow-hidden p-0 transition-shadow group-hover:shadow-md">
                <div className="relative aspect-[4/3] w-full bg-border/40">
                  {data.imageUrl ? (
                    <Image src={data.imageUrl} alt={data.name} fill sizes="(min-width: 1024px) 33vw, 50vw" className="object-cover" unoptimized />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-4xl">🍿</div>
                  )}
                </div>
                <CardContent className="p-5">
                  <p className="text-card-title font-semibold text-foreground">{data.name}</p>
                  <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{data.description}</p>
                  <p className="mt-3 text-lg font-semibold text-foreground">{formatKes(data.priceKes)}</p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
