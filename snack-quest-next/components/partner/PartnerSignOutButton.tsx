'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function PartnerSignOutButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleSignOut() {
    startTransition(async () => {
      await fetch('/api/vending/partners/auth/logout', { method: 'POST' });
      router.replace('/partner/login');
      router.refresh();
    });
  }

  return (
    <Button variant="ghost" size="sm" onClick={handleSignOut} loading={isPending}>
      <LogOut aria-hidden="true" />
      Sign out
    </Button>
  );
}
