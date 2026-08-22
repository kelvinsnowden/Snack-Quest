import { FargoIcon } from '@/components/icons/FargoIcon';
import { TushopIcon } from '@/components/icons/TushopIcon';
import { MpesaLogo } from '@/components/icons/MpesaLogo';

/**
 * "Is this legitimate?" answered visually rather than in a sentence —
 * the real operational partners behind every order: Fargo Courier for
 * delivery and collection, Tushop, and M-Pesa for payment. All
 * are already real integrations elsewhere in this codebase
 * (`MPESA_RECIPIENT_NAME`, the Fargo delivery copy on
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
 * makes the loop seamless. `marquee-pause-on-hover` stops the scroll
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
  // Taller than its neighbour on purpose: M-Pesa is a wide
  // wordmark, Fargo's asset is a square badge, and matching its
  // height would leave it reading as much smaller.
  { Icon: FargoIcon, name: 'Fargo Courier', className: 'h-9 sm:h-10' },
  // Square badge like Fargo's, so it takes the same taller sizing —
  // matching the M-Pesa wordmark's height would leave it reading small.
  { Icon: TushopIcon, name: 'Tushop', className: 'h-9 sm:h-10' },
  { Icon: MpesaLogo, name: 'M-Pesa', className: 'h-7 sm:h-8' },
] as const;

function LogoTrack() {
  return (
    <div className="flex shrink-0 items-center gap-12 pr-12 sm:gap-16 sm:pr-16">
      {PARTNERS.map(({ Icon, name, className }) => (
        <Icon key={name} className={className} />
      ))}
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
