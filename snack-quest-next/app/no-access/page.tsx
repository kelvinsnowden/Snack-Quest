import type { Metadata } from 'next';
import Link from 'next/link';
import { ShieldOff } from 'lucide-react';
import { requireStaffSession } from '@/lib/auth/session';
import { isPermissionKey, permissionLabel } from '@/lib/auth/permissions';
import { Card, CardContent } from '@/components/ui/card';

export const metadata: Metadata = { title: 'No access' };

/** Where a staff member lands when a page needs a permission they don't hold. */
export default async function NoAccessPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await requireStaffSession();
  const params = await searchParams;
  const requested = typeof params.permission === 'string' && isPermissionKey(params.permission) ? params.permission : null;
  const homes = [
    { href: '/admin', label: 'Admin', show: session.roles.some((role) => role === 'admin' || role === 'super_admin') },
    { href: '/finance', label: 'Finance', show: session.roles.includes('finance') },
    { href: '/warehouse', label: 'Warehouse', show: session.roles.includes('warehouse') },
    { href: '/agent', label: 'Support', show: session.roles.includes('agent') },
  ].filter((home) => home.show);
  return (
    <main className="mx-auto flex min-h-screen max-w-lg items-center px-4 py-12">
      <Card className="w-full">
        <CardContent className="flex flex-col gap-4 p-6">
          <ShieldOff className="h-6 w-6 text-muted-foreground" aria-hidden />
          <h1 className="text-xl font-semibold text-foreground">You don’t have access to this page</h1>
          <p className="text-sm text-muted-foreground">
            {requested ? (
              <>
                It needs the permission <strong className="text-foreground">{permissionLabel(requested)}</strong>. Ask whoever manages staff access to add it if you need this page for your work.
              </>
            ) : (
              'Ask whoever manages staff access if you need this page for your work.'
            )}
          </p>
          {homes.length > 0 ? (
            <div className="flex flex-wrap gap-3 text-sm">
              {homes.map((home) => (
                <Link key={home.href} href={home.href} className="font-medium text-primary underline-offset-4 hover:underline">
                  Back to {home.label}
                </Link>
              ))}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </main>
  );
}
