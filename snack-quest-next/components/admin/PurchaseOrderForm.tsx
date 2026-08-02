'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';

interface LineItemRow {
  packageId: string;
  quantity: string;
  unitCostKes: string;
}

const EMPTY_ROW: LineItemRow = { packageId: '', quantity: '', unitCostKes: '' };

export function PurchaseOrderForm({
  suppliers,
  products,
}: {
  suppliers: { id: string; name: string }[];
  products: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [supplierId, setSupplierId] = useState(suppliers[0]?.id ?? '');
  const [lineItems, setLineItems] = useState<LineItemRow[]>([{ ...EMPTY_ROW, packageId: products[0]?.id ?? '' }]);
  const [expectedDeliveryAt, setExpectedDeliveryAt] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateRow(index: number, patch: Partial<LineItemRow>) {
    setLineItems((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function addRow() {
    setLineItems((rows) => [...rows, { ...EMPTY_ROW, packageId: products[0]?.id ?? '' }]);
  }

  function removeRow(index: number) {
    setLineItems((rows) => rows.filter((_, i) => i !== index));
  }

  const totalCostKes = lineItems.reduce((sum, row) => {
    const quantity = Number(row.quantity);
    const unitCostKes = Number(row.unitCostKes);
    return Number.isFinite(quantity) && Number.isFinite(unitCostKes) ? sum + quantity * unitCostKes : sum;
  }, 0);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!supplierId) {
      setError('Choose a supplier.');
      return;
    }
    const parsedLineItems = [];
    for (const row of lineItems) {
      const quantity = Number(row.quantity);
      const unitCostKes = Number(row.unitCostKes);
      if (!row.packageId) {
        setError('Every line item needs a product.');
        return;
      }
      if (!Number.isInteger(quantity) || quantity <= 0) {
        setError('Every line item needs a whole-number quantity greater than zero.');
        return;
      }
      if (!Number.isFinite(unitCostKes) || unitCostKes < 0) {
        setError('Every line item needs a non-negative unit cost.');
        return;
      }
      parsedLineItems.push({ packageId: row.packageId, quantity, unitCostKes });
    }

    setSubmitting(true);
    try {
      const response = await fetch('/api/admin/purchase-orders', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          supplierId,
          lineItems: parsedLineItems,
          expectedDeliveryAt: expectedDeliveryAt || null,
          notes: notes.trim(),
        }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? 'Could not create this purchase order.');
      }
      const body = (await response.json()) as { purchaseOrderId: string };
      router.push(`/admin/purchase-orders/${body.purchaseOrderId}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create this purchase order.');
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6">
      <Card>
        <CardContent className="flex flex-col gap-5 pt-6">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="supplier">Supplier</Label>
            <select
              id="supplier"
              value={supplierId}
              onChange={(event) => setSupplierId(event.target.value)}
              className="flex h-10 w-full rounded-md border border-border bg-surface px-3 text-sm text-foreground shadow-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              {suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="expectedDeliveryAt">
              Expected delivery <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id="expectedDeliveryAt"
              type="date"
              value={expectedDeliveryAt}
              onChange={(event) => setExpectedDeliveryAt(event.target.value)}
            />
          </div>

          <div className="flex flex-col gap-3">
            <Label>Line items</Label>
            {lineItems.map((row, index) => (
              <div key={index} className="flex items-start gap-2">
                <select
                  value={row.packageId}
                  onChange={(event) => updateRow(index, { packageId: event.target.value })}
                  className="flex h-10 flex-1 rounded-md border border-border bg-surface px-3 text-sm text-foreground shadow-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                >
                  {products.map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.name}
                    </option>
                  ))}
                </select>
                <Input
                  type="number"
                  min={1}
                  step={1}
                  placeholder="Qty"
                  value={row.quantity}
                  onChange={(event) => updateRow(index, { quantity: event.target.value })}
                  className="w-24"
                />
                <Input
                  type="number"
                  min={0}
                  step={1}
                  placeholder="Unit cost (KES)"
                  value={row.unitCostKes}
                  onChange={(event) => updateRow(index, { unitCostKes: event.target.value })}
                  className="w-36"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => removeRow(index)}
                  disabled={lineItems.length === 1}
                  aria-label="Remove line item"
                >
                  <Trash2 className="size-4" aria-hidden="true" />
                </Button>
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={addRow} className="self-start">
              <Plus className="size-4" aria-hidden="true" />
              Add line item
            </Button>
            <p className="text-sm text-muted-foreground">
              Total: <span className="font-medium text-foreground">KES {totalCostKes.toLocaleString('en-KE')}</span>
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="notes">
              Notes <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Textarea id="notes" value={notes} onChange={(event) => setNotes(event.target.value)} />
          </div>
        </CardContent>
      </Card>

      {error ? <p className="text-sm text-danger">{error}</p> : null}

      <div className="flex items-center gap-3">
        <Button type="submit" loading={submitting}>
          Save as draft
        </Button>
        <Button type="button" variant="ghost" onClick={() => router.push('/admin/purchase-orders')} disabled={submitting}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
