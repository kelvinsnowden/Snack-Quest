'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, CheckCircle2, RefreshCw } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface Outcome {
  intentId: string;
  checkoutRequestId: string;
  outcome: string;
  reviewReason?: string;
}

/**
 * The other half of `needsManualReview`: Daraja confirmed the payment
 * succeeded, but the query carries no receipt, so completing the order
 * needs a human to type in the M-Pesa receipt read off the statement or
 * the confirmation SMS (§ payment reconciliation: complete manually).
 * Never guesses or reuses a number from anywhere else on the page.
 */
function CompleteManuallyForm({ intentId, onDone }: { intentId: string; onDone: () => void }) {
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
      onDone();
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

/**
 * Asks Safaricom about payments stuck in `processing`, now rather than
 * at 02:00 (§ Payment reconciliation).
 *
 * The reason this exists: an STK push that Safaricom accepts and then
 * never calls back about leaves a customer on a spinner and an operator
 * with nothing to go on. Safaricom's STK Push Query knows the answer
 * within seconds, the codebase could already ask it, and nothing
 * exposed that to a human.
 *
 * Outcomes are shown verbatim rather than summarised into "done". The
 * whole point is to read what Safaricom actually said about a specific
 * checkout request.
 */
export function ReconcileNowButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ checked: number; outcomes: Outcome[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [completedIntentIds, setCompletedIntentIds] = useState<Set<string>>(new Set());

  async function run() {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const response = await fetch('/api/admin/payments/reconcile', { method: 'POST' });
      const data = (await response.json().catch(() => null)) as
        | { checked: number; outcomes: Outcome[]; error?: string }
        | null;
      if (!response.ok || !data) {
        throw new Error(data?.error ?? `The check failed (HTTP ${response.status}).`);
      }
      setResult(data);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The check failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="flex flex-col gap-3 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-card-title font-semibold text-foreground">Check stuck payments</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Asks Safaricom what happened to any payment still waiting. Runs automatically overnight — use this when
            someone is waiting now.
          </p>
        </div>
        <Button onClick={run} loading={busy} variant="outline">
          <RefreshCw className="size-4" aria-hidden="true" />
          Check now
        </Button>
      </div>

      {error ? (
        <p className="flex items-start gap-2 text-sm text-danger">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </p>
      ) : null}

      {result ? (
        result.checked === 0 ? (
          <p className="flex items-start gap-2 text-sm text-muted-foreground">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
            <span>No payments are waiting — nothing to check.</span>
          </p>
        ) : (
          <ul className="flex flex-col gap-2 border-t border-border pt-3">
            {result.outcomes.map((outcome) => (
              <li key={outcome.checkoutRequestId} className="flex flex-col gap-0.5">
                <span className="text-sm font-medium text-foreground">
                  {outcome.outcome}
                  <span className="ml-2 font-normal text-muted-foreground">{outcome.checkoutRequestId}</span>
                </span>
                {outcome.reviewReason ? (
                  <span className="text-caption text-muted-foreground">{outcome.reviewReason}</span>
                ) : null}
                {outcome.outcome === 'needsManualReview' ? (
                  completedIntentIds.has(outcome.intentId) ? (
                    <p className="mt-2 flex items-center gap-2 text-sm text-success">
                      <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" />
                      Marked as paid — the order is being created now.
                    </p>
                  ) : (
                    <CompleteManuallyForm
                      intentId={outcome.intentId}
                      onDone={() => {
                        setCompletedIntentIds((prev) => new Set(prev).add(outcome.intentId));
                        router.refresh();
                      }}
                    />
                  )
                ) : null}
              </li>
            ))}
          </ul>
        )
      ) : null}
    </Card>
  );
}
