import Link from 'next/link';
import { Boxes, Check } from 'lucide-react';
import { WhatsAppOrderButton } from '@/components/marketing/WhatsAppOrderButton';
import { Badge } from '@/components/ui/badge';
import { formatKes } from '@/lib/orders/format';
import { Reveal } from '../design/Reveal';
import { PRIMARY_CTA_CLASS } from '../design/ctaStyles';
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
  'M-Pesa secure checkout on WhatsApp',
];

/**
 * Real, live package data — never hardcoded tier names/prices (§
 * jungle-adventure landing page rebuild). Whatever this business
 * actually sells is what shows here, styled with the spec's premium
 * card treatment; the middle box (of up to 3) gets the emphasis
 * treatment as the visual "most popular" position.
 */
export function PickYourBox({
  packages,
}: {
  packages: Array<{ id: string; data: Package }>;
}) {
  if (packages.length === 0) {
    return null;
  }

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
          <p className="text-foreground/70 mx-auto mt-5 max-w-[576px] text-base md:text-lg">
            We hand-pack a limited number of boxes each week. When this
            week&apos;s batch is gone, it&apos;s gone.
          </p>
        </div>
      </Reveal>

      <div className="mx-auto mt-14 grid max-w-6xl gap-6 md:mt-20 md:grid-cols-3">
        {packages.map((pkg, index) => {
          const accent = ACCENTS[index % ACCENTS.length];
          const isEmphasized = packages.length === 3 && index === 1;
          return (
            <Reveal key={pkg.id} delayMs={index * 120}>
              <div
                className={`relative flex h-full flex-col overflow-hidden rounded-[28px] border bg-gradient-to-br p-6 transition-all duration-400 ease-[cubic-bezier(0.2,0.8,0.2,1)] hover:-translate-y-2 hover:shadow-[0_30px_80px_-30px_rgb(31_31_31/0.3)] md:p-9 ${accent.wash} ${accent.border} ${
                  isEmphasized
                    ? 'md:scale-[1.02] md:shadow-[0_30px_80px_-30px_rgb(31_31_31/0.3)]'
                    : ''
                }`}
              >
                <div
                  aria-hidden="true"
                  className={`absolute -top-16 -right-16 size-56 rounded-full blur-3xl ${accent.dot}`}
                />

                {isEmphasized ? (
                  <Badge className="bg-home-lime text-foreground absolute top-4 right-4 rotate-3 shadow-sm md:top-5 md:right-5">
                    ★ Best Seller
                  </Badge>
                ) : null}

                <div className="relative flex items-center gap-2">
                  <Boxes
                    className={`size-5 ${accent.icon}`}
                    strokeWidth={2.2}
                    aria-hidden="true"
                  />
                  <span className="text-caption text-foreground/60 font-bold tracking-wide uppercase">
                    {index === 0
                      ? 'Start your quest'
                      : isEmphasized
                        ? 'Most explorers pick this'
                        : 'For serious explorers'}
                  </span>
                </div>

                <h3 className="font-display relative mt-4 text-2xl leading-[1.1] font-normal uppercase md:mt-6 md:text-4xl">
                  {pkg.data.name}
                </h3>
                <p className="text-foreground relative mt-3 text-2xl font-bold md:mt-4 md:text-4xl">
                  {formatKes(pkg.data.priceKes)}
                </p>
                {pkg.data.description ? (
                  <p className="text-small text-foreground/70 relative mt-1">
                    {pkg.data.description}
                  </p>
                ) : null}

                <ul className="relative mt-4 flex flex-1 flex-col gap-2 md:mt-7 md:gap-3">
                  {TRUST_LINES.map((line) => (
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

                <div className="relative mt-6 md:mt-9">
                  <WhatsAppOrderButton
                    message={`Hi! I'd like to order the ${pkg.data.name}.`}
                    size="lg"
                    className={`w-full justify-center md:w-auto ${PRIMARY_CTA_CLASS}`}
                  >
                    Order the {pkg.data.name}
                  </WhatsAppOrderButton>
                </div>
              </div>
            </Reveal>
          );
        })}
      </div>

      <Reveal delayMs={200}>
        <p className="text-small text-foreground/60 mx-auto mt-10 max-w-xl text-center">
          M-Pesa accepted · Jumia pickup countrywide · Bolt Package home
          delivery in Nairobi.
        </p>
      </Reveal>

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
