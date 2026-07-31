'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Switch } from '@/components/ui/switch';

export function CreatorReferralLinkActiveToggle({ linkId, isActive }: { linkId: string; isActive: boolean }) {
  const router = useRouter();
  const [checked, setChecked] = useState(isActive);
  const [pending, setPending] = useState(false);

  async function onCheckedChange(next: boolean) {
    setChecked(next);
    setPending(true);
    try {
      const response = await fetch(`/api/creator/referral-links/${linkId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ isActive: next }),
      });
      if (!response.ok) {
        throw new Error();
      }
      router.refresh();
    } catch {
      setChecked(!next);
    } finally {
      setPending(false);
    }
  }

  return (
    <Switch
      checked={checked}
      disabled={pending}
      onCheckedChange={onCheckedChange}
      aria-label={checked ? 'Deactivate referral link' : 'Activate referral link'}
    />
  );
}
