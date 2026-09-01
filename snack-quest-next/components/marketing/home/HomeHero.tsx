import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight, Globe, Hand, MapPin, PackageOpen, ShieldCheck, Sparkles, Truck } from 'lucide-react';
import { BuyNowButton } from '@/components/marketing/BuyNowButton';
import { Button } from '@/components/ui/button';
import { MpesaBadge } from '@/components/icons/MpesaBadge';
import { BOX_HERO_SRC } from '@/components/checkout/payment/SnackBoxHero';
import { Reveal } from '../design/Reveal';
import { PRIMARY_CTA_CLASS, GHOST_CTA_CLASS } from '../design/ctaStyles';

/**
 * The hero (§ hero redesign).
 *
 * Left-aligned, with the box beside the headline rather than beneath
 * the buttons. The product is a box of recognisable packets and the
 * photograph explains it faster than any sentence, so it earns a place
 * next to the first thing anybody reads.
 *
 * The picture is the cutout the payment screens already use, imported
 * from there rather than copied, so the box a customer sees on the way
 * in is the same one that greets them when they have paid. The
 * previous asset was a photograph on its own off-white ground: a hard
 * rectangle with a pale background baked into it, which no amount of
 * layout can make sit on a page. A cutout has no edges to fight.
 *
 * That makes it the LCP element on every visit, so it is priced
 * accordingly: `priority`, and explicit `sizes` so a phone never
 * fetches the desktop rendition. Optimized rather than `unoptimized`
 * as the payment screens have it — they show it at one fixed size
 * where the optimizer earns nothing, whereas here a phone should get
 * a ~300px rendition of a 1214px source. Alpha survives, because the
 * optimizer emits WebP and AVIF.
 *
 * On a phone the picture is positioned rather than stacked: it sits
 * top-right, the headline is held to the column beside it, and the
 * body copy runs full width underneath. Stacking it above the buttons
 * pushed "Start your quest" off the first screen, which is the one
 * thing a hero cannot afford.
 */

const TRUST = [
  { icon: MapPin, title: 'Delivered', detail: 'across Kenya', tone: 'text-secondary' },
  // Split across the two lines the other two use, so removing
  // "Secure" costs the word and not the rhythm of the row.
  { icon: ShieldCheck, title: 'M-Pesa', detail: 'payments', tone: 'text-secondary' },
  { icon: PackageOpen, title: 'Hand-picked', detail: 'snacks', tone: 'text-primary' },
] as const;

/** What the box is, in three beats, in the order a customer meets them. */
const PROMISES = [
  { icon: Globe, lead: 'Global', rest: 'variety' },
  { icon: Hand, lead: 'Pick your', rest: 'favourites' },
  { icon: PackageOpen, lead: 'We surprise', rest: 'you with the rest' },
] as const;

/** Stated by the business. The express figure is deliberately conservative against the 90-minute promise the checkout makes. */
const STATS = [
  { icon: PackageOpen, value: '8+', label: 'First-time experiences', tone: 'bg-secondary/10 text-secondary' },
  { icon: Sparkles, value: '100+', label: 'Happy snackers', tone: 'bg-primary/10 text-primary' },
  { icon: Truck, value: '2 hrs', label: 'Guaranteed express available', tone: 'bg-success/10 text-success' },
] as const;

export function HomeHero({ primaryPackageId }: { primaryPackageId?: string } = {}) {
  return (
    <section className="bg-background relative overflow-hidden px-5 pt-6 pb-14 md:px-10 md:pt-10 md:pb-24">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="bg-secondary/15 absolute -top-32 -left-32 size-[500px] rounded-full blur-3xl" />
        <div className="bg-primary/15 absolute top-32 -right-32 size-[420px] rounded-full blur-3xl" />
      </div>

      {/* Three facts that answer "can I trust this" before the pitch begins. */}
      <Reveal>
        <ul className="border-border bg-surface relative mx-auto grid max-w-6xl grid-cols-3 rounded-2xl border p-3 sm:p-4">
          {TRUST.map((item, index) => (
            <li
              key={item.title}
              className={`flex items-center gap-2 px-1 sm:gap-3 sm:px-4 ${index > 0 ? 'border-border border-l' : ''}`}
            >
              <span className="bg-background hidden size-9 shrink-0 items-center justify-center rounded-xl sm:flex">
                <item.icon className={`size-4.5 ${item.tone}`} aria-hidden="true" />
              </span>
              <span className="min-w-0">
                <span className="text-foreground block text-caption font-semibold sm:text-sm">
                  {item.title}
                </span>
                <span className="text-muted-foreground block text-caption sm:text-sm">
                  {item.detail}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </Reveal>

      <div className="relative mx-auto mt-10 max-w-6xl lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-center lg:gap-12">
        {/*
          Positioned on a phone, a grid cell from `lg`. Deliberately
          allowed past the right edge: the box reads as arriving rather
          than as a product shot pinned inside a frame.
        */}
        <div className="pointer-events-none absolute -top-1 -right-8 w-[56%] max-w-[290px] sm:-right-6 sm:w-[50%] sm:max-w-[400px] lg:pointer-events-auto lg:static lg:order-2 lg:w-full lg:max-w-none">
          {/*
            A cutout needs its own light to sit on. Without this the
            box floats on flat page colour and reads as pasted on;
            with it there is something behind the burst for it to
            come out of.
          */}
          <div
            aria-hidden="true"
            className="bg-primary/20 absolute inset-x-[12%] top-[28%] h-1/3 rounded-full blur-3xl"
          />
          <Image
            src={BOX_HERO_SRC}
            alt="A Snack Quest box with Japanese, Korean and Thai snacks bursting out of it."
            width={1214}
            height={1295}
            priority
            sizes="(min-width: 1024px) 620px, 60vw"
            className="relative h-auto w-full"
          />
        </div>

        <div className="relative lg:order-1">
          <Reveal>
            <div className="border-secondary/20 bg-secondary/5 text-caption text-secondary inline-flex items-center gap-2 rounded-full border px-3 py-1.5 font-bold tracking-wide uppercase">
              <Sparkles className="size-3.5" aria-hidden="true" />
              Discover. Pick. Enjoy.
            </div>
          </Reveal>

          {/*
            Held to the column beside the photograph on a phone so the
            two never collide, released at `lg` where the image has a
            column of its own.
          */}
          <Reveal delayMs={100}>
            <h1 className="font-display mt-5 max-w-[60%] text-[clamp(2.15rem,8.6vw,4.5rem)] leading-[0.88] font-normal tracking-tight uppercase sm:max-w-[58%] lg:max-w-none">
              <span className="text-foreground block">Explore the</span>
              <span className="text-secondary block">flavours</span>
              <span className="text-foreground block">of the</span>
              <span className="text-primary block">world.</span>
            </h1>
          </Reveal>

          <Reveal delayMs={180}>
            {/*
              Where the international positioning is stated, and the
              only place it needs to be. "First stop" rather than
              "starting in Asia": Asia is not a phase the brand is
              passing through — those boxes stay — it is the first of
              several ranges. The qualifier is not decoration: every box
              today is Asian, so "from around the world" alone would
              promise a range the box does not contain.
            */}
            <p className="text-subtitle text-foreground/75 mt-7 max-w-xl">
              Hand-picked snacks from around the world. First stop: Asia.{' '}
              <span className="text-secondary font-semibold">Pick the flavours you want</span>, and{' '}
              <span className="text-secondary font-semibold">
                discover the ones you haven&apos;t met yet.
              </span>
            </p>
          </Reveal>

          <Reveal delayMs={240}>
            <ul className="mt-7 flex max-w-xl items-start">
              {PROMISES.map((promise, index) => (
                <li
                  key={promise.lead}
                  className={`flex min-w-0 flex-1 items-start gap-2 ${index > 0 ? 'border-border ml-3 border-l pl-3' : ''}`}
                >
                  <promise.icon
                    className="text-secondary mt-0.5 size-4 shrink-0"
                    aria-hidden="true"
                  />
                  <span className="text-caption min-w-0 leading-tight">
                    <span className="text-secondary block font-semibold">{promise.lead}</span>
                    <span className="text-foreground/70 block">{promise.rest}</span>
                  </span>
                </li>
              ))}
            </ul>
          </Reveal>

          <Reveal delayMs={300}>
            <div className="mt-8 flex max-w-md flex-col gap-3">
              <BuyNowButton
                packageId={primaryPackageId}
                size="lg"
                className={`${PRIMARY_CTA_CLASS} w-full`}
                analyticsSource="home_hero"
              >
                Start your quest
              </BuyNowButton>
              <Button asChild variant="secondary" size="lg" className={`${GHOST_CTA_CLASS} w-full`}>
                <Link href="#boxes">
                  See our boxes
                  <ArrowRight className="size-4" aria-hidden="true" />
                </Link>
              </Button>
            </div>
          </Reveal>
        </div>
      </div>

      <Reveal delayMs={360}>
        <ul className="border-border bg-surface relative mx-auto mt-10 grid max-w-6xl gap-4 rounded-2xl border p-5 sm:grid-cols-3">
          {STATS.map((stat) => (
            <li key={stat.value} className="flex items-center gap-3">
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
        The one payment reassurance worth making here, and it is true:
        the PIN is entered on Safaricom's own prompt, and no page on
        this site ever asks for one.
      */}
      <Reveal delayMs={400}>
        <div className="border-secondary/20 bg-secondary/5 relative mx-auto mt-4 flex max-w-6xl items-center justify-between gap-4 rounded-2xl border p-5">
          <div className="flex min-w-0 items-center gap-3">
            <span className="bg-surface flex size-11 shrink-0 items-center justify-center rounded-full">
              <ShieldCheck className="text-secondary size-5" aria-hidden="true" />
            </span>
            <span className="min-w-0">
              <span className="text-foreground block text-sm font-semibold">
                Pay safely with <span className="text-secondary">M-Pesa</span>
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
