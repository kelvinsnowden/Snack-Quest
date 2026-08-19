import type { Metadata } from 'next';
import Link from 'next/link';
import { MessageSquareQuote } from 'lucide-react';
import { requireStaffSession } from '@/lib/auth/session';
import { reviewService, REVIEW_REQUEST_ELIGIBLE_AFTER_DAYS } from '@/services/reviewService';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { CopyLinkButton } from '@/components/creator/CopyLinkButton';
import { ReviewModerationCard, type ModeratableReview } from '@/components/admin/ReviewModerationCard';
import { ReviewRequestList } from '@/components/admin/ReviewRequestList';
import { getSiteUrl } from '@/lib/seo/siteUrl';
import { toMillis } from '@/lib/firestoreTimestamp';
import { buildWhatsAppOrderUrl } from '@/lib/whatsapp/orderLink';
import type { ReviewStatus } from '@/types';

export const metadata: Metadata = { title: 'Reviews' };

/**
 * `to-ask` is not a `ReviewStatus` — it lists *orders* whose customer
 * hasn't been asked yet, not reviews (§ Mission 2 — review
 * acquisition). It shares this page because "who should we ask" and
 * "what came back" are one job, and a separate route would split the
 * same workflow across two screens.
 */
type ReviewTab = ReviewStatus | 'to-ask';

const TABS: { status: ReviewTab; label: string }[] = [
  { status: 'to-ask', label: 'To ask' },
  { status: 'pending', label: 'Awaiting review' },
  { status: 'published', label: 'On the site' },
  { status: 'rejected', label: 'Rejected' },
];

/**
 * The moderation queue (§ Admin: Reviews) — and the place the
 * shareable review link lives, since "send this to a customer" and
 * "read what came back" are the same job.
 *
 * Nothing a customer submits is visible on the site until it's
 * approved here. That's the whole safety model for a public form that
 * accepts photos, so this page is the feature, not an afterthought to
 * it.
 */
export default async function AdminReviewsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const session = await requireStaffSession();
  const { status } = await searchParams;
  const activeTab: ReviewTab = TABS.some((tab) => tab.status === status)
    ? (status as ReviewTab)
    : 'pending';
  const activeStatus: ReviewStatus = activeTab === 'to-ask' ? 'pending' : activeTab;

  const [entries, pendingCount, awaitingRequest] = await Promise.all([
    // Skipped on the "to ask" tab, which renders orders rather than
    // reviews — no point paying for a moderation read nothing shows.
    activeTab === 'to-ask'
      ? Promise.resolve([])
      : reviewService.listForModeration(session.businessId, activeStatus),
    reviewService.countPending(session.businessId),
    reviewService.listAwaitingReviewRequest(session.businessId),
  ]);

  const reviewUrl = `${getSiteUrl()}/review`;

  // Plain, serializable fields only — `Review` carries Firestore
  // Timestamps, which cannot cross into a Client Component.
  const reviews: ModeratableReview[] = entries.map(({ id, data }) => ({
    id,
    customerName: data.customerName,
    rating: data.rating,
    body: data.body,
    photoUrls: data.photos.map((photo) => photo.url),
    contactPhone: data.contactPhone,
    submittedAtIso: new Date(toMillis(data.createdAt)).toISOString(),
    status: data.status,
  }));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-page-title text-foreground font-bold tracking-tight">Reviews</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Send customers the link below. Nothing they write appears on the site until you publish it here.
        </p>
      </div>

      <Card className="flex flex-col gap-4 p-5">
        <div>
          <p className="text-foreground text-sm font-medium">Your review link</p>
          <p className="text-muted-foreground mt-1 text-sm">
            Works for anyone — no account, no order number. Send it after a box lands.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <code className="border-border bg-background text-foreground min-w-0 flex-1 truncate rounded-md border px-3 py-2 text-sm">
            {reviewUrl}
          </code>
          <CopyLinkButton url={reviewUrl} />
          <a
            href={buildWhatsAppOrderUrl(
              `Hi! Hope you enjoyed your Snack Quest box 🎁 Would you mind leaving us a quick review? ${reviewUrl}`,
            )}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary text-sm font-medium underline underline-offset-4"
          >
            Send on WhatsApp
          </a>
        </div>
      </Card>

      <div className="border-border flex flex-wrap gap-2 border-b pb-3">
        {TABS.map((tab) => (
          <Link
            key={tab.status}
            href={`/admin/reviews?status=${tab.status}`}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              activeStatus === tab.status
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:bg-border/40'
            }`}
          >
            {tab.label}
            {tab.status === 'pending' && pendingCount > 0 ? ` (${pendingCount})` : ''}
            {tab.status === 'to-ask' && awaitingRequest.length > 0 ? ` (${awaitingRequest.length})` : ''}
          </Link>
        ))}
      </div>

      {activeTab === 'to-ask' ? (
        awaitingRequest.length === 0 ? (
          <EmptyState
            icon={MessageSquareQuote}
            title="Nobody to ask right now"
            description={`Customers appear here about ${REVIEW_REQUEST_ELIGIBLE_AFTER_DAYS} days after they order, once they've had the box — unless they've already been asked or already reviewed.`}
          />
        ) : (
          <div className="flex flex-col gap-4">
            <p className="text-muted-foreground text-sm">
              Ordered at least {REVIEW_REQUEST_ELIGIBLE_AFTER_DAYS} days ago, never asked, no review yet.
              Nothing is sent automatically — reach out yourself, then mark it here so nobody gets chased twice.
            </p>
            <ReviewRequestList rows={awaitingRequest} reviewUrl={reviewUrl} />
          </div>
        )
      ) : reviews.length === 0 ? (
        <EmptyState
          icon={MessageSquareQuote}
          title={activeStatus === 'pending' ? 'Nothing waiting' : 'Nothing here yet'}
          description={
            activeStatus === 'pending'
              ? 'New reviews land here the moment a customer submits one.'
              : 'Reviews you act on will show up under this tab.'
          }
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {reviews.map((review) => (
            <ReviewModerationCard key={review.id} review={review} />
          ))}
        </div>
      )}
    </div>
  );
}
