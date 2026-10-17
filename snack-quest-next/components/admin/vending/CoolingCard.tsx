'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Thermometer } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { COOLING_LIMITS, type MachineCooling, type TemperatureVerdict } from '@/lib/vending/cooling';

const when = new Intl.DateTimeFormat('en-KE', { timeZone: 'Africa/Nairobi', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

const VERDICT: Record<string, { label: string; tone: 'success' | 'warning' | 'danger' | 'outline' }> = {
  in_range: { label: 'In range', tone: 'success' },
  too_warm: { label: 'Too warm', tone: 'danger' },
  too_cold: { label: 'Too cold', tone: 'warning' },
  no_reading: { label: 'No reading', tone: 'warning' },
  not_monitored: { label: 'Not monitored', tone: 'outline' },
};

/**
 * A machine's cooling target (§ refrigeration) beside its latest
 * temperature. Saving always sets what alerts are judged against; it is
 * sent to the machine only when the machine can act on it, and the card
 * says which, so no one assumes the compressor was changed when it wasn't.
 */
export function CoolingCard({
  machineId,
  cooling,
  saved,
  reading,
  verdict,
  canEdit,
  canControl,
}: {
  machineId: string;
  cooling: MachineCooling;
  /** False while the machine still runs on the default target. */
  saved: boolean;
  reading: { celsius: number | null; at: string } | null;
  /** The reading judged on the server, against the same range the alerts use. */
  verdict: TemperatureVerdict['kind'];
  canEdit: boolean;
  canControl: boolean;
}) {
  const router = useRouter();
  const [form, setForm] = useState({
    enabled: cooling.enabled,
    minCelsius: String(cooling.minCelsius),
    maxCelsius: String(cooling.maxCelsius),
    alertAfterMinutes: String(cooling.alertAfterMinutes),
  });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  const shown = VERDICT[verdict];
  const celsius = reading?.celsius !== null && reading?.celsius !== undefined && reading.celsius > -40 ? reading.celsius : null;

  function update(patch: Partial<typeof form>) {
    setForm((current) => ({ ...current, ...patch }));
    setMessage(null);
  }

  async function save() {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/vending/machines/${machineId}/cooling`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled: form.enabled,
          minCelsius: Number(form.minCelsius),
          maxCelsius: Number(form.maxCelsius),
          alertAfterMinutes: Number(form.alertAfterMinutes),
        }),
      });
      const data = (await response.json().catch(() => null)) as { sent?: { commandRef?: string }; error?: string } | null;
      if (!response.ok) throw new Error(data?.error ?? 'That didn’t save. Please try again.');
      setMessage({
        tone: 'ok',
        text: data?.sent?.commandRef
          ? 'Saved and sent to the machine. It confirms on its next check-in.'
          : 'Saved. Alerts use this range. The machine runs its own thermostat, so set the same range on it.',
      });
      router.refresh();
    } catch (error) {
      setMessage({ tone: 'error', text: error instanceof Error ? error.message : 'That didn’t save.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Thermometer className="size-5 text-muted-foreground" aria-hidden="true" />
        <span className="text-2xl font-semibold text-foreground">{celsius !== null ? `${celsius.toFixed(1)} °C` : '—'}</span>
        <Badge variant={shown.tone}>{shown.label}</Badge>
        <span className="text-sm text-muted-foreground">{reading ? `Reported ${when.format(new Date(reading.at))}` : 'No reading yet'}</span>
      </div>

      <p className="text-sm text-muted-foreground">
        {canControl ? 'This machine takes its cooling range from here.' : 'Monitoring only: this machine runs its own thermostat. Alerts use the range below.'}
        {saved ? '' : ' Until you save a range, the default below is used once the machine reports a temperature.'}
      </p>

      <fieldset disabled={!canEdit || busy} className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <Switch id="cooling-enabled" checked={form.enabled} onCheckedChange={(checked) => update({ enabled: checked })} />
          <Label htmlFor="cooling-enabled">Cooled machine</Label>
        </div>
        {form.enabled ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cooling-min">Lowest °C</Label>
              <Input id="cooling-min" type="number" step="0.5" min={COOLING_LIMITS.lowestCelsius} max={COOLING_LIMITS.highestCelsius} value={form.minCelsius} onChange={(event) => update({ minCelsius: event.target.value })} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cooling-max">Highest °C</Label>
              <Input id="cooling-max" type="number" step="0.5" min={COOLING_LIMITS.lowestCelsius} max={COOLING_LIMITS.highestCelsius} value={form.maxCelsius} onChange={(event) => update({ maxCelsius: event.target.value })} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cooling-after">Alert after (minutes)</Label>
              <Input id="cooling-after" type="number" step="1" min={COOLING_LIMITS.minAlertMinutes} max={COOLING_LIMITS.maxAlertMinutes} value={form.alertAfterMinutes} onChange={(event) => update({ alertAfterMinutes: event.target.value })} />
            </div>
          </div>
        ) : null}
      </fieldset>

      {message ? (
        <p role={message.tone === 'error' ? 'alert' : 'status'} className={message.tone === 'error' ? 'text-sm text-danger' : 'text-sm text-success'}>
          {message.text}
        </p>
      ) : null}

      {canEdit ? (
        <div>
          <Button type="button" onClick={save} loading={busy}>
            {canControl ? 'Save and send to machine' : 'Save'}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
