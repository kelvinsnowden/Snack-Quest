'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

/**
 * The other half of `needsManualReview`: Daraja confirmed the payment
 * succeeded, but the query carries no receipt, so completing the order
 * needs a human to type in the M-Pesa receipt read off the statement or
 * the confirmation SMS (§ payment reconciliation: complete manually).
 * Never guesses or reuses a number from anywhere else on the page.
 */
export function CompleteManuallyForm({ intentId, onDone }: { intentId: string; onDone?: () => void }) {
  const router = useRouter();
  const [receipt, setReceipt] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!receipt.trim()) {
      setError('Enter the M-Pesa receipt number first.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/payments/${intentId}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mpesaReceiptNumber: receipt.trim() }),
      });
      const data = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        throw new Error(data?.error ?? `The check failed (HTTP ${response.status}).`);
      }
      if (onDone) onDone();
      else router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not complete this payment.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-2 flex flex-wrap items-start gap-2">
      <Input
        value={receipt}
        onChange={(event) => setReceipt(event.target.value)}
        placeholder="M-Pesa receipt, e.g. QGH7XXXXXX"
        className="max-w-56"
      />
      <Button onClick={submit} loading={busy} size="sm" variant="outline">
        Mark as paid
      </Button>
      {error ? <span className="text-caption text-danger">{error}</span> : null}
    </div>
  );
}

