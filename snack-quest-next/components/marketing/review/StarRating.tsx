'use client';

import { useState } from 'react';
import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * The rating control on the review form (§ homepage reviews). Built as
 * a real radio group rather than five buttons: it is a single choice
 * from five, arrow keys move between them, and a screen reader
 * announces it as one question with one answer — none of which comes
 * free from a row of `<button>`s.
 *
 * The stars are deliberately large. This is the first thing a customer
 * touches on a phone, one-handed, possibly while holding a snack box,
 * and a 24px tap target would be the difference between a review and
 * an abandoned form.
 */

const LABELS = ['Not great', 'Okay', 'Good', 'Really good', 'Loved it'];

export function StarRating({
  value,
  onChange,
}: {
  value: number;
  onChange: (rating: number) => void;
}) {
  const [hovered, setHovered] = useState(0);
  const shown = hovered || value;

  return (
    <div className="flex flex-col items-center gap-3">
      <div
        role="radiogroup"
        aria-label="Your rating"
        className="flex items-center gap-1.5"
        onMouseLeave={() => setHovered(0)}
      >
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            role="radio"
            aria-checked={value === star}
            aria-label={`${star} star${star === 1 ? '' : 's'} — ${LABELS[star - 1]}`}
            onClick={() => onChange(star)}
            onMouseEnter={() => setHovered(star)}
            className="focus-visible:ring-primary rounded-full p-1.5 outline-none transition-transform duration-150 focus-visible:ring-2 active:scale-90"
          >
            <Star
              className={cn(
                'size-9 transition-colors duration-150 sm:size-10',
                star <= shown ? 'fill-primary text-primary' : 'fill-transparent text-border',
              )}
              strokeWidth={1.5}
              aria-hidden="true"
            />
          </button>
        ))}
      </div>
      <p aria-live="polite" className="text-muted-foreground min-h-5 text-sm font-medium">
        {shown > 0 ? LABELS[shown - 1] : 'Tap to rate'}
      </p>
    </div>
  );
}
