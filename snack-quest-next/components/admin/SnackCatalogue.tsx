'use client';

import { useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { AlertTriangle, ImageOff, Loader2, Pencil, Plus, Trash2, Upload } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { EmptyState } from '@/components/ui/empty-state';
import type { SerializedSnackItem } from '@/lib/recipes/serialize';

interface DraftState {
  id: string | null;
  name: string;
  imageUrl: string | null;
  expectedUnitCostKes: string;
  unitLabel: string;
  origin: string;
  sourcingNote: string;
  isActive: boolean;
}

const EMPTY: DraftState = {
  id: null,
  name: '',
  imageUrl: null,
  expectedUnitCostKes: '',
  unitLabel: 'bag',
  origin: '',
  sourcingNote: '',
  isActive: true,
};

/**
 * The snack catalogue (§ Box Recipes) — the one place a snack's photo
 * and price are maintained, for every box that contains it.
 *
 * The photo is not decoration and the form treats it as the primary
 * field: whoever buys this may never have bought it before, and a name
 * in a script they cannot read is not enough to pick the right bag off
 * a shelf.
 */
export function SnackCatalogue({ items }: { items: SerializedSnackItem[] }) {
  const router = useRouter();
  const [draft, setDraft] = useState<DraftState | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function edit(item: SerializedSnackItem) {
    setDraft({
      id: item.id,
      name: item.name,
      imageUrl: item.imageUrl,
      expectedUnitCostKes: String(item.expectedUnitCostKes),
      unitLabel: item.unitLabel,
      origin: item.origin ?? '',
      sourcingNote: item.sourcingNote ?? '',
      isActive: item.isActive,
    });
    setError(null);
  }

  async function uploadPhoto(file: File) {
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('directory', 'snacks');
      const response = await fetch('/api/storage/upload', { method: 'POST', body: form });
      const data = (await response.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!response.ok || !data.url) {
        throw new Error(data.error ?? 'Could not upload that photo.');
      }
      setDraft((prev) => (prev ? { ...prev, imageUrl: data.url! } : prev));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not upload that photo.');
    } finally {
      setUploading(false);
    }
  }

  async function save() {
    if (!draft) return;
    setBusy(true);
    setError(null);
    try {
      const body = {
        name: draft.name,
        imageUrl: draft.imageUrl,
        expectedUnitCostKes: Number(draft.expectedUnitCostKes),
        unitLabel: draft.unitLabel,
        origin: draft.origin,
        sourcingNote: draft.sourcingNote,
        isActive: draft.isActive,
      };
      const response = await fetch(draft.id ? `/api/admin/snack-items/${draft.id}` : '/api/admin/snack-items', {
        method: draft.id ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(data.error ?? 'Could not save that snack.');
      }
      setDraft(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save that snack.');
    } finally {
      setBusy(false);
    }
  }

  async function remove(item: SerializedSnackItem) {
    if (!confirm(`Delete "${item.name}"?`)) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/snack-items/${item.id}`, { method: 'DELETE' });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(data.error ?? 'Could not delete that snack.');
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete that snack.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {error ? (
        <Card className="flex items-start gap-2.5 border-danger/40 p-4">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-danger" aria-hidden="true" />
          <p className="text-sm text-foreground">{error}</p>
        </Card>
      ) : null}

      {draft ? (
        <Card className="flex flex-col gap-4 p-5">
          <p className="text-card-title font-semibold text-foreground">{draft.id ? 'Edit snack' : 'New snack'}</p>

          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="flex flex-col gap-2">
              <span className="text-caption text-muted-foreground">Photo</span>
              <div className="relative size-28 overflow-hidden rounded-lg bg-border/30">
                {draft.imageUrl ? (
                  <Image src={draft.imageUrl} alt="" fill sizes="112px" className="object-cover" />
                ) : (
                  <div className="flex size-full items-center justify-center text-muted-foreground">
                    <ImageOff className="size-6" aria-hidden="true" />
                  </div>
                )}
              </div>
              <label className="inline-flex min-h-10 cursor-pointer items-center justify-center gap-1.5 rounded-md border border-border px-3 text-sm font-medium text-foreground hover:bg-border/30">
                {uploading ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Upload className="size-4" aria-hidden="true" />}
                {draft.imageUrl ? 'Replace' : 'Upload'}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void uploadPhoto(file);
                  }}
                />
              </label>
            </div>

            <div className="flex flex-1 flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="snack-name">Name</Label>
                <Input
                  id="snack-name"
                  value={draft.name}
                  onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                  placeholder="Calbee Shrimp Chips 70g"
                  className="min-h-11"
                />
                <p className="text-caption text-muted-foreground">Include size and flavour — this has to be enough to buy the right thing.</p>
              </div>

              <div className="flex gap-3">
                <div className="flex flex-1 flex-col gap-1.5">
                  <Label htmlFor="snack-cost">Expected cost (KES)</Label>
                  <Input
                    id="snack-cost"
                    inputMode="numeric"
                    value={draft.expectedUnitCostKes}
                    onChange={(event) => setDraft({ ...draft, expectedUnitCostKes: event.target.value })}
                    className="min-h-11 tabular-nums"
                  />
                </div>
                <div className="flex w-28 flex-col gap-1.5">
                  <Label htmlFor="snack-unit">Unit</Label>
                  <Input
                    id="snack-unit"
                    value={draft.unitLabel}
                    onChange={(event) => setDraft({ ...draft, unitLabel: event.target.value })}
                    placeholder="bag"
                    className="min-h-11"
                  />
                </div>
              </div>

              <div className="flex gap-3">
                <div className="flex w-32 flex-col gap-1.5">
                  <Label htmlFor="snack-origin">Origin</Label>
                  <Input
                    id="snack-origin"
                    value={draft.origin}
                    onChange={(event) => setDraft({ ...draft, origin: event.target.value })}
                    placeholder="Japan"
                    className="min-h-11"
                  />
                </div>
                <div className="flex flex-1 flex-col gap-1.5">
                  <Label htmlFor="snack-source">Where to buy it</Label>
                  <Input
                    id="snack-source"
                    value={draft.sourcingNote}
                    onChange={(event) => setDraft({ ...draft, sourcingNote: event.target.value })}
                    placeholder="Chinese supermarket, Diamond Plaza"
                    className="min-h-11"
                  />
                </div>
              </div>

              <label className="flex items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={draft.isActive}
                  onChange={(event) => setDraft({ ...draft, isActive: event.target.checked })}
                  className="size-4"
                />
                Available for new recipes
              </label>
            </div>
          </div>

          <div className="flex gap-2">
            <Button onClick={save} loading={busy} className="min-h-11">
              Save
            </Button>
            <Button variant="ghost" onClick={() => setDraft(null)} className="min-h-11">
              Cancel
            </Button>
          </div>
        </Card>
      ) : (
        <div>
          <Button onClick={() => setDraft(EMPTY)} className="min-h-11">
            <Plus className="size-4" aria-hidden="true" />
            Add a snack
          </Button>
        </div>
      )}

      {items.length === 0 ? (
        <EmptyState
          icon={ImageOff}
          title="No snacks yet"
          description="Add the snacks you buy, with a photo and a price. Recipes are built from these."
        />
      ) : (
        <ul className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((item) => (
            <li key={item.id}>
              <Card className={`flex gap-3 p-3 ${item.isActive ? '' : 'opacity-60'}`}>
                <div className="relative size-20 shrink-0 overflow-hidden rounded-lg bg-border/30">
                  {item.imageUrl ? (
                    <Image src={item.imageUrl} alt={item.name} fill sizes="80px" className="object-cover" />
                  ) : (
                    <div className="flex size-full items-center justify-center text-muted-foreground">
                      <ImageOff className="size-5" aria-hidden="true" />
                    </div>
                  )}
                </div>

                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <div className="flex items-start justify-between gap-2">
                    <p className="truncate font-semibold text-foreground">{item.name}</p>
                    {!item.isActive ? <Badge variant="outline">inactive</Badge> : null}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    KES <span className="tabular-nums">{item.expectedUnitCostKes.toLocaleString()}</span> per{' '}
                    {item.unitLabel}
                    {item.origin ? ` · ${item.origin}` : ''}
                  </p>
                  {item.sourcingNote ? (
                    <p className="truncate text-caption text-muted-foreground">{item.sourcingNote}</p>
                  ) : null}
                  <div className="mt-1 flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => edit(item)} disabled={busy}>
                      <Pencil className="size-4" aria-hidden="true" />
                      <span className="sr-only">Edit</span>
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => remove(item)} disabled={busy}>
                      <Trash2 className="size-4 text-danger" aria-hidden="true" />
                      <span className="sr-only">Delete</span>
                    </Button>
                  </div>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
