import type { Metadata } from 'next';
import { requireStaffSession } from '@/lib/auth/session';
import { ProductForm } from '@/components/admin/ProductForm';

export const metadata: Metadata = { title: 'Add product' };

export default async function NewAdminProductPage() {
  await requireStaffSession();

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">Add product</h1>
        <p className="hidden sm:block mt-1 text-sm text-muted-foreground">
          New boxes are synced to the WhatsApp catalog automatically.
        </p>
      </div>
      <ProductForm mode="create" />
    </div>
  );
}
