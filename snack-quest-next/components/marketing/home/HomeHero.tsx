import Link from 'next/link';
import { ArrowRight, Clock, MapPin, Truck } from 'lucide-react';
import { BuyNowButton } from '@/components/marketing/BuyNowButton';
import { Button } from '@/components/ui/button';
import { MpesaBadge } from '@/components/icons/MpesaBadge';
import { PartnersMarquee } from '@/components/marketing/PartnersMarquee';
import { Reveal } from '../design/Reveal';
import { PRIMARY_CTA_CLASS, GHOST_CTA_CLASS } from '../design/ctaStyles';

/**
 * Deliberately no hero photograph (§ jungle-adventure landing page
 * rebuild spec §6.1/§20.7) — the hero is typographic on purpose, so
 * whatever section follows carries the page's first photograph. Today
 * that's `ReviewsSection`'s real customer photos (§ CRO audit — funnel
 * order), stronger, earlier proof than an illustrated placeholder.
 *
 * The compact `PartnersMarquee` above "Delivered across Kenya" sits in
 * the section's own top padding rather than adding a new one — top
 * padding dropped from `py-16 md:py-40` to an asymmetric
 * `pt-8 pb-16 md:pt-12 md:pb-40` by exactly the marquee's own height,
 * so the hero doesn't grow taller, it just uses that space for
 * something instead of leaving it empty. `-mx-5 md:-mx-10` cancels the
 * section's own horizontal padding so the marquee still bleeds edge to
 * edge rather than sitting inset like the rest of the hero's content.
 */
export function HomeHero({ primaryPackageId }: { primaryPackageId?: string } = {}) {
  return (
    <section className="bg-background relative overflow-hidden px-5 pt-8 pb-16 md:px-10 md:pt-12 md:pb-40">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="bg-primary/20 absolute -top-32 -left-32 size-[500px] rounded-full blur-3xl" />
        <div className="bg-secondary/20 absolute top-40 -right-32 size-[420px] rounded-full blur-3xl" />
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
        <div className="border-secondary/40 text-caption text-secondary/60 absolute top-8 right-8 hidden -rotate-12 items-center gap-1 rounded-lg border-2 px-3 py-1 font-bold tracking-wide uppercase md:flex">
          ✈ Nairobi · 2026
        </div>
        <div className="border-primary/40 text-caption text-primary/70 absolute bottom-8 left-8 hidden rotate-6 items-center gap-1 rounded-lg border-2 px-3 py-1 font-bold tracking-wide uppercase md:flex">
          ★ Tokyo · Seoul · Bangkok
        </div>
      </div>

      <div className="relative -mx-5 mb-8 md:-mx-10 md:mb-12">
        <PartnersMarquee compact />
      </div>

      <div className="relative mx-auto max-w-3xl text-center">
        <Reveal>
          <div className="border-foreground/10 text-caption text-foreground/70 inline-flex items-center gap-2 rounded-full border bg-white/70 px-4 py-1.5 font-semibold tracking-wide uppercase backdrop-blur-sm">
            <MapPin className="text-primary size-3.5" aria-hidden="true" />
            Delivered across Kenya
          </div>
        </Reveal>

        <Reveal delayMs={120}>
          <h1 className="font-display mt-6 text-[clamp(2.75rem,8vw,5.5rem)] leading-[0.9] font-normal tracking-tight text-balance uppercase">
            <span className="text-foreground">Kenya&apos;s </span>
            <span className="text-secondary">mystery</span>
            <span className="text-foreground"> snack </span>
            <span className="text-primary">adventure.</span>
          </h1>
        </Reveal>

        <Reveal delayMs={200}>
          {/*
            Where the international positioning is stated, and the only
            place it needs to be (§ international positioning).
            "First stop" rather than "starting in Asia": Asia is not a
            phase the brand is passing through — those boxes stay — it
            is the first of several ranges. It also happens to be the
            language the rest of this page already speaks in (the quest,
            the route, explorers). The qualifier is not decoration: every
            box today is Asian, so "from around the world" on its own
            would promise a range the box doesn't contain.
          */}
          <p className="text-subtitle text-foreground/75 mx-auto mt-6 max-w-xl">
            Hand-picked mystery snacks from around the world. First stop: Asia.{' '}
            <span className="text-foreground font-semibold">
              You&apos;re about to take the first step into a very delicious
              adventure.
            </span>
          </p>
        </Reveal>

        <Reveal delayMs={300}>
          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <BuyNowButton
              packageId={primaryPackageId}
              size="lg"
              className={PRIMARY_CTA_CLASS}
              analyticsSource="home_hero"
            >
              Start your quest
            </BuyNowButton>
            <Button
              asChild
              variant="secondary"
              size="lg"
              className={GHOST_CTA_CLASS}
            >
              <Link href="#boxes">
                See the boxes
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            </Button>
          </div>

          <div className="text-small text-foreground/70 mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
            <span className="inline-flex items-center gap-1.5">
              <Clock className="text-primary size-4" aria-hidden="true" />
              Checkout in 2 minutes
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Truck className="text-secondary size-4" aria-hidden="true" />
              Delivered in 24–48 hrs
            </span>
            <span className="inline-flex items-center gap-1.5">
              <MpesaBadge /> accepted
            </span>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
