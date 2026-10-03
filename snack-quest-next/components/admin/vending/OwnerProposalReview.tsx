'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

/**
 * Accept or send back one owner's screen design proposal (§ OWNER SCREEN
 * DESIGN). Accepting publishes it on that owner's machines, checked like
 * any publish; sending it back needs a reason the owner will see.
 */
export function OwnerProposalReview({ partnerId, ownerName, updatedAtMillis }: { partnerId: string; ownerName: string; updatedAtMillis: number }) {
  const router = useRouter();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<'accept' | 'decline' | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function act(action: 'accept' | 'decline') {
    setBusy(action);
    setError(null);
    try {
      const url = action === 'accept' ? `/api/vending/kiosk/owner-proposals/${encodeURIComponent(partnerId)}/accept` : `/api/vending/kiosk/owner-proposals/${encodeURIComponent(partnerId)}/decline`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note, seenUpdatedAtMillis: updatedAtMillis }),
      });
      const data = (await response.json().catch(() => null)) as { error?: string; problems?: string[] } | null;
      if (!response.ok) throw new Error(data?.problems?.length ? data.problems.join(' ') : (data?.error ?? `Couldn’t save (HTTP ${response.status}).`));
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Something went wrong.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Note</span>
        <Input value={note} maxLength={500} onChange={(event) => setNote(event.target.value)} placeholder={`What changes, or why it goes back to ${ownerName}`} className="min-h-10" />
      </label>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => act('accept')} loading={busy === 'accept'} disabled={Boolean(busy) || !note.trim()}>
          Accept and publish
        </Button>
        <Button size="sm" variant="outline" onClick={() => act('decline')} loading={busy === 'decline'} disabled={Boolean(busy) || note.trim().length < 3}>
          Send back
        </Button>
      </div>
      {error ? (
        <p role="alert" className="flex items-start gap-2 text-sm text-danger">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {error}
        </p>
      ) : null}
    </div>
  );
}
