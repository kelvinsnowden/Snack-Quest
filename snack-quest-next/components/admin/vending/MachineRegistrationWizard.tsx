'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DeviceKeyReveal } from '@/components/admin/vending/DeviceKeyReveal';

export interface ManufacturerOption {
  key: string;
  label: string;
  /** Plain words on what it can do today — e.g. testing only, or waiting for the manufacturer. */
  note: string;
}

interface Values {
  serialNumber: string;
  manufacturer: string;
  model: string;
  hardwareVersion: string;
  firmwareVersion: string;
  machineCode: string;
  ownerPartnerId: string;
  locationId: string;
}

const STEPS = ['Machine', 'Owner and place', 'Check and register'] as const;

/**
 * Registering a machine: what it is, who owns it and where it stands,
 * then one confirm. Registering creates its record (status "Registered",
 * so it can't sell yet) and its first screen key, shown once with a
 * pairing code. Owner and place are optional here and only offered to
 * people allowed to set them.
 */
export function MachineRegistrationWizard({
  manufacturers,
  owners,
  locations,
  canSetOwner,
  canSetLocation,
}: {
  manufacturers: ManufacturerOption[];
  owners: { id: string; name: string }[];
  locations: { id: string; name: string }[];
  canSetOwner: boolean;
  canSetLocation: boolean;
}) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [values, setValues] = useState<Values>({ serialNumber: '', manufacturer: '', model: '', hardwareVersion: '', firmwareVersion: '', machineCode: '', ownerPartnerId: '', locationId: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [registered, setRegistered] = useState<{ machineId: string; machineCode: string; secret: string } | null>(null);
  const set = (key: keyof Values) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setValues((current) => ({ ...current, [key]: event.target.value }));
  const chosen = manufacturers.find((option) => option.key === values.manufacturer);
  const identityDone = values.serialNumber.trim() !== '' && values.manufacturer !== '' && values.model.trim() !== '';

  async function register() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/vending/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({
          serialNumber: values.serialNumber.trim(),
          manufacturer: values.manufacturer,
          model: values.model.trim(),
          hardwareVersion: values.hardwareVersion.trim() || null,
          firmwareVersion: values.firmwareVersion.trim() || null,
          machineCode: values.machineCode.trim() || null,
          ownerPartnerId: values.ownerPartnerId || null,
          locationId: values.locationId || null,
        }),
      });
      const data = (await response.json().catch(() => null)) as { error?: string; message?: string; machineId?: string; machineCode?: string; credential?: { secret: string } } | null;
      if (!response.ok || !data?.machineId || !data.credential) throw new Error(data?.message ?? data?.error ?? `Couldn't register (HTTP ${response.status}).`);
      setRegistered({ machineId: data.machineId, machineCode: data.machineCode ?? values.machineCode, secret: data.credential.secret });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't register.");
    } finally {
      setBusy(false);
    }
  }

  if (registered) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-foreground">
          <span className="font-semibold">{registered.machineCode}</span> is registered. It can’t sell yet — next set up its slots and what it sells, then move it to “Selling” on its setup page.
        </p>
        <DeviceKeyReveal machineCode={registered.machineCode} secret={registered.secret} onDone={() => router.push(`/admin/vending/${registered.machineId}/setup`)} />
      </div>
    );
  }

  const field = 'h-10 rounded-lg border border-border bg-background px-3 text-sm';
  const ownerName = owners.find((owner) => owner.id === values.ownerPartnerId)?.name ?? 'Snack Quest';
  const locationName = locations.find((location) => location.id === values.locationId)?.name ?? 'Not placed yet';

  return (
    <div className="flex flex-col gap-6">
      <ol className="flex flex-wrap gap-2 text-sm" aria-label="Steps">
        {STEPS.map((label, index) => (
          <li key={label} aria-current={index === step ? 'step' : undefined} className={`rounded-full px-3 py-1 ${index === step ? 'bg-primary text-primary-foreground' : index < step ? 'bg-border/50 text-foreground' : 'bg-border/20 text-muted-foreground'}`}>
            {index + 1}. {label}
          </li>
        ))}
      </ol>

      {step === 0 ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="reg-manufacturer">Made by</Label>
            <select id="reg-manufacturer" value={values.manufacturer} onChange={set('manufacturer')} className={field}>
              <option value="">Choose…</option>
              {manufacturers.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}
            </select>
            {chosen ? <p className="text-xs text-muted-foreground">{chosen.note}</p> : null}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="reg-model">Model</Label>
            <Input id="reg-model" value={values.model} onChange={set('model')} placeholder="As printed on the machine" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="reg-serial">Serial number</Label>
            <Input id="reg-serial" value={values.serialNumber} onChange={set('serialNumber')} autoComplete="off" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="reg-code">Machine code</Label>
            <Input id="reg-code" value={values.machineCode} onChange={set('machineCode')} placeholder="Leave blank to get the next SQ-MCH number" autoComplete="off" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="reg-hw">Hardware version (optional)</Label>
            <Input id="reg-hw" value={values.hardwareVersion} onChange={set('hardwareVersion')} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="reg-fw">Firmware version (optional)</Label>
            <Input id="reg-fw" value={values.firmwareVersion} onChange={set('firmwareVersion')} />
          </div>
        </div>
      ) : null}

      {step === 1 ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="reg-owner">Owner</Label>
            <select id="reg-owner" value={values.ownerPartnerId} onChange={set('ownerPartnerId')} disabled={!canSetOwner} className={field}>
              <option value="">Snack Quest (no outside owner)</option>
              {owners.map((owner) => <option key={owner.id} value={owner.id}>{owner.name}</option>)}
            </select>
            {!canSetOwner ? <p className="text-xs text-muted-foreground">You can’t set owners; someone who manages owners can do it later.</p> : null}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="reg-location">Where it will stand</Label>
            <select id="reg-location" value={values.locationId} onChange={set('locationId')} disabled={!canSetLocation} className={field}>
              <option value="">Not placed yet</option>
              {locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
            </select>
            {!canSetLocation ? <p className="text-xs text-muted-foreground">You can’t place machines; it can be placed later from its setup page.</p> : null}
          </div>
        </div>
      ) : null}

      {step === 2 ? (
        <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
          {[
            ['Made by', chosen?.label ?? values.manufacturer],
            ['Model', values.model],
            ['Serial number', values.serialNumber],
            ['Machine code', values.machineCode.trim() || 'Next SQ-MCH number'],
            ['Owner', ownerName],
            ['Where', locationName],
          ].map(([term, detail]) => (
            <div key={term}>
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{term}</dt>
              <dd className="text-foreground">{detail}</dd>
            </div>
          ))}
          <p className="text-sm text-muted-foreground sm:col-span-2">Registering creates the machine as “Registered” — it won’t take payments until it’s set up and switched to selling. You’ll get its first screen key once, on the next screen.</p>
        </dl>
      ) : null}

      {error ? (
        <p role="alert" className="flex items-start gap-2 text-sm text-danger">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {error}
        </p>
      ) : null}

      <div className="flex gap-2">
        {step > 0 ? <Button variant="outline" disabled={busy} onClick={() => setStep(step - 1)}>Back</Button> : null}
        {step < STEPS.length - 1 ? (
          <Button disabled={step === 0 && !identityDone} onClick={() => setStep(step + 1)}>Next</Button>
        ) : (
          <Button loading={busy} onClick={register}>Register machine</Button>
        )}
      </div>
    </div>
  );
}
