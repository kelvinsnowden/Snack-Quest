'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, LogOut } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

/**
 * The account control in the Owner Portal's own header (§ Owner Portal
 * dark redesign) — replaces the old always-visible "Sign out" button
 * with the avatar + dropdown pattern the reference mockup uses. Sign
 * out is the same request `PartnerSignOutButton` made; this owns it
 * directly rather than nesting that component (a `Button` inside a
 * `DropdownMenuItem` fights the item's own click handling).
 */
export function PartnerAccountMenu({ name, contactEmail }: { name: string; contactEmail: string | null }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const initial = name.trim().charAt(0).toUpperCase() || '?';

  function handleSignOut() {
    startTransition(async () => {
      await fetch('/api/vending/partners/auth/logout', { method: 'POST' });
      router.replace('/partner/login');
      router.refresh();
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-1.5 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background">
        <Avatar>
          <AvatarFallback className="bg-secondary text-secondary-foreground font-bold">{initial}</AvatarFallback>
        </Avatar>
        <ChevronDown className="size-4 text-muted-foreground" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel className="flex flex-col gap-0.5">
          <span className="text-sm font-semibold text-foreground">{name}</span>
          {contactEmail ? <span className="text-xs font-normal text-muted-foreground">{contactEmail}</span> : null}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="danger" disabled={isPending} onSelect={handleSignOut}>
          <LogOut aria-hidden="true" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
