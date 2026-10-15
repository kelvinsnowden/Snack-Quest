'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';

/** Copies `/own` applications made before the CRM existed into it. Safe to press more than once. */
export function ImportOwnApplicationsButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch('/api/admin/vending/leads/import-own', { method: 'POST' });
      if (!response.ok) throw new Error();
      const data = (await response.json()) as { imported: number; alreadyThere: number };
      setMessage(
        data.imported === 0
          ? 'Nothing new — every /own application is already here.'
          : `Added ${data.imported} application${data.imported === 1 ? '' : 's'}.`,
      );
      router.refresh();
    } catch {
      setMessage('That didn’t work. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button type="button" size="sm" variant="outline" disabled={busy} onClick={run}>
        {busy ? 'Importing…' : 'Import /own applications'}
      </Button>
      {message ? <p className="text-muted-foreground text-sm">{message}</p> : null}
    </div>
  );
}
