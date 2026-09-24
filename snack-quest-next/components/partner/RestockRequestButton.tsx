'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, PackagePlus } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * § QUICK ACTIONS "Request Restock" — opens a real draft restock task
 * through the same staged workflow every other restock goes through
 * (`ownerPortalService.requestRestock` → `restockTaskService.createDraft`);
 * this button never bypasses approve/pick/dispatch/receive.
 */
export function RestockRequestButton({ machineId }: { machineId: string }) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleClick() {
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(`/api/vending/partners/me/machines/${machineId}/restock-request`, { method: 'POST' });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        setError(response.status === 409 ? 'All slots are already well stocked — nothing to restock.' : (data.error ?? 'Could not request a restock.'));
        return;
      }
      setSuccess(true);
      router.refresh();
    } catch {
      setError('Could not reach Snack Quest. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Button type="button" variant="secondary" onClick={handleClick} loading={submitting} disabled={success}>
        <PackagePlus aria-hidden="true" />
        {success ? 'Restock requested' : 'Request Restock'}
      </Button>
      {error ? (
        <p role="alert" className="flex items-start gap-2 rounded-md bg-danger/10 px-3 py-2 text-xs text-danger">
          <AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          {error}
        </p>
      ) : null}
    </div>
  );
}
