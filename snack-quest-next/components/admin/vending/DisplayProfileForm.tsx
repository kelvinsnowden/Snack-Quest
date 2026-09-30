'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { MachineDisplayProfile } from '@/types';

const PRESETS = [
  { label: '32" portrait (1080×1920)', widthPx: 1080, heightPx: 1920, diagonalInches: 32 },
  { label: '21.5" portrait (1080×1920)', widthPx: 1080, heightPx: 1920, diagonalInches: 21.5 },
  { label: '10.1" landscape (1280×800)', widthPx: 1280, heightPx: 800, diagonalInches: 10.1 },
  { label: '15.6" landscape (1920×1080)', widthPx: 1920, heightPx: 1080, diagonalInches: 15.6 },
];

/** The machine's screen size (§ DEVICE PROFILES) — used to preview designs at the size customers see. `kiosk.design`. */
export function DisplayProfileForm({ machineId, current }: { machineId: string; current: MachineDisplayProfile | null }) {
  const router = useRouter();
  const [width, setWidth] = useState(String(current?.widthPx ?? ''));
  const [height, setHeight] = useState(String(current?.heightPx ?? ''));
  const [diagonal, setDiagonal] = useState(current?.diagonalInches ? String(current.diagonalInches) : '');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function save(display: unknown) {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/vending/machines/${machineId}/display`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ display }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? `Couldn’t save (HTTP ${response.status}).`);
      setMessage({ ok: true, text: display ? 'Saved.' : 'Cleared.' });
      router.refresh();
    } catch (error) {
      setMessage({ ok: false, text: error instanceof Error ? error.message : 'Couldn’t save.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {PRESETS.map((preset) => (
          <Button
            key={preset.label}
            size="sm"
            variant="outline"
            onClick={() => {
              setWidth(String(preset.widthPx));
              setHeight(String(preset.heightPx));
              setDiagonal(String(preset.diagonalInches));
            }}
          >
            {preset.label}
          </Button>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Width (pixels)</span>
          <Input inputMode="numeric" value={width} onChange={(event) => setWidth(event.target.value)} className="min-h-10 tabular-nums" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Height (pixels)</span>
          <Input inputMode="numeric" value={height} onChange={(event) => setHeight(event.target.value)} className="min-h-10 tabular-nums" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Diagonal (inches, optional)</span>
          <Input inputMode="decimal" value={diagonal} onChange={(event) => setDiagonal(event.target.value)} className="min-h-10 tabular-nums" />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" loading={busy} disabled={!width || !height} onClick={() => save({ widthPx: Number(width), heightPx: Number(height), diagonalInches: diagonal ? Number(diagonal) : null })}>
          Save screen size
        </Button>
        {current ? (
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => save(null)}>
            Clear
          </Button>
        ) : null}
        {message ? (
          <span role={message.ok ? 'status' : 'alert'} className={`text-sm ${message.ok ? 'text-success' : 'text-danger'}`}>
            {message.text}
          </span>
        ) : null}
      </div>
    </div>
  );
}
