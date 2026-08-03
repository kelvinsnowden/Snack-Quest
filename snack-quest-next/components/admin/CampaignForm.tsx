'use client';

import { useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { ImagePlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import type { CampaignStatus } from '@/types';

export interface CampaignFormValues {
  title: string;
  status: CampaignStatus;
  commissionRateKes: number;
  rules: string;
  targetNiche: string;
  deadline: string;
  assetsUrl: string | null;
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
};

const STATUS_OPTIONS: CampaignStatus[] = ['draft', 'active', 'paused', 'ended'];

export function CampaignForm({ mode, campaignId, initialValues }: CampaignFormProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [values, setValues] = useState<CampaignFormValues>(initialValues ?? DEFAULTS);
  const [imagePreview, setImagePreview] = useState<string | null>(initialValues?.assetsUrl ?? null);
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
      return values.assetsUrl;
    }
    setUploadingImage(true);
    try {
      const form = new FormData();
      form.append('file', pendingFile);
      form.append('directory', 'marketing');
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

  const busy = submitting || uploadingImage;

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
