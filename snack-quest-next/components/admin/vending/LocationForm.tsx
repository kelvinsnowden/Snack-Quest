'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { CUSTOMER_TYPE_OPTIONS, INDOOR_OUTDOOR_OPTIONS, LOCATION_TYPE_OPTIONS } from '@/lib/vending/locationOptions';

export interface LocationFormValues {
  name: string;
  locationType: string;
  city: string;
  area: string;
  address: string;
  latitude: string;
  longitude: string;
  estimatedFootTraffic: string;
  operatingHours: string;
  customerType: string;
  indoorOutdoor: string;
  notes: string;
}

export const EMPTY_LOCATION: LocationFormValues = {
  name: '',
  locationType: 'office',
  city: 'Nairobi',
  area: '',
  address: '',
  latitude: '',
  longitude: '',
  estimatedFootTraffic: '',
  operatingHours: '',
  customerType: '',
  indoorOutdoor: '',
  notes: '',
};

const text = (value: string) => (value.trim() ? value.trim() : null);
const number = (value: string) => (value.trim() === '' ? null : Number(value));

/**
 * A place machines stand. Name, type and city are what every report
 * groups by; the rest helps compare sites (foot traffic is a staff
 * estimate, never inferred from sales). Creating one opens its page;
 * editing saves in place.
 */
export function LocationForm({ locationId, initial, canEdit }: { locationId: string | null; initial: LocationFormValues; canEdit: boolean }) {
  const router = useRouter();
  const [values, setValues] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const set = (key: keyof LocationFormValues) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setSaved(false);
    setValues((current) => ({ ...current, [key]: event.target.value }));
  };

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    for (const key of ['latitude', 'longitude', 'estimatedFootTraffic'] as const) {
      if (values[key].trim() !== '' && !Number.isFinite(Number(values[key]))) {
        setError(`${key === 'estimatedFootTraffic' ? 'Foot traffic' : key[0].toUpperCase() + key.slice(1)} must be a number.`);
        return;
      }
    }
    setBusy(true);
    try {
      const body = {
        name: values.name.trim(),
        locationType: values.locationType,
        city: values.city.trim(),
        area: text(values.area),
        address: text(values.address),
        latitude: number(values.latitude),
        longitude: number(values.longitude),
        estimatedFootTraffic: number(values.estimatedFootTraffic),
        operatingHours: text(values.operatingHours),
        customerType: values.customerType || null,
        indoorOutdoor: values.indoorOutdoor || null,
        notes: text(values.notes),
      };
      const response = await fetch(locationId ? `/api/vending/locations/${locationId}` : '/api/vending/locations', {
        method: locationId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = (await response.json().catch(() => null)) as { error?: string; locationId?: string } | null;
      if (!response.ok) throw new Error(data?.error ?? `Couldn't save (HTTP ${response.status}).`);
      if (!locationId && data?.locationId) {
        router.push(`/admin/vending/locations/${data.locationId}`);
        return;
      }
      setSaved(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save.");
    } finally {
      setBusy(false);
    }
  }

  const field = 'h-10 rounded-lg border border-border bg-background px-3 text-sm disabled:opacity-60';
  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <fieldset disabled={!canEdit || busy} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label htmlFor="loc-name">Name</Label>
          <Input id="loc-name" value={values.name} onChange={set('name')} placeholder="e.g. Strathmore University — Student Centre" required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="loc-type">Type of place</Label>
          <select id="loc-type" value={values.locationType} onChange={set('locationType')} className={field}>
            {LOCATION_TYPE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="loc-city">City</Label>
          <Input id="loc-city" value={values.city} onChange={set('city')} required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="loc-area">Area</Label>
          <Input id="loc-area" value={values.area} onChange={set('area')} placeholder="e.g. Madaraka" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="loc-address">Address</Label>
          <Input id="loc-address" value={values.address} onChange={set('address')} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="loc-lat">Latitude</Label>
          <Input id="loc-lat" inputMode="decimal" value={values.latitude} onChange={set('latitude')} placeholder="-1.3095" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="loc-lng">Longitude</Label>
          <Input id="loc-lng" inputMode="decimal" value={values.longitude} onChange={set('longitude')} placeholder="36.8148" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="loc-traffic">People passing per day (estimate)</Label>
          <Input id="loc-traffic" inputMode="numeric" value={values.estimatedFootTraffic} onChange={set('estimatedFootTraffic')} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="loc-hours">Opening hours</Label>
          <Input id="loc-hours" value={values.operatingHours} onChange={set('operatingHours')} placeholder="e.g. Mon–Sat 7am–9pm" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="loc-customers">Who buys here</Label>
          <select id="loc-customers" value={values.customerType} onChange={set('customerType')} className={field}>
            <option value="">Not set</option>
            {CUSTOMER_TYPE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="loc-inout">Indoor or outdoor</Label>
          <select id="loc-inout" value={values.indoorOutdoor} onChange={set('indoorOutdoor')} className={field}>
            <option value="">Not set</option>
            {INDOOR_OUTDOOR_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label htmlFor="loc-notes">Notes</Label>
          <Textarea id="loc-notes" value={values.notes} onChange={set('notes')} rows={3} />
        </div>
      </fieldset>
      {error ? (
        <p role="alert" className="flex items-start gap-2 text-sm text-danger">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {error}
        </p>
      ) : null}
      {saved ? (
        <p role="status" className="flex items-center gap-2 text-sm text-success">
          <CheckCircle2 className="size-4" aria-hidden="true" />
          Saved.
        </p>
      ) : null}
      {canEdit ? (
        <div>
          <Button type="submit" loading={busy} disabled={!values.name.trim() || !values.city.trim()}>{locationId ? 'Save location' : 'Create location'}</Button>
        </div>
      ) : null}
    </form>
  );
}
