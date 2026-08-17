import { ArrowRight } from 'lucide-react';
import type { Package } from '@/types';
import { formatKes } from '@/lib/orders/format';
import { CREATOR_PACKAGE_DISCOUNT_KES } from '@/lib/creators/creatorCheckoutDiscount';
import { BuyNowButton } from '@/components/marketing/BuyNowButton';
import { PortalCard } from './PortalCard';
import { PortalSection } from './PortalSection';

type PackageEntry = { id: string; data: Package };

const JOURNEY = ['Buy', 'Create', 'Post', 'Grow', 'Monetize'];

/**
 * Replaces the dashboard's old `FeaturedCampaignBanner` slot (§
 * Creator-Only Offers) — a creator's first login used to lead with
 * whatever campaign happened to be active; this leads with something
 * true every time they log in: because they're a Snack Quest creator,
 * they get pricing regular customers don't. `CampaignCarousel` still
 * renders right below this, unchanged — only the single featured
 * banner was swapped out, not campaign discovery itself.
 *
 * Both `rescueOffer` and `packages` are real `Package` documents the
 * page already fetches (`productService.getRescueOffer`,
 * `packageRepository.listActive`) — no invented product, no hardcoded
 * price. The KES 500 creator price shown here is exactly what
 * `POST /api/checkout/web` charges: both derive
 * `CREATOR_PACKAGE_DISCOUNT_KES` from the same constant, and the
 * actual discount is verified server-side from this same creator's
 * session cookie at checkout, not from anything this page tells the
 * client.
 *
 * The rescue offer never gets the extra KES 500 off — it's already a
 * one-time discounted price, the same rule the checkout backend
 * enforces (`ConversationService`'s `isRescueOffer` check), so this
 * component doesn't apply or display a further discount on it either.
 *
 * Deliberately not "sale" / "discount sale" / "limited-time
 * promotion" / "featured campaign" anywhere in the copy — a creator
 * benefit, not a clearance rack. No earnings promise either: the copy
 * says what the box is *for* (making content), never what it *pays*.
 */
export function CreatorOffers({
  rescueOffer,
  packages,
}: {
  rescueOffer: PackageEntry | null;
  packages: PackageEntry[];
}) {
  if (!rescueOffer && packages.length === 0) return null;

  return (
    <PortalSection id="creator-offers" title="Creator-only offers">
      <div className="flex flex-col gap-4">
        <p className="text-muted-foreground -mt-2 text-sm">
          Because you&apos;re a Snack Quest creator, you get pricing regular customers don&apos;t.
        </p>

        {rescueOffer ? (
          <PortalCard
            raised
            className="border-primary/30 from-primary/10 via-surface to-secondary/10 relative overflow-hidden bg-gradient-to-br"
          >
            <p className="text-caption text-primary font-bold tracking-wide uppercase">
              Creator starter box
            </p>
            <p className="font-display text-foreground mt-2 text-3xl leading-[1.1] font-normal uppercase md:text-4xl">
              {formatKes(rescueOffer.data.priceKes)}
            </p>
            <p className="text-foreground/70 mt-2 max-w-sm text-sm">
              Your next content could be inside this box.
            </p>
            {rescueOffer.data.description ? (
              <p className="text-foreground/70 mt-2 max-w-sm text-sm">{rescueOffer.data.description}</p>
            ) : null}
            {rescueOffer.data.snackCountLabel ? (
              <p className="text-foreground mt-1 max-w-sm text-sm font-semibold">
                {rescueOffer.data.snackCountLabel}
              </p>
            ) : null}

            <div className="text-foreground/60 mt-4 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs font-semibold tracking-wide uppercase">
              {JOURNEY.map((step, index) => (
                <span key={step} className="flex items-center gap-1.5">
                  {step}
                  {index < JOURNEY.length - 1 ? (
                    <ArrowRight className="size-3" aria-hidden="true" />
                  ) : null}
                </span>
              ))}
            </div>

            <BuyNowButton packageId={rescueOffer.id} className="mt-5 w-full sm:w-auto">
              Get my creator box — {formatKes(rescueOffer.data.priceKes)}
            </BuyNowButton>
          </PortalCard>
        ) : null}

        {packages.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-3">
            {packages.map(({ id, data }) => {
              const creatorPriceKes = Math.max(data.priceKes - CREATOR_PACKAGE_DISCOUNT_KES, 0);
              return (
                <PortalCard key={id} className="flex flex-col gap-2">
                  <p className="text-foreground font-semibold">{data.name}</p>
                  {data.description ? (
                    <p className="text-muted-foreground text-sm">{data.description}</p>
                  ) : null}
                  {data.snackCountLabel ? (
                    <p className="text-foreground text-sm font-medium">{data.snackCountLabel}</p>
                  ) : null}
                  <div className="flex items-baseline gap-2">
                    <span className="text-muted-foreground text-sm line-through">
                      {formatKes(data.priceKes)}
                    </span>
                    <span className="text-foreground text-lg font-semibold">
                      {formatKes(creatorPriceKes)}
                    </span>
                  </div>
                  <p className="text-caption text-primary font-bold tracking-wide uppercase">
                    Creator price
                  </p>
                  <BuyNowButton packageId={id} size="sm" className="mt-2">
                    Get this box
                  </BuyNowButton>
                </PortalCard>
              );
            })}
          </div>
        ) : null}
      </div>
    </PortalSection>
  );
}
