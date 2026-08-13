import { BoltIcon } from '@/components/icons/BoltIcon';
import { JumiaIcon } from '@/components/icons/JumiaIcon';
import { MpesaLogo } from '@/components/icons/MpesaLogo';

/**
 * "Is this legitimate?" answered visually rather than in a sentence —
 * the real operational partners behind every order: Bolt for door
 * delivery, Jumia for pickup stations, M-Pesa for payment. All three
 * are already real integrations elsewhere in this codebase
 * (`MPESA_RECIPIENT_NAME`, the Bolt/Jumia delivery copy on
 * `/how-it-works`) — nothing invented for this strip. Shared between
 * the home page (replacing `PickYourBox`'s old plain-text "M-Pesa
 * accepted · Jumia pickup countrywide · Bolt Package home delivery"
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
 * that a visitor recognises Bolt-green and M-Pesa-green as belonging
 * to Bolt and M-Pesa, not to this site.
 *
 * The track renders the logo list twice and scrolls exactly `-50%` —
 * see `animate-marquee`'s doc comment in `globals.css` for why that
 * makes the loop seamless. `marquee-pause-on-hover` stops the scroll
 * so a visitor who stops to look at a logo isn't fighting it to read.
 * The whole strip is `aria-hidden`, with one static, unduplicated list
 * for screen readers — a scrolling, doubled DOM list has nothing
 * useful to announce twice.
 */
const PARTNERS = [
  { Icon: BoltIcon, name: 'Bolt', className: 'h-6 sm:h-7' },
  { Icon: JumiaIcon, name: 'Jumia', className: 'h-7 sm:h-8' },
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

export function PartnersMarquee({ label = 'Real partners behind every order' }: { label?: string }) {
  return (
    <section className="bg-white py-10 md:py-14">
      <p className="text-caption text-foreground/50 mx-auto max-w-2xl text-center font-bold tracking-[0.3em] uppercase">
        {label}
      </p>

      <div
        className="marquee-pause-on-hover relative mt-7 overflow-hidden md:mt-9"
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
