'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { EyeOff, ImageOff, Loader2, Pencil, RotateCcw, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { EmptyState } from '@/components/ui/empty-state';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { MachineAssortmentPromotionalState } from '@/types';

export interface ScreenProductRow {
  productId: string;
  productCatalogue: 'snackItem' | 'package';
  slotCode: string | null;
  visible: boolean;
  displayOrder: number;
  category: string | null;
  promotionalState: MachineAssortmentPromotionalState;
  customerFacingName: string | null;
  customerFacingDescription: string | null;
  customerFacingImageUrl: string | null;
  product: { name: string; description: string | null; imageUrl: string | null; origin: string | null };
}

const NAME_MAX = 60;
const DESCRIPTION_MAX = 160;

const BADGES: { value: MachineAssortmentPromotionalState; label: string }[] = [
  { value: 'none', label: 'No badge' },
  { value: 'featured', label: 'Featured' },
  { value: 'new', label: 'New' },
  { value: 'limited_time', label: 'Limited time' },
];

interface Draft {
  name: string;
  description: string;
  imageUrl: string | null;
  category: string;
  position: string;
  badge: MachineAssortmentPromotionalState;
  visible: boolean;
}

function rowKey(row: ScreenProductRow): string {
  return `${row.productCatalogue}:${row.productId}`;
}

function ProductThumb({ src, alt }: { src: string | null; alt: string }) {
  if (!src) {
    return (
      <div className="flex size-full items-center justify-center text-muted-foreground">
        <ImageOff className="size-6" aria-hidden="true" />
      </div>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element -- any uploaded https image, not a configured next/image host.
  return <img src={src} alt={alt} className="size-full object-cover" />;
}

/**
 * How each product appears on this machine's customer screen — photo,
 * name, short description, category, position and badge — with the
 * product's own values shown as the fallback. Everything here is
 * specific to this machine; the snack's own photo and description are
 * edited once, in the snack catalogue, for every machine.
 */
export function MachineScreenProducts({ machineId, rows }: { machineId: string; rows: ScreenProductRow[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<ScreenProductRow | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const categories = useMemo(() => Array.from(new Set(rows.map((row) => row.category).filter((c): c is string => Boolean(c)))).sort(), [rows]);

  function open(row: ScreenProductRow) {
    setEditing(row);
    setError(null);
    setDraft({
      name: row.customerFacingName ?? '',
      description: row.customerFacingDescription ?? '',
      imageUrl: row.customerFacingImageUrl,
      category: row.category ?? '',
      position: String(row.displayOrder),
      badge: row.promotionalState,
      visible: row.visible,
    });
  }

  function close() {
    setEditing(null);
    setDraft(null);
    setError(null);
  }

  async function upload(file: File) {
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('directory', 'kiosk');
      const response = await fetch('/api/storage/upload', { method: 'POST', body: form });
      const data = (await response.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!response.ok || !data.url) {
        throw new Error(data.error ?? 'Could not upload that photo. Use a JPG, PNG or WebP under 4 MB.');
      }
      setDraft((prev) => (prev ? { ...prev, imageUrl: data.url! } : prev));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not upload that photo.');
    } finally {
      setUploading(false);
    }
  }

  async function save() {
    if (!editing || !draft) return;
    const position = Number(draft.position);
    if (!Number.isInteger(position) || position < 0) {
      setError('Position must be a whole number, 0 or more. Lower numbers appear first.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/vending/machines/${machineId}/assortment/${editing.productCatalogue}/${encodeURIComponent(editing.productId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerFacingName: draft.name.trim() || null,
          customerFacingDescription: draft.description.trim() || null,
          customerFacingImageUrl: draft.imageUrl,
          category: draft.category.trim() || null,
          displayOrder: position,
          promotionalState: draft.badge,
          ...(draft.visible !== editing.visible ? { visible: draft.visible } : {}),
        }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(data.error ?? 'Could not save these changes.');
      }
      close();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save these changes.');
    } finally {
      setSaving(false);
    }
  }

  if (rows.length === 0) {
    return <EmptyState icon={ImageOff} title="Nothing on this screen yet" description="Assort products to this machine first; each one then appears here to style for the screen." />;
  }

  const previewImage = draft && editing ? (draft.imageUrl ?? editing.product.imageUrl) : null;

  return (
    <>
      <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {rows.map((row) => {
          const name = row.customerFacingName ?? row.product.name;
          const description = row.customerFacingDescription ?? row.product.description;
          const image = row.customerFacingImageUrl ?? row.product.imageUrl;
          const badge = BADGES.find((b) => b.value === row.promotionalState);
          return (
            <li key={rowKey(row)}>
              <button
                type="button"
                onClick={() => open(row)}
                className={`group flex w-full flex-col overflow-hidden rounded-lg border border-border bg-surface text-left transition-shadow hover:shadow-md focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none ${row.visible ? '' : 'opacity-60'}`}
              >
                <div className="relative aspect-square w-full bg-background">
                  <ProductThumb src={image} alt={name} />
                  <span className="absolute right-2 top-2 flex size-8 items-center justify-center rounded-full bg-surface/90 text-foreground opacity-0 shadow-sm transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                    <Pencil className="size-4" aria-hidden="true" />
                  </span>
                </div>
                <div className="flex flex-col gap-1 p-3">
                  <p className="line-clamp-2 text-sm font-semibold text-foreground">{name}</p>
                  {description ? <p className="line-clamp-2 text-caption text-muted-foreground">{description}</p> : <p className="text-caption text-warning">No description yet</p>}
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <span className="text-caption tabular-nums text-muted-foreground">#{row.displayOrder}</span>
                    {row.slotCode ? <Badge variant="outline">{row.slotCode}</Badge> : null}
                    {row.promotionalState !== 'none' && badge ? <Badge>{badge.label}</Badge> : null}
                    {!row.visible ? (
                      <Badge variant="outline">
                        <EyeOff className="size-3" aria-hidden="true" /> Hidden
                      </Badge>
                    ) : null}
                  </div>
                </div>
              </button>
            </li>
          );
        })}
      </ul>

      <Dialog open={editing !== null} onOpenChange={(value) => (value ? null : close())}>
        <DialogContent className="max-w-2xl">
          {editing && draft ? (
            <>
              <DialogHeader>
                <DialogTitle>How it looks on this screen</DialogTitle>
                <DialogDescription>
                  {editing.product.name}
                  {editing.slotCode ? ` · slot ${editing.slotCode}` : ' · no slot yet'}. Leave a field blank to use the product&apos;s own.
                </DialogDescription>
              </DialogHeader>

              <div className="mt-6 grid gap-6 sm:grid-cols-[200px_1fr]">
                <div className="flex flex-col gap-3">
                  <div className="aspect-square overflow-hidden rounded-lg bg-background">
                    <ProductThumb src={previewImage} alt="" />
                  </div>
                  <label className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-md border border-border px-3 text-sm font-medium text-foreground hover:bg-border/30 focus-within:ring-2 focus-within:ring-primary">
                    {uploading ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Upload className="size-4" aria-hidden="true" />}
                    {draft.imageUrl ? 'Replace photo' : 'Upload a photo for this machine'}
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="sr-only"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) void upload(file);
                        event.target.value = '';
                      }}
                    />
                  </label>
                  {draft.imageUrl ? (
                    <Button variant="ghost" size="sm" onClick={() => setDraft({ ...draft, imageUrl: null })}>
                      <RotateCcw aria-hidden="true" />
                      Use the product&apos;s photo
                    </Button>
                  ) : (
                    <p className="text-caption text-muted-foreground">
                      {editing.product.imageUrl ? 'Showing the product’s own photo.' : 'No photo yet — the screen shows a placeholder.'} Square photos on a plain background look best.
                    </p>
                  )}
                </div>

                <div className="flex flex-col gap-4">
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="screen-name">Name on screen</Label>
                    <Input id="screen-name" value={draft.name} maxLength={NAME_MAX} placeholder={editing.product.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
                  </div>

                  <div className="flex flex-col gap-2">
                    <Label htmlFor="screen-description">Short description</Label>
                    <Textarea
                      id="screen-description"
                      rows={3}
                      value={draft.description}
                      maxLength={DESCRIPTION_MAX}
                      placeholder={editing.product.description ?? 'Crunchy, sweet and a little spicy — a street-food favourite in Seoul.'}
                      onChange={(event) => setDraft({ ...draft, description: event.target.value })}
                    />
                    <p className="text-caption text-muted-foreground">
                      Shown when a customer taps the product. {draft.description.length}/{DESCRIPTION_MAX}
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="screen-category">Category</Label>
                      <Input id="screen-category" list="screen-categories" value={draft.category} maxLength={40} placeholder="Chips" onChange={(event) => setDraft({ ...draft, category: event.target.value })} />
                      <datalist id="screen-categories">
                        {categories.map((category) => (
                          <option key={category} value={category} />
                        ))}
                      </datalist>
                    </div>
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="screen-position">Position</Label>
                      <Input id="screen-position" inputMode="numeric" value={draft.position} onChange={(event) => setDraft({ ...draft, position: event.target.value })} className="tabular-nums" />
                    </div>
                  </div>

                  <fieldset className="flex flex-col gap-2">
                    <legend className="mb-2 text-sm font-medium text-foreground">Badge</legend>
                    <div className="flex flex-wrap gap-2">
                      {BADGES.map((badge) => (
                        <button
                          key={badge.value}
                          type="button"
                          aria-pressed={draft.badge === badge.value}
                          onClick={() => setDraft({ ...draft, badge: badge.value })}
                          className={`min-h-11 rounded-full px-4 text-sm font-medium transition-colors md:min-h-9 ${draft.badge === badge.value ? 'bg-foreground text-background' : 'bg-border/40 text-foreground hover:bg-border/60'}`}
                        >
                          {badge.label}
                        </button>
                      ))}
                    </div>
                  </fieldset>

                  <label className="flex items-center justify-between gap-4 rounded-md bg-background px-4 py-3">
                    <span className="flex flex-col">
                      <span className="text-sm font-medium text-foreground">Show on the screen</span>
                      <span className="text-caption text-muted-foreground">Off hides it without removing it from the machine.</span>
                    </span>
                    <Switch checked={draft.visible} onCheckedChange={(value) => setDraft({ ...draft, visible: value })} />
                  </label>
                </div>
              </div>

              {error ? (
                <p role="alert" className="mt-4 text-sm text-danger">
                  {error}
                </p>
              ) : null}

              <DialogFooter>
                <Button variant="ghost" onClick={close}>
                  Cancel
                </Button>
                <Button onClick={save} loading={saving} disabled={uploading}>
                  Save
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
