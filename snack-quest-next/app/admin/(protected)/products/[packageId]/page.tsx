import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireStaffSession } from '@/lib/auth/session';
import { packageRepository } from '@/repositories/packageRepository';
import { ProductForm } from '@/components/admin/ProductForm';

export const metadata: Metadata = { title: 'Edit product' };

export default async function EditAdminProductPage({
  params,
}: {
  params: Promise<{ packageId: string }>;
}) {
  const session = await requireStaffSession();
  const { packageId } = await params;

  const product = await packageRepository.findById(session.businessId, packageId);
  if (!product) {
    notFound();
  }

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">Edit product</h1>
        <p className="hidden sm:block mt-1 text-sm text-muted-foreground">Changes are synced to the WhatsApp catalog automatically.</p>
      </div>
      <ProductForm
        mode="edit"
        packageId={packageId}
        initialValues={{
          name: product.name,
          description: product.description,
          priceKes: product.priceKes,
          isActive: product.isActive,
          stockCount: product.stockCount,
          imageUrl: product.imageUrl,
          snackCountLabel: product.snackCountLabel ?? '',
          guaranteedPickCount: product.guaranteedPickCount,
          highlightLabel: product.highlightLabel ?? '',
          isRescueOffer: product.isRescueOffer ?? false,
          offerExpiresAt: product.offerExpiresAt ? product.offerExpiresAt.toDate().toISOString().slice(0, 10) : '',
        }}
      />
    </div>
  );
}
