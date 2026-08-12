'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { FileText, ImagePlus, Send, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { MAX_SUBMISSION_IMAGES } from '@/lib/campaigns/limits';

const SUBMISSION_TYPES = [
  { value: 'social_post', label: 'Social post' },
  { value: 'video', label: 'Video' },
  { value: 'photo', label: 'Photo' },
  { value: 'story', label: 'Story' },
  { value: 'other', label: 'Other' },
];

async function uploadTo(directory: 'creators' | 'documents', file: File): Promise<string> {
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

/**
 * A creator submitting proof of a campaign deliverable (§ Creator
 * Portal campaigns browse, § campaign attachments) — up to
 * `MAX_SUBMISSION_IMAGES` photos, one supporting document, a link, and a
 * comment. Every attachment uploads to Blob storage immediately on
 * pick (same pattern as `AvatarUpload`), so `onSubmit` only ever sends
 * URLs the server already has, never a raw file.
 */
export function SubmitDeliverableDialog({ campaignId, campaignTitle }: { campaignId: string; campaignTitle: string }) {
  const router = useRouter();
  const imageInputRef = useRef<HTMLInputElement>(null);
  const documentInputRef = useRef<HTMLInputElement>(null);

  const [open, setOpen] = useState(false);
  const [submissionType, setSubmissionType] = useState(SUBMISSION_TYPES[0].value);
  const [socialLink, setSocialLink] = useState('');
  const [notes, setNotes] = useState('');
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [imageUploading, setImageUploading] = useState(false);
  const [documentUrl, setDocumentUrl] = useState<string | null>(null);
  const [documentName, setDocumentName] = useState<string | null>(null);
  const [documentUploading, setDocumentUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setSubmissionType(SUBMISSION_TYPES[0].value);
    setSocialLink('');
    setNotes('');
    setImageUrls([]);
    setDocumentUrl(null);
    setDocumentName(null);
    setError(null);
  }

  async function onImagesSelected(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (files.length === 0) return;

    const room = MAX_SUBMISSION_IMAGES - imageUrls.length;
    const toUpload = files.slice(0, room);
    setImageUploading(true);
    setError(null);
    try {
      const uploaded = await Promise.all(toUpload.map((file) => uploadTo('creators', file)));
      setImageUrls((prev) => [...prev, ...uploaded]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not upload your photo.');
    } finally {
      setImageUploading(false);
    }
  }

  function removeImage(url: string) {
    setImageUrls((prev) => prev.filter((u) => u !== url));
  }

  async function onDocumentSelected(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setDocumentUploading(true);
    setError(null);
    try {
      const url = await uploadTo('documents', file);
      setDocumentUrl(url);
      setDocumentName(file.name);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not upload your document.');
    } finally {
      setDocumentUploading(false);
    }
  }

  function removeDocument() {
    setDocumentUrl(null);
    setDocumentName(null);
  }

  async function onSubmit() {
    if (!socialLink.trim() && !notes.trim() && imageUrls.length === 0 && !documentUrl) {
      setError('Add a link, a photo, a document, or a comment as proof.');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch('/api/creator/campaign-submissions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          campaignId,
          submissionType,
          socialLink: socialLink.trim() || null,
          notes: notes.trim(),
          imageUrls,
          documentUrl,
        }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? 'Could not submit your deliverable.');
      }
      setOpen(false);
      reset();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not submit your deliverable.');
    } finally {
      setSubmitting(false);
    }
  }

  const busy = submitting || imageUploading || documentUploading;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm">
          <Send aria-hidden="true" />
          Submit
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Submit deliverable</DialogTitle>
          <DialogDescription>{campaignTitle} — proof gets reviewed before it&apos;s approved.</DialogDescription>
        </DialogHeader>

        <div className="mt-4 flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="submissionType">Type</Label>
            <select
              id="submissionType"
              value={submissionType}
              onChange={(event) => setSubmissionType(event.target.value)}
              className="flex h-10 w-full rounded-md border border-border bg-surface px-3 text-sm text-foreground shadow-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              {SUBMISSION_TYPES.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="socialLink">Link to your post</Label>
            <Input
              id="socialLink"
              value={socialLink}
              onChange={(event) => setSocialLink(event.target.value)}
              placeholder="https://instagram.com/p/..."
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>
              Photos <span className="text-muted-foreground">(up to {MAX_SUBMISSION_IMAGES})</span>
            </Label>
            <div className="flex flex-wrap gap-2">
              {imageUrls.map((url) => (
                <div key={url} className="relative size-16 overflow-hidden rounded-md border border-border">
                  <Image src={url} alt="" fill sizes="64px" className="object-cover" unoptimized />
                  <button
                    type="button"
                    onClick={() => removeImage(url)}
                    aria-label="Remove photo"
                    className="absolute top-0.5 right-0.5 flex size-4 items-center justify-center rounded-full bg-foreground/70 text-white"
                  >
                    <X className="size-2.5" aria-hidden="true" />
                  </button>
                </div>
              ))}
              {imageUrls.length < MAX_SUBMISSION_IMAGES ? (
                <button
                  type="button"
                  onClick={() => imageInputRef.current?.click()}
                  disabled={imageUploading}
                  className="flex size-16 items-center justify-center rounded-md border border-dashed border-border text-muted-foreground transition-colors hover:bg-border/10 disabled:cursor-wait disabled:opacity-70"
                >
                  <ImagePlus className="size-5" aria-hidden="true" />
                </button>
              ) : null}
            </div>
            <input
              ref={imageInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              multiple
              className="sr-only"
              onChange={onImagesSelected}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>
              Document <span className="text-muted-foreground">(optional, PDF)</span>
            </Label>
            {documentUrl ? (
              <div className="border-border bg-surface flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                <FileText className="text-muted-foreground size-4 shrink-0" aria-hidden="true" />
                <span className="truncate">{documentName}</span>
                <button
                  type="button"
                  onClick={removeDocument}
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
                onClick={() => documentInputRef.current?.click()}
                className="w-fit"
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
            <Label htmlFor="notes">
              Comment <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Textarea id="notes" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Anything else the reviewer should know" />
          </div>

          {error ? <p className="text-sm text-danger">{error}</p> : null}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={onSubmit} loading={busy}>
            Submit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
