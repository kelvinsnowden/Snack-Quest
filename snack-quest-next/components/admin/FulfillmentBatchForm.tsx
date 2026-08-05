'use client';

import { useMemo, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { allocateEqualSplit } from '@/lib/fulfillmentBatches/allocation';
import { formatKes } from '@/lib/orders/format';

export interface BatchableOrderSummary {
  id: string;
  customerName: string;
  packageLabel: string;
  totalKes: number;
}

function parseNonNegative(value: string): number {
  if (value.trim() === '') return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : NaN;
}

export function FulfillmentBatchForm({ orders }: { orders: BatchableOrderSummary[] }) {
  const router = useRouter();
  const [productsPurchasedKes, setProductsPurchasedKes] = useState('');
  const [packagingKes, setPackagingKes] = useState('');
  const [deliveryKes, setDeliveryKes] = useState('');
  const [miscKes, setMiscKes] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const orderIds = useMemo(() => orders.map((order) => order.id), [orders]);
  const totalRevenueKes = useMemo(() => orders.reduce((sum, order) => sum + order.totalKes, 0), [orders]);

  const parsedCosts = useMemo(
    () => ({
      productsPurchasedKes: parseNonNegative(productsPurchasedKes),
      packagingKes: parseNonNegative(packagingKes),
      deliveryKes: parseNonNegative(deliveryKes),
      miscKes: parseNonNegative(miscKes),
    }),
    [productsPurchasedKes, packagingKes, deliveryKes, miscKes],
  );
  const costsValid = Object.values(parsedCosts).every((value) => Number.isFinite(value) && value >= 0);
  const totalCostKes = costsValid
    ? parsedCosts.productsPurchasedKes + parsedCosts.packagingKes + parsedCosts.deliveryKes + parsedCosts.miscKes
    : 0;
  const allocations = useMemo(
    () => (costsValid ? allocateEqualSplit(totalCostKes, orderIds) : {}),
    [costsValid, totalCostKes, orderIds],
  );
  const grossProfitKes = totalRevenueKes - totalCostKes;
  const profitMarginPct = totalRevenueKes > 0 ? (grossProfitKes / totalRevenueKes) * 100 : 0;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const productsPurchased = parseNonNegative(productsPurchasedKes);
    if (!Number.isFinite(productsPurchased) || productsPurchased <= 0) {
      setError('Products purchased must be greater than zero — that\'s the whole point of the trip.');
      return;
    }
    if (!costsValid) {
      setError('Every cost must be a non-negative number.');
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch('/api/admin/fulfillment-batches', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          orderIds,
          productsPurchasedKes: productsPurchased,
          packagingKes: parsedCosts.packagingKes || undefined,
          deliveryKes: parsedCosts.deliveryKes || undefined,
          miscKes: parsedCosts.miscKes || undefined,
          notes: notes.trim() || undefined,
        }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? 'Could not create this fulfillment batch.');
      }
      const body = (await response.json()) as { fulfillmentBatchId: string };
      router.push(`/admin/fulfillment-batches/${body.fulfillmentBatchId}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create this fulfillment batch.');
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Orders in this batch</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="border-b border-border bg-border/20 text-left text-caption text-muted-foreground uppercase">
                <tr>
                  <th className="px-4 py-3 font-medium">Customer</th>
                  <th className="px-4 py-3 font-medium">Box</th>
                  <th className="px-4 py-3 font-medium">Revenue</th>
                  <th className="px-4 py-3 font-medium">Allocated cost</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <tr key={order.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 font-medium text-foreground">{order.customerName}</td>
                    <td className="px-4 py-3 text-foreground">{order.packageLabel}</td>
                    <td className="px-4 py-3 tabular-nums text-foreground">{formatKes(order.totalKes)}</td>
                    <td className="px-4 py-3 tabular-nums text-foreground">
                      {formatKes(allocations[order.id] ?? 0)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Shopping trip costs</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="productsPurchasedKes">Products purchased (KES)</Label>
            <Input
              id="productsPurchasedKes"
              type="number"
              min={0}
              step={1}
              value={productsPurchasedKes}
              onChange={(event) => setProductsPurchasedKes(event.target.value)}
              placeholder="6000"
            />
          </div>
          <div className="grid gap-5 sm:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="packagingKes">
                Packaging <span className="text-muted-foreground">(optional)</span>
              </Label>
              <Input
                id="packagingKes"
                type="number"
                min={0}
                step={1}
                value={packagingKes}
                onChange={(event) => setPackagingKes(event.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="deliveryKes">
                Delivery <span className="text-muted-foreground">(optional)</span>
              </Label>
              <Input
                id="deliveryKes"
                type="number"
                min={0}
                step={1}
                value={deliveryKes}
                onChange={(event) => setDeliveryKes(event.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="miscKes">
                Miscellaneous <span className="text-muted-foreground">(optional)</span>
              </Label>
              <Input
                id="miscKes"
                type="number"
                min={0}
                step={1}
                value={miscKes}
                onChange={(event) => setMiscKes(event.target.value)}
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="notes">
              Notes <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Textarea id="notes" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Carrefour Two Rivers, 2pm run" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Economics</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-4">
          <div>
            <p className="text-caption text-muted-foreground uppercase">Revenue</p>
            <p className="mt-1 text-lg font-semibold tabular-nums text-foreground">{formatKes(totalRevenueKes)}</p>
          </div>
          <div>
            <p className="text-caption text-muted-foreground uppercase">Total cost</p>
            <p className="mt-1 text-lg font-semibold tabular-nums text-foreground">{formatKes(totalCostKes)}</p>
          </div>
          <div>
            <p className="text-caption text-muted-foreground uppercase">Gross profit</p>
            <p className={`mt-1 text-lg font-semibold tabular-nums ${grossProfitKes < 0 ? 'text-danger' : 'text-foreground'}`}>
              {formatKes(grossProfitKes)}
            </p>
          </div>
          <div>
            <p className="text-caption text-muted-foreground uppercase">Margin</p>
            <p className={`mt-1 text-lg font-semibold tabular-nums ${grossProfitKes < 0 ? 'text-danger' : 'text-foreground'}`}>
              {profitMarginPct.toFixed(1)}%
            </p>
          </div>
        </CardContent>
      </Card>

      {error ? <p className="text-sm text-danger">{error}</p> : null}

      <div className="flex items-center gap-3">
        <Button type="submit" loading={submitting} disabled={orders.length === 0}>
          Create fulfillment batch
        </Button>
        <Button type="button" variant="ghost" onClick={() => router.push('/admin/orders')} disabled={submitting}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
