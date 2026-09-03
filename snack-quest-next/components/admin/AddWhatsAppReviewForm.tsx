'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ImagePlus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { StarRating } from '@/components/marketing/review/StarRating';
import {
  compressImage,
  totalBytes,
  MAX_TOTAL_UPLOAD_BYTES,
} from '@/components/marketing/review/compressImage';

/**
 * Putting a WhatsApp review on the site (§ reviews that arrive on
 * WhatsApp).
 *
 * Most customers who say something nice say it in the chat they
 * already have open. Until now those reviews were real and unusable:
 * the only way onto the site was a form the customer would have to be
 * talked into filling in a second time.
 *
 * Collapsed by default. This page's day job is the moderation queue,
 * and a form permanently open above it would push the queue down the
 * screen for the commoner task.
 *
 * Everything posts as one multipart request, screenshot included —
 * see `app/api/admin/reviews/route.ts` for why the file travels with
 * the review rather than through an upload endpoint of its own.
 */

const MAX_SCREENSHOTS = 3;

export function AddWhatsAppReviewForm() {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);

  const [open, setOpen] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [rating, setRating] = useState(5);
  const [body, setBody] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [screenshots, setScreenshots] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /*
   * Compressed in the browser, exactly as the customer form does it.
   * A phone screenshot is routinely several megabytes and the whole
   * review travels in one request, which Vercel caps well below that —
   * so without this a perfectly ordinary screenshot fails at the edge,
   * before any of this code gets to say anything useful about why.
   */
  async function addScreenshots(list: FileList | null) {
    if (!list) return;
    setError(null);
    const incoming = await Promise.all(Array.from(list).map((file) => compressImage(file)));
    setScreenshots((current) => {
      const next = [...current, ...incoming].slice(0, MAX_SCREENSHOTS);
      if (totalBytes(next) > MAX_TOTAL_UPLOAD_BYTES) {
        setError('Those screenshots are too large together — remove one, or crop them tighter.');
        return current;
      }
      return next;
    });
    // Cleared so choosing the same file twice in a row still fires a
    // change event, which it otherwise would not.
    if (fileInput.current) fileInput.current.value = '';
  }

  function reset() {
    setCustomerName('');
    setRating(5);
    setBody('');
    setContactPhone('');
    setScreenshots([]);
    setError(null);
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    const formData = new FormData();
    formData.set('customerName', customerName.trim());
    formData.set('rating', String(rating));
    formData.set('body', body.trim());
    if (contactPhone.trim()) formData.set('contactPhone', contactPhone.trim());
    for (const file of screenshots) formData.append('photos', file);

    try {
      const response = await fetch('/api/admin/reviews', { method: 'POST', body: formData });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(payload?.error ?? 'That didn’t save. Try again.');
        return;
      }
      reset();
      setOpen(false);
      // It is published immediately, so the "On the site" tab is where
      // it now lives — refresh so the operator sees it land rather than
      // wondering whether the press worked.
      router.refresh();
    } catch {
      setError('That didn’t save — check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) {
    return (
      <Card className="flex flex-wrap items-center justify-between gap-3 p-5">
        <div className="min-w-0">
          <p className="text-foreground text-sm font-medium">Got a review on WhatsApp?</p>
          <p className="text-muted-foreground mt-1 text-sm">
            Type it up here with the screenshot. It goes straight onto the site.
          </p>
        </div>
        <Button type="button" onClick={() => setOpen(true)}>
          Add a review
        </Button>
      </Card>
    );
  }

  return (
    <Card className="p-5">
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-foreground text-sm font-medium">Add a review from WhatsApp</p>
            <p className="text-muted-foreground mt-1 text-sm">
              This publishes immediately — you are the one approving it.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              reset();
              setOpen(false);
            }}
            className="text-muted-foreground hover:text-foreground shrink-0"
            aria-label="Close"
          >
            <X className="size-5" aria-hidden="true" />
          </button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="wa-name">Customer&rsquo;s name</Label>
            <Input
              id="wa-name"
              value={customerName}
              onChange={(event) => setCustomerName(event.target.value)}
              placeholder="Wanjiru K."
              required
            />
            <p className="text-muted-foreground text-caption">
              Shown on the site. A first name and initial is plenty.
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="wa-phone">
              Their number <span className="text-muted-foreground font-normal">(optional)</span>
            </Label>
            <Input
              id="wa-phone"
              value={contactPhone}
              onChange={(event) => setContactPhone(event.target.value)}
              inputMode="numeric"
              placeholder="0712 345 678"
            />
            {/*
              The badge is earned by matching a paid order, never by a
              staff member deciding this person bought something — so
              this says what the number is for rather than implying it
              grants anything.
            */}
            <p className="text-muted-foreground text-caption">
              Never shown. If it matches a paid order, the review gets a “Verified purchase” badge.
            </p>
          </div>
        </div>

        {/* The customer form's control, so a rating means the same thing however it was entered. */}
        <StarRating value={rating} onChange={setRating} />

        <div className="flex flex-col gap-2">
          <Label htmlFor="wa-body">What they said</Label>
          <Textarea
            id="wa-body"
            value={body}
            onChange={(event) => setBody(event.target.value)}
            rows={4}
            placeholder="Type their message as they wrote it."
            required
          />
          <p className="text-muted-foreground text-caption">
            Their words, not a summary — a tidied-up quote is not what they said.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-foreground text-sm font-medium">Screenshot</span>
          <div className="flex flex-wrap gap-2">
            {screenshots.map((file, index) => (
              <span
                key={`${file.name}-${index}`}
                className="border-border bg-background text-foreground inline-flex max-w-full items-center gap-2 rounded-md border px-3 py-2 text-sm"
              >
                <span className="truncate">{file.name}</span>
                <button
                  type="button"
                  onClick={() => setScreenshots((current) => current.filter((_, i) => i !== index))}
                  aria-label={`Remove ${file.name}`}
                  className="text-muted-foreground hover:text-foreground shrink-0"
                >
                  <X className="size-4" aria-hidden="true" />
                </button>
              </span>
            ))}
            {screenshots.length < MAX_SCREENSHOTS ? (
              <Button type="button" variant="outline" onClick={() => fileInput.current?.click()}>
                <ImagePlus className="size-4" aria-hidden="true" />
                {screenshots.length === 0 ? 'Choose screenshot' : 'Add another'}
              </Button>
            ) : null}
          </div>
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            multiple
            onChange={(event) => addScreenshots(event.target.files)}
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
          />
          {/*
            Said at the moment the file is chosen, which is the only
            place it will be read. A WhatsApp screenshot usually carries
            the customer's number and profile photo at the top, and this
            image goes on the public site.
          */}
          <p className="text-muted-foreground text-caption">
            Up to {MAX_SCREENSHOTS}. These appear on the site, so crop out their number and profile
            picture first.
          </p>
        </div>

        {error ? (
          <p className="border-danger/30 bg-danger/5 text-danger rounded-lg border p-3 text-sm" role="alert">
            {error}
          </p>
        ) : null}

        <div className="flex flex-wrap gap-3">
          <Button type="submit" loading={submitting}>
            {submitting ? 'Publishing…' : 'Publish review'}
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              reset();
              setOpen(false);
            }}
          >
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  );
}
