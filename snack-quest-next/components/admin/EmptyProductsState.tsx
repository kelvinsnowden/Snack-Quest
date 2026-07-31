import Link from 'next/link';
import { PackagePlus } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';

export function EmptyProductsState() {
  return (
    <EmptyState
      icon={PackagePlus}
      title="No products yet"
      description="Add your first snack box so it can be sold through the WhatsApp catalog."
      action={
        <Button asChild>
          <Link href="/admin/products/new">Add product</Link>
        </Button>
      }
    />
  );
}
