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

export interface EligibleCreator {
  uid: string;
  displayName: string;
  email: string;
}

export function CreateReferralLinkDialog({ creators }: { creators: EligibleCreator[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [ownerId, setOwnerId] = useState(creators[0]?.uid ?? '');
  const [code, setCode] = useState('');
  const [discountKes, setDiscountKes] = useState('');
  const [commissionKes, setCommissionKes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setOwnerId(creators[0]?.uid ?? '');
    setCode('');
    setDiscountKes('');
    setCommissionKes('');
    setError(null);
  }

  async function onSubmit() {
    if (!ownerId) {
      setError('Choose a creator.');
      return;
    }
    if (!code.trim()) {
      setError('Enter a code.');
      return;
    }
    const discount = Number(discountKes);
    const commission = Number(commissionKes);
    if (!Number.isFinite(discount) || discount < 0 || !Number.isFinite(commission) || commission < 0) {
      setError('Discount and commission must be non-negative numbers.');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch('/api/admin/referral-links', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ownerId, code: code.trim(), discountKes: discount, commissionKes: commission }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? 'Could not create this referral link.');
      }
      setOpen(false);
      reset();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create this referral link.');
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
        <Button disabled={creators.length === 0}>
          <Plus aria-hidden="true" />
          Add link
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New referral link</DialogTitle>
          <DialogDescription>Gives a customer a discount and credits the creator a commission per order.</DialogDescription>
        </DialogHeader>

        <div className="mt-4 flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ownerId">Creator</Label>
            <select
              id="ownerId"
              value={ownerId}
              onChange={(event) => setOwnerId(event.target.value)}
              className="flex h-10 w-full rounded-md border border-border bg-surface px-3 text-sm text-foreground shadow-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              {creators.map((creator) => (
                <option key={creator.uid} value={creator.uid}>
                  {creator.displayName} ({creator.email})
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="code">Code</Label>
            <Input id="code" value={code} onChange={(event) => setCode(event.target.value)} placeholder="SAVE10" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="discountKes">Customer discount (KES)</Label>
              <Input
                id="discountKes"
                type="number"
                min={0}
                step={1}
                value={discountKes}
                onChange={(event) => setDiscountKes(event.target.value)}
                placeholder="0"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="commissionKes">Creator commission (KES)</Label>
              <Input
                id="commissionKes"
                type="number"
                min={0}
                step={1}
                value={commissionKes}
                onChange={(event) => setCommissionKes(event.target.value)}
                placeholder="0"
              />
            </div>
          </div>

          {error ? <p className="text-sm text-danger">{error}</p> : null}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={onSubmit} loading={submitting}>
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
