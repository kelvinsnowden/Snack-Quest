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
 * reference-image quality pass) — a horizontal preview of active
 * campaigns, linking to the full browsable list on `/creator/campaigns`.
 *
 * Used to sit below a `FeaturedCampaignBanner` picking one campaign to
 * lead with; that banner was replaced by `CreatorOffers` (§
 * Creator-Only Offers) and removed here as dead code, along with the
 * `pickFeatured` ranking helper only it used. This carousel and every
 * other campaign surface (`/creator/campaigns`, campaign detail pages)
 * are unchanged.
 */
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
