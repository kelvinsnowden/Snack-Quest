'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Copy, Check, Mail, MailWarning } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import type { StaffRole } from '@/types';

const ROLE_OPTIONS: { value: StaffRole; label: string }[] = [
  { value: 'admin', label: 'Admin' },
  { value: 'super_admin', label: 'Super admin' },
  { value: 'agent', label: 'Agent (Sales)' },
  { value: 'warehouse', label: 'Warehouse' },
  { value: 'finance', label: 'Finance' },
];

const DEFAULTS = { email: '', displayName: '', role: 'admin' as StaffRole, department: '' };

export function InviteStaffDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState(DEFAULTS);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ resetLink: string; emailAttempted: boolean } | null>(null);
  const [copied, setCopied] = useState(false);

  function reset() {
    setValues(DEFAULTS);
    setError(null);
    setResult(null);
    setCopied(false);
  }

  async function onSubmit() {
    if (!values.email.trim() || !values.displayName.trim() || !values.department.trim()) {
      setError('Email, name, and department are all required.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch('/api/admin/staff', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: values.email.trim(),
          displayName: values.displayName.trim(),
          role: values.role,
          department: values.department.trim(),
        }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? 'Could not invite this staff member.');
      }
      const body = (await response.json()) as { resetLink: string; emailAttempted: boolean };
      setResult(body);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not invite this staff member.');
    } finally {
      setSubmitting(false);
    }
  }

  async function copyLink() {
    if (!result) return;
    await navigator.clipboard.writeText(result.resetLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="size-4" aria-hidden="true" />
          Invite staff
        </Button>
      </DialogTrigger>
      <DialogContent>
        {result ? (
          <>
            <DialogHeader>
              <DialogTitle>Staff account created</DialogTitle>
              <DialogDescription>
                {result.emailAttempted ? (
                  <span className="flex items-center gap-1.5 text-success">
                    <Mail className="size-4" aria-hidden="true" />
                    An invite email was sent — you can also share the link below yourself.
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 text-warning">
                    <MailWarning className="size-4" aria-hidden="true" />
                    Email delivery isn&apos;t set up — share this link with them yourself.
                  </span>
                )}
              </DialogDescription>
            </DialogHeader>
            <div className="mt-4 flex items-center gap-2 rounded-md border border-border bg-border/10 p-3">
              <code className="flex-1 truncate text-xs text-foreground">{result.resetLink}</code>
              <Button size="sm" variant="outline" onClick={copyLink}>
                {copied ? <Check className="size-4" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}
                {copied ? 'Copied' : 'Copy'}
              </Button>
            </div>
            <DialogFooter>
              <Button
                onClick={() => {
                  setOpen(false);
                  reset();
                }}
              >
                Done
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Invite staff</DialogTitle>
              <DialogDescription>Creates a real account and a password-reset link — no shell access needed.</DialogDescription>
            </DialogHeader>
            <div className="mt-4 flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="invite-name">Full name</Label>
                <Input
                  id="invite-name"
                  value={values.displayName}
                  onChange={(event) => setValues((v) => ({ ...v, displayName: event.target.value }))}
                  placeholder="e.g. Amina Hassan"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="invite-email">Email</Label>
                <Input
                  id="invite-email"
                  type="email"
                  value={values.email}
                  onChange={(event) => setValues((v) => ({ ...v, email: event.target.value }))}
                  placeholder="amina@example.com"
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="invite-role">Role</Label>
                  <select
                    id="invite-role"
                    className="h-10 rounded-md border border-border bg-surface px-3 text-sm text-foreground"
                    value={values.role}
                    onChange={(event) => setValues((v) => ({ ...v, role: event.target.value as StaffRole }))}
                  >
                    {ROLE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="invite-department">Department</Label>
                  <Input
                    id="invite-department"
                    value={values.department}
                    onChange={(event) => setValues((v) => ({ ...v, department: event.target.value }))}
                    placeholder="e.g. Sales"
                  />
                </div>
              </div>
              {error ? <p className="text-sm text-danger">{error}</p> : null}
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setOpen(false)} disabled={submitting}>
                Cancel
              </Button>
              <Button onClick={onSubmit} loading={submitting}>
                Send invite
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
