import type { Metadata } from 'next';
import { ShieldAlert } from 'lucide-react';
import { requireStaffSession } from '@/lib/auth/session';
import { hasPermission } from '@/lib/auth/permissions';
import { staffManagementService } from '@/services/staffManagementService';
import { StaffTable } from '@/components/admin/StaffTable';
import { InviteStaffDialog } from '@/components/admin/InviteStaffDialog';
import { Card } from '@/components/ui/card';

export const metadata: Metadata = { title: 'Users & permissions' };

export default async function AdminStaffPage() {
  const session = await requireStaffSession();

  if (!hasPermission(session, 'users.manage')) {
    return (
      <div className="flex max-w-2xl flex-col gap-6">
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">Users & permissions</h1>
        <Card className="flex flex-col items-center gap-3 p-10 text-center">
          <ShieldAlert className="size-8 text-warning" aria-hidden="true" />
          <p className="text-card-title font-semibold text-foreground">You can’t manage staff access</p>
          <p className="text-sm text-muted-foreground">
            Changing who can do what needs the “Invite staff and change their access” permission.
          </p>
        </Card>
      </div>
    );
  }

  const staff = await staffManagementService.listStaff(session.businessId);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">Users & permissions</h1>
          <p className="hidden sm:block mt-1 text-sm text-muted-foreground">
            Invite staff, choose what each person can do, and disable or remove access. Changes apply on their next page load.
          </p>
        </div>
        <InviteStaffDialog />
      </div>

      <StaffTable staff={staff} currentUid={session.uid} />
    </div>
  );
}
