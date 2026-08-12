import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, Megaphone } from 'lucide-react';
import type { Campaign } from '@/types';
import { formatKes } from '@/lib/orders/format';
import {
  CLOSING_SOON_WINDOW_DAYS,
  daysUntilDeadline,
  isVideoAsset,
  urgencyLabel,
} from '@/lib/creator/campaignPresentation';

type CampaignEntry = { id: string; data: Campaign };

/**
 * Dashboard campaign discovery (§ Creator Portal premium rebuild,
 * reference-image quality pass). Two pieces sharing one job: surface
 * "what's the best opportunity right now" without leaving the home
 * screen, matching how the car-rental reference fronts its "top pick"
 * before the full browsable list.
 *
 * The featured pick is real ranking, not editorial choice: soonest
 * real deadline first (genuinely time-sensitive beats everything),
 * falling back to the highest commission when no campaign has one.
 * Both surfaces link straight to that campaign's own detail route
 * (§ campaign attachments) rather than the plain list.
 */
function pickFeatured(campaigns: CampaignEntry[]): CampaignEntry | null {
  if (campaigns.length === 0) return null;
  const withDeadline = campaigns
    .map((c) => ({ c, daysLeft: daysUntilDeadline(c.data.deadline) }))
    .filter((x): x is { c: CampaignEntry; daysLeft: number } => x.daysLeft !== null)
    .sort((a, b) => a.daysLeft - b.daysLeft);
  if (withDeadline.length > 0) return withDeadline[0].c;
  return [...campaigns].sort(
    (a, b) => b.data.commissionRateKes - a.data.commissionRateKes,
  )[0];
}

export function FeaturedCampaignBanner({ campaigns }: { campaigns: CampaignEntry[] }) {
  const featured = pickFeatured(campaigns);
  if (!featured) return null;

  const { data } = featured;
  const daysLeft = daysUntilDeadline(data.deadline);
  const isClosingSoon = daysLeft !== null && daysLeft <= CLOSING_SOON_WINDOW_DAYS;
  const hasPhoto = Boolean(data.assetsUrl) && !isVideoAsset(data.assetsUrl ?? '');

  return (
    <Link
      href={`/creator/campaigns/${featured.id}`}
      className="focus-visible:ring-primary focus-visible:ring-offset-background group relative block overflow-hidden rounded-2xl focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
    >
      <div className="from-foreground via-foreground/90 relative aspect-[16/9] w-full bg-gradient-to-br to-[#4a2e12] sm:aspect-[21/9]">
        {hasPhoto ? (
          <Image
            src={data.assetsUrl as string}
            alt=""
            fill
            sizes="(min-width: 768px) 50vw, 100vw"
            className="object-cover opacity-70 transition-opacity duration-200 group-hover:opacity-60"
          />
        ) : null}
        <div className="from-foreground/95 absolute inset-0 bg-gradient-to-t via-transparent to-transparent" />

        <div className="absolute inset-0 flex flex-col justify-end gap-2 p-5 md:p-7">
          <p className="text-caption font-bold tracking-[0.2em] text-white/70 uppercase">
            {isClosingSoon ? urgencyLabel(daysLeft as number) : 'Featured campaign'}
          </p>
          <h3 className="text-card-title max-w-md font-semibold text-white">
            {data.title}
          </h3>
          <div className="mt-2 flex items-center gap-3">
            <span className="bg-primary text-primary-foreground inline-flex items-center rounded-full px-3 py-1.5 text-sm font-semibold">
              {formatKes(data.commissionRateKes)} commission
            </span>
            <span className="inline-flex items-center gap-1 text-sm font-semibold text-white">
              View campaign
              <ArrowRight className="size-4" aria-hidden="true" />
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}

export function CampaignCarousel({ campaigns }: { campaigns: CampaignEntry[] }) {
  if (campaigns.length === 0) return null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-card-title text-foreground font-semibold">
          Active campaigns
        </h2>
        <Link
          href="/creator/campaigns"
          className="text-primary focus-visible:ring-primary focus-visible:ring-offset-background inline-flex items-center gap-1 rounded-md text-sm font-medium hover:underline focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
        >
          See all
          <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      </div>

      {/* Horizontal scroll-snap, not a wrapping grid: this is a
          discovery preview, not the full browsable list — the full
          Campaigns page already owns that job. */}
      <ul className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0">
        {campaigns.slice(0, 6).map(({ id, data }) => {
          const isVideo = data.assetsUrl ? isVideoAsset(data.assetsUrl) : false;
          const daysLeft = daysUntilDeadline(data.deadline);
          const isClosingSoon = daysLeft !== null && daysLeft <= CLOSING_SOON_WINDOW_DAYS;
          return (
            <li key={id} className="w-[72vw] shrink-0 snap-start sm:w-64">
              <Link
                href={`/creator/campaigns/${id}`}
                className="border-border bg-surface focus-visible:ring-primary focus-visible:ring-offset-background block h-full overflow-hidden rounded-lg border focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
              >
                <div className="bg-muted-foreground/10 relative aspect-[4/3] w-full">
                  {data.assetsUrl && !isVideo ? (
                    <Image
                      src={data.assetsUrl}
                      alt=""
                      fill
                      sizes="(min-width: 640px) 256px, 72vw"
                      className="object-cover"
                    />
                  ) : (
                    <div className="text-muted-foreground flex h-full w-full items-center justify-center">
                      <Megaphone className="size-6" aria-hidden="true" />
                    </div>
                  )}
                  <span className="bg-primary text-primary-foreground absolute top-2 left-2 rounded-full px-2.5 py-1 text-xs font-semibold shadow-sm">
                    {formatKes(data.commissionRateKes)}
                  </span>
                  {isClosingSoon ? (
                    <span className="bg-warning text-warning-foreground absolute top-2 right-2 rounded-full px-2.5 py-1 text-xs font-semibold shadow-sm">
                      {urgencyLabel(daysLeft as number)}
                    </span>
                  ) : null}
                </div>
                <p className="text-foreground truncate p-3 text-sm font-medium">
                  {data.title}
                </p>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
