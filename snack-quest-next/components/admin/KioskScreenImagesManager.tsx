'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowDown, ArrowUp, ImagePlus, Loader2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { KIOSK_SCREEN_PLACEMENTS, KIOSK_SCREEN_PLACEMENT_KEYS, type KioskScreenPlacement } from '@/types/kioskScreenImage';
import type { SerializedKioskScreenImage } from '@/lib/vending/serialize';

/**
 * A miniature of the portrait machine screen with the placement being
 * edited lit up — so "Menu banner" and "Idle screen" mean something
 * before anyone uploads to them.
 */
function PlacementDiagram({ placement }: { placement: KioskScreenPlacement }) {
  const lit = 'bg-primary/80';
  const dim = 'bg-border/70';
  if (placement === 'attract') {
    return (
      <div aria-hidden="true" className="flex h-36 w-20 shrink-0 flex-col items-center justify-end rounded-md border-4 border-foreground/80 bg-primary/80 p-1.5">
        <span className="h-2 w-10 rounded-full bg-surface/90" />
      </div>
    );
  }
  return (
    <div aria-hidden="true" className="flex h-36 w-20 shrink-0 flex-col gap-1 rounded-md border-4 border-foreground/80 bg-surface p-1">
      <span className="h-1.5 w-8 rounded-full bg-border" />
      <span className={`h-5 w-full rounded-sm ${lit}`} />
      <span className="flex gap-0.5">
        <span className={`h-1.5 w-4 rounded-full ${dim}`} />
        <span className={`h-1.5 w-4 rounded-full ${dim}`} />
        <span className={`h-1.5 w-4 rounded-full ${dim}`} />
      </span>
      <span className="grid flex-1 grid-cols-3 gap-0.5">
        {Array.from({ length: 9 }).map((_, index) => (
          <span key={index} className={`rounded-sm ${dim}`} />
        ))}
      </span>
      <span className="h-3 w-full rounded-sm bg-foreground/70" />
    </div>
  );
}

function aspectClass(placement: KioskScreenPlacement): string {
  return placement === 'attract' ? 'aspect-[9/16] w-28' : 'aspect-[27/10] w-full sm:w-72';
}

async function jsonOrError(response: Response, fallback: string): Promise<void> {
  if (response.ok) return;
  const data = (await response.json().catch(() => ({}))) as { error?: string };
  throw new Error(data.error ?? fallback);
}

/**
 * Chooses the artwork for each part of the customer machine screen,
 * for one scope: the whole fleet (`machineId` null) or one machine.
 * `inherited` is what a machine shows today for a placement where it
 * has no images of its own — shown so nobody uploads a duplicate of the
 * fleet banner just to see it.
 */
export function KioskScreenImagesManager({
  machineId,
  images,
  inherited,
}: {
  machineId: string | null;
  images: SerializedKioskScreenImage[];
  inherited?: SerializedKioskScreenImage[];
}) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(id: string, action: () => Promise<void>) {
    setBusyId(id);
    setError(null);
    try {
      await action();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That change did not save.');
    } finally {
      setBusyId(null);
    }
  }

  const patch = (id: string, body: Record<string, unknown>) =>
    run(id, async () => {
      const response = await fetch(`/api/vending/kiosk-screen/images/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      await jsonOrError(response, 'That change did not save.');
    });

  const remove = (image: SerializedKioskScreenImage) => {
    if (!confirm(`Remove "${image.altText}" from the screen? The file stays in storage.`)) return;
    return run(image.id, async () => {
      const response = await fetch(`/api/vending/kiosk-screen/images/${image.id}`, { method: 'DELETE' });
      await jsonOrError(response, 'Could not remove that image.');
    });
  };

  return (
    <div className="flex flex-col gap-10">
      {error ? (
        <p role="alert" className="rounded-md bg-danger/10 px-4 py-3 text-sm text-danger">
          {error}
        </p>
      ) : null}

      {KIOSK_SCREEN_PLACEMENT_KEYS.map((placement) => {
        const spec = KIOSK_SCREEN_PLACEMENTS[placement];
        const group = images.filter((image) => image.placement === placement).sort((a, b) => a.displayOrder - b.displayOrder);
        const fallback = (inherited ?? []).filter((image) => image.placement === placement && image.active);
        const activeCount = group.filter((image) => image.active).length;
        return (
          <section key={placement} aria-labelledby={`placement-${placement}`} className="flex flex-col gap-6">
            <div className="flex gap-6">
              <PlacementDiagram placement={placement} />
              <div className="flex flex-col gap-2">
                <h2 id={`placement-${placement}`} className="text-subtitle font-semibold text-foreground">
                  {spec.label}
                </h2>
                <p className="max-w-prose text-sm text-muted-foreground">{spec.description}</p>
                <p className="text-caption text-muted-foreground">
                  Design at {spec.recommendedWidth} × {spec.recommendedHeight} px · JPG, PNG or WebP under 4 MB · up to {spec.maxImages} images. Keep text away from the edges — the screen crops to fill.
                </p>
                <p className="text-sm text-foreground">
                  {activeCount > 0
                    ? `${activeCount} image${activeCount === 1 ? '' : 's'} showing${activeCount > 1 ? ', rotating in the order below' : ''}.`
                    : machineId !== null && fallback.length > 0
                      ? `Showing the ${fallback.length} fleet-wide image${fallback.length === 1 ? '' : 's'} until you add one here.`
                      : 'Nothing chosen — the screen shows its built-in Snack Quest design.'}
                </p>
              </div>
            </div>

            {group.length > 0 ? (
              <ol className="flex flex-col gap-4">
                {group.map((image, index) => (
                  <li key={image.id} className={`flex flex-col gap-4 rounded-lg border border-border bg-surface p-4 sm:flex-row sm:items-center ${image.active ? '' : 'opacity-60'}`}>
                    <div className={`shrink-0 overflow-hidden rounded-md bg-background ${aspectClass(placement)}`}>
                      {/* eslint-disable-next-line @next/next/no-img-element -- any uploaded https image, not a configured next/image host. */}
                      <img src={image.imageUrl} alt={image.altText} className="size-full object-cover" />
                    </div>
                    <AltTextField image={image} disabled={busyId === image.id} onSave={(altText) => patch(image.id, { altText })} />
                    <div className="flex items-center gap-2 sm:flex-col sm:items-end">
                      <label className="flex items-center gap-2 text-sm text-foreground">
                        <Switch checked={image.active} disabled={busyId === image.id} onCheckedChange={(active) => patch(image.id, { active })} aria-label={`Show "${image.altText}"`} />
                        {image.active ? 'Showing' : 'Off'}
                      </label>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" disabled={index === 0 || busyId !== null} onClick={() => patch(image.id, { move: 'earlier' })} aria-label="Show earlier">
                          <ArrowUp aria-hidden="true" />
                        </Button>
                        <Button variant="ghost" size="icon" disabled={index === group.length - 1 || busyId !== null} onClick={() => patch(image.id, { move: 'later' })} aria-label="Show later">
                          <ArrowDown aria-hidden="true" />
                        </Button>
                        <Button variant="ghost" size="icon" disabled={busyId !== null} onClick={() => remove(image)} aria-label={`Remove "${image.altText}"`}>
                          <Trash2 className="text-danger" aria-hidden="true" />
                        </Button>
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            ) : machineId !== null && fallback.length > 0 ? (
              <div className="flex flex-wrap gap-3" aria-label="Fleet-wide images this machine shows now">
                {fallback.map((image) => (
                  <div key={image.id} className={`overflow-hidden rounded-md bg-background opacity-70 ${aspectClass(placement)}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element -- any uploaded https image, not a configured next/image host. */}
                    <img src={image.imageUrl} alt={image.altText} className="size-full object-cover" />
                  </div>
                ))}
                <Badge variant="outline" className="self-start">
                  Fleet-wide
                </Badge>
              </div>
            ) : null}

            {group.length < spec.maxImages ? <AddImageForm placement={placement} machineId={machineId} /> : null}
          </section>
        );
      })}
    </div>
  );
}

function AltTextField({ image, disabled, onSave }: { image: SerializedKioskScreenImage; disabled: boolean; onSave: (altText: string) => void }) {
  const [value, setValue] = useState(image.altText);
  const changed = value.trim() !== image.altText;
  return (
    <form
      className="flex flex-1 flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (changed) onSave(value);
      }}
    >
      <Label htmlFor={`alt-${image.id}`}>What the image says</Label>
      <div className="flex gap-2">
        <Input id={`alt-${image.id}`} value={value} maxLength={160} onChange={(event) => setValue(event.target.value)} />
        {changed ? (
          <Button type="submit" variant="outline" disabled={disabled}>
            Save
          </Button>
        ) : null}
      </div>
    </form>
  );
}

function AddImageForm({ placement, machineId }: { placement: KioskScreenPlacement; machineId: string | null }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [altText, setAltText] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function choose(next: File | null) {
    setError(null);
    setFile(next);
    setPreview((previous) => {
      if (previous) URL.revokeObjectURL(previous);
      return next ? URL.createObjectURL(next) : null;
    });
  }

  async function submit() {
    if (!file) {
      setError('Choose an image first.');
      return;
    }
    if (!altText.trim()) {
      setError('Describe the image in a few words — screen readers read this aloud.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('directory', 'kiosk');
      const upload = await fetch('/api/storage/upload', { method: 'POST', body: form });
      const uploaded = (await upload.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!upload.ok || !uploaded.url) {
        throw new Error(uploaded.error ?? 'Could not upload that image. Use a JPG, PNG or WebP under 4 MB.');
      }
      const response = await fetch('/api/vending/kiosk-screen/images', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ placement, machineId, imageUrl: uploaded.url, altText }),
      });
      await jsonOrError(response, 'The image uploaded but could not be added to the screen.');
      choose(null);
      setAltText('');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add that image.');
    } finally {
      setSaving(false);
    }
  }

  const inputId = `add-${placement}`;
  return (
    <div className="flex flex-col gap-4 rounded-lg border border-dashed border-border p-4 sm:flex-row sm:items-end">
      <label
        htmlFor={inputId}
        className={`flex shrink-0 cursor-pointer flex-col items-center justify-center gap-2 overflow-hidden rounded-md bg-background text-sm text-muted-foreground hover:bg-border/30 focus-within:ring-2 focus-within:ring-primary ${aspectClass(placement)}`}
      >
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element -- a local object URL for the file about to be uploaded.
          <img src={preview} alt="" className="size-full object-cover" />
        ) : (
          <>
            <ImagePlus className="size-6" aria-hidden="true" />
            Choose image
          </>
        )}
        <input id={inputId} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(event) => choose(event.target.files?.[0] ?? null)} />
      </label>
      <div className="flex flex-1 flex-col gap-2">
        <Label htmlFor={`${inputId}-alt`}>What the image says</Label>
        <Input
          id={`${inputId}-alt`}
          value={altText}
          maxLength={160}
          placeholder={placement === 'attract' ? 'Snacks from 12 countries — tap to explore' : 'New this week: Korean honey butter chips'}
          onChange={(event) => setAltText(event.target.value)}
        />
        {error ? (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        ) : null}
      </div>
      <Button onClick={submit} disabled={saving} className="shrink-0">
        {saving ? <Loader2 className="animate-spin" aria-hidden="true" /> : <ImagePlus aria-hidden="true" />}
        Add to {KIOSK_SCREEN_PLACEMENTS[placement].label.toLowerCase()}
      </Button>
    </div>
  );
}
