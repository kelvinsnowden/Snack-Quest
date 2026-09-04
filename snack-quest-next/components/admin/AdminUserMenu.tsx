'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Check, LogOut } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { activeWorkspace, workspacesFor } from '@/lib/auth/staffWorkspaces';

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase();
}

function roleLabel(role: string): string {
  return role
    .split('_')
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(' ');
}

export function AdminUserMenu({
  displayName,
  email,
  role,
  roles = [],
}: {
  displayName: string;
  email: string;
  role: string;
  /**
   * Every role on the session, which decides what the switcher may
   * offer. Defaults to empty so a caller that has not been updated
   * renders exactly the menu it rendered before rather than a
   * switcher with nothing in it.
   */
  roles?: readonly string[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const workspaces = workspacesFor(roles);
  const current = activeWorkspace(pathname ?? '');
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  function handleLogout() {
    setOpen(false);
    startTransition(async () => {
      await fetch('/api/auth/logout', { method: 'POST' });
      router.replace('/admin/login');
      router.refresh();
    });
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-2 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          aria-label={`Account menu for ${displayName}`}
        >
          <Avatar>
            <AvatarFallback>{initials(displayName)}</AvatarFallback>
          </Avatar>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel className="flex flex-col gap-0.5 py-2">
          <span className="text-sm font-medium text-foreground">{displayName}</span>
          <span className="truncate text-xs font-normal text-muted-foreground">{email}</span>
          <span className="text-xs font-normal text-primary">{roleLabel(role)}</span>
        </DropdownMenuLabel>
        {/*
          Only shown when there is somewhere else to go. A single-item
          "switch workspace" list is a menu section that says the
          person is already where they must be, which is noise on
          every screen a warehouse-only account ever sees.
        */}
        {workspaces.length > 1 ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-muted-foreground text-xs font-normal">
              Switch workspace
            </DropdownMenuLabel>
            {workspaces.map((workspace) => {
              const isCurrent = workspace.href === current?.href;
              return (
                <DropdownMenuItem key={workspace.href} asChild>
                  <Link
                    href={workspace.href}
                    aria-current={isCurrent ? 'page' : undefined}
                    className="flex items-start gap-2"
                  >
                    {/*
                      The tick occupies its space either way, so the
                      labels stay on one left edge instead of shifting
                      by a row as you move between workspaces.
                    */}
                    <Check
                      aria-hidden="true"
                      className={`mt-0.5 size-4 shrink-0 ${isCurrent ? 'text-primary' : 'invisible'}`}
                    />
                    <span className="flex flex-col gap-0.5">
                      <span className="text-foreground text-sm font-medium">{workspace.label}</span>
                      <span className="text-muted-foreground text-xs">{workspace.description}</span>
                    </span>
                  </Link>
                </DropdownMenuItem>
              );
            })}
          </>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="danger" onSelect={handleLogout} disabled={isPending}>
          <LogOut aria-hidden="true" />
          {isPending ? 'Signing out…' : 'Log out'}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
