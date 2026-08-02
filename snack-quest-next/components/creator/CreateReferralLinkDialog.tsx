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

/** A creator creating their own referral link (§ Creator Portal referral links) — same shape as the admin dialog, minus the creator picker since it's always the signed-in creator. */
export function CreateReferralLinkDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');
  const [discountKes, setDiscountKes] = useState('');
  const [commissionKes, setCommissionKes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setCode('');
    setDiscountKes('');
    setCommissionKes('');
    setError(null);
  }

  async function onSubmit() {
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
      const response = await fetch('/api/creator/referral-links', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code: code.trim(), discountKes: discount, commissionKes: commission }),
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
        <Button>
          <Plus aria-hidden="true" />
          New link
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New referral link</DialogTitle>
          <DialogDescription>
            Gives a customer a discount and credits you a commission on every order that uses it.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4 flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="code">Code</Label>
            <Input id="code" value={code} onChange={(event) => setCode(event.target.value)} placeholder="AMINA10" />
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
              <Label htmlFor="commissionKes">Your commission (KES)</Label>
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
