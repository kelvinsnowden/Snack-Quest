'use client';

import { useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { FileText, ImagePlus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { MAX_CAMPAIGN_IMAGES } from '@/lib/campaigns/limits';
import type { CampaignStatus } from '@/types';

export interface CampaignFormValues {
  title: string;
  status: CampaignStatus;
  commissionRateKes: number;
  rules: string;
  targetNiche: string;
  deadline: string;
  assetsUrl: string | null;
  imageUrls: string[];
  documentUrl: string | null;
  referenceLink: string | null;
}

interface CampaignFormProps {
  mode: 'create' | 'edit';
  campaignId?: string;
  initialValues?: CampaignFormValues;
}

const DEFAULTS: CampaignFormValues = {
  title: '',
  status: 'draft',
  commissionRateKes: 0,
  rules: '',
  targetNiche: '',
  deadline: '',
  assetsUrl: null,
  imageUrls: [],
  documentUrl: null,
  referenceLink: null,
};

async function uploadToStorage(directory: 'marketing' | 'documents', file: File): Promise<string> {
  const form = new FormData();
  form.append('file', file);
  form.append('directory', directory);
  const response = await fetch('/api/storage/upload', { method: 'POST', body: form });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? 'Upload failed.');
  }
  const body = (await response.json()) as { url: string };
  return body.url;
}

const STATUS_OPTIONS: CampaignStatus[] = ['draft', 'active', 'paused', 'ended'];

function filenameFromUrl(url: string): string {
  try {
    const pathname = new URL(url).pathname;
    return decodeURIComponent(pathname.split('/').pop() || 'Document');
  } catch {
    return 'Document';
  }
}

export function CampaignForm({ mode, campaignId, initialValues }: CampaignFormProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const documentInputRef = useRef<HTMLInputElement>(null);
  const [values, setValues] = useState<CampaignFormValues>(initialValues ?? DEFAULTS);
  const [imagePreview, setImagePreview] = useState<string | null>(initialValues?.assetsUrl ?? null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [galleryImages, setGalleryImages] = useState<string[]>(initialValues?.imageUrls ?? []);
  const [galleryUploading, setGalleryUploading] = useState(false);
  const [documentUrl, setDocumentUrl] = useState<string | null>(initialValues?.documentUrl ?? null);
  const [documentUploading, setDocumentUploading] = useState(false);
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
      return values.assetsUrl;
    }
    setUploadingImage(true);
    try {
      return await uploadToStorage('marketing', pendingFile);
    } finally {
      setUploadingImage(false);
    }
  }

  async function onGalleryFilesSelected(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (files.length === 0) return;

    const room = MAX_CAMPAIGN_IMAGES - galleryImages.length;
    const toUpload = files.slice(0, room);
    setGalleryUploading(true);
    setError(null);
    try {
      const uploaded = await Promise.all(toUpload.map((file) => uploadToStorage('marketing', file)));
      setGalleryImages((prev) => [...prev, ...uploaded]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not upload an image.');
    } finally {
      setGalleryUploading(false);
    }
  }

  function removeGalleryImage(url: string) {
    setGalleryImages((prev) => prev.filter((u) => u !== url));
  }

  async function onDocumentSelected(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setDocumentUploading(true);
    setError(null);
    try {
      setDocumentUrl(await uploadToStorage('documents', file));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not upload the document.');
    } finally {
      setDocumentUploading(false);
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!values.title.trim()) {
      setError('Title is required.');
      return;
    }
    if (!values.rules.trim()) {
      setError('Rules are required.');
      return;
    }
    if (!values.targetNiche.trim()) {
      setError('Target niche is required.');
      return;
    }
    if (!Number.isFinite(values.commissionRateKes) || values.commissionRateKes <= 0) {
      setError('Commission must be a positive number.');
      return;
    }
    if (!values.deadline) {
      setError('Deadline is required.');
      return;
    }

    setSubmitting(true);
    try {
      const assetsUrl = await uploadPendingImage();

      const payload = {
        title: values.title.trim(),
        status: values.status,
        commissionRateKes: values.commissionRateKes,
        rules: values.rules.trim(),
        targetNiche: values.targetNiche.trim(),
        deadline: values.deadline,
        assetsUrl,
        imageUrls: galleryImages,
        documentUrl,
        referenceLink: values.referenceLink?.trim() || null,
      };

      const response = await fetch(
        mode === 'create' ? '/api/admin/campaigns' : `/api/admin/campaigns/${campaignId}`,
        {
          method: mode === 'create' ? 'POST' : 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
        },
      );

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? 'Could not save this campaign.');
      }

      router.push('/admin/campaigns');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save this campaign.');
      setSubmitting(false);
    }
  }

  const busy = submitting || uploadingImage || galleryUploading || documentUploading;

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6">
      <Card>
        <CardContent className="flex flex-col gap-5 pt-6">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="assetsUrl">Campaign image</Label>
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
                <p>JPEG, PNG, WebP, GIF, or a short video. Up to 100MB.</p>
                <Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => fileInputRef.current?.click()}>
                  {imagePreview ? 'Change image' : 'Upload image'}
                </Button>
              </div>
              <input
                ref={fileInputRef}
                id="assetsUrl"
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime,video/webm"
                className="sr-only"
                onChange={onFileSelected}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              value={values.title}
              onChange={(event) => setValues((v) => ({ ...v, title: event.target.value }))}
              placeholder="Back to School"
              required
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rules">Rules</Label>
            <Textarea
              id="rules"
              value={values.rules}
              onChange={(event) => setValues((v) => ({ ...v, rules: event.target.value }))}
              placeholder="What does a creator need to post to earn commission?"
              required
            />
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="targetNiche">Target niche</Label>
              <Input
                id="targetNiche"
                value={values.targetNiche}
                onChange={(event) => setValues((v) => ({ ...v, targetNiche: event.target.value }))}
                placeholder="Food, lifestyle, ..."
                required
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="commissionRateKes">Commission (KES)</Label>
              <Input
                id="commissionRateKes"
                type="number"
                min={1}
                step={1}
                value={values.commissionRateKes || ''}
                onChange={(event) => setValues((v) => ({ ...v, commissionRateKes: Number(event.target.value) }))}
                required
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="deadline">Deadline</Label>
              <Input
                id="deadline"
                type="date"
                value={values.deadline}
                onChange={(event) => setValues((v) => ({ ...v, deadline: event.target.value }))}
                required
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="status">Status</Label>
              <select
                id="status"
                value={values.status}
                onChange={(event) => setValues((v) => ({ ...v, status: event.target.value as CampaignStatus }))}
                className="flex h-10 rounded-md border border-border bg-surface px-3 text-sm text-foreground shadow-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                {STATUS_OPTIONS.map((status) => (
                  <option key={status} value={status}>
                    {status[0].toUpperCase() + status.slice(1)}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-5 pt-6">
          <div className="flex flex-col gap-1.5">
            <Label>
              Additional images <span className="text-muted-foreground">(up to {MAX_CAMPAIGN_IMAGES})</span>
            </Label>
            <div className="flex flex-wrap items-center gap-3">
              {galleryImages.map((url) => (
                <div key={url} className="relative size-20 overflow-hidden rounded-lg border border-border">
                  <Image src={url} alt="" fill sizes="80px" className="object-cover" unoptimized />
                  <button
                    type="button"
                    onClick={() => removeGalleryImage(url)}
                    aria-label="Remove image"
                    className="absolute top-1 right-1 flex size-5 items-center justify-center rounded-full bg-foreground/70 text-white"
                  >
                    <X className="size-3" aria-hidden="true" />
                  </button>
                </div>
              ))}
              {galleryImages.length < MAX_CAMPAIGN_IMAGES ? (
                <button
                  type="button"
                  onClick={() => galleryInputRef.current?.click()}
                  disabled={galleryUploading}
                  className="flex size-20 items-center justify-center rounded-lg border border-dashed border-border bg-border/10 text-muted-foreground transition-colors hover:bg-border/20 disabled:cursor-wait disabled:opacity-70"
                >
                  <ImagePlus className="size-6" aria-hidden="true" />
                </button>
              ) : null}
            </div>
            <input
              ref={galleryInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              multiple
              className="sr-only"
              onChange={onGalleryFilesSelected}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Document</Label>
            {documentUrl ? (
              <div className="border-border bg-surface flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                <FileText className="text-muted-foreground size-4 shrink-0" aria-hidden="true" />
                <span className="truncate">{filenameFromUrl(documentUrl)}</span>
                <button
                  type="button"
                  onClick={() => setDocumentUrl(null)}
                  aria-label="Remove document"
                  className="text-muted-foreground ml-auto shrink-0 hover:text-foreground"
                >
                  <X className="size-4" aria-hidden="true" />
                </button>
              </div>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                loading={documentUploading}
                className="w-fit"
                onClick={() => documentInputRef.current?.click()}
              >
                Attach a document
              </Button>
            )}
            <input
              ref={documentInputRef}
              type="file"
              accept="application/pdf"
              className="sr-only"
              onChange={onDocumentSelected}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="referenceLink">Reference link</Label>
            <Input
              id="referenceLink"
              value={values.referenceLink ?? ''}
              onChange={(event) => setValues((v) => ({ ...v, referenceLink: event.target.value }))}
              placeholder="https://instagram.com/p/example"
            />
          </div>
        </CardContent>
      </Card>

      {error ? <p className="text-sm text-danger">{error}</p> : null}

      <div className="flex items-center gap-3">
        <Button type="submit" loading={busy}>
          {mode === 'create' ? 'Create campaign' : 'Save changes'}
        </Button>
        <Button type="button" variant="ghost" onClick={() => router.push('/admin/campaigns')} disabled={busy}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
