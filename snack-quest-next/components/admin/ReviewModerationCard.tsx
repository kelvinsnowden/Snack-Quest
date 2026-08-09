'use client';

import { useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Check, Star, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

/**
 * One review awaiting a decision (§ Admin: Reviews). Approving is what
 * puts it on the homepage; rejecting also deletes its photos, so the
 * button says so rather than leaving that to be discovered.
 */

export interface ModeratableReview {
  id: string;
  customerName: string;
  rating: number;
  body: string;
  photoUrls: string[];
  contactPhone: string | null;
  submittedAtIso: string;
  status: 'pending' | 'published' | 'rejected';
}

export function ReviewModerationCard({ review }: { review: ModeratableReview }) {
  const router = useRouter();
  const [busy, setBusy] = useState<'published' | 'rejected' | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function moderate(status: 'published' | 'rejected') {
    setBusy(status);
    setError(null);
    try {
      const response = await fetch(`/api/admin/reviews/${review.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        setError(payload.error ?? 'Could not update this review.');
        return;
      }
      router.refresh();
    } catch {
      setError('Could not reach the server.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card className="flex flex-col gap-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-foreground font-semibold">{review.customerName}</p>
          <p className="text-muted-foreground mt-1 text-sm">
            {new Date(review.submittedAtIso).toLocaleString('en-KE', {
              day: 'numeric',
              month: 'short',
              hour: 'numeric',
              minute: '2-digit',
            })}
            {review.contactPhone ? ` · ${review.contactPhone}` : ''}
          </p>
        </div>
        <span className="flex items-center gap-0.5" role="img" aria-label={`${review.rating} out of 5 stars`}>
          {[1, 2, 3, 4, 5].map((star) => (
            <Star
              key={star}
              className={`size-4 ${star <= review.rating ? 'fill-primary text-primary' : 'fill-transparent text-border'}`}
              strokeWidth={1.5}
              aria-hidden="true"
            />
          ))}
        </span>
      </div>

      <p className="text-foreground text-sm leading-relaxed whitespace-pre-line">{review.body}</p>

      {review.photoUrls.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {review.photoUrls.map((url) => (
            // Opens full size in a new tab — a moderator needs to see
            // the actual image, not a 96px thumbnail of it.
            <a
              key={url}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="bg-border/40 focus-visible:ring-primary relative size-24 overflow-hidden rounded-lg outline-none focus-visible:ring-2"
            >
              <Image src={url} alt="" fill sizes="96px" className="object-cover" />
            </a>
          ))}
        </div>
      ) : null}

      {error ? (
        <p className="text-danger text-sm" role="alert">
          {error}
        </p>
      ) : null}

      {review.status === 'pending' ? (
        <div className="mt-auto flex flex-wrap gap-2">
          <Button size="sm" onClick={() => moderate('published')} loading={busy === 'published'}>
            <Check aria-hidden="true" />
            Publish
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => moderate('rejected')}
            loading={busy === 'rejected'}
          >
            <X aria-hidden="true" />
            Reject and delete photos
          </Button>
        </div>
      ) : review.status === 'published' ? (
        <div className="mt-auto flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => moderate('rejected')}
            loading={busy === 'rejected'}
          >
            Take down
          </Button>
        </div>
      ) : (
        <div className="mt-auto">
          <Button size="sm" variant="outline" onClick={() => moderate('published')} loading={busy === 'published'}>
            Publish after all
          </Button>
        </div>
      )}
    </Card>
  );
}
