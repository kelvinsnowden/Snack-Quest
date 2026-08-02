import type { Metadata } from 'next';
import { ShieldAlert } from 'lucide-react';
import { requireStaffSession } from '@/lib/auth/session';
import { isSuperAdmin } from '@/lib/auth/requireSuperAdmin';
import { staffManagementService } from '@/services/staffManagementService';
import { StaffTable } from '@/components/admin/StaffTable';
import { InviteStaffDialog } from '@/components/admin/InviteStaffDialog';
import { Card } from '@/components/ui/card';

export const metadata: Metadata = { title: 'Staff' };

export default async function AdminStaffPage() {
  const session = await requireStaffSession();

  if (!isSuperAdmin(session)) {
    return (
      <div className="flex max-w-2xl flex-col gap-6">
        <h1 className="text-page-title font-bold tracking-tight text-foreground">Staff</h1>
        <Card className="flex flex-col items-center gap-3 p-10 text-center">
          <ShieldAlert className="size-8 text-warning" aria-hidden="true" />
          <p className="text-card-title font-semibold text-foreground">Super admin access required</p>
          <p className="text-sm text-muted-foreground">
            Managing who has staff access is one of the most sensitive actions in this platform — only a super admin can do it.
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
          <h1 className="text-page-title font-bold tracking-tight text-foreground">Staff</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Invite staff, change roles, and disable or remove access — all takes effect immediately, no shell access needed.
          </p>
        </div>
        <InviteStaffDialog />
      </div>

      <StaffTable staff={staff} currentUid={session.uid} />
    </div>
  );
}
