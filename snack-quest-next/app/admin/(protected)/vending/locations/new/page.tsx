import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { requireStaffSession } from '@/lib/auth/session';
import { hasPermission } from '@/lib/auth/permissions';
import { Card, CardContent } from '@/components/ui/card';
import { LocationForm, EMPTY_LOCATION } from '@/components/admin/vending/LocationForm';

export const metadata: Metadata = { title: 'New location' };

export default async function NewLocationPage() {
  const session = await requireStaffSession();
  if (!hasPermission(session, 'locations.manage')) redirect('/admin/vending/locations');
  return (
    <div className="flex max-w-3xl flex-col gap-6 p-4 sm:p-6">
      <div>
        <Link href="/admin/vending/locations" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" aria-hidden="true" />
          Locations
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-foreground">New location</h1>
      </div>
      <Card>
        <CardContent className="pt-6">
          <LocationForm locationId={null} initial={EMPTY_LOCATION} canEdit />
        </CardContent>
      </Card>
    </div>
  );
}
