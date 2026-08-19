import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { ImageOff, Plus } from 'lucide-react';
import { requireStaffSession } from '@/lib/auth/session';
import { packageRepository } from '@/repositories/packageRepository';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { EmptyProductsState } from '@/components/admin/EmptyProductsState';
import { ProductActiveToggle } from '@/components/admin/ProductActiveToggle';
import { formatKes } from '@/lib/orders/format';

export const metadata: Metadata = { title: 'Products' };

export default async function AdminProductsPage() {
  const session = await requireStaffSession();
  const products = await packageRepository.listAllByBusiness(session.businessId);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">Products</h1>
          <p className="hidden sm:block mt-1 text-sm text-muted-foreground">The snack boxes sold through the WhatsApp catalog.</p>
        </div>
        <Button asChild>
          <Link href="/admin/products/new">
            <Plus aria-hidden="true" />
            Add product
          </Link>
        </Button>
      </div>

      {products.length === 0 ? (
        <EmptyProductsState />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {products.map(({ id, data }) => (
            <Card key={id} className="flex flex-col overflow-hidden p-0">
              <div className="relative aspect-[4/3] w-full bg-border/20">
                {data.imageUrl ? (
                  <Image src={data.imageUrl} alt={data.name} fill sizes="(min-width: 1024px) 33vw, 50vw" className="object-cover" unoptimized />
                ) : (
                  <div className="flex size-full items-center justify-center text-muted-foreground">
                    <ImageOff className="size-8" aria-hidden="true" />
                  </div>
                )}
                <div className="absolute top-2 right-2">
                  <Badge variant={data.isActive ? 'success' : 'outline'}>{data.isActive ? 'Active' : 'Inactive'}</Badge>
                </div>
              </div>
              <div className="flex flex-1 flex-col gap-2 p-4">
                <div>
                  <Link href={`/admin/products/${id}`} className="font-semibold text-foreground hover:underline">
                    {data.name}
                  </Link>
                  <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{data.description}</p>
                </div>
                <div className="mt-auto flex items-center justify-between pt-2">
                  <div>
                    <p className="font-semibold tabular-nums text-foreground">{formatKes(data.priceKes)}</p>
                    <p className="text-caption text-muted-foreground tabular-nums">
                      {data.stockCount === undefined ? 'Unlimited stock' : `${data.stockCount} in stock`}
                    </p>
                  </div>
                  <ProductActiveToggle packageId={id} isActive={data.isActive} />
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
