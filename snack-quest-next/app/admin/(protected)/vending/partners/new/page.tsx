import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { requireAdminPage } from '@/lib/auth/requireAdminSection';
import { Card, CardContent } from '@/components/ui/card';
import { OwnerForm } from '@/components/admin/vending/OwnerControls';

export const metadata: Metadata = { title: 'Add machine owner' };

export default async function NewMachineOwnerPage() {
  await requireAdminPage('vending', 'owners.manage');
  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6">
      <div>
        <Link
          href="/admin/vending/partners"
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Machine Owners
        </Link>
        <h1 className="text-foreground mt-2 text-2xl font-semibold">
          Add machine owner
        </h1>
        <p className="text-muted-foreground max-w-2xl text-sm">
          After adding them, give them machines from each machine’s setup page
          and record their agreement here.
        </p>
      </div>
      <Card className="max-w-3xl">
        <CardContent className="p-6">
          <OwnerForm
            partnerId={null}
            initial={{ name: '', contactEmail: '', contactPhone: '', note: '' }}
            claimed={false}
            canEdit
          />
        </CardContent>
      </Card>
    </div>
  );
}
