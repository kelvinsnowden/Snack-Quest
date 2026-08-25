import Image from 'next/image';
import Link from 'next/link';
import { Boxes, Check, Star } from 'lucide-react';
import { BuyNowButton } from '@/components/marketing/BuyNowButton';
import { WhatsAppCheckoutButton } from '@/components/marketing/WhatsAppCheckoutButton';
import { buildBoxOrderMessage } from '@/lib/whatsapp/orderLink';
import { formatKes } from '@/lib/orders/format';
import { Reveal } from '../design/Reveal';
import { PRIMARY_CTA_CLASS } from '../design/ctaStyles';
import { OfferCountdown } from './OfferCountdown';
import type { Package } from '@/types';

const ACCENTS = [
  {
    wash: 'from-background to-primary/10',
    border: 'border-foreground/5',
    icon: 'text-primary',
    dot: 'bg-primary/40',
    checkBg: 'bg-primary',
    checkFg: 'text-white',
  },
  {
    wash: 'from-background to-secondary/15',
    border: 'border-secondary/40',
    icon: 'text-secondary',
    dot: 'bg-secondary/40',
    checkBg: 'bg-secondary',
    checkFg: 'text-white',
  },
  {
    wash: 'from-background to-home-lime/20',
    border: 'border-foreground/5',
    icon: 'text-foreground',
    dot: 'bg-home-lime/40',
    checkBg: 'bg-home-lime',
    checkFg: 'text-foreground',
  },
] as const;

/** True for any box, regardless of tier — never a fabricated per-tier claim about contents this platform doesn't actually track. */
const TRUST_LINES = [
  'Hand-picked and quality-checked before it ships',
  'Packed and dispatched within 24 hours',
  'Pay with M-Pesa at checkout',
];

/**
 * Real, live package data — never hardcoded tier names/prices (§
 * jungle-adventure landing page rebuild). Whatever this business
 * actually sells is what shows here, styled with the spec's premium
 * card treatment.
 *
 * The middle box (of three) is raised slightly. That is visual
 * hierarchy so three equal-weight cards don't read as an undifferentiated
 * wall — it deliberately carries no label, because this platform has no
 * verified per-box sales figure to back a "best seller"/"most popular"
 * claim, and `public/llms.txt` states plainly that the site publishes
 * none. It used to carry both (§ Mission 2 — social-proof integrity);
 * they were removed rather than reworded, since every softer synonym
 * ("customer favourite", "top pick") asserts the same unverified
 * statistic. Revisit only with a real order-count query behind a
 * minimum-volume floor.
 */
export function PickYourBox({
  packages,
}: {
  packages: Array<{ id: string; data: Package }>;
}) {
  if (packages.length === 0) {
    return null;
  }

  const anyHighlighted = packages.some((pkg) => Boolean(pkg.data.highlightLabel));

  return (
    <section
      id="boxes"
      className="scroll-mt-20 bg-white px-5 py-16 md:px-10 md:py-32"
    >
      <Reveal>
        <div className="mx-auto max-w-xl text-center">
          <p className="text-caption text-primary font-bold tracking-[0.3em] uppercase">
            Pick your box
          </p>
          <h2 className="font-display mt-4 text-4xl leading-[1.05] font-normal text-balance uppercase md:text-6xl">
            Choose your <span className="text-primary">mystery.</span>
          </h2>
          {/*
            Was a weekly-batch scarcity line ("when this week's batch is
            gone, it's gone") — a deadline nothing in the product
            actually enforces, so it was doing the same job as the
            removed Best Seller badge (§ Mission 2 — social-proof
            integrity). Replaced with what is verifiably true and does
            more useful work anyway: it answers "is the cheaper box the
            lesser box?" before the customer has to ask.
          */}
          <p className="text-foreground/70 mx-auto mt-5 max-w-[576px] text-base md:text-lg">
            Every box is hand-packed and personally tasted before it ships.
            Same care whichever size you pick — the difference is how much
            of the adventure you get.
          </p>
        </div>
      </Reveal>

      <div className="mx-auto mt-10 grid max-w-6xl gap-6 md:mt-20 md:grid-cols-3">
        {/*
          Emphasis follows the data once any box carries a badge. It
          used to be positional — the middle of three — which quietly
          decided merchandising by array order, so the box an admin
          actually marked BEST VALUE could end up the plain one beside
          two louder neighbours.
        */}
        {packages.map((pkg, index) => {
          const accent = ACCENTS[index % ACCENTS.length];
          const isEmphasized = anyHighlighted
            ? Boolean(pkg.data.highlightLabel)
            : packages.length === 3 && index === 1;
          const pickCount = pkg.data.guaranteedPickCount ?? 0;
          // Only the exit-intent rescue offer carries a real
          // expiration — never a fabricated deadline on an ordinary
          // box (§ exit-intent rescue offer).
          const expiresAtMs =
            pkg.data.isRescueOffer && pkg.data.offerExpiresAt ? pkg.data.offerExpiresAt.toMillis() : null;
          return (
            <Reveal key={pkg.id} delayMs={index * 120}>
              <div
                className={`relative flex h-full flex-col overflow-hidden rounded-[28px] border bg-gradient-to-br transition-all duration-400 ease-[cubic-bezier(0.2,0.8,0.2,1)] hover:-translate-y-2 hover:shadow-[0_30px_80px_-30px_rgb(31_31_31/0.3)] ${accent.wash} ${accent.border} ${
                  isEmphasized
                    ? 'md:scale-[1.02] md:shadow-[0_30px_80px_-30px_rgb(31_31_31/0.3)]'
                    : ''
                }`}
              >
                <div
                  aria-hidden="true"
                  className={`absolute -top-16 -right-16 size-56 rounded-full blur-3xl ${accent.dot}`}
                />

                {/*
                  Sits on the image rather than in the text column: it
                  is the first thing that should register, and in the
                  text it would queue up behind the eyebrow, the name
                  and the price.
                */}
                {pkg.data.highlightLabel ? (
                  <p className="bg-secondary text-caption absolute top-4 left-4 z-20 inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 font-bold tracking-wide text-white uppercase shadow-md">
                    <Star className="size-3.5 fill-current" aria-hidden="true" />
                    {pkg.data.highlightLabel}
                  </p>
                ) : null}

                <div className="relative aspect-[16/10] w-full overflow-hidden bg-border/40">
                  {pkg.data.imageUrl ? (
                    <Image
                      src={pkg.data.imageUrl}
                      alt={pkg.data.name}
                      fill
                      sizes="(min-width: 768px) 33vw, 100vw"
                      className="object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-5xl">
                      🍿
                    </div>
                  )}
                </div>

                <div className="relative flex flex-1 flex-col p-6 md:p-9">
                  <div className="flex items-center gap-2">
                    <Boxes
                      className={`size-5 ${accent.icon}`}
                      strokeWidth={2.2}
                      aria-hidden="true"
                    />
                    {/*
                      Describes the tier itself, never how many people
                      bought it — "Most explorers pick this" was an
                      unverified statistic (§ Mission 2 — social-proof
                      integrity). These three read as what they are:
                      how far into the adventure each box takes you.
                    */}
                    <span className="text-caption text-foreground/60 font-bold tracking-wide uppercase">
                      {index === 0
                        ? 'Start your quest'
                        : isEmphasized
                          ? 'Go deeper'
                          : 'For serious explorers'}
                    </span>
                  </div>

                  <h3 className="font-display mt-4 text-2xl leading-[1.1] font-normal uppercase md:mt-6 md:text-4xl">
                    {pkg.data.name}
                  </h3>
                  <p className="text-foreground mt-3 text-2xl font-bold md:mt-4 md:text-4xl">
                    {formatKes(pkg.data.priceKes)}
                  </p>
                  {expiresAtMs !== null ? (
                    <div className="mt-1.5">
                      <OfferCountdown expiresAtMs={expiresAtMs} />
                    </div>
                  ) : null}
                  {/*
                    The one line that makes this box a different
                    product rather than a bigger one, so it sits above
                    the description instead of becoming the last of
                    several identical trust bullets.
                  */}
                  {pickCount > 0 ? (
                    <p className="text-secondary mt-2 text-base font-bold">
                      Pick {pickCount}. We&apos;ll surprise you with the rest.
                    </p>
                  ) : null}
                  {pkg.data.description ? (
                    <p className="text-small text-foreground/70 mt-1">
                      {pkg.data.description}
                    </p>
                  ) : null}
                  <p className="text-small text-foreground/60 mt-1">
                    All snacks have passed the taste test. I have tasted each of them.
                  </p>

                  <ul className="mt-4 flex flex-1 flex-col gap-2 md:mt-7 md:gap-3">
                    {[
                      ...(pickCount > 0
                        ? [`Choose ${pickCount} snacks you know you'll love — we curate the rest`]
                        : []),
                      ...(pkg.data.snackCountLabel ? [pkg.data.snackCountLabel] : []),
                      ...TRUST_LINES,
                    ].map((line) => (
                      <li
                        key={line}
                        className="text-small text-foreground/80 flex items-start gap-2.5"
                      >
                        <span
                          className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full ${accent.checkBg}`}
                        >
                          <Check
                            className={`size-2.5 ${accent.checkFg}`}
                            strokeWidth={3}
                            aria-hidden="true"
                          />
                        </span>
                        {line}
                      </li>
                    ))}
                  </ul>

                  <div className="mt-6 flex flex-col gap-2.5 md:mt-9">
                    <BuyNowButton
                      packageId={pkg.id}
                      size="lg"
                      className={`w-full justify-center md:w-auto ${PRIMARY_CTA_CLASS}`}
                      analyticsSource="home_pick_your_box"
                      analyticsPriceKes={pkg.data.priceKes}
                    >
                      Buy the {pkg.data.name}
                    </BuyNowButton>
                    {/*
                      Per box, so the message names the one the
                      customer was actually looking at (§ order on
                      WhatsApp). A generic "I want a box" costs a round
                      trip establishing something they had already
                      decided before they tapped.
                    */}
                    <WhatsAppCheckoutButton
                      source="home_pick_your_box"
                      packageId={pkg.id}
                      message={buildBoxOrderMessage({ name: pkg.data.name, priceKes: pkg.data.priceKes })}
                      className="text-small w-full py-2.5 md:w-auto"
                    >
                      Or order on WhatsApp
                    </WhatsAppCheckoutButton>
                  </div>
                </div>
              </div>
            </Reveal>
          );
        })}
      </div>

      <div className="mt-6 text-center">
        <Link
          href="/boxes"
          className="text-small text-secondary font-medium hover:underline"
        >
          See every box &amp; full details →
        </Link>
      </div>
    </section>
  );
}
