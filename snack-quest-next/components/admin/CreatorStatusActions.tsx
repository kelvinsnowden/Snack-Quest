'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, type ButtonProps } from '@/components/ui/button';
import { CREATOR_STATUS_LABELS, VALID_CREATOR_TRANSITIONS } from '@/lib/creators/transitions';
import type { CreatorStatus } from '@/types';

const VARIANT_FOR_TARGET: Record<CreatorStatus, ButtonProps['variant']> = {
  pending: 'outline',
  active: 'primary',
  suspended: 'danger',
};

const ACTION_LABEL: Record<CreatorStatus, string> = {
  pending: 'Move to pending',
  active: 'Approve',
  suspended: 'Suspend',
};

export function CreatorStatusActions({ uid, status }: { uid: string; status: CreatorStatus }) {
  const router = useRouter();
  const [pendingTarget, setPendingTarget] = useState<CreatorStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  const nextStatuses = VALID_CREATOR_TRANSITIONS[status];
  if (nextStatuses.length === 0) {
    return null;
  }

  async function transitionTo(next: CreatorStatus) {
    setPendingTarget(next);
    setError(null);
    try {
      const response = await fetch(`/api/admin/creators/${uid}/status`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: next }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? 'Could not update this creator.');
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update this creator.');
    } finally {
      setPendingTarget(null);
    }
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap justify-end gap-2">
        {nextStatuses.map((next) => (
          <Button
            key={next}
            variant={VARIANT_FOR_TARGET[next]}
            size="sm"
            loading={pendingTarget === next}
            disabled={pendingTarget !== null && pendingTarget !== next}
            onClick={() => transitionTo(next)}
          >
            {ACTION_LABEL[next] ?? `Mark as ${CREATOR_STATUS_LABELS[next]}`}
          </Button>
        ))}
      </div>
      {error ? <p className="text-xs text-danger">{error}</p> : null}
    </div>
  );
}
