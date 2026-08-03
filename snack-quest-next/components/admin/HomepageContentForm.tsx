'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { ImagePlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import type { HomepageContent } from '@/types';

interface ImageField {
  key: keyof HomepageContent;
  label: string;
  hint: string;
}

const FIELDS: ImageField[] = [
  {
    key: 'founderImageUrl',
    label: 'Founder portrait',
    hint: 'Shown in the "Meet the founder" section.',
  },
  {
    key: 'whatsInsidePhotoUrl',
    label: 'Snack flat-lay photo',
    hint: 'Shown in the "What\'s inside?" section.',
  },
];

/**
 * Uploads for the homepage's two photo-led sections (§ Homepage CMS)
 * — reuses the exact upload path `ProductForm` already uses
 * (`/api/storage/upload`, Vercel Blob), just pointed at the
 * `marketing` directory instead of `snacks`. Each field is fully
 * independent: uploading one and saving doesn't touch the other.
 */
export function HomepageContentForm({
  initialValues,
}: {
  initialValues: HomepageContent;
}) {
  const router = useRouter();
  const [values, setValues] = useState<HomepageContent>(initialValues);
  const [pendingFiles, setPendingFiles] = useState<
    Partial<Record<keyof HomepageContent, File>>
  >({});
  const [uploading, setUploading] = useState<keyof HomepageContent | null>(
    null,
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const inputRefs = {
    founderImageUrl: useRef<HTMLInputElement>(null),
    whatsInsidePhotoUrl: useRef<HTMLInputElement>(null),
  };

  function onFileSelected(
    field: keyof HomepageContent,
    event: React.ChangeEvent<HTMLInputElement>,
  ) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setPendingFiles((prev) => ({ ...prev, [field]: file }));
    setValues((prev) => ({ ...prev, [field]: URL.createObjectURL(file) }));
  }

  async function uploadPending(
    field: keyof HomepageContent,
  ): Promise<string | null> {
    const file = pendingFiles[field];
    if (!file) {
      return values[field];
    }
    setUploading(field);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('directory', 'marketing');
      const response = await fetch('/api/storage/upload', {
        method: 'POST',
        body: form,
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(
          body?.error ??
            `Could not upload the ${field === 'founderImageUrl' ? 'founder portrait' : 'flat-lay photo'}.`,
        );
      }
      const body = (await response.json()) as { url: string };
      return body.url;
    } finally {
      setUploading(null);
    }
  }

  async function onSave() {
    setError(null);
    setSaved(false);
    setSubmitting(true);
    try {
      const founderImageUrl = await uploadPending('founderImageUrl');
      const whatsInsidePhotoUrl = await uploadPending('whatsInsidePhotoUrl');

      const response = await fetch('/api/admin/settings', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          homepageContent: { founderImageUrl, whatsInsidePhotoUrl },
        }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(body?.error ?? 'Could not save homepage content.');
      }

      setValues({ founderImageUrl, whatsInsidePhotoUrl });
      setPendingFiles({});
      setSaved(true);
      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Could not save homepage content.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  const busy = submitting || uploading !== null;

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardContent className="flex flex-col gap-6 pt-6">
          {FIELDS.map((field) => {
            const preview = values[field.key];
            return (
              <div key={field.key} className="flex flex-col gap-1.5">
                <Label htmlFor={field.key}>{field.label}</Label>
                <div className="flex items-center gap-4">
                  <button
                    type="button"
                    onClick={() => inputRefs[field.key].current?.click()}
                    className="border-border bg-border/10 text-muted-foreground hover:bg-border/20 relative flex size-24 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-dashed transition-colors"
                  >
                    {preview ? (
                      <Image
                        src={preview}
                        alt=""
                        fill
                        sizes="96px"
                        className="object-cover"
                        unoptimized
                      />
                    ) : (
                      <ImagePlus className="size-6" aria-hidden="true" />
                    )}
                  </button>
                  <div className="text-muted-foreground text-sm">
                    <p>{field.hint}</p>
                    <p>JPEG, PNG, WebP, or GIF. Up to 100MB.</p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="mt-2"
                      loading={uploading === field.key}
                      onClick={() => inputRefs[field.key].current?.click()}
                    >
                      {preview ? 'Change photo' : 'Upload photo'}
                    </Button>
                  </div>
                  <input
                    ref={inputRefs[field.key]}
                    id={field.key}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    className="sr-only"
                    onChange={(event) => onFileSelected(field.key, event)}
                  />
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {error ? <p className="text-danger text-sm">{error}</p> : null}
      {saved && !error ? (
        <p className="text-success text-sm">Homepage content saved.</p>
      ) : null}

      <div className="flex items-center gap-3">
        <Button type="button" onClick={onSave} loading={busy}>
          Save changes
        </Button>
      </div>
    </div>
  );
}
