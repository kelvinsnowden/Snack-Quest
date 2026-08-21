'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Closes a run, or reopens a closed one (§ Box Recipes).
 *
 * Pinned to the bottom of the viewport rather than sitting at the end of
 * the list: on a long list this is the one action someone needs when
 * they are done, and making them scroll past forty snacks to reach it
 * is the kind of thing that gets it skipped.
 *
 * Closing with lines still unbought is allowed and only warned about.
 * Shops run out; a run that could not be closed until everything was
 * ticked would push someone into ticking a line they never bought,
 * which would make the recorded costs false.
 */
export function CompleteShoppingRun({
  runId,
  status,
  remaining,
}: {
  runId: string;
  status: 'open' | 'completed';
  remaining: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function post(reopen: boolean) {
    if (!reopen && remaining > 0) {
      const ok = confirm(
        `${remaining} item${remaining === 1 ? '' : 's'} still unbought.\n\nClose the run anyway? Do this if the shop ran out — not to tidy the list up.`,
      );
      if (!ok) return;
    }
    setBusy(true);
    try {
      await fetch(`/api/warehouse/shopping-runs/${runId}/complete${reopen ? '?reopen=true' : ''}`, { method: 'POST' });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-x-0 bottom-0 border-t border-border bg-surface/95 p-3 backdrop-blur md:left-auto md:right-8 md:w-80 md:rounded-t-xl md:border">
      {status === 'open' ? (
        <Button onClick={() => post(false)} loading={busy} className="min-h-12 w-full">
          <CheckCircle2 className="size-4" aria-hidden="true" />
          Done shopping
        </Button>
      ) : (
        <Button variant="outline" onClick={() => post(true)} loading={busy} className="min-h-12 w-full">
          <RotateCcw className="size-4" aria-hidden="true" />
          Reopen this run
        </Button>
      )}
    </div>
  );
}
