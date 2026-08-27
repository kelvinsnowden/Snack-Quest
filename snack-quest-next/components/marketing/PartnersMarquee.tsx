import { FargoIcon } from '@/components/icons/FargoIcon';
import { TushopIcon } from '@/components/icons/TushopIcon';
import { MpesaLogo } from '@/components/icons/MpesaLogo';

/**
 * "Is this legitimate?" answered visually rather than in a sentence —
 * the real operational partners behind every order: Tushop for door
 * delivery in Nairobi, Fargo Courier for pickup points everywhere
 * else, M-Pesa for payment. All
 * are already real integrations elsewhere in this codebase
 * (`MPESA_RECIPIENT_NAME`, the delivery copy on
 * `/how-it-works`) — nothing invented for this strip. Shared between
 * the home page (replacing `PickYourBox`'s old plain-text "M-Pesa
 * accepted · Door delivery in Nairobi · Fargo pickup countrywide"
 * line — the same three names, just illegible as a sentence next to
 * an actual marquee of them) and the Creator Program page (§ Creator
 * Program CRO pass).
 *
 * WhatsApp deliberately isn't in this set: it's a support channel, not
 * a fulfillment/payment partner, and mixing it in diluted the "how an
 * order actually happens" story this strip tells.
 *
 * Real brand colours throughout, deliberately not recoloured to
 * Snack Quest's own palette: the entire point of a partner marquee is
 * that a visitor recognises M-Pesa-green as belonging to M-Pesa,
 * not to this site.
 *
 * The track renders the logo list twice and scrolls exactly `-50%` —
 * see `animate-marquee`'s doc comment in `globals.css` for why that
 * makes the loop seamless.
 *
 * Each copy repeats the set `SETS_PER_COPY` times, and that is what
 * makes the strip reach both edges. Three logos come to roughly 600px,
 * so two copies of a single set filled about 1200px and simply
 * stopped — on a desktop screen the logos bunched against the left and
 * the right half of the strip sat empty.
 *
 * Repeating rather than spreading three logos thin across the whole
 * width, because a marquee reads as a moving ribbon: evenly spacing
 * three items over 1920px removes the gap at the end but leaves long
 * empty stretches drifting past instead.
 *
 * `min-w-screen` is the backstop for a display wider than the repeats
 * cover, and `justify-around` is what it spreads them with — on any
 * ordinary screen the content is wider than the viewport and neither
 * does anything.
 *
 * Both copies are built by the same rule, so they stay identical and
 * `-50%` still lands exactly one copy along, which is the whole
 * requirement for the loop to be seamless. `marquee-pause-on-hover` stops the scroll
 * so a visitor who stops to look at a logo isn't fighting it to read.
 * The whole strip is `aria-hidden`, with one static, unduplicated list
 * for screen readers — a scrolling, doubled DOM list has nothing
 * useful to announce twice.
 *
 * `compact` drops the caption, the white background, and most of the
 * vertical padding — for `HomeHero`, which wanted the marquee inside
 * its own existing top padding rather than as another full section
 * stacked on top of it. No new vertical space, just that space filled
 * with something instead of being empty.
 */
const PARTNERS = [
  // Sized against optical area, not height. M-Pesa is a wide wordmark —
  // about 200px across at 28px tall — so it covers roughly four times
  // the area of a square badge of the same height. Matching heights, or
  // even nudging them up a step, still leaves the badges reading as the
  // small ones in the row. These are set to balance the mass instead.
  { Icon: FargoIcon, name: 'Fargo Courier', className: 'h-12 sm:h-14' },
  { Icon: TushopIcon, name: 'Tushop', className: 'h-12 sm:h-14' },
  { Icon: MpesaLogo, name: 'M-Pesa', className: 'h-7 sm:h-8' },
] as const;

/**
 * Enough repeats of the three logos to cover a wide desktop at their
 * natural spacing — one set is roughly 600px, so four clears 1920 with
 * room to spare. Higher costs nothing but a few more inline SVGs.
 */
const SETS_PER_COPY = 4;

function LogoTrack() {
  return (
    <div className="flex min-w-screen shrink-0 items-center justify-around gap-12 pr-12 sm:gap-16 sm:pr-16">
      {Array.from({ length: SETS_PER_COPY }).flatMap((_, set) =>
        PARTNERS.map(({ Icon, name, className }) => (
          <Icon key={`${set}-${name}`} className={className} />
        )),
      )}
    </div>
  );
}

export function PartnersMarquee({
  label = 'Real partners behind every order',
  compact = false,
}: {
  label?: string;
  compact?: boolean;
}) {
  return (
    <section className={compact ? undefined : 'bg-white py-10 md:py-14'}>
      {compact ? null : (
        <p className="text-caption text-foreground/50 mx-auto max-w-2xl text-center font-bold tracking-[0.3em] uppercase">
          {label}
        </p>
      )}

      <div
        className={`marquee-pause-on-hover relative overflow-hidden ${compact ? '' : 'mt-7 md:mt-9'}`}
        style={{
          maskImage:
            'linear-gradient(to right, transparent, black 10%, black 90%, transparent)',
          WebkitMaskImage:
            'linear-gradient(to right, transparent, black 10%, black 90%, transparent)',
        }}
      >
        <div aria-hidden="true" className="animate-marquee flex w-max">
          <LogoTrack />
          <LogoTrack />
        </div>
        <ul className="sr-only">
          {PARTNERS.map(({ name }) => (
            <li key={name}>{name}</li>
          ))}
        </ul>
      </div>
    </section>
  );
}
