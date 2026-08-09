'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Camera, CheckCircle2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { StarRating } from './StarRating';
import { PRIMARY_CTA_CLASS } from '../design/ctaStyles';

/**
 * The review form behind the shareable link (§ homepage reviews).
 *
 * Built for a phone held in one hand, because that is where it will
 * actually be filled in — a customer with the box open in front of
 * them. Everything is full-width and thumb-sized, the photo picker
 * opens the camera directly on mobile (`capture`), and there is no
 * account, no email, and nothing required beyond a name, a rating and
 * a sentence.
 *
 * The one honest thing it must say, and does, is that a review isn't
 * published instantly. Someone reads it first.
 */

const MAX_PHOTOS = 3;
const MAX_BODY = 1200;

interface StagedPhoto {
  file: File;
  previewUrl: string;
}

export function ReviewForm() {
  const [customerName, setCustomerName] = useState('');
  const [rating, setRating] = useState(0);
  const [body, setBody] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [photos, setPhotos] = useState<StagedPhoto[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  // Object URLs are a real allocation, not a string — released when the
  // photo is removed or the component unmounts.
  useEffect(() => {
    return () => {
      for (const photo of photos) {
        URL.revokeObjectURL(photo.previewUrl);
      }
    };
  }, [photos]);

  function addPhotos(files: FileList | null) {
    if (!files) {
      return;
    }
    const room = MAX_PHOTOS - photos.length;
    const accepted = Array.from(files)
      .filter((file) => file.type.startsWith('image/'))
      .slice(0, room);
    setPhotos((current) => [
      ...current,
      ...accepted.map((file) => ({ file, previewUrl: URL.createObjectURL(file) })),
    ]);
    // Lets the same file be picked again after being removed.
    if (fileInput.current) {
      fileInput.current.value = '';
    }
  }

  function removePhoto(index: number) {
    setPhotos((current) => {
      URL.revokeObjectURL(current[index].previewUrl);
      return current.filter((_, i) => i !== index);
    });
  }

  const ready = customerName.trim().length >= 2 && rating > 0 && body.trim().length >= 10;

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!ready) {
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const payload = new FormData();
      payload.set('customerName', customerName.trim());
      payload.set('rating', String(rating));
      payload.set('body', body.trim());
      if (contactPhone.trim()) {
        payload.set('contactPhone', contactPhone.trim());
      }
      for (const photo of photos) {
        payload.append('photos', photo.file);
      }

      const response = await fetch('/api/reviews', { method: 'POST', body: payload });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(result.error ?? 'Something went wrong. Please try again.');
        return;
      }
      setSubmitted(true);
    } catch {
      setError("We couldn't reach Snack Quest. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div className="flex flex-col items-center gap-6 text-center">
        <span className="bg-success/10 text-success flex size-20 items-center justify-center rounded-full">
          <CheckCircle2 className="size-10" aria-hidden="true" />
        </span>
        <div className="flex flex-col gap-3">
          <h2 className="text-page-title text-foreground font-bold tracking-tight">
            Thank you, {customerName.trim().split(' ')[0]}!
          </h2>
          <p className="text-muted-foreground text-base">
            We&apos;ve got your review. One of us reads every single one before it goes up, so give it a little
            while to appear on the site.
          </p>
        </div>
        <Button asChild size="lg" className={PRIMARY_CTA_CLASS}>
          <Link href="/">Back to Snack Quest</Link>
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-8">
      <div className="border-border bg-surface flex flex-col items-center gap-4 rounded-2xl border p-6">
        <p className="text-foreground text-center text-base font-semibold">How was your box?</p>
        <StarRating value={rating} onChange={setRating} />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="review-body">Tell us about it</Label>
        <Textarea
          id="review-body"
          value={body}
          onChange={(event) => setBody(event.target.value.slice(0, MAX_BODY))}
          rows={5}
          placeholder="What did you open first? What surprised you? Would you send one to a friend?"
          className="min-h-32 text-base"
        />
        <p className="text-muted-foreground text-right text-sm tabular-nums">
          {body.trim().length}/{MAX_BODY}
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <Label>Add photos (optional)</Label>
        <div className="grid grid-cols-3 gap-3">
          {photos.map((photo, index) => (
            <div key={photo.previewUrl} className="bg-border/40 relative aspect-square overflow-hidden rounded-xl">
              <Image src={photo.previewUrl} alt="" fill sizes="33vw" className="object-cover" unoptimized />
              <button
                type="button"
                onClick={() => removePhoto(index)}
                aria-label={`Remove photo ${index + 1}`}
                className="focus-visible:ring-primary absolute top-1.5 right-1.5 flex size-7 items-center justify-center rounded-full bg-black/60 text-white outline-none focus-visible:ring-2"
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            </div>
          ))}

          {photos.length < MAX_PHOTOS ? (
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              className="border-border text-muted-foreground hover:border-primary hover:text-primary focus-visible:ring-primary flex aspect-square flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed outline-none transition-colors focus-visible:ring-2"
            >
              <Camera className="size-6" aria-hidden="true" />
              <span className="text-sm font-medium">Add</span>
            </button>
          ) : null}
        </div>
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          // Opens the camera straight away on a phone, which is where
          // the box actually is.
          capture="environment"
          multiple
          onChange={(event) => addPhotos(event.target.files)}
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
        />
        <p className="text-muted-foreground text-sm">
          Up to {MAX_PHOTOS} photos. A shot of the box or your favourite snack is perfect.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="review-name">Your name</Label>
          <Input
            id="review-name"
            value={customerName}
            onChange={(event) => setCustomerName(event.target.value)}
            autoComplete="name"
            placeholder="Wanjiru K."
            className="text-base"
          />
          <p className="text-muted-foreground text-sm">Shown with your review — first name is fine.</p>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="review-phone">Phone (optional)</Label>
          <Input
            id="review-phone"
            value={contactPhone}
            onChange={(event) => setContactPhone(event.target.value)}
            inputMode="tel"
            placeholder="0712 345 678"
            className="text-base"
          />
          <p className="text-muted-foreground text-sm">Never shown. Only so we can reach you if we need to.</p>
        </div>
      </div>

      {error ? (
        <p className="text-danger text-sm" role="alert">
          {error}
        </p>
      ) : null}

      <div className="flex flex-col gap-3">
        <Button type="submit" size="lg" loading={submitting} disabled={!ready} className={PRIMARY_CTA_CLASS}>
          {submitting ? 'Sending…' : 'Post my review'}
        </Button>
        <p className="text-muted-foreground text-center text-sm">
          Every review is read by a person before it appears on the site.
        </p>
      </div>
    </form>
  );
}
