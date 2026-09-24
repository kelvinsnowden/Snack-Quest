'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/**
 * § PART 7 — OWNER VS LOCATION ECONOMICS. Purely the owner's own
 * record-keeping — nothing entered here ever reaches Snack Quest's
 * settlement math (see the route this posts to, and
 * `LocationOwnerExpenses`'s own doc comment). The copy says so
 * explicitly rather than leaving an owner to guess whether filling
 * this in changes what they're paid.
 */
export function LocationExpensesForm({
  locationId,
  initial,
}: {
  locationId: string;
  initial: { monthlyRentKes: number | null; placementFeeKes: number | null; monthlyElectricityKes: number | null; locationCommissionPct: number | null };
}) {
  const router = useRouter();
  const [values, setValues] = useState({
    monthlyRentKes: initial.monthlyRentKes?.toString() ?? '',
    placementFeeKes: initial.placementFeeKes?.toString() ?? '',
    monthlyElectricityKes: initial.monthlyElectricityKes?.toString() ?? '',
    locationCommissionPct: initial.locationCommissionPct?.toString() ?? '',
  });
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSaved(false);
    setSubmitting(true);
    try {
      const response = await fetch(`/api/vending/partners/me/locations/${locationId}/expenses`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          monthlyRentKes: values.monthlyRentKes.trim() ? Number(values.monthlyRentKes) : null,
          placementFeeKes: values.placementFeeKes.trim() ? Number(values.placementFeeKes) : null,
          monthlyElectricityKes: values.monthlyElectricityKes.trim() ? Number(values.monthlyElectricityKes) : null,
          locationCommissionPct: values.locationCommissionPct.trim() ? Number(values.locationCommissionPct) : null,
        }),
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? 'Could not save.');
        return;
      }
      setSaved(true);
      router.refresh();
    } catch {
      setError('Could not reach Snack Quest. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <p className="text-xs text-muted-foreground">
        For your own records only — these never change what Snack Quest pays you. Your distributable profit is always revenue minus cost of goods minus your subscription.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="monthlyRentKes">Monthly rent (KES)</Label>
          <Input id="monthlyRentKes" type="number" inputMode="numeric" value={values.monthlyRentKes} onChange={(e) => setValues((v) => ({ ...v, monthlyRentKes: e.target.value }))} disabled={submitting} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="placementFeeKes">Placement fee (KES)</Label>
          <Input id="placementFeeKes" type="number" inputMode="numeric" value={values.placementFeeKes} onChange={(e) => setValues((v) => ({ ...v, placementFeeKes: e.target.value }))} disabled={submitting} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="monthlyElectricityKes">Monthly electricity (KES)</Label>
          <Input id="monthlyElectricityKes" type="number" inputMode="numeric" value={values.monthlyElectricityKes} onChange={(e) => setValues((v) => ({ ...v, monthlyElectricityKes: e.target.value }))} disabled={submitting} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="locationCommissionPct">Location commission (%)</Label>
          <Input id="locationCommissionPct" type="number" inputMode="decimal" value={values.locationCommissionPct} onChange={(e) => setValues((v) => ({ ...v, locationCommissionPct: e.target.value }))} disabled={submitting} />
        </div>
      </div>
      {error ? (
        <p role="alert" className="flex items-start gap-2 rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {error}
        </p>
      ) : null}
      {saved ? <p className="text-sm text-success">Saved.</p> : null}
      <Button type="submit" size="sm" className="w-fit" loading={submitting}>
        <Save aria-hidden="true" />
        Save
      </Button>
    </form>
  );
}
