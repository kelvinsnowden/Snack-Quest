'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { upload } from '@vercel/blob/client';
import { CheckCircle2, ImagePlus, Loader2, Video, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { StarRating } from './StarRating';
import { compressImage, totalBytes, MAX_TOTAL_UPLOAD_BYTES } from './compressImage';
import { REVIEW_VIDEO_ENABLED, REVIEW_VIDEO_POLICY } from '@/lib/storage/policies';
import { PRIMARY_CTA_CLASS } from '../design/ctaStyles';
import { trackEvent } from '@/lib/analytics/trackEvent';
import { FUNNEL_EVENTS } from '@/lib/analytics/funnelEvents';

/**
 * The review form behind the shareable link (§ homepage reviews).
 *
 * Built for a phone held in one hand, because that is where it will
 * actually be filled in — a customer with the box open in front of
 * them. Everything is full-width and thumb-sized, and there is no
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
  const [compressing, setCompressing] = useState(false);
  // A chosen video, held locally until submit. It is uploaded straight
  // to Blob storage rather than sent with the form — see
  // app/api/reviews/video/route.ts for why it cannot travel with it.
  const [video, setVideo] = useState<{ file: File; previewUrl: string } | null>(null);
  const [videoProgress, setVideoProgress] = useState<number | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const videoInput = useRef<HTMLInputElement>(null);

  // Object URLs are a real allocation, not a string — released when the
  // photo is removed or the component unmounts.
  useEffect(() => {
    return () => {
      for (const photo of photos) {
        URL.revokeObjectURL(photo.previewUrl);
      }
    };
  }, [photos]);

  /**
   * `review_started` — the first real interaction with the form, not
   * the page load (§ Mission 2 — funnel analytics). Landing on
   * `/review` is already a page view; what this adds is how many of
   * those people actually began writing, which is the difference
   * between "the ask reached them" and "the ask worked".
   */
  const reviewStartedRef = useRef(false);
  function markReviewStarted() {
    if (reviewStartedRef.current) {
      return;
    }
    reviewStartedRef.current = true;
    trackEvent(FUNNEL_EVENTS.reviewStarted);
  }

  async function addPhotos(files: FileList | null) {
    if (!files) {
      return;
    }
    const room = MAX_PHOTOS - photos.length;
    const picked = Array.from(files)
      .filter((file) => file.type.startsWith('image/'))
      .slice(0, room);
    // Lets the same file be picked again after being removed.
    if (fileInput.current) {
      fileInput.current.value = '';
    }
    if (picked.length === 0) {
      return;
    }

    setCompressing(true);
    setError(null);
    try {
      // Shrunk here, before it ever becomes part of a request — see
      // compressImage.ts for why a raw phone photo cannot be uploaded.
      const prepared = await Promise.all(picked.map(compressImage));
      const next = [
        ...photos,
        ...prepared.map((file) => ({ file, previewUrl: URL.createObjectURL(file) })),
      ];

      // Backstop for anything that wouldn't compress. Saying so here
      // beats letting the platform reject the request, which returns
      // no message this form can show.
      if (totalBytes(next.map((entry) => entry.file)) > MAX_TOTAL_UPLOAD_BYTES) {
        for (const entry of next.slice(photos.length)) {
          URL.revokeObjectURL(entry.previewUrl);
        }
        setError(
          photos.length === 0
            ? 'That photo is too large to upload. Try a different one.'
            : 'Those photos are too large together — remove one and try again.',
        );
        return;
      }

      setPhotos(next);
    } finally {
      setCompressing(false);
    }
  }

  /**
   * Reads the real duration out of the file before accepting it. A
   * byte ceiling alone would let a long, heavily compressed clip
   * through and reject a short, high-bitrate one, which from the
   * customer's side looks arbitrary.
   */
  async function addVideo(files: FileList | null) {
    const file = files?.[0];
    if (videoInput.current) {
      videoInput.current.value = '';
    }
    if (!file) {
      return;
    }
    setError(null);

    if (file.size > REVIEW_VIDEO_POLICY.maxSizeBytes) {
      setError(
        `That video is too big. Keep it under ${Math.round(REVIEW_VIDEO_POLICY.maxSizeBytes / (1024 * 1024))}MB — about ${REVIEW_VIDEO_POLICY.maxDurationSeconds} seconds.`,
      );
      return;
    }

    const previewUrl = URL.createObjectURL(file);
    const duration = await new Promise<number>((resolve) => {
      const probe = document.createElement('video');
      probe.preload = 'metadata';
      probe.onloadedmetadata = () => resolve(probe.duration);
      // A duration we can't read is not a reason to refuse the file —
      // the byte ceiling above and the server's own cap still hold.
      probe.onerror = () => resolve(0);
      probe.src = previewUrl;
    });

    if (duration > REVIEW_VIDEO_POLICY.maxDurationSeconds + 1) {
      URL.revokeObjectURL(previewUrl);
      setError(
        `That video is ${Math.round(duration)} seconds long. Please keep it to ${REVIEW_VIDEO_POLICY.maxDurationSeconds} seconds or less.`,
      );
      return;
    }

    // One or the other, never both — see the picker's own note.
    for (const photo of photos) {
      URL.revokeObjectURL(photo.previewUrl);
    }
    setPhotos([]);
    setVideo({ file, previewUrl });
  }

  function removeVideo() {
    if (video) {
      URL.revokeObjectURL(video.previewUrl);
    }
    setVideo(null);
    setVideoProgress(null);
  }

  function removePhoto(index: number) {
    setPhotos((current) => {
      URL.revokeObjectURL(current[index].previewUrl);
      return current.filter((_, i) => i !== index);
    });
  }

  const ready =
    customerName.trim().length >= 2 && rating > 0 && body.trim().length >= 10 && !compressing;

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!ready) {
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      // Uploaded before the form is submitted, straight from the
      // browser to Blob storage. If this fails the review is not sent
      // — better to tell them now than to drop the video silently
      // from a review they think they posted with it.
      let videoUrl: string | null = null;
      if (video) {
        setVideoProgress(0);
        const blob = await upload(video.file.name, video.file, {
          access: 'public',
          handleUploadUrl: '/api/reviews/video',
          onUploadProgress: ({ percentage }) => setVideoProgress(percentage),
        });
        videoUrl = blob.url;
      }

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
      if (videoUrl) {
        payload.set('videoUrl', videoUrl);
      }

      const response = await fetch('/api/reviews', { method: 'POST', body: payload });

      // Not every failure answers in JSON. A request rejected before it
      // reaches the route — a 413 from the platform for an oversized
      // body, a gateway error — replies with HTML or nothing, and
      // parsing that unconditionally used to throw straight into the
      // catch below, reporting "couldn't reach Snack Quest" for a
      // request that had very much arrived. That misdirection is what
      // hid a real 413 from oversized photos.
      const result = (await response.json().catch(() => null)) as { error?: string } | null;

      if (!response.ok) {
        setError(
          result?.error ??
            (response.status === 413
              ? 'Your photos are too large to upload. Remove one and try again.'
              : `Something went wrong (error ${response.status}). Please try again.`),
        );
        return;
      }
      trackEvent(FUNNEL_EVENTS.reviewSubmitted, {
        rating,
        hasPhotos: photos.length > 0,
        hasVideo: video !== null,
      });
      setSubmitted(true);
    } catch {
      setError("We couldn't reach Snack Quest. Check your connection and try again.");
    } finally {
      setSubmitting(false);
      setVideoProgress(null);
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
        <StarRating
          value={rating}
          onChange={(next) => {
            markReviewStarted();
            setRating(next);
          }}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="review-body">Tell us about it</Label>
        <Textarea
          id="review-body"
          value={body}
          onChange={(event) => {
            markReviewStarted();
            setBody(event.target.value.slice(0, MAX_BODY));
          }}
          rows={5}
          placeholder="What did you open first? What surprised you? Would you send one to a friend?"
          className="min-h-32 text-base"
        />
        <p className="text-muted-foreground text-right text-sm tabular-nums">
          {body.trim().length}/{MAX_BODY}
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <Label>{REVIEW_VIDEO_ENABLED ? 'Add photos or a video (optional)' : 'Add photos (optional)'}</Label>

        {video ? (
          <div className="border-border bg-surface relative overflow-hidden rounded-xl border">
            {/* Muted and click-to-play: this is a preview of their own
                clip, not something that should start shouting. */}
            <video
              src={video.previewUrl}
              controls
              playsInline
              muted
              preload="metadata"
              className="aspect-video w-full bg-black object-contain"
            />
            <button
              type="button"
              onClick={removeVideo}
              disabled={submitting}
              aria-label="Remove video"
              className="focus-visible:ring-primary absolute top-2 right-2 flex size-8 items-center justify-center rounded-full bg-black/60 text-white outline-none focus-visible:ring-2 disabled:opacity-50"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          </div>
        ) : null}

        <div className={`grid grid-cols-3 gap-3 ${video ? 'hidden' : ''}`}>
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
              // The icon used to be a camera, which promised the one
              // thing the picker no longer forces. An image icon says
              // "a photo goes here" without implying how you get it.
              className="border-border text-muted-foreground hover:border-primary hover:text-primary focus-visible:ring-primary flex aspect-square flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed outline-none transition-colors focus-visible:ring-2"
            >
              {compressing ? (
                <Loader2 className="size-6 animate-spin" aria-hidden="true" />
              ) : (
                <ImagePlus className="size-6" aria-hidden="true" />
              )}
              <span className="text-sm font-medium">
                {compressing ? 'Preparing…' : photos.length === 0 ? 'Add photo' : 'Add more'}
              </span>
            </button>
          ) : null}
        </div>
        {/*
          Deliberately no `capture` attribute. It was here to open the
          camera straight away, on the assumption that someone reviewing
          a box has it in front of them — but `capture` doesn't add the
          camera to the chooser, it *replaces* the chooser. Anyone who
          photographed their box when it arrived and wanted to attach
          that photo had no way to. Without it the browser shows its own
          picker — camera, gallery and files — which is both options
          instead of one.
        */}
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          multiple
          onChange={(event) => addPhotos(event.target.files)}
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
        />
        {/*
          Deliberately one or the other. A card carrying three photos
          and a video is a mess to lay out and a lot to ask of someone
          on mobile data — and in practice a person has either filmed
          the unboxing or photographed the result, not both.
        */}
        {video || !REVIEW_VIDEO_ENABLED ? null : (
          <button
            type="button"
            onClick={() => videoInput.current?.click()}
            className="border-border text-muted-foreground hover:border-primary hover:text-primary focus-visible:ring-primary flex items-center justify-center gap-2 rounded-xl border-2 border-dashed py-3 text-sm font-medium outline-none transition-colors focus-visible:ring-2"
          >
            <Video className="size-4" aria-hidden="true" />
            {photos.length > 0 ? 'Use a video instead' : 'Add a video'}
          </button>
        )}

        <input
          ref={videoInput}
          type="file"
          accept="video/*"
          onChange={(event) => addVideo(event.target.files)}
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
        />

        <p className="text-muted-foreground text-sm">
          {video
            ? `One video, up to ${REVIEW_VIDEO_POLICY.maxDurationSeconds} seconds. Remove it if you'd rather send photos.`
            : REVIEW_VIDEO_ENABLED
              ? `Up to ${MAX_PHOTOS} photos, or one video of ${REVIEW_VIDEO_POLICY.maxDurationSeconds} seconds or less. A shot of the box or your favourite snack is perfect.`
              : `Up to ${MAX_PHOTOS}. Take one now or pick from your gallery — a shot of the box or your favourite snack is perfect.`}
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
          {/*
            The number now does a second job — it is what matches a
            review to a real order and earns the "Verified purchase"
            badge (§ Mission 2 — review acquisition). Saying so keeps
            this description complete, and gives someone a reason to
            fill in a field they would otherwise skip. The number
            itself is still never published.
          */}
          <p className="text-muted-foreground text-sm">
            Never shown. We use it to confirm your order so your review shows as a verified purchase,
            and so we can reach you if we need to.
          </p>
        </div>
      </div>

      {error ? (
        <p className="text-danger text-sm" role="alert">
          {error}
        </p>
      ) : null}

      <div className="flex flex-col gap-3">
        <Button type="submit" size="lg" loading={submitting} disabled={!ready} className={PRIMARY_CTA_CLASS}>
          {submitting
            ? videoProgress !== null && videoProgress < 100
              ? `Uploading video… ${Math.round(videoProgress)}%`
              : 'Sending…'
            : 'Post my review'}
        </Button>
        <p className="text-muted-foreground text-center text-sm">
          Every review is read by a person before it appears on the site.
        </p>
      </div>
    </form>
  );
}
