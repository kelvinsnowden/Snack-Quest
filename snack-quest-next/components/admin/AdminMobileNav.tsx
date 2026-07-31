'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { ADMIN_NAV_ITEMS } from './adminNav';

/** The mobile equivalent of AdminSidebar — same nav items, a drawer instead of a fixed rail, so navigation is never hidden on small screens (design-system skill: "Never hide critical functionality on mobile"). */
export function AdminMobileNav({ businessName }: { businessName: string }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <Button
        variant="ghost"
        size="icon"
        className="md:hidden"
        aria-label="Open navigation menu"
        onClick={() => setOpen(true)}
      >
        <Menu aria-hidden="true" />
      </Button>
      <SheetContent side="left">
        <SheetHeader>
          <SheetTitle>{businessName}</SheetTitle>
          <SheetDescription>Admin navigation</SheetDescription>
        </SheetHeader>
        <nav aria-label="Admin navigation" className="flex-1 space-y-0.5 overflow-y-auto px-3 pb-5">
          {ADMIN_NAV_ITEMS.map((item) => {
            const isActive = pathname === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-border/40 hover:text-foreground',
                )}
              >
                <Icon className="size-4 shrink-0" aria-hidden="true" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </SheetContent>
    </Sheet>
  );
}
