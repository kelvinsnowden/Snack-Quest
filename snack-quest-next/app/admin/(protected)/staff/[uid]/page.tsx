import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { requireStaffSession } from '@/lib/auth/session';
import { effectivePermissionsOf, findTemplate, permissionLabel, isPermissionKey } from '@/lib/auth/permissions';
import { staffManagementService } from '@/services/staffManagementService';
import { staffRepository } from '@/repositories/staffRepository';
import { auditLogRepository } from '@/repositories/auditLogRepository';
import { BUSINESS_TIME_ZONE } from '@/lib/vending/businessClock';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AccessEditor } from '@/components/admin/AccessEditor';

export const metadata: Metadata = { title: 'Staff access' };

const when = new Intl.DateTimeFormat('en-KE', { timeZone: BUSINESS_TIME_ZONE, day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });

const ACTION_LABEL: Record<string, string> = {
  'staff.change_access': 'Access changed',
  'staff.change_role': 'Role changed',
  'staff.change_permissions': 'Admin areas changed',
  'staff.disable': 'Disabled',
  'staff.reactivate': 'Reactivated',
  'staff.invite': 'Invited',
};

/** One person's access: what they can do, why, and every change to it. The layout already requires `users.manage`. */
export default async function StaffAccessPage({ params }: { params: Promise<{ uid: string }> }) {
  const session = await requireStaffSession();
  const { uid } = await params;
  const [member, profile, history] = await Promise.all([
    staffManagementService.getStaffMember(session.businessId, uid),
    staffRepository.findById(uid),
    auditLogRepository.listForEntities(session.businessId, [uid], 30),
  ]);
  if (!member || !profile) notFound();

  const isSelf = uid === session.uid;
  const isSuper = member.roles.includes('super_admin');
  const readOnlyReason = isSelf ? 'This is your own account. Someone else with access to staff has to change your access.' : isSuper ? 'A super admin always has every permission. Change their role on the Users page to narrow what they can do.' : null;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/admin/staff" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" aria-hidden="true" />
          Users & permissions
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">{member.displayName}</h1>
          <Badge variant="outline">{member.role.replace('_', ' ')}</Badge>
          {member.disabled ? <Badge variant="danger">Disabled</Badge> : null}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {member.email} · {findTemplate(member.template)?.label ?? 'Role default'} · {member.effectivePermissions.length} permissions ·{' '}
          <Link href={`/admin/staff/${encodeURIComponent(uid)}/access`} className="text-primary hover:underline">
            What can they do?
          </Link>
        </p>
      </div>

      <AccessEditor
        member={{
          uid: member.uid,
          displayName: member.displayName,
          roles: member.roles,
          template: member.template,
          grantedPermissions: member.grantedPermissions,
          revokedPermissions: member.revokedPermissions,
          legacySections: profile.permissions,
        }}
        editorPermissions={effectivePermissionsOf(session)}
        canEdit={!readOnlyReason}
        readOnlyReason={readOnlyReason}
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">History</CardTitle>
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground">No changes recorded.</p>
          ) : (
            <ol className="flex flex-col gap-3">
              {history.map(({ id, data }) => {
                const before = new Set(((data.before?.permissions as string[] | undefined) ?? []));
                const after = new Set(((data.after?.permissions as string[] | undefined) ?? []));
                const gained = [...after].filter((key) => !before.has(key) && isPermissionKey(key));
                const lost = [...before].filter((key) => !after.has(key) && isPermissionKey(key));
                return (
                  <li key={id} className="text-sm">
                    <p className="text-foreground">
                      <span className="font-medium">{ACTION_LABEL[data.action] ?? data.action}</span>
                      <span className="text-muted-foreground"> · {data.createdAt ? when.format(data.createdAt.toDate()) : ''} · by {data.actorId}</span>
                    </p>
                    {typeof data.after?.role === 'string' ? <p className="text-muted-foreground">New role: {data.after.role}</p> : null}
                    {gained.length > 0 ? <p className="text-success">Gained: {gained.map((key) => permissionLabel(key).toLowerCase()).join('; ')}</p> : null}
                    {lost.length > 0 ? <p className="text-danger">Lost: {lost.map((key) => permissionLabel(key).toLowerCase()).join('; ')}</p> : null}
                  </li>
                );
              })}
            </ol>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
