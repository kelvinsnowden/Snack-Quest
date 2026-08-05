'use client';

import { useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { ImagePlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent } from '@/components/ui/card';

export interface ProductFormValues {
  name: string;
  description: string;
  priceKes: number;
  isActive: boolean;
  stockCount?: number;
  lowStockThreshold?: number;
  imageUrl: string | null;
  snackCountLabel?: string;
}

interface ProductFormProps {
  mode: 'create' | 'edit';
  packageId?: string;
  initialValues?: ProductFormValues;
}

const DEFAULTS: ProductFormValues = {
  name: '',
  description: '',
  priceKes: 0,
  isActive: true,
  stockCount: undefined,
  lowStockThreshold: undefined,
  imageUrl: null,
  snackCountLabel: '',
};

export function ProductForm({ mode, packageId, initialValues }: ProductFormProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [values, setValues] = useState<ProductFormValues>(initialValues ?? DEFAULTS);
  const [trackStock, setTrackStock] = useState(initialValues?.stockCount !== undefined);
  const [imagePreview, setImagePreview] = useState<string | null>(initialValues?.imageUrl ?? null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function onFileSelected(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setPendingFile(file);
    setImagePreview(URL.createObjectURL(file));
  }

  async function uploadPendingImage(): Promise<string | null> {
    if (!pendingFile) {
      return values.imageUrl;
    }
    setUploadingImage(true);
    try {
      const form = new FormData();
      form.append('file', pendingFile);
      form.append('directory', 'snacks');
      const response = await fetch('/api/storage/upload', { method: 'POST', body: form });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? 'Image upload failed.');
      }
      const body = (await response.json()) as { url: string };
      return body.url;
    } finally {
      setUploadingImage(false);
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!values.name.trim()) {
      setError('Name is required.');
      return;
    }
    if (!values.description.trim()) {
      setError('Description is required.');
      return;
    }
    if (!Number.isFinite(values.priceKes) || values.priceKes <= 0) {
      setError('Price must be a positive number.');
      return;
    }

    setSubmitting(true);
    try {
      const imageUrl = await uploadPendingImage();

      const payload = {
        name: values.name.trim(),
        description: values.description.trim(),
        priceKes: values.priceKes,
        isActive: values.isActive,
        imageUrl,
        ...(values.snackCountLabel?.trim() ? { snackCountLabel: values.snackCountLabel.trim() } : {}),
        // Only sent on create — an initial stock count, not an adjustment.
        // Editing an existing product's stock happens on the audited
        // Inventory page instead (§ Admin: Inventory), never here.
        ...(mode === 'create' && trackStock && typeof values.stockCount === 'number'
          ? { stockCount: values.stockCount }
          : {}),
        ...(trackStock && typeof values.lowStockThreshold === 'number'
          ? { lowStockThreshold: values.lowStockThreshold }
          : {}),
      };

      const response = await fetch(
        mode === 'create' ? '/api/admin/products' : `/api/admin/products/${packageId}`,
        {
          method: mode === 'create' ? 'POST' : 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
        },
      );

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? 'Could not save this product.');
      }

      router.push('/admin/products');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save this product.');
      setSubmitting(false);
    }
  }

  const busy = submitting || uploadingImage;

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6">
      <Card>
        <CardContent className="flex flex-col gap-5 pt-6">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="image">Photo</Label>
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="relative flex size-24 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-dashed border-border bg-border/10 text-muted-foreground transition-colors hover:bg-border/20"
              >
                {imagePreview ? (
                  <Image src={imagePreview} alt="" fill sizes="96px" className="object-cover" unoptimized />
                ) : (
                  <ImagePlus className="size-6" aria-hidden="true" />
                )}
              </button>
              <div className="text-sm text-muted-foreground">
                <p>JPEG, PNG, WebP, or GIF. Up to 8MB.</p>
                <Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => fileInputRef.current?.click()}>
                  {imagePreview ? 'Change photo' : 'Upload photo'}
                </Button>
              </div>
              <input
                ref={fileInputRef}
                id="image"
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="sr-only"
                onChange={onFileSelected}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              value={values.name}
              onChange={(event) => setValues((v) => ({ ...v, name: event.target.value }))}
              placeholder="Deluxe Snack Box"
              required
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={values.description}
              onChange={(event) => setValues((v) => ({ ...v, description: event.target.value }))}
              placeholder="What's inside this box?"
              required
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="snackCountLabel">What&apos;s inside bullet (optional)</Label>
            <Input
              id="snackCountLabel"
              value={values.snackCountLabel ?? ''}
              onChange={(event) => setValues((v) => ({ ...v, snackCountLabel: event.target.value }))}
              placeholder="e.g. 10+ snacks"
            />
            <p className="text-caption text-muted-foreground">
              Shown as an extra bullet point on the homepage&apos;s Pick Your Box cards. Leave blank to omit it.
            </p>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="priceKes">Price (KES)</Label>
              <Input
                id="priceKes"
                type="number"
                min={1}
                step={1}
                value={values.priceKes || ''}
                onChange={(event) => setValues((v) => ({ ...v, priceKes: Number(event.target.value) }))}
                required
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="stockCount">Track stock</Label>
                <Switch
                  checked={trackStock}
                  disabled={mode === 'edit'}
                  onCheckedChange={(checked) => {
                    setTrackStock(checked);
                    if (!checked) setValues((v) => ({ ...v, stockCount: undefined }));
                  }}
                />
              </div>
              <Input
                id="stockCount"
                type="number"
                min={0}
                step={1}
                disabled={!trackStock || mode === 'edit'}
                value={values.stockCount ?? ''}
                onChange={(event) => setValues((v) => ({ ...v, stockCount: Number(event.target.value) }))}
                placeholder={trackStock ? '0' : 'Unlimited'}
              />
              {mode === 'edit' && trackStock ? (
                <p className="text-caption text-muted-foreground">
                  Adjust stock from{' '}
                  <Link href="/admin/inventory" className="text-primary hover:underline">
                    Inventory
                  </Link>
                  .
                </p>
              ) : null}
            </div>

            {trackStock ? (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="lowStockThreshold">Low stock alert at</Label>
                <Input
                  id="lowStockThreshold"
                  type="number"
                  min={0}
                  step={1}
                  value={values.lowStockThreshold ?? ''}
                  onChange={(event) =>
                    setValues((v) => ({ ...v, lowStockThreshold: Number(event.target.value) }))
                  }
                  placeholder="e.g. 10"
                />
              </div>
            ) : null}
          </div>

          <div className="flex items-center justify-between rounded-md border border-border p-3">
            <div>
              <p className="text-sm font-medium text-foreground">Active</p>
              <p className="text-caption text-muted-foreground">Inactive boxes are hidden from checkout.</p>
            </div>
            <Switch
              checked={values.isActive}
              onCheckedChange={(checked) => setValues((v) => ({ ...v, isActive: checked }))}
            />
          </div>
        </CardContent>
      </Card>

      {error ? <p className="text-sm text-danger">{error}</p> : null}

      <div className="flex items-center gap-3">
        <Button type="submit" loading={busy}>
          {mode === 'create' ? 'Create product' : 'Save changes'}
        </Button>
        <Button type="button" variant="ghost" onClick={() => router.push('/admin/products')} disabled={busy}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
