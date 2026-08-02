import Link from 'next/link';
import { ArrowRight, Clock, MapPin, Truck } from 'lucide-react';
import { WhatsAppOrderButton } from '@/components/marketing/WhatsAppOrderButton';
import { Button } from '@/components/ui/button';
import { Reveal } from './Reveal';
import { PRIMARY_CTA_CLASS, GHOST_CTA_CLASS } from './styles';

/**
 * Deliberately no hero photograph (§ jungle-adventure landing page
 * rebuild spec §6.1/§20.7) — the hero is typographic on purpose, so
 * the Founder Story section below is the page's first photograph.
 */
export function HomeHero({ whatsappCustomerNumber }: { whatsappCustomerNumber: string | null }) {
  return (
    <section className="relative overflow-hidden bg-background px-5 py-28 md:px-10 md:py-40">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="absolute -top-32 -left-32 size-[500px] rounded-full bg-primary/20 blur-3xl" />
        <div className="absolute top-40 -right-32 size-[420px] rounded-full bg-secondary/20 blur-3xl" />
        <svg
          className="absolute inset-0 size-full opacity-[0.12]"
          viewBox="0 0 800 800"
          preserveAspectRatio="none"
          fill="none"
        >
          <path
            d="M50 700 C 250 650, 300 500, 400 480 S 600 300, 780 80"
            stroke="var(--color-foreground)"
            strokeWidth="2"
            strokeDasharray="2 10"
          />
          <circle cx="50" cy="700" r="6" fill="var(--color-primary)" />
          <circle cx="780" cy="80" r="6" fill="var(--color-secondary)" />
        </svg>
        <div className="absolute top-8 right-8 hidden -rotate-12 items-center gap-1 rounded-lg border-2 border-secondary/40 px-3 py-1 text-caption font-bold tracking-wide text-secondary/60 uppercase md:flex">
          ✈ Nairobi · 2026
        </div>
        <div className="absolute bottom-8 left-8 hidden rotate-6 items-center gap-1 rounded-lg border-2 border-primary/40 px-3 py-1 text-caption font-bold tracking-wide text-primary/70 uppercase md:flex">
          ★ Tokyo · Seoul · Bangkok
        </div>
      </div>

      <div className="relative mx-auto max-w-3xl text-center">
        <Reveal>
          <div className="inline-flex items-center gap-2 rounded-full border border-foreground/10 bg-white/70 px-4 py-1.5 text-caption font-semibold tracking-wide text-foreground/70 uppercase backdrop-blur-sm">
            <MapPin className="size-3.5 text-primary" aria-hidden="true" />
            Delivered across Kenya
          </div>
        </Reveal>

        <Reveal delayMs={120}>
          <h1 className="mt-6 text-balance font-display text-[clamp(2.75rem,8vw,5.5rem)] leading-[0.9] font-normal tracking-tight uppercase">
            <span className="text-foreground">Kenya&apos;s </span>
            <span className="text-secondary">mystery</span>
            <span className="text-foreground"> snack </span>
            <span className="text-primary">adventure.</span>
          </h1>
        </Reveal>

        <Reveal delayMs={200}>
          <p className="mx-auto mt-6 max-w-xl text-subtitle text-foreground/75">
            Hand-picked snacks from Japan, Korea, China &amp; Thailand.{' '}
            <span className="font-semibold text-foreground">
              You&apos;re about to take the first step into a very delicious adventure.
            </span>
          </p>
        </Reveal>

        <Reveal delayMs={300}>
          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <WhatsAppOrderButton
              whatsappCustomerNumber={whatsappCustomerNumber}
              message="Hi! I'd like to order a Snack Quest box."
              size="lg"
              className={PRIMARY_CTA_CLASS}
            />
            <Button asChild variant="secondary" size="lg" className={GHOST_CTA_CLASS}>
              <Link href="#boxes">
                See the boxes
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            </Button>
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-small text-foreground/70">
            <span className="inline-flex items-center gap-1.5">
              <Clock className="size-4 text-primary" aria-hidden="true" />
              Order in 2 min on WhatsApp
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Truck className="size-4 text-secondary" aria-hidden="true" />
              Delivered in 24–48 hrs
            </span>
            <span className="inline-flex items-center gap-1.5">💳 M-Pesa accepted</span>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
