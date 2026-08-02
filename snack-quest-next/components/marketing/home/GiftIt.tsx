import { ShieldCheck } from 'lucide-react';
import { WhatsAppOrderButton } from '@/components/marketing/WhatsAppOrderButton';
import { Reveal } from '../design/Reveal';
import { PRIMARY_CTA_CLASS } from '../design/ctaStyles';

/**
 * Gifting section, rebuilt (§ home page gifting redesign).
 *
 * The previous version stacked eight competing blocks into one
 * section: seven occasion tiles that each carried BOTH an emoji and a
 * Lucide icon for the same meaning, three accent colours rotating with
 * no semantic reason, hover rotate+scale+lift, a five-item lime
 * checklist, and a promise panel nested two surfaces deep inside a
 * gradient card. Every one of those is on the Design Bible's
 * anti-pattern list — icon overload, decorative motion, oversized
 * radii, competing CTAs, visual clutter — and together they read as
 * generated rather than designed.
 *
 * Rebuilt on the Bible's own review questions: can hierarchy replace
 * decoration, can typography replace another icon, can spacing replace
 * borders, can fewer colours say more. Occasions are now an editorial
 * typographic index rather than tiles. The five checklist bullets
 * collapse to the three claims that actually differentiate the
 * product, set as a definition list so the claim leads and the proof
 * follows. One icon survives in the whole section — on the guarantee,
 * where it carries real meaning — and one accent colour.
 */

const OCCASIONS = [
  'Birthdays',
  'Anniversaries',
  'Graduations',
  'Christmas',
  'Congratulations',
  'Corporate gifting',
  'Just because',
];

const REASONS = [
  {
    claim: 'It is never another mug',
    proof:
      'A sealed box of imported snacks they cannot buy locally — opened, not unwrapped.',
  },
  {
    claim: 'It arrives gift-ready',
    proof:
      'Packed to be handed over as it is. Anywhere in Kenya, in 24–48 hours.',
  },
  {
    claim: 'It gets talked about',
    proof:
      'Filmed, shared, and remembered long after a hamper would have been forgotten.',
  },
];

export function GiftIt({
  whatsappCustomerNumber,
}: {
  whatsappCustomerNumber: string | null;
}) {
  return (
    <section
      className="bg-white px-5 py-24 md:px-10 md:py-36"
      aria-labelledby="gift-it"
    >
      <div className="mx-auto grid max-w-5xl gap-16 md:grid-cols-[1.1fr_1fr] md:gap-20">
        <div>
          <Reveal>
            <p className="text-caption text-primary font-bold tracking-[0.3em] uppercase">
              Gift it
            </p>
            <h2
              id="gift-it"
              className="font-display mt-5 text-[clamp(2.5rem,7vw,4rem)] leading-[0.95] font-normal tracking-tight text-balance uppercase"
            >
              Give the gift of <span className="text-secondary">surprise.</span>
            </h2>
            <p className="text-subtitle text-foreground/70 mt-6 max-w-md">
              For anyone tired of gifting the same predictable mug or generic
              hamper.
            </p>
          </Reveal>

          <Reveal delayMs={160}>
            <div className="mt-10">
              <WhatsAppOrderButton
                whatsappCustomerNumber={whatsappCustomerNumber}
                message="Hi! I'd like to send a Snack Quest box as a gift."
                size="lg"
                className={PRIMARY_CTA_CLASS}
              />
            </div>
          </Reveal>

          <Reveal delayMs={220}>
            <p className="text-small text-foreground/60 mt-8 flex max-w-md items-start gap-2.5">
              <ShieldCheck
                className="text-primary mt-0.5 size-4 shrink-0"
                strokeWidth={2.5}
                aria-hidden="true"
              />
              <span>
                Every snack is tasted and approved by our team before it earns a
                place in a box. Arrives damaged or incomplete, we make it right.
              </span>
            </p>
          </Reveal>
        </div>

        <div className="md:pt-4">
          <Reveal delayMs={80}>
            <dl className="flex flex-col">
              {REASONS.map((reason) => (
                <div
                  key={reason.claim}
                  className="border-foreground/10 border-t py-6 first:border-t-0 first:pt-0"
                >
                  <dt className="text-card-title text-foreground font-semibold">
                    {reason.claim}
                  </dt>
                  <dd className="text-body text-foreground/65 mt-2">
                    {reason.proof}
                  </dd>
                </div>
              ))}
            </dl>
          </Reveal>

          <Reveal delayMs={200}>
            <div className="border-foreground/10 mt-10 border-t pt-6">
              <h3 className="text-caption text-foreground/50 font-bold tracking-[0.25em] uppercase">
                Sent most for
              </h3>
              <ul className="text-body text-foreground/70 mt-4 flex flex-wrap gap-x-3 gap-y-2">
                {OCCASIONS.map((occasion, index) => (
                  <li key={occasion} className="flex items-center gap-3">
                    {index > 0 ? (
                      <span
                        aria-hidden="true"
                        className="bg-foreground/25 size-1 rounded-full"
                      />
                    ) : null}
                    {occasion}
                  </li>
                ))}
              </ul>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
