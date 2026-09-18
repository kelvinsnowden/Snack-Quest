import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import {
  ArrowRight,
  Camera,
  Compass,
  Gift,
  Globe2,
  Heart,
  Repeat,
  ShoppingBag,
  Sparkles,
  Store,
  Truck,
  Users,
} from 'lucide-react';
import { buildPageMetadata } from '@/lib/seo/pageMetadata';
import { getSiteUrl } from '@/lib/seo/siteUrl';
import { safeJsonLd } from '@/lib/seo/safeJsonLd';
import { InvestNav } from '@/components/marketing/invest/InvestNav';
import { InvestCta } from '@/components/marketing/invest/InvestCta';
import { InvestorVideo, PreferReading } from '@/components/marketing/invest/InvestorVideo';
import { InterestForm } from '@/components/marketing/invest/InterestForm';
import { MobileInvestBar } from '@/components/marketing/invest/MobileInvestBar';
import { INVEST_FAQ } from '@/lib/invest/faq';
import {
  ALLOCATIONS,
  AVERAGE_ORDER_KES,
  formatKsh,
  INTEREST_DISCLAIMER,
  RAISE_HEADLINE,
  RAISE_PURPOSE,
  RAISE_TOTAL_KES,
  TIKTOK,
  TRACTION,
  TRACTION_AS_OF,
} from '@/lib/invest/raise';

const TITLE = "Invest in Snack Quest | Building Kenya's Snack Discovery Brand";
const DESCRIPTION =
  "We're building a new kind of snack discovery experience in Kenya — online, in-store and built for repeat discovery. Learn about Snack Quest and express your investor interest.";

export const metadata: Metadata = buildPageMetadata({
  title: TITLE,
  description: DESCRIPTION,
  path: '/invest',
  image: '/deck/og.jpg',
});

/* ─────────────────────────────────────────────────────────────── */

/** Band backgrounds, named once so the page's rhythm is legible in one place. */
const INK = 'bg-[#120c22]';
const INK_SOFT = 'bg-[#181030]';

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-primary mb-4 inline-block text-xs font-bold tracking-[0.2em] uppercase">
      {children}
    </span>
  );
}

function Section({
  id,
  className,
  children,
  labelledBy,
}: {
  id?: string;
  className?: string;
  children: React.ReactNode;
  labelledBy?: string;
}) {
  return (
    <section
      id={id}
      aria-labelledby={labelledBy}
      // `scroll-mt` clears the fixed nav, or every anchor lands with
      // its own heading hidden behind the bar.
      className={`scroll-mt-20 px-5 py-16 sm:px-8 sm:py-24 ${className ?? ''}`}
    >
      <div className="mx-auto w-full max-w-[1200px]">{children}</div>
    </section>
  );
}

function Title({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2
      id={id}
      className="font-display text-[clamp(1.9rem,6vw,3.25rem)] leading-[1.08] tracking-tight text-white text-balance"
    >
      {children}
    </h2>
  );
}

function Lede({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-5 max-w-2xl text-base leading-relaxed text-white/70 sm:text-lg">{children}</p>
  );
}

/** A number and what it counts. The page's most repeated unit. */
function Metric({
  value,
  label,
  note,
  accent = 'orange',
}: {
  value: string;
  label: string;
  note?: string;
  accent?: 'orange' | 'purple' | 'lime';
}) {
  /*
   * The accent is a rule above the number, not a wash behind it. As a
   * background gradient the lime turned olive against this ground —
   * two colours averaging into mud is exactly what a dark palette does
   * to a bright one — while as a 3px rule it stays the colour it is.
   */
  const rule =
    accent === 'orange'
      ? 'bg-primary'
      : accent === 'purple'
        ? 'bg-secondary'
        : 'bg-home-lime';
  const wash =
    accent === 'orange'
      ? 'from-primary/12'
      : accent === 'purple'
        ? 'from-secondary/16'
        : 'from-home-lime/[0.07]';
  return (
    <div
      className={`relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br ${wash} to-transparent p-5 sm:rounded-3xl sm:p-7`}
    >
      <span aria-hidden="true" className={`mb-5 block h-1 w-10 rounded-full ${rule}`} />
      <span className="font-display block text-[clamp(1.75rem,5.5vw,2.75rem)] leading-none tracking-tight text-white tabular-nums">
        {value}
      </span>
      <span className="mt-3 block text-sm font-semibold text-white/90 sm:text-base">{label}</span>
      {note ? <span className="mt-1.5 block text-xs text-white/50 sm:text-sm">{note}</span> : null}
    </div>
  );
}

/** One step in a left-to-right journey — used by the four flow diagrams. */
function FlowStep({ children, last }: { children: React.ReactNode; last?: boolean }) {
  return (
    <li className="flex items-center gap-3">
      <span className="rounded-full border border-white/15 bg-white/[0.06] px-4 py-2.5 text-xs font-bold tracking-[0.12em] whitespace-nowrap text-white uppercase sm:text-sm">
        {children}
      </span>
      {last ? null : (
        <ArrowRight className="text-primary size-4 shrink-0 sm:size-5" aria-hidden="true" />
      )}
    </li>
  );
}

function Flow({ steps, label }: { steps: readonly string[]; label: string }) {
  return (
    <ul
      aria-label={label}
      // Wraps rather than scrolls: a horizontal scroller inside a
      // vertical page is a thing people miss entirely on a phone.
      className="flex flex-wrap items-center gap-x-3 gap-y-3"
    >
      {steps.map((step, index) => (
        <FlowStep key={step} last={index === steps.length - 1}>
          {step}
        </FlowStep>
      ))}
    </ul>
  );
}

function Pillar({
  icon: Icon,
  title,
  body,
}: {
  icon: typeof Store;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 sm:p-6">
      <Icon className="text-primary mb-4 size-6" aria-hidden="true" />
      <h3 className="text-base font-bold tracking-tight text-white sm:text-lg">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-white/65 sm:text-base">{body}</p>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────── */

export default function InvestPage() {
  const siteUrl = getSiteUrl();

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebPage',
        '@id': `${siteUrl}/invest#webpage`,
        url: `${siteUrl}/invest`,
        name: TITLE,
        description: DESCRIPTION,
        inLanguage: 'en-KE',
        isPartOf: { '@id': `${siteUrl}/#website` },
        about: { '@id': `${siteUrl}/#organization` },
      },
      /*
       * FAQ only. Deliberately no `Offer`, `FinancialProduct` or
       * anything else that would describe this as a security for sale —
       * the page is an expression of interest, and structured data
       * saying otherwise would be a misrepresentation a search engine
       * then repeats.
       */
      {
        '@type': 'FAQPage',
        '@id': `${siteUrl}/invest#faq`,
        mainEntity: INVEST_FAQ.map((item) => ({
          '@type': 'Question',
          name: item.question,
          acceptedAnswer: { '@type': 'Answer', text: item.answer },
        })),
      },
    ],
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }} />
      <InvestNav />
      <MobileInvestBar />

      {/* ── HERO ────────────────────────────────────────────── */}
      <section className={`${INK} relative overflow-hidden px-5 pt-24 pb-16 sm:px-8 sm:pt-32 sm:pb-24`}>
        {/* Two soft lamps in the brand's own colours. Pure CSS — no image to download. */}
        <div
          aria-hidden="true"
          className="bg-secondary/25 pointer-events-none absolute -top-40 -left-32 size-[34rem] rounded-full blur-[120px]"
        />
        <div
          aria-hidden="true"
          className="bg-primary/20 pointer-events-none absolute -top-24 -right-40 size-[30rem] rounded-full blur-[120px]"
        />
        <div className="relative mx-auto w-full max-w-[1200px]">
          <div className="mx-auto max-w-3xl text-center">
            <Eyebrow>The Snack Quest story</Eyebrow>
            <h1 className="font-display text-[clamp(2.1rem,7vw,4rem)] leading-[1.05] tracking-tight text-white text-balance">
              What if discovering snacks became a destination?
            </h1>
            <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-white/70 sm:text-lg">
              Watch Kelvin, founder of Snack Quest, explain what we’re building, why now, and
              where we’re going.
            </p>
          </div>

          <div className="mx-auto mt-10 w-full max-w-[1100px] sm:mt-12">
            <InvestorVideo />
            <PreferReading />
          </div>
        </div>
      </section>

      {/* ── THE ONE-MINUTE VERSION ──────────────────────────── */}
      <Section id="opportunity" labelledBy="opportunity-title" className={INK_SOFT}>
        <Eyebrow>For the sixty-second reader</Eyebrow>
        <Title id="opportunity-title">The opportunity, in one minute.</Title>
        <Lede>
          A live business with real customers, raising to build its first physical home — and the
          engine that fills it.
        </Lede>

        <div className="mt-10 grid gap-3.5 sm:mt-12 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3">
          <Metric value={RAISE_HEADLINE} label="Current fundraising objective" note={RAISE_PURPOSE} />
          <Metric value="Store #1" label="First physical Snack Quest discovery destination" accent="purple" />
          <Metric
            value={String(TRACTION.paidOrders)}
            label="Paid orders"
            note={`From ${TRACTION.customers} customers`}
            accent="lime"
          />
          <Metric
            value={formatKsh(TRACTION.revenueKes)}
            label="Revenue"
            note={`Average order ${formatKsh(AVERAGE_ORDER_KES)}`}
          />
          <Metric value={TIKTOK.profileViewsToDate} label="TikTok profile views" accent="purple" />
          <Metric value={String(TIKTOK.sharesToDate)} label="Shares" accent="lime" />
        </div>
        <p className="mt-5 text-xs text-white/45 sm:text-sm">
          Trading results as of {TRACTION_AS_OF}. TikTok figures are {TIKTOK.handle}’s own reported
          totals.
        </p>
      </Section>

      {/* ── WHAT IS SNACK QUEST ─────────────────────────────── */}
      <Section labelledBy="what-title" className={INK}>
        <div className="grid gap-10 lg:grid-cols-[1.1fr_1fr] lg:items-center lg:gap-16">
          <div>
            <Eyebrow>What we are</Eyebrow>
            <Title id="what-title">We’re not just selling snacks.</Title>
            <Lede>
              Snack Quest is building a discovery brand around interesting snacks from around the
              world and closer to home — giving people a place to discover, try, share, gift and
              come back for more.
            </Lede>
            <div className="mt-8">
              <Flow
                label="The discovery loop"
                steps={['Discover', 'Try', 'Share', 'Return']}
              />
            </div>
          </div>
          <div className="relative aspect-[4/3] overflow-hidden rounded-2xl sm:rounded-3xl">
            <Image
              src="/deck/box.webp"
              alt="A packed Snack Quest box of imported snacks."
              fill
              sizes="(min-width: 1024px) 520px, 100vw"
              className="object-cover"
              loading="lazy"
            />
          </div>
        </div>

        <div className="mt-12 grid gap-3.5 sm:grid-cols-2 sm:gap-5 lg:grid-cols-4">
          <Pillar
            icon={Store}
            title="Physical discovery"
            body="A destination where customers can physically discover unusual snacks."
          />
          <Pillar
            icon={ShoppingBag}
            title="Digital discovery"
            body="Customers can discover and purchase through the online store."
          />
          <Pillar
            icon={Camera}
            title="Social discovery"
            body="Creators and customers turn products into content."
          />
          <Pillar
            icon={Repeat}
            title="Repeat discovery"
            body="The Passport and loyalty system encourage customers to return."
          />
        </div>
      </Section>

      {/* ── WHY THE STORE MATTERS ───────────────────────────── */}
      <Section id="store" labelledBy="store-title" className={INK_SOFT}>
        <Eyebrow>Store #1</Eyebrow>
        <Title id="store-title">The first store isn’t just a shop.</Title>
        <Lede>
          We’re creating a physical discovery destination where the product itself becomes the
          experience.
        </Lede>

        <figure className="mt-10 overflow-hidden rounded-2xl sm:mt-12 sm:rounded-3xl">
          <div className="relative aspect-[16/10] w-full sm:aspect-[2/1]">
            <Image
              src="/deck/shot-interior.webp"
              alt="Concept render of the Snack Quest store interior: neon signage, snacks shelved by country, a Build Your Quest pick wall and a seating corner."
              fill
              sizes="(min-width: 1200px) 1200px, 100vw"
              className="object-cover"
              loading="lazy"
            />
          </div>
          <figcaption className="bg-black/40 px-4 py-3 text-xs text-white/55 sm:text-sm">
            Concept render of the Snack Quest store interior.
          </figcaption>
        </figure>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <figure className="overflow-hidden rounded-2xl">
            <div className="relative aspect-[3/2] w-full">
              <Image
                src="/deck/shot-front.webp"
                alt="Concept render of the Snack Quest shopfront at night, lit signage reading Explore. Taste. Enjoy."
                fill
                sizes="(min-width: 640px) 580px, 100vw"
                className="object-cover"
                loading="lazy"
              />
            </div>
            <figcaption className="bg-black/40 px-4 py-3 text-xs text-white/55">
              Concept render of the shopfront.
            </figcaption>
          </figure>
          <figure className="overflow-hidden rounded-2xl">
            <div className="relative aspect-[3/2] w-full">
              <Image
                src="/deck/shot-pickwall.webp"
                alt="Concept render of the in-store pick wall, where customers choose the snacks that go into their own box."
                fill
                sizes="(min-width: 640px) 580px, 100vw"
                className="object-cover"
                loading="lazy"
              />
            </div>
            <figcaption className="bg-black/40 px-4 py-3 text-xs text-white/55">
              Concept render of the in-store pick wall.
            </figcaption>
          </figure>
        </div>

        <div className="mt-8 grid gap-3.5 sm:grid-cols-2 sm:gap-5 lg:grid-cols-4">
          <Pillar
            icon={Compass}
            title="Discovery"
            body="A rotating selection of interesting products."
          />
          <Pillar
            icon={Sparkles}
            title="Experience"
            body="A space people want to explore and photograph."
          />
          <Pillar
            icon={Camera}
            title="Content"
            body="A physical environment that naturally creates social content."
          />
          <Pillar
            icon={Truck}
            title="Conversion"
            body="Customers can discover in-store and continue shopping online."
          />
        </div>
      </Section>

      {/* ── BUSINESS MODEL ──────────────────────────────────── */}
      <Section labelledBy="model-title" className={INK}>
        <Eyebrow>The business model</Eyebrow>
        <Title id="model-title">One customer. Multiple ways to buy.</Title>
        <Lede>
          The same person can buy a single packet, a curated box, a gift, or an office order — and
          come back through a different door each time.
        </Lede>

        <div className="mt-10 grid gap-5 sm:mt-12 lg:grid-cols-2">
          <div className="border-primary/25 bg-primary/[0.07] rounded-2xl border p-6 sm:rounded-3xl sm:p-8">
            <h3 className="text-primary text-xs font-bold tracking-[0.18em] uppercase">
              Selling today
            </h3>
            <ul className="mt-5 flex flex-col gap-3.5">
              {[
                ['Individual snacks', `A ${TRACTION.snackCatalogue}-snack catalogue, sold by the packet.`],
                ['Curated Snack Quest boxes', 'Four boxes, from a Mini Quest to a Premium box where you choose five snacks yourself.'],
                ['Gifting', 'Boxes sent to someone else, with a message.'],
                ['Online repeat purchases', 'The web store, with M-Pesa checkout and delivery across Nairobi.'],
              ].map(([title, body]) => (
                <li key={title} className="flex gap-3">
                  <Check />
                  <span className="text-sm leading-relaxed text-white/80 sm:text-base">
                    <b className="font-semibold text-white">{title}</b> — {body}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="border-secondary/25 bg-secondary/[0.07] rounded-2xl border p-6 sm:rounded-3xl sm:p-8">
            <h3 className="text-xs font-bold tracking-[0.18em] text-white/60 uppercase">
              What we’re building toward
            </h3>
            <ul className="mt-5 flex flex-col gap-3.5">
              {[
                ['Physical store purchases', 'Store #1 — the reason for this raise.'],
                ['Corporate orders', 'Office and client gifting at volume.'],
                ['Future replication', 'More locations once Store #1 proves the model.'],
              ].map(([title, body]) => (
                <li key={title} className="flex gap-3">
                  <Dot />
                  <span className="text-sm leading-relaxed text-white/75 sm:text-base">
                    <b className="font-semibold text-white">{title}</b> — {body}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-6 text-xs leading-relaxed text-white/45 sm:text-sm">
              These are plans, not current revenue. Everything in the left column is running
              today; nothing in this one has earned a shilling yet.
            </p>
          </div>
        </div>
      </Section>

      {/* ── THE PASSPORT ────────────────────────────────────── */}
      <Section labelledBy="passport-title" className={INK_SOFT}>
        <div className="grid gap-10 lg:grid-cols-[1fr_0.9fr] lg:items-center lg:gap-16">
          <div>
            <Eyebrow>The Passport</Eyebrow>
            <Title id="passport-title">We’re building customers, not one-time orders.</Title>
            <Lede>
              The Snack Quest Passport turns a single purchase into a reason to come back.
              Customers collect progress as they order, refer friends with their own code, and earn
              credit they can spend with us.
            </Lede>
            <div className="mt-8">
              <Flow
                label="The Passport journey"
                steps={['Buy', 'Collect', 'Refer', 'Earn', 'Return']}
              />
            </div>
            <p className="mt-7 text-sm leading-relaxed text-white/60 sm:text-base">
              The strategic purpose is simple: turn individual snack purchases into a long-term
              customer relationship. It is also the honest gap in our numbers —{' '}
              <b className="text-white/85">
                all {TRACTION.paidOrders} orders so far came from {TRACTION.customers} different
                people, and none has yet bought twice.
              </b>{' '}
              Repeat purchase is precisely what Store #1 and the Passport exist to prove.
            </p>
          </div>

          <div className="relative">
            {/* The Passport as a card. Concept — the loyalty engine is built, the Passport wrapper is not yet live. */}
            <div className="from-secondary/40 via-secondary/10 relative overflow-hidden rounded-2xl border border-white/12 bg-gradient-to-br to-transparent p-6 sm:rounded-3xl sm:p-8">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <span className="text-xs font-bold tracking-[0.2em] text-white/50 uppercase">
                    Snack Quest
                  </span>
                  <p className="font-display mt-1 text-2xl leading-none text-white sm:text-3xl">
                    Passport
                  </p>
                </div>
                <Image src="/deck/logo.png" alt="" width={48} height={48} className="size-12 rounded-xl" loading="lazy" />
              </div>

              <div className="mt-7 grid grid-cols-5 gap-2.5" aria-hidden="true">
                {Array.from({ length: 15 }, (_, index) => (
                  <span
                    key={index}
                    className={`flex aspect-square items-center justify-center rounded-lg border text-xs font-bold ${
                      index < 3
                        ? 'border-primary/60 bg-primary/25 text-white'
                        : 'border-white/10 bg-white/[0.04] text-white/25'
                    }`}
                  >
                    {index + 1}
                  </span>
                ))}
              </div>
              <p className="mt-5 text-sm text-white/70">
                Fifteen orders, one free box. Refer a friend, earn credit, spend it on your next
                quest.
              </p>
              <p className="mt-3 text-xs text-white/40">
                Concept design. The wallet credit and referral mechanics behind it already run in
                production; the Passport is how we intend to present them.
              </p>
            </div>
          </div>
        </div>
      </Section>

      {/* ── TRACTION ────────────────────────────────────────── */}
      <Section id="traction" labelledBy="traction-title" className={INK}>
        <Eyebrow>Traction</Eyebrow>
        <Title id="traction-title">We’re early — but people are paying attention.</Title>
        <Lede>
          Every figure below is counted, not estimated. The trading numbers come from our own order
          records; the TikTok numbers are TikTok’s.
        </Lede>

        <div className="mt-10 grid gap-3.5 sm:mt-12 sm:grid-cols-2 sm:gap-5 lg:grid-cols-4">
          <Metric value={String(TRACTION.paidOrders)} label="Paid orders" />
          <Metric value={formatKsh(TRACTION.revenueKes)} label="Revenue" accent="lime" />
          <Metric value={TIKTOK.profileViewsToDate} label="TikTok profile views" accent="purple" />
          <Metric value={String(TIKTOK.sharesToDate)} label="Shares" />
        </div>
        <p className="mt-5 text-xs text-white/45 sm:text-sm">Results as of {TRACTION_AS_OF}.</p>

        <div className="mt-12 grid gap-8 lg:grid-cols-[0.85fr_1fr] lg:items-center lg:gap-14">
          <figure className="overflow-hidden rounded-2xl border border-white/10">
            <Image
              src={TIKTOK.screenshot.src}
              alt={`TikTok's analytics screen for ${TIKTOK.handle}, ${TIKTOK.screenshot.window}: ${TIKTOK.screenshot.postViews} post views, ${TIKTOK.screenshot.likes} likes, ${TIKTOK.screenshot.comments} comments, ${TIKTOK.screenshot.shares} shares.`}
              width={739}
              height={1340}
              sizes="(min-width: 1024px) 420px, 100vw"
              className="h-auto w-full"
              loading="lazy"
            />
            <figcaption className="bg-black/40 px-4 py-3 text-xs leading-relaxed text-white/55">
              TikTok’s own analytics for {TIKTOK.handle}, {TIKTOK.screenshot.window} — a 28-day
              window, which is why these differ from the running totals above.
            </figcaption>
          </figure>

          <div className="flex flex-col gap-5">
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-6 sm:p-7">
              <h3 className="text-base font-bold text-white sm:text-lg">What the numbers say</h3>
              <p className="mt-3 text-sm leading-relaxed text-white/70 sm:text-base">
                {TRACTION.paidOrders} people paid for a box at an average of{' '}
                {formatKsh(AVERAGE_ORDER_KES)} — ahead of the {formatKsh(3500)} the store model
                assumes. {TRACTION.reviewCount} of them left public reviews, averaging{' '}
                {TRACTION.reviewAverage} out of 5. Demand arrived from TikTok before we spent
                anything on advertising.
              </p>
            </div>
            <div className="border-primary/25 bg-primary/[0.06] rounded-2xl border p-6 sm:p-7">
              <h3 className="text-base font-bold text-white sm:text-lg">
                And what they don’t say yet
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-white/70 sm:text-base">
                This is a few weeks of trading, not a trend. Nobody has ordered twice yet, we have
                no store, and the margin is measured over a small number of orders. We’re still
                early. The purpose of this raise is to turn the initial demand signal into a
                repeatable physical and digital business.
              </p>
            </div>
          </div>
        </div>
      </Section>

      {/* ── THE RAISE ───────────────────────────────────────── */}
      <Section id="raise" labelledBy="raise-title" className={INK_SOFT}>
        <Eyebrow>The raise</Eyebrow>
        <Title id="raise-title">We’re raising {RAISE_HEADLINE}</Title>
        <p className="mt-5 max-w-2xl text-lg font-semibold text-white/85 sm:text-xl">
          {RAISE_PURPOSE}
        </p>

        <div className="mt-10 flex flex-col gap-3.5 sm:mt-12 sm:gap-4">
          {ALLOCATIONS.map((item) => (
            <div
              key={item.id}
              className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 sm:rounded-3xl sm:p-7"
            >
              <div className="grid gap-3 sm:grid-cols-[minmax(170px,auto)_1fr] sm:gap-6">
                <span className="font-display block text-[clamp(1.6rem,5vw,2.25rem)] leading-none text-white tabular-nums">
                  {formatKsh(item.amountKes)}
                </span>
                <div>
                  <h3 className="text-base font-bold tracking-tight text-white sm:text-lg">
                    {item.label}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-white/65 sm:text-base">
                    {item.body}
                  </p>
                </div>
              </div>
              {/*
                The share of the raise, across the full card rather than
                inside the number's column — confined to ~170px the five
                bars differed by a few pixels each and showed nothing.
                Here 2.5M is visibly most of the row and 200K is visibly
                a sliver, which is the whole point of drawing it.
              */}
              <div
                aria-hidden="true"
                className="mt-5 h-1.5 w-full overflow-hidden rounded-full bg-white/[0.07]"
              >
                <span
                  className="from-primary to-home-orange-glow block h-full rounded-full bg-gradient-to-r"
                  style={{ width: `${(item.amountKes / RAISE_TOTAL_KES) * 100}%` }}
                />
              </div>
              <span className="mt-2 block text-xs text-white/40">
                {Math.round((item.amountKes / RAISE_TOTAL_KES) * 100)}% of the raise
              </span>
            </div>
          ))}

          <div className="border-primary/40 bg-primary/10 flex items-baseline justify-between gap-4 rounded-2xl border p-5 sm:rounded-3xl sm:p-7">
            <span className="text-sm font-bold tracking-[0.16em] text-white/70 uppercase sm:text-base">
              Total
            </span>
            <span className="font-display text-[clamp(1.6rem,5vw,2.5rem)] leading-none text-white tabular-nums">
              {formatKsh(RAISE_TOTAL_KES)}
            </span>
          </div>
        </div>

        {/* How the money moves. */}
        <div className="mt-14">
          <h3 className="font-display text-[clamp(1.4rem,4vw,2rem)] leading-tight text-white">
            How the {RAISE_HEADLINE} moves through the business
          </h3>
          <ol className="mt-7 flex flex-col gap-2.5">
            {[
              ['Capital', 'The raise closes.'],
              ['Product', 'Stock lands — the assortment that makes discovery real.'],
              ['Store', 'Store #1 opens, fitted and stocked.'],
              ['Content + customer acquisition', 'The studio and the marketing bring people to it.'],
              ['Repeat customers', 'The Passport turns first orders into second ones.'],
              ['Proven store model', 'Economics, product mix and operations, evidenced.'],
              ['Replication', 'The playbook is repeatable — and fundable on its own terms.'],
            ].map(([step, body], index, all) => (
              <li key={step} className="flex items-start gap-4">
                <span className="flex flex-col items-center self-stretch">
                  <span className="bg-primary/20 text-primary flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-bold tabular-nums">
                    {index + 1}
                  </span>
                  {index === all.length - 1 ? null : (
                    <span aria-hidden="true" className="mt-1 w-px flex-1 bg-white/15" />
                  )}
                </span>
                <span className="pt-1.5 pb-4">
                  <b className="block text-sm font-bold tracking-[0.12em] text-white uppercase sm:text-base">
                    {step}
                  </b>
                  <span className="mt-1 block text-sm text-white/60 sm:text-base">{body}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>
      </Section>

      {/* ── WHY THIS MUCH ───────────────────────────────────── */}
      <Section labelledBy="why-title" className={INK}>
        <Eyebrow>Why {RAISE_HEADLINE}</Eyebrow>
        <Title id="why-title">We’re raising enough to actually build the engine.</Title>
        <Lede>
          Opening the store alone is not enough. A shop with thin shelves, no marketing and no
          runway is a shop that closes before it has learned anything. So the raise covers the
          whole machine:
        </Lede>
        <ul className="mt-9 grid gap-3.5 sm:grid-cols-2 sm:gap-4">
          {[
            'Inventory customers actually want to discover.',
            'A physical environment worth visiting.',
            'Working capital to operate through the early months.',
            'Marketing to bring customers into the ecosystem.',
            'A content engine to continuously produce product-led content.',
            'Livestreaming and social commerce capability.',
            'The ability to learn and optimise before scaling.',
          ].map((point) => (
            <li
              key={point}
              className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/[0.04] p-4 text-sm text-white/80 sm:text-base"
            >
              <Check />
              {point}
            </li>
          ))}
        </ul>
        <p className="mt-8 max-w-3xl text-base leading-relaxed text-white/70 sm:text-lg">
          The {RAISE_HEADLINE} raise is intended to give Store #1 a real chance to prove the
          complete model — not to open a door and hope.
        </p>
      </Section>

      {/* ── REPLICATION ─────────────────────────────────────── */}
      <Section labelledBy="replication-title" className={INK_SOFT}>
        <Eyebrow>Where it goes</Eyebrow>
        <Title id="replication-title">Store #1 is the beginning, not the destination.</Title>
        <div className="mt-9">
          <Flow
            label="From one store to a brand"
            steps={[
              'Store #1',
              'Prove the model',
              'Document the playbook',
              'Replicate',
              'Multiple locations',
              'National brand',
            ]}
          />
        </div>
        <div className="mt-10 rounded-2xl border border-white/10 bg-white/[0.04] p-6 sm:rounded-3xl sm:p-8">
          <h3 className="text-base font-bold text-white sm:text-lg">What Store #1 has to prove</h3>
          <ul className="mt-5 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-5">
            {[
              'Product mix',
              'Customer behaviour',
              'Store economics',
              'Repeat purchase',
              'Loyalty',
              'Content acquisition',
              'Supply chain',
              'Staffing',
              'Operations',
              'Marketing economics',
            ].map((item) => (
              <li
                key={item}
                className="rounded-lg border border-white/10 bg-white/[0.03] px-3.5 py-2.5 text-sm text-white/75"
              >
                {item}
              </li>
            ))}
          </ul>
          <p className="mt-6 text-sm leading-relaxed text-white/60 sm:text-base">
            That list is the bridge from a single store to a scalable brand. Until it is answered
            with evidence, a second location would be a guess repeated twice.
          </p>
        </div>
      </Section>

      {/* ── BIGGER VISION ───────────────────────────────────── */}
      <Section labelledBy="vision-title" className={INK}>
        <Eyebrow>The bigger vision</Eyebrow>
        <Title id="vision-title">
          We want Snack Quest to become the place people think of when they want to discover
          something delicious and unexpected.
        </Title>
        <ul className="mt-10 flex flex-wrap gap-2.5 sm:mt-12 sm:gap-3">
          {[
            { label: 'Stores', icon: Store },
            { label: 'E-commerce', icon: ShoppingBag },
            { label: 'Snack boxes', icon: Gift },
            { label: 'Gifting', icon: Heart },
            { label: 'Creators', icon: Users },
            { label: 'Loyalty', icon: Repeat },
            { label: 'Private label', icon: Sparkles },
            { label: 'Replication', icon: Globe2 },
          ].map(({ label, icon: Icon }) => (
            <li
              key={label}
              className="flex items-center gap-2.5 rounded-full border border-white/15 bg-white/[0.05] px-4 py-2.5 text-sm font-semibold text-white/85 sm:px-5 sm:py-3 sm:text-base"
            >
              <Icon className="text-primary size-4 shrink-0" aria-hidden="true" />
              {label}
            </li>
          ))}
        </ul>
      </Section>

      {/* ── FOUNDER ─────────────────────────────────────────── */}
      <Section labelledBy="founder-title" className={INK_SOFT}>
        <div className="grid gap-10 lg:grid-cols-[0.8fr_1fr] lg:items-center lg:gap-14">
          <figure className="overflow-hidden rounded-2xl sm:rounded-3xl">
            <div className="relative aspect-[4/5] w-full">
              <Image
                src="/deck/shot-founder.webp"
                alt="Kelvin Kimathi, founder of Snack Quest, seated with an open Snack Quest box."
                fill
                sizes="(min-width: 1024px) 460px, 100vw"
                className="object-cover"
                loading="lazy"
              />
            </div>
          </figure>
          <div>
            <Eyebrow>The founder</Eyebrow>
            <Title id="founder-title">Built by Kelvin Kimathi</Title>
            <div className="mt-6 flex flex-col gap-4 text-base leading-relaxed text-white/70 sm:text-lg">
              <p>
                Kelvin never planned to start a snack company. Working alongside Chinese colleagues
                opened up a world of snacks he’d never seen before — some surprised him, some became
                an instant favourite, and that feeling of discovering something unexpected felt
                worth sharing.
              </p>
              <p>
                Today, every snack in a Snack Quest box has been personally tasted and selected, so
                that same sense of discovery reaches whoever opens the box next. He packs the
                boxes, answers the messages, and appears in most of the videos.
              </p>
              <p className="text-white/85">
                Store #1 is the next version of that idea: instead of sending the discovery to
                someone’s door, giving them somewhere to walk into and find it themselves.
              </p>
            </div>
          </div>
        </div>
      </Section>

      {/* ── INTEREST FORM ───────────────────────────────────── */}
      <Section id="investor-interest" labelledBy="interest-title" className={INK}>
        <div className="mx-auto max-w-3xl text-center">
          <Eyebrow>Investor interest</Eyebrow>
          <Title id="interest-title">Want to be part of the journey?</Title>
          <Lede>
            <span className="mx-auto block">
              We’re currently speaking with potential investors who believe in what Snack Quest can
              become. Submit your details if you’d like to learn more and be considered for the
              opportunity.
            </span>
          </Lede>
        </div>

        <div className="mx-auto mt-10 w-full max-w-2xl rounded-2xl border border-white/10 bg-white/[0.03] p-6 sm:mt-12 sm:rounded-3xl sm:p-10">
          <h3 className="font-display mb-7 text-center text-2xl text-white sm:text-3xl">
            Express your investor interest
          </h3>
          <InterestForm />
        </div>
      </Section>

      {/* ── FAQ ─────────────────────────────────────────────── */}
      <Section id="faq" labelledBy="faq-title" className={INK_SOFT}>
        <Eyebrow>Questions</Eyebrow>
        <Title id="faq-title">Investor FAQ</Title>
        <div className="mt-9 flex flex-col gap-2.5 sm:mt-12">
          {INVEST_FAQ.map((item) => (
            <details
              key={item.question}
              className="group rounded-xl border border-white/10 bg-white/[0.04] px-5 py-4 sm:rounded-2xl sm:px-6 sm:py-5"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-left text-base font-semibold text-white marker:hidden sm:text-lg">
                {item.question}
                <span
                  aria-hidden="true"
                  className="text-primary shrink-0 text-xl transition-transform group-open:rotate-45"
                >
                  +
                </span>
              </summary>
              <p className="mt-3 text-sm leading-relaxed text-white/65 sm:text-base">
                {item.answer}
              </p>
            </details>
          ))}
        </div>
      </Section>

      {/* ── FINAL CTA ───────────────────────────────────────── */}
      <section className={`${INK} relative overflow-hidden px-5 py-20 sm:px-8 sm:py-28`}>
        <div className="absolute inset-0">
          <Image
            src="/deck/shot-aisles.webp"
            alt=""
            fill
            sizes="100vw"
            className="object-cover opacity-30"
            loading="lazy"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-[#120c22]/90 via-[#120c22]/80 to-[#120c22]" />
        </div>
        <div className="relative mx-auto max-w-3xl text-center">
          <h2 className="font-display text-[clamp(2rem,6.5vw,3.5rem)] leading-[1.07] tracking-tight text-white text-balance">
            The world is full of snacks worth discovering.
          </h2>
          <p className="mt-5 text-lg text-white/75 sm:text-xl">
            We’re building the place to discover them.
          </p>
          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <InvestCta source="final" size="lg" className="w-full sm:w-auto">
              Express investor interest
            </InvestCta>
            <Link
              href="/"
              className="inline-flex w-full items-center justify-center rounded-full border border-white/25 px-8 py-4 text-base font-semibold text-white transition-colors hover:bg-white/10 sm:w-auto"
            >
              Explore Snack Quest
            </Link>
          </div>
          <p className="mx-auto mt-10 max-w-2xl text-xs leading-relaxed text-white/40">
            {INTEREST_DISCLAIMER}
          </p>
        </div>
      </section>

      <footer className={`${INK} border-t border-white/10 px-5 py-8 text-center sm:px-8`}>
        <p className="text-xs text-white/40">
          © {new Date().getFullYear()} Snack Quest ·{' '}
          <Link href="/" className="underline underline-offset-4 hover:text-white/70">
            snackquests.shop
          </Link>
        </p>
      </footer>
    </>
  );
}

/* Small marks, kept local — they exist only inside this page's lists. */
function Check() {
  return (
    <span
      aria-hidden="true"
      className="bg-primary/20 text-primary mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold"
    >
      ✓
    </span>
  );
}

function Dot() {
  return (
    <span
      aria-hidden="true"
      className="bg-secondary/30 mt-2 size-2 shrink-0 rounded-full"
    />
  );
}
