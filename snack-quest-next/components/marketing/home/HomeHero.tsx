import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight, Globe, Hand, MapPin, PackageOpen, ShieldCheck, Sparkles, Truck } from 'lucide-react';
import { BuyNowButton } from '@/components/marketing/BuyNowButton';
import { Button } from '@/components/ui/button';
import { MpesaBadge } from '@/components/icons/MpesaBadge';
import { PartnersMarquee } from '@/components/marketing/PartnersMarquee';
import { Reveal } from '../design/Reveal';
import { PRIMARY_CTA_CLASS, GHOST_CTA_CLASS } from '../design/ctaStyles';

/**
 * The hero (§ hero redesign).
 *
 * It was typographic on purpose — no photograph, so the section below
 * carried the page's first image. That is reversed here at the
 * business's direction: the product is a box of recognisable packets,
 * and a customer who has never heard of Snack Quest understands it
 * faster from one photograph of the actual box than from any sentence
 * about it.
 *
 * Which makes this the LCP element on every visit, so it is priced
 * accordingly: `priority` to skip lazy-loading, explicit `sizes` so a
 * phone never fetches the desktop rendition, and the source stored as
 * WebP rather than the 2.3MB PNG it arrived as. The mobile LCP work
 * this page has already had is easy to undo with one careless image.
 *
 * On a phone the picture sits *below* the buttons rather than between
 * them and the headline. Above them it looks better and pushes "Start
 * your quest" off the first screen, which is the one thing the hero
 * exists to avoid.
 */

/** Stated by the business. Deliberately conservative against the 90-minute express promise the checkout makes. */
const STATS = [
  {
    icon: PackageOpen,
    value: '8+',
    label: 'First-time experiences',
    tone: 'bg-secondary/10 text-secondary',
  },
  { icon: Sparkles, value: '100+', label: 'Happy snackers', tone: 'bg-primary/10 text-primary' },
  {
    icon: Truck,
    value: '2 hrs',
    label: 'Guaranteed express delivery available',
    tone: 'bg-success/10 text-success',
  },
] as const;

/** What the box actually is, in three beats, in the order a customer meets them. */
const PROMISES = [
  { icon: Globe, lead: 'Global', rest: 'variety' },
  { icon: Hand, lead: 'Pick', rest: 'your favourites' },
  { icon: PackageOpen, lead: 'We surprise you', rest: 'with the rest' },
] as const;

export function HomeHero({ primaryPackageId }: { primaryPackageId?: string } = {}) {
  return (
    <section className="bg-background relative overflow-hidden px-5 pt-8 pb-16 md:px-10 md:pt-12 md:pb-28">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="bg-secondary/20 absolute -top-32 -left-32 size-[500px] rounded-full blur-3xl" />
        <div className="bg-primary/20 absolute top-40 -right-32 size-[420px] rounded-full blur-3xl" />
      </div>

      <div className="relative -mx-5 mb-8 md:-mx-10 md:mb-10">
        <PartnersMarquee compact />
      </div>

      {/*
        Three facts that answer "can I trust this" before the pitch
        begins: it reaches me, the money is safe, the snacks are real.
        Not a badge row — each one is a plain statement of something the
        business actually does.
      */}
      <Reveal>
        <ul className="border-border bg-surface relative mx-auto mb-10 grid max-w-5xl gap-3 rounded-2xl border p-4 sm:grid-cols-3 sm:divide-x sm:divide-[color:var(--color-border)] sm:gap-0">
          {[
            { icon: MapPin, title: 'Delivered', detail: 'across Kenya', tone: 'text-secondary' },
            { icon: ShieldCheck, title: 'Secure', detail: 'M-Pesa payments', tone: 'text-secondary' },
            { icon: PackageOpen, title: 'Hand-picked', detail: 'every single box', tone: 'text-primary' },
          ].map((item) => (
            <li key={item.title} className="flex items-center gap-3 sm:justify-center sm:px-4">
              <span className="bg-background flex size-9 shrink-0 items-center justify-center rounded-xl">
                <item.icon className={`size-4.5 ${item.tone}`} aria-hidden="true" />
              </span>
              <span className="min-w-0">
                <span className="text-foreground block text-sm font-semibold">{item.title}</span>
                <span className="text-muted-foreground block text-sm">{item.detail}</span>
              </span>
            </li>
          ))}
        </ul>
      </Reveal>

      <div className="relative mx-auto grid max-w-6xl items-center gap-10 lg:grid-cols-2 lg:gap-14">
        <div className="text-center lg:text-left">
          <Reveal>
            <div className="border-secondary/20 text-caption text-secondary inline-flex items-center gap-2 rounded-full border bg-white/70 px-4 py-1.5 font-semibold tracking-wide uppercase backdrop-blur-sm">
              <Sparkles className="size-3.5" aria-hidden="true" />
              Discover. Pick. Enjoy.
            </div>
          </Reveal>

          <Reveal delayMs={120}>
            <h1 className="font-display mt-6 text-[clamp(2.75rem,8vw,4.75rem)] leading-[0.9] font-normal tracking-tight text-balance uppercase">
              <span className="text-foreground">Explore the </span>
              <span className="text-secondary">flavours</span>
              <span className="text-foreground"> of the </span>
              <span className="text-primary">world.</span>
            </h1>
          </Reveal>

          <Reveal delayMs={200}>
            {/*
              Where the international positioning is stated, and the
              only place it needs to be. "First stop" rather than
              "starting in Asia": Asia is not a phase the brand is
              passing through — those boxes stay — it is the first of
              several ranges. The qualifier is not decoration: every box
              today is Asian, so "from around the world" alone would
              promise a range the box does not contain.
            */}
            <p className="text-subtitle text-foreground/75 mx-auto mt-6 max-w-xl lg:mx-0">
              Hand-picked snacks from around the world. First stop: Asia.{' '}
              <span className="text-foreground font-semibold">
                Pick the flavours you want, and discover the ones you haven&apos;t met yet.
              </span>
            </p>
          </Reveal>

          <Reveal delayMs={260}>
            <ul className="text-small mt-7 flex flex-wrap justify-center gap-x-6 gap-y-3 lg:justify-start">
              {PROMISES.map((promise) => (
                <li key={promise.lead} className="flex items-center gap-2">
                  <promise.icon className="text-secondary size-4 shrink-0" aria-hidden="true" />
                  <span className="text-foreground/75">
                    <span className="text-secondary font-semibold">{promise.lead}</span>{' '}
                    {promise.rest}
                  </span>
                </li>
              ))}
            </ul>
          </Reveal>

          <Reveal delayMs={320}>
            <div className="mt-9 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-center lg:justify-start">
              <BuyNowButton
                packageId={primaryPackageId}
                size="lg"
                className={PRIMARY_CTA_CLASS}
                analyticsSource="home_hero"
              >
                Start your quest
              </BuyNowButton>
              <Button asChild variant="secondary" size="lg" className={GHOST_CTA_CLASS}>
                <Link href="#boxes">
                  See our boxes
                  <ArrowRight className="size-4" aria-hidden="true" />
                </Link>
              </Button>
            </div>
          </Reveal>
        </div>

        {/*
          Below the buttons on a phone, beside them from `lg` up. The
          photograph is the fastest explanation of what this is, but not
          at the cost of pushing the one button the hero exists for off
          the first screen.
        */}
        <Reveal delayMs={160}>
          <div className="relative mx-auto w-full max-w-lg lg:max-w-none">
            <Image
              src="/hero-box.webp"
              alt="A Snack Quest box packed with imported snacks and instant noodles."
              width={1200}
              height={960}
              // The LCP element: never lazy, and never the desktop
              // rendition on a phone.
              priority
              sizes="(min-width: 1024px) 560px, 100vw"
              className="h-auto w-full"
            />
          </div>
        </Reveal>
      </div>

      <Reveal delayMs={380}>
        <ul className="border-border bg-surface relative mx-auto mt-12 grid max-w-5xl gap-4 rounded-2xl border p-5 sm:grid-cols-3">
          {STATS.map((stat) => (
            <li key={stat.value} className="flex items-center gap-3 sm:justify-center">
              <span
                className={`flex size-11 shrink-0 items-center justify-center rounded-full ${stat.tone}`}
              >
                <stat.icon className="size-5" aria-hidden="true" />
              </span>
              <span className="min-w-0">
                <span className="text-foreground block text-lg font-bold tabular-nums">
                  {stat.value}
                </span>
                <span className="text-muted-foreground block text-sm leading-tight">
                  {stat.label}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </Reveal>

      {/*
        The one piece of payment reassurance worth making here, and it
        is true: the PIN is entered on Safaricom's own prompt, and no
        page on this site ever asks for one.
      */}
      <Reveal delayMs={430}>
        <div className="border-secondary/20 bg-secondary/5 relative mx-auto mt-4 flex max-w-5xl items-center justify-between gap-4 rounded-2xl border p-5">
          <div className="flex items-center gap-3">
            <span className="bg-surface flex size-11 shrink-0 items-center justify-center rounded-full">
              <ShieldCheck className="text-secondary size-5" aria-hidden="true" />
            </span>
            <span className="min-w-0">
              <span className="text-foreground block text-sm font-semibold">
                Pay safely with M-Pesa
              </span>
              <span className="text-muted-foreground block text-sm">
                Your PIN is never shared with us.
              </span>
            </span>
          </div>
          <MpesaBadge />
        </div>
      </Reveal>
    </section>
  );
}
