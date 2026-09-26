'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, RotateCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Issues a `restart` command to a machine (§ types/machineCommand.ts).
 * Deliberately the only command type exposed here — see that type's
 * own doc comment for why the union is one member wide. Never shown
 * for a machine whose resolved adapter doesn't declare
 * `remote_restart` (the caller decides that, not this component) —
 * a control for a capability the machine can't act on would be a lie
 * about what pressing it does.
 *
 * Issuing writes a `pending` command; it is not proof the machine
 * restarted, only that the request now exists for the machine to
 * discover on its own next poll. `router.refresh()` re-reads the
 * command history from the server so the new row (and its status as
 * it changes on later poll/ack/complete calls) shows up without a
 * manual reload.
 */
export function IssueMachineCommandAction({ machineId }: { machineId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function issue() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/vending/machines/${machineId}/commands`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commandType: 'restart' }),
      });
      const data = (await response.json().catch(() => null)) as { commandRef?: string; error?: string } | null;
      if (!response.ok) {
        throw new Error(data?.error ?? `Could not issue the command (HTTP ${response.status}).`);
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not issue the command.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Button onClick={issue} loading={busy} size="sm" variant="outline">
        <RotateCw className="size-4" aria-hidden="true" />
        Issue restart command
      </Button>
      <p className="text-caption text-muted-foreground">
        Delivered on the machine&apos;s next poll — not synchronous. Watch the command history below for its status.
      </p>
      {error ? (
        <p className="flex items-start gap-2 text-sm text-danger">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </p>
      ) : null}
    </div>
  );
}
