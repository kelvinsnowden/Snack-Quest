'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/**
 * A human agent's manual quote for a door-delivery order (§ Human Sales
 * Agent workspace). Submitting only sends the customer an itemized
 * total ending in "reply PAY" — it does not charge them. M-Pesa STK
 * only fires once the customer themselves replies PAY, a deliberate
 * design this workspace doesn't bypass (see the route's own comment).
 */
export function DoorDeliveryPricingForm({ conversationId }: { conversationId: string }) {
  const router = useRouter();
  const [feeKes, setFeeKes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const fee = Number(feeKes);
    if (!Number.isFinite(fee) || fee < 0) {
      setError('Enter a valid delivery fee.');
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch(`/api/admin/conversations/${conversationId}/price-door-delivery`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ feeKes: fee }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? 'Could not send this quote.');
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send this quote.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card className="border-warning/40 bg-warning/5">
      <CardHeader>
        <CardTitle>Price this door delivery</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">
          Door delivery is normally priced automatically from the Fargo rate. This form is the fallback for when no rate is configured, or the address needs a quote of its own. The customer gets an itemized total and is
          asked to reply PAY — M-Pesa only charges them once they do.
        </p>
        <form onSubmit={onSubmit} className="flex items-end gap-3">
          <div className="flex flex-1 flex-col gap-1.5">
            <Label htmlFor="feeKes">Delivery fee (KES)</Label>
            <Input
              id="feeKes"
              type="number"
              min={0}
              step={1}
              value={feeKes}
              onChange={(event) => setFeeKes(event.target.value)}
              placeholder="e.g. 350"
              required
            />
          </div>
          <Button type="submit" loading={submitting}>
            Send quote
          </Button>
        </form>
        {error ? <p className="text-sm text-danger">{error}</p> : null}
      </CardContent>
    </Card>
  );
}
