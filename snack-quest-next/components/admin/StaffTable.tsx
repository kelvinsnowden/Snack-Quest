'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Copy, Check, KeyRound, UserX, UserCheck, Trash2, UserCog } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { StaffListItem } from '@/services/staffManagementService';
import type { StaffRole } from '@/types';

const ROLE_LABELS: Record<StaffRole, string> = {
  super_admin: 'Super admin',
  admin: 'Admin',
  agent: 'Agent',
  warehouse: 'Warehouse',
  finance: 'Finance',
};

const ROLE_OPTIONS: StaffRole[] = ['super_admin', 'admin', 'agent', 'warehouse', 'finance'];

function ResetLinkDialog({ open, onOpenChange, resetLink }: { open: boolean; onOpenChange: (open: boolean) => void; resetLink: string | null }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    if (!resetLink) return;
    await navigator.clipboard.writeText(resetLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Password reset link</DialogTitle>
          <DialogDescription>Single-use, expires after a while. Share it with the staff member yourself.</DialogDescription>
        </DialogHeader>
        <div className="mt-4 flex items-center gap-2 rounded-md border border-border bg-border/10 p-3">
          <code className="flex-1 truncate text-xs text-foreground">{resetLink}</code>
          <Button size="sm" variant="outline" onClick={copy}>
            {copied ? <Check className="size-4" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}
            {copied ? 'Copied' : 'Copy'}
          </Button>
        </div>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function StaffTable({ staff, currentUid }: { staff: StaffListItem[]; currentUid: string }) {
  const router = useRouter();
  const [busyUid, setBusyUid] = useState<string | null>(null);
  const [resetLink, setResetLink] = useState<string | null>(null);
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function patch(uid: string, body: Record<string, unknown>) {
    setBusyUid(uid);
    setError(null);
    try {
      const response = await fetch(`/api/admin/staff/${uid}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? 'Could not update this staff member.');
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update this staff member.');
    } finally {
      setBusyUid(null);
    }
  }

  async function onRemove(uid: string, displayName: string) {
    if (!confirm(`Remove ${displayName}? They'll immediately lose access. This can be reversed only by inviting them again.`)) {
      return;
    }
    setBusyUid(uid);
    setError(null);
    try {
      const response = await fetch(`/api/admin/staff/${uid}`, { method: 'DELETE' });
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? 'Could not remove this staff member.');
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove this staff member.');
    } finally {
      setBusyUid(null);
    }
  }

  async function onResetPassword(uid: string) {
    setBusyUid(uid);
    setError(null);
    try {
      const response = await fetch(`/api/admin/staff/${uid}/reset-password`, { method: 'POST' });
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? 'Could not generate a reset link.');
      }
      const data = (await response.json()) as { resetLink: string };
      setResetLink(data.resetLink);
      setResetDialogOpen(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not generate a reset link.');
    } finally {
      setBusyUid(null);
    }
  }

  if (staff.length === 0) {
    return <EmptyState icon={UserCog} title="No staff yet" description="Invite your first staff member to get started." />;
  }

  return (
    <>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="border-b border-border bg-border/20 text-left text-caption text-muted-foreground uppercase">
              <tr>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Role</th>
                <th className="px-4 py-3 font-medium">Department</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Last sign-in</th>
                <th className="px-4 py-3 font-medium" />
              </tr>
            </thead>
            <tbody>
              {staff.map((member) => {
                const isSelf = member.uid === currentUid;
                const busy = busyUid === member.uid;
                return (
                  <tr key={member.uid} className="border-b border-border last:border-0 hover:bg-border/20">
                    <td className="px-4 py-3">
                      <p className="font-medium text-foreground">
                        {member.displayName}
                        {isSelf ? <span className="ml-1.5 text-caption text-muted-foreground">(you)</span> : null}
                      </p>
                      <p className="text-caption text-muted-foreground">{member.email}</p>
                    </td>
                    <td className="px-4 py-3">
                      <select
                        className="h-8 rounded-md border border-border bg-surface px-2 text-sm text-foreground disabled:opacity-50"
                        value={member.role}
                        disabled={isSelf || busy}
                        onChange={(event) => patch(member.uid, { role: event.target.value })}
                      >
                        {ROLE_OPTIONS.map((role) => (
                          <option key={role} value={role}>
                            {ROLE_LABELS[role]}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3 text-foreground">{member.department}</td>
                    <td className="px-4 py-3">
                      <Badge variant={member.disabled ? 'danger' : 'success'}>{member.disabled ? 'Disabled' : 'Active'}</Badge>
                    </td>
                    <td className="px-4 py-3 text-caption text-muted-foreground">
                      {member.lastSignInAt ? new Date(member.lastSignInAt).toLocaleString() : 'Never'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1.5">
                        <Button variant="ghost" size="sm" onClick={() => onResetPassword(member.uid)} disabled={busy}>
                          <KeyRound className="size-4" aria-hidden="true" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={isSelf || busy}
                          onClick={() => patch(member.uid, { disabled: !member.disabled })}
                        >
                          {member.disabled ? <UserCheck className="size-4" aria-hidden="true" /> : <UserX className="size-4" aria-hidden="true" />}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={isSelf || busy}
                          onClick={() => onRemove(member.uid, member.displayName)}
                        >
                          <Trash2 className="size-4 text-danger" aria-hidden="true" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <ResetLinkDialog open={resetDialogOpen} onOpenChange={setResetDialogOpen} resetLink={resetLink} />
    </>
  );
}
