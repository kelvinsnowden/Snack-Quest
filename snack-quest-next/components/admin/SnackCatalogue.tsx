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
import { Textarea } from '@/components/ui/textarea';
import { EmptyState } from '@/components/ui/empty-state';
import type { SerializedSnackItem } from '@/lib/recipes/serialize';
import type { ProductPriceType } from '@/types/economics';
import { PriceBookEditor } from '@/components/admin/vending/EconomicsControls';

/** Mirrors `SNACK_DESCRIPTION_MAX` in `services/recipeService.ts` (a server-only module); the server enforces it. */
const SNACK_DESCRIPTION_MAX = 160;

interface DraftState {
  id: string | null;
  name: string;
  imageUrl: string | null;
  description: string;
  expectedUnitCostKes: string;
  unitLabel: string;
  origin: string;
  sourcingNote: string;
  isActive: boolean;
  availableForPremiumSelection: boolean;
  stockCount: string;
}

const EMPTY: DraftState = {
  id: null,
  name: '',
  imageUrl: null,
  description: '',
  expectedUnitCostKes: '',
  unitLabel: 'bag',
  origin: '',
  sourcingNote: '',
  isActive: true,
  availableForPremiumSelection: false,
  stockCount: '',
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
export function SnackCatalogue({
  items,
  canSeeCost = true,
  canEditCost = true,
  canEdit = true,
  priceAccess = { visible: false, editable: [] },
}: {
  items: SerializedSnackItem[];
  /** `products.cost.view`: without it the list carries no costs and none is shown. */
  canSeeCost?: boolean;
  /** `products.cost.manage`: without it the form has no cost field and never sends one. */
  canEditCost?: boolean;
  /** `products.snacks.manage`. */
  canEdit?: boolean;
  /** Which price-book prices this person may see and change (§ PRICE BOOK). */
  priceAccess?: { visible: boolean; editable: ProductPriceType[] };
}) {
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
      description: item.description ?? '',
      expectedUnitCostKes: item.expectedUnitCostKes === null ? '' : String(item.expectedUnitCostKes),
      unitLabel: item.unitLabel,
      origin: item.origin ?? '',
      sourcingNote: item.sourcingNote ?? '',
      isActive: item.isActive,
      availableForPremiumSelection: item.availableForPremiumSelection ?? false,
      stockCount: item.stockCount === undefined ? '' : String(item.stockCount),
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
        description: draft.description,
        // Sent only by someone who may set costs, and only when filled in; a blank cost stays unset.
        ...(canEditCost && draft.expectedUnitCostKes.trim() !== '' ? { expectedUnitCostKes: Number(draft.expectedUnitCostKes) } : {}),
        unitLabel: draft.unitLabel,
        origin: draft.origin,
        sourcingNote: draft.sourcingNote,
        isActive: draft.isActive,
        availableForPremiumSelection: draft.availableForPremiumSelection,
        // Blank means untracked, which is not the same as zero — see
        // `SnackItem.stockCount`. Null clears it back to untracked.
        stockCount: draft.stockCount.trim() === '' ? null : Number(draft.stockCount),
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

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="snack-description">What customers read</Label>
                <Textarea
                  id="snack-description"
                  value={draft.description}
                  maxLength={SNACK_DESCRIPTION_MAX}
                  rows={2}
                  onChange={(event) => setDraft({ ...draft, description: event.target.value })}
                  placeholder="Light, crunchy prawn crackers — Japan's favourite after-school snack."
                />
                <p className="text-caption text-muted-foreground">
                  Shown on the machine screen when someone taps the snack. One or two short sentences
                  ({draft.description.length}/{SNACK_DESCRIPTION_MAX}).
                </p>
              </div>

              <div className="flex gap-3">
                {canEditCost ? (
                  <div className="flex flex-1 flex-col gap-1.5">
                    <Label htmlFor="snack-cost">Expected cost (KES)</Label>
                    <Input
                      id="snack-cost"
                      inputMode="numeric"
                      value={draft.expectedUnitCostKes}
                      onChange={(event) => setDraft({ ...draft, expectedUnitCostKes: event.target.value })}
                      className="min-h-11 tabular-nums"
                    />
                    <p className="text-caption text-muted-foreground">A change is kept in the price history; past sales keep the cost they were sold at.</p>
                  </div>
                ) : (
                  <p className="flex-1 self-end text-caption text-muted-foreground">Costs are set by someone with cost access.</p>
                )}
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

              {/*
                Off by default and opted into per snack: this catalogue
                holds bulk staples and things being trialled, and a
                customer should be picking from neither.
              */}
              <label className="flex items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={draft.availableForPremiumSelection}
                  onChange={(event) =>
                    setDraft({ ...draft, availableForPremiumSelection: event.target.checked })
                  }
                  className="size-4"
                />
                Customers can pick this in a Premium box
              </label>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="snack-stock">
                  Units in stock{' '}
                  <span className="text-muted-foreground font-normal">(blank = not counted)</span>
                </Label>
                <Input
                  id="snack-stock"
                  type="number"
                  min={0}
                  inputMode="numeric"
                  value={draft.stockCount}
                  onChange={(event) => setDraft({ ...draft, stockCount: event.target.value })}
                  className="max-w-32"
                />
              </div>
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
        canEdit ? (
          <div>
            <Button onClick={() => setDraft(EMPTY)} className="min-h-11">
              <Plus className="size-4" aria-hidden="true" />
              Add a snack
            </Button>
          </div>
        ) : null
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
                    {canSeeCost ? (
                      item.expectedUnitCostKes === null ? (
                        <>Cost not set yet · per </>
                      ) : (
                        <>
                          KES <span className="tabular-nums">{item.expectedUnitCostKes.toLocaleString()}</span> per{' '}
                        </>
                      )
                    ) : (
                      'Per '
                    )}
                    {item.unitLabel}
                    {item.origin ? ` · ${item.origin}` : ''}
                  </p>
                  {item.sourcingNote ? (
                    <p className="truncate text-caption text-muted-foreground">{item.sourcingNote}</p>
                  ) : null}
                  {priceAccess.visible ? <PriceBookEditor productCatalogue="snackItem" productId={item.id} editableTypes={priceAccess.editable} /> : null}
                  <div className={canEdit ? 'mt-1 flex gap-1' : 'hidden'}>
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
