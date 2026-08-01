'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';

export interface SupplierFormValues {
  name: string;
  contactName: string;
  phone: string;
  email: string;
  notes: string;
  isActive: boolean;
}

const DEFAULTS: SupplierFormValues = { name: '', contactName: '', phone: '', email: '', notes: '', isActive: true };

/**
 * Create or edit a supplier (§ Inventory: batches, purchase orders,
 * suppliers, movements, low-stock alerts, expiry, audit trail) — one
 * dialog, reused for both modes like `InventoryAdjustDialog`.
 */
export function SupplierFormDialog({
  mode,
  supplierId,
  initialValues,
  trigger,
}: {
  mode: 'create' | 'edit';
  supplierId?: string;
  initialValues?: SupplierFormValues;
  trigger?: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<SupplierFormValues>(initialValues ?? DEFAULTS);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setValues(initialValues ?? DEFAULTS);
    setError(null);
  }

  async function onSubmit() {
    if (!values.name.trim() || !values.contactName.trim() || !values.phone.trim()) {
      setError('Name, contact name, and phone are required.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const payload = {
        name: values.name.trim(),
        contactName: values.contactName.trim(),
        phone: values.phone.trim(),
        email: values.email.trim() || null,
        notes: values.notes.trim(),
        ...(mode === 'edit' ? { isActive: values.isActive } : {}),
      };
      const response = await fetch(mode === 'create' ? '/api/admin/suppliers' : `/api/admin/suppliers/${supplierId}`, {
        method: mode === 'create' ? 'POST' : 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? 'Could not save this supplier.');
      }
      setOpen(false);
      reset();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save this supplier.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm">
            <Plus className="size-4" aria-hidden="true" />
            Add supplier
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{mode === 'create' ? 'Add supplier' : 'Edit supplier'}</DialogTitle>
          <DialogDescription>Suppliers are who a purchase order is placed with.</DialogDescription>
        </DialogHeader>

        <div className="mt-4 flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="supplier-name">Business name</Label>
            <Input
              id="supplier-name"
              value={values.name}
              onChange={(event) => setValues((v) => ({ ...v, name: event.target.value }))}
              placeholder="e.g. Coastal Snacks Ltd"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="supplier-contact">Contact name</Label>
              <Input
                id="supplier-contact"
                value={values.contactName}
                onChange={(event) => setValues((v) => ({ ...v, contactName: event.target.value }))}
                placeholder="e.g. Jane Wanjiru"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="supplier-phone">Phone</Label>
              <Input
                id="supplier-phone"
                value={values.phone}
                onChange={(event) => setValues((v) => ({ ...v, phone: event.target.value }))}
                placeholder="254700000000"
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="supplier-email">
              Email <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id="supplier-email"
              type="email"
              value={values.email}
              onChange={(event) => setValues((v) => ({ ...v, email: event.target.value }))}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="supplier-notes">
              Notes <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Textarea
              id="supplier-notes"
              value={values.notes}
              onChange={(event) => setValues((v) => ({ ...v, notes: event.target.value }))}
            />
          </div>
          {mode === 'edit' ? (
            <div className="flex items-center justify-between rounded-md border border-border p-3">
              <div>
                <p className="text-sm font-medium text-foreground">Active</p>
                <p className="text-caption text-muted-foreground">Inactive suppliers are hidden from the new purchase order picker.</p>
              </div>
              <Switch checked={values.isActive} onCheckedChange={(checked) => setValues((v) => ({ ...v, isActive: checked }))} />
            </div>
          ) : null}
          {error ? <p className="text-sm text-danger">{error}</p> : null}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={onSubmit} loading={submitting}>
            {mode === 'create' ? 'Add supplier' : 'Save changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
