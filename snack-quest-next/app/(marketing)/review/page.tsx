import type { Metadata } from 'next';
import { Sparkles } from 'lucide-react';
import { ReviewForm } from '@/components/marketing/review/ReviewForm';
import { buildPageMetadata } from '@/lib/seo/pageMetadata';

/**
 * `/review` (§ homepage reviews) — the link to send a customer after
 * their box lands. Short URL on purpose: it gets pasted into a
 * WhatsApp message, and `snackquests.shop/review` is something someone
 * can also just read out.
 *
 * No login, no order lookup, no code to enter. Every extra step here
 * is a customer who doesn't finish, and a review nobody writes is
 * worth nothing regardless of how well it would have been verified.
 * The moderation queue is what keeps that safe rather than a gate on
 * the way in.
 */
export const metadata: Metadata = buildPageMetadata({
  title: 'Leave a review',
  description: 'Tell us how your Snack Quest box was — it takes about a minute.',
  path: '/review',
});

export default function LeaveReviewPage() {
  return (
    <div className="mx-auto max-w-2xl px-5 py-12 sm:px-6 sm:py-16">
      <header className="flex flex-col items-center gap-4 text-center">
        <span className="bg-primary/10 text-primary flex size-14 items-center justify-center rounded-full">
          <Sparkles className="size-7" aria-hidden="true" />
        </span>
        <h1 className="text-page-title text-foreground font-bold tracking-tight text-balance">
          How was your Snack Quest?
        </h1>
        <p className="text-muted-foreground max-w-md text-base text-pretty">
          Takes about a minute. Your words help the next person decide whether to take the leap — and we read
          every single one.
        </p>
      </header>

      <div className="mt-10">
        <ReviewForm />
      </div>
    </div>
  );
}
