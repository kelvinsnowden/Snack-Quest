import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ArrowRight,
  Boxes,
  Camera,
  CreditCard,
  Globe,
  LineChart,
  MapPin,
  Megaphone,
  Package,
  Repeat as RepeatIcon,
  Rocket,
  Settings,
  Smartphone,
  TrendingUp,
  Truck,
  Wallet,
  Building2,
  GraduationCap,
  Hotel,
  Landmark,
  ShoppingBag,
  TrainFront,
} from 'lucide-react';
import { buildPageMetadata } from '@/lib/seo/pageMetadata';
import { OwnNav } from '@/components/marketing/own/OwnNav';
import { OwnCta } from '@/components/marketing/own/OwnCta';
import { MobileOwnBar } from '@/components/marketing/own/MobileOwnBar';
import { ApplicationForm } from '@/components/marketing/own/ApplicationForm';
import { HeroImagePlaceholder } from '@/components/marketing/own/HeroImagePlaceholder';
import { DashboardImagePlaceholder } from '@/components/marketing/own/DashboardImagePlaceholder';
import { LocationPhotoCard } from '@/components/marketing/own/LocationPhotoCard';
import { LOCATION_TYPES } from '@/types/machineOwnerInterest';

const TITLE = 'Own a Snack Quest Discovery Machine | Machine Ownership';
const DESCRIPTION =
  'Own the retail asset without building the retail operation. Buy a Snack Quest Discovery Machine, secure the location, and Snack Quest runs the system that keeps it operating.';

export const metadata: Metadata = buildPageMetadata({
  title: TITLE,
  description: DESCRIPTION,
  path: '/own',
  image: '/deck/og.jpg',
});

const INK = 'bg-black';
const INK_SOFT = 'bg-[#0c0c0c]';

/**
 * The reference design cycles through a full accent set — not just
 * brand orange — across every icon grid on this page (location types,
 * the offer stack, the portal checklist). `home-lime`/`secondary` are
 * existing brand tokens; pink and blue are this page's own two
 * one-off accents (same convention as its other literal hex values)
 * added specifically for that variety.
 */
const ACCENT = {
  orange: 'text-primary',
  pink: 'text-[#ff3fa3]',
  lime: 'text-home-lime',
  blue: 'text-[#3aa9ff]',
  purple: 'text-secondary',
  green: 'text-[#2ecc71]',
} as const;

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <span className="mb-4 inline-block text-xs font-bold tracking-[0.2em] text-[#ff3fa3] uppercase">{children}</span>;
}

function Section({ id, className, children }: { id?: string; className?: string; children: React.ReactNode }) {
  return (
    <section id={id} className={`scroll-mt-20 px-5 py-16 sm:px-8 sm:py-24 ${className ?? ''}`}>
      <div className="mx-auto w-full max-w-[1200px]">{children}</div>
    </section>
  );
}

/** Headlines on this page render in caps deliberately — see the page's own doc comment: "Direct. Confident. Commercial. Specific. Slightly provocative" calls for a bolder register than the /invest page's sentence case. */
function Statement({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="font-display text-[clamp(1.9rem,6vw,3.25rem)] leading-[1.08] tracking-tight text-balance text-white uppercase">
      {children}
    </h2>
  );
}

function Lede({ children }: { children: React.ReactNode }) {
  return <p className="mt-5 max-w-2xl text-base leading-relaxed text-white/70 sm:text-lg">{children}</p>;
}

/** A quiet bordered card that carries one key statement, with an icon rather than a filled block — used everywhere this page needs to make a line stand out without another slab of colour. */
function EmphasisCard({ icon: Icon, children }: { icon: typeof ArrowRight; children: React.ReactNode }) {
  return (
    <div className="mt-12 flex flex-col items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.04] p-8 text-center sm:mt-14 sm:rounded-3xl sm:p-12">
      <span className="bg-primary/15 text-primary flex size-11 shrink-0 items-center justify-center rounded-xl">
        <Icon className="size-5" aria-hidden="true" />
      </span>
      {children}
    </div>
  );
}

const LOCATION_META: Record<string, { icon: typeof Building2; accent: string }> = {
  mall: { icon: ShoppingBag, accent: ACCENT.blue },
  office: { icon: Building2, accent: ACCENT.orange },
  university: { icon: GraduationCap, accent: ACCENT.lime },
  hotel: { icon: Hotel, accent: ACCENT.pink },
  hospital: { icon: Landmark, accent: ACCENT.blue },
  apartment: { icon: Building2, accent: ACCENT.green },
  bnb: { icon: Hotel, accent: ACCENT.purple },
  transport_hub: { icon: TrainFront, accent: ACCENT.orange },
  other: { icon: Building2, accent: ACCENT.orange },
};

const STACK_ITEMS = [
  { icon: Package, title: 'Discovery Machine', body: 'The physical retail asset.', accent: ACCENT.orange },
  { icon: Globe, title: 'International Snack Supply', body: 'Products selected and replenished through Snack Quest.', accent: ACCENT.pink },
  { icon: Smartphone, title: 'Software', body: 'Your connected management layer.', accent: ACCENT.pink },
  { icon: CreditCard, title: 'Payments', body: 'Connected transaction infrastructure.', accent: ACCENT.orange },
  { icon: Truck, title: 'Restocking', body: 'Ongoing supply and inventory management.', accent: ACCENT.green },
  { icon: Settings, title: 'Operations', body: 'We help run the operational layer.', accent: ACCENT.orange },
  { icon: Megaphone, title: 'Marketing', body: 'Brand support to drive awareness.', accent: ACCENT.orange },
  { icon: Camera, title: 'Data + Cameras', body: 'Sales, product data and remote monitoring.', accent: ACCENT.pink },
] as const;

const PORTAL_ITEMS = [
  { icon: Package, label: 'Multiple machines', accent: ACCENT.orange },
  { icon: LineChart, label: 'Sales & transactions', accent: ACCENT.green },
  { icon: Boxes, label: 'Inventory levels', accent: ACCENT.blue },
  { icon: Settings, label: 'Machine status', accent: ACCENT.orange },
  { icon: MapPin, label: 'Location management', accent: ACCENT.pink },
  { icon: TrendingUp, label: 'Product performance', accent: ACCENT.orange },
  { icon: Camera, label: 'Live camera monitoring', accent: ACCENT.pink },
  { icon: LineChart, label: 'Demand data', accent: ACCENT.blue },
] as const;

const PROCESS_STEPS = [
  { icon: Package, step: 'Buy', body: 'Discovery Machine' },
  { icon: MapPin, step: 'Place', body: 'Your location' },
  { icon: Settings, step: 'Operate', body: 'Snack Quest management' },
  { icon: LineChart, step: 'Learn', body: 'Sales + demand data' },
  { icon: TrendingUp, step: 'Expand', body: 'Acquire another machine' },
  { icon: RepeatIcon, step: 'Repeat', body: 'Multiple locations' },
] as const;

const FAQS = [
  {
    q: 'How much does a Discovery Machine cost?',
    a: 'Capital ranges vary by setup. Tell us your starting point in the application and we’ll walk you through the real options.',
  },
  {
    q: 'Do I need experience running a business?',
    a: 'No. Snack Quest operates the machine day-to-day — you own the asset and the location relationship.',
  },
  {
    q: 'What if I don’t have a location yet?',
    a: 'That’s fine. Tell us what access you have — including relationships that could open doors — and we’ll help you think it through.',
  },
  {
    q: 'How long does the application take?',
    a: 'A few minutes. We review every application personally and follow up about next steps.',
  },
  {
    q: 'Can I own more than one machine?',
    a: 'Yes. Many owners start with one and expand once it’s performing, using the same operating layer.',
  },
] as const;

export default function OwnPage() {
  return (
    <>
      <OwnNav />
      <MobileOwnBar />

      {/* ── SECTION 1 — THE HOOK ─────────────────────────────── */}
      <section className={`${INK} relative overflow-hidden px-5 pt-28 pb-16 sm:px-8 sm:pt-36 sm:pb-24`}>
        <div className="relative mx-auto grid w-full max-w-[1200px] gap-14 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:items-center lg:gap-16">
          <div>
            <Statement>
              What if you could own the <span className="from-primary to-home-orange-glow bg-gradient-to-r bg-clip-text text-transparent">retail asset</span>{' '}
              without building the <span className="text-home-lime">retail operation?</span>
            </Statement>
            <p className="mt-6 max-w-xl text-base leading-relaxed text-white/70 sm:text-lg">
              Buy a Snack Quest Discovery Machine. Secure the right location. We provide the system that keeps it running.
            </p>

            <ul className="mt-10 grid grid-cols-3 gap-3 border-t border-white/10 pt-8 sm:gap-4">
              <TrustItem icon={Package} title="You" detail="Own the machine" />
              <TrustItem icon={MapPin} title="Connections" detail="Secure the location" />
              <TrustItem icon={Settings} title="Snack Quest" detail="Runs the operation" />
            </ul>

            <div className="mt-10 flex flex-col items-start gap-3">
              <OwnCta source="hero" size="lg" className="uppercase">
                Apply to own a machine
                <ArrowRight className="size-5" aria-hidden="true" />
              </OwnCta>
              <p className="text-sm text-white/45">For people with capital, location access, or both.</p>
            </div>
          </div>

          <div className="mx-auto w-full max-w-md lg:mx-0 lg:max-w-none">
            <HeroImagePlaceholder variant="landscape" />
          </div>
        </div>
      </section>

      {/* ── SECTION 2 — THE LOCATION MATTERS MOST ───────────── */}
      <Section id="locations" className={INK_SOFT}>
        <Eyebrow>01 · The opportunity</Eyebrow>
        <Statement>
          The <span className="text-primary">location</span> is the most important part of the business.
        </Statement>

        <div className="mt-10 grid gap-8 sm:mt-12 lg:grid-cols-2 lg:gap-14">
          <div className="flex flex-col gap-4 text-base leading-relaxed text-white/75 sm:text-lg">
            <p>A great machine in a weak location can struggle.</p>
            <p>A great location gives the machine access to the people who can actually buy from it.</p>
            <p>That’s why we’re looking for owners who can bring more than capital.</p>
          </div>
          <div>
            <p className="mb-3 text-xs font-bold tracking-[0.18em] text-white/45 uppercase">Places our machines can go</p>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 lg:grid-cols-2">
              {LOCATION_TYPES.filter((option) => option.value !== 'other').map((option) => {
                const meta = LOCATION_META[option.value];
                return <LocationPhotoCard key={option.value} icon={meta.icon} label={option.label} accentClassName={meta.accent} />;
              })}
            </div>
          </div>
        </div>

        <div className="mt-10 rounded-2xl border border-white/10 bg-white/[0.04] p-6 sm:mt-12 sm:p-8">
          <p className="text-lg font-semibold text-white sm:text-xl">If you can open doors, we can help you build what goes behind them.</p>
          <p className="mt-3 text-sm leading-relaxed text-white/50 sm:text-base">
            Location performance depends on traffic, customer profile, product mix, pricing and operating conditions. We don’t promise
            that any particular location will be profitable — your network is an advantage, not a guarantee.
          </p>
        </div>
      </Section>

      {/* ── SECTION 3 — THE OFFER STACK ─────────────────────── */}
      <Section id="stack" className={INK}>
        <Eyebrow>02 · The offer</Eyebrow>
        <Statement>
          You’re not <span className="text-primary">just</span> buying a machine.
        </Statement>
        <Lede>You get a physical asset and a complete system around it.</Lede>

        <div className="mt-10 grid gap-3 sm:mt-12 sm:grid-cols-2 lg:grid-cols-4">
          {STACK_ITEMS.map((item) => (
            <div key={item.title} className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
              <span className={`mb-3 flex size-10 items-center justify-center rounded-xl bg-white/10 ${item.accent}`}>
                <item.icon className="size-5" aria-hidden="true" />
              </span>
              <p className="text-sm font-bold text-white">{item.title}</p>
              <p className="mt-1 text-xs leading-relaxed text-white/55">{item.body}</p>
            </div>
          ))}
        </div>

        <EmphasisCard icon={Boxes}>
          <p className="font-display text-[clamp(1.5rem,4.5vw,2.5rem)] leading-tight text-white uppercase">
            You own the machine. We provide the operating layer.
          </p>
          <p className="mt-4 text-sm text-white/50 sm:text-base">
            Performance depends on your location, demand, product mix, pricing and operating conditions — not a guarantee we make you.
          </p>
        </EmphasisCard>
      </Section>

      {/* ── SECTION 4 — THE OWNER PORTAL ────────────────────── */}
      <Section id="portal" className={INK_SOFT}>
        <Eyebrow>03 · Your dashboard</Eyebrow>
        <Statement>
          Your machines. Your data. All <span className="text-primary">in</span> one place.
        </Statement>
        <Lede>Manage one machine or several from your own owner portal.</Lede>

        <div className="mt-10 grid gap-8 sm:mt-12 lg:grid-cols-2 lg:items-center lg:gap-12">
          <DashboardImagePlaceholder className="mx-auto w-full max-w-sm lg:mx-0 lg:max-w-none" />

          <ul className="flex flex-col gap-2.5">
            {PORTAL_ITEMS.map((item) => (
              <li key={item.label} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3">
                <item.icon className={`size-4 shrink-0 ${item.accent}`} aria-hidden="true" />
                <span className="text-sm font-medium text-white/85">{item.label}</span>
              </li>
            ))}
          </ul>
        </div>

        <EmphasisCard icon={Boxes}>
          <p className="font-display text-[clamp(1.3rem,4vw,2rem)] leading-tight text-white uppercase">One portal. Every machine you own.</p>
        </EmphasisCard>
      </Section>

      {/* ── SECTION 5 — HOW IT WORKS / THE REPEAT ───────────── */}
      <Section id="how-it-works" className={INK}>
        <Eyebrow>04 · Scale it</Eyebrow>
        <Statement>The first machine is the test. The second is the repeat.</Statement>

        <ol className="mt-10 grid gap-3 sm:mt-12 sm:grid-cols-2 lg:grid-cols-3">
          {PROCESS_STEPS.map((item, index) => (
            <li key={item.step} className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
              <span className="bg-primary/15 text-primary flex size-10 shrink-0 items-center justify-center rounded-full">
                <item.icon className="size-4.5" aria-hidden="true" />
              </span>
              <span>
                <b className="block text-xs font-bold tracking-[0.12em] text-white/45 uppercase">
                  {String(index + 1).padStart(2, '0')} · {item.step}
                </b>
                <span className="mt-0.5 block text-sm font-semibold text-white">{item.body}</span>
              </span>
            </li>
          ))}
        </ol>

        <p className="mt-8 max-w-2xl text-base leading-relaxed text-white/75 sm:text-lg">
          If your first machine performs well, you don’t have to start from zero again. You already have:
        </p>
        <ul className="mt-6 grid gap-2.5 sm:grid-cols-2">
          {[
            'the relationship with Snack Quest',
            'the management system',
            'the supply network',
            'the software',
            'the operating process',
            'the data',
            'the experience',
          ].map((item) => (
            <li key={item} className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white/80 sm:text-base">
              {item}
            </li>
          ))}
        </ul>

        <EmphasisCard icon={TrendingUp}>
          <p className="font-display text-[clamp(1.3rem,4vw,2rem)] leading-tight text-white uppercase">One machine can become a portfolio.</p>
          <p className="max-w-md text-sm text-white/70 sm:text-base">Each additional machine plugs into the same Snack Quest operating layer.</p>
          <p className="text-xs text-white/45 sm:text-sm">Expansion depends on capital, location access and machine performance.</p>
        </EmphasisCard>
      </Section>

      {/* ── SECTION 6 — QUALIFICATION ────────────────────────── */}
      <Section className={INK_SOFT}>
        <Eyebrow>05 · Is this for you?</Eyebrow>
        <Statement>This is for people who have capital, connections or both.</Statement>

        <div className="mt-10 grid gap-4 sm:mt-12 sm:grid-cols-3">
          <QualifyCard icon={Wallet} title="Capital" body="You can comfortably acquire and deploy the machine." accent="orange" />
          <QualifyCard icon={MapPin} title="Connections" body="You can access strong commercial locations." accent="lime" />
          <QualifyCard icon={Rocket} title="Ambition" body="You want the option to build beyond one machine." accent="purple" />
        </div>

        <EmphasisCard icon={ArrowRight}>
          <p className="font-display text-[clamp(1.2rem,3.5vw,1.75rem)] leading-tight text-white uppercase">
            If you have two of the three, we should talk.
          </p>
        </EmphasisCard>

        <div className="mt-8 flex flex-col items-center gap-3 sm:mt-10">
          <OwnCta source="qualification" size="lg">
            Apply to become a machine owner
            <ArrowRight className="size-5" aria-hidden="true" />
          </OwnCta>
          <p className="text-sm text-white/45">Tell us what you have access to. We’ll determine whether the model fits.</p>
        </div>
      </Section>

      {/* ── SECTION 7 — FAQ ──────────────────────────────────── */}
      <Section id="faq" className={INK}>
        <div className="mx-auto max-w-3xl">
          <Eyebrow>FAQ</Eyebrow>
          <Statement>Questions people ask before applying.</Statement>

          <div className="mt-10 flex flex-col gap-3 sm:mt-12">
            {FAQS.map((item) => (
              <div key={item.q} className="rounded-2xl border border-white/10 bg-white/[0.04] p-6">
                <p className="text-base font-bold text-white sm:text-lg">{item.q}</p>
                <p className="mt-2 text-sm leading-relaxed text-white/65 sm:text-base">{item.a}</p>
              </div>
            ))}
          </div>
        </div>
      </Section>

      {/* ── LEAD FORM ────────────────────────────────────────── */}
      <Section id="apply" className={INK_SOFT}>
        <div className="mx-auto max-w-3xl text-center">
          <Eyebrow>Apply</Eyebrow>
          <Statement>Let’s see what you can build.</Statement>
        </div>
        <div className="mx-auto mt-10 w-full max-w-2xl rounded-2xl border border-white/10 bg-white/[0.03] p-6 sm:mt-12 sm:rounded-3xl sm:p-10">
          <ApplicationForm />
        </div>
      </Section>

      {/* ── FINAL SCREEN ─────────────────────────────────────── */}
      <section className={`${INK} relative flex min-h-[80vh] flex-col items-center justify-center overflow-hidden px-5 py-24 text-center sm:px-8`}>
        <div className="mx-auto w-full max-w-xs sm:max-w-sm">
          <HeroImagePlaceholder />
        </div>
        <div className="relative mx-auto mt-12 max-w-3xl sm:mt-16">
          <Statement>Own the first one. Let the system help you build the next.</Statement>
          <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-white/70 sm:text-lg">
            Your capital buys the asset. Your connections create the opportunity. Snack Quest provides the operating layer.
          </p>
          <div className="mt-9 flex flex-col items-center gap-3">
            <OwnCta source="final" size="lg">
              Apply to become a machine owner
              <ArrowRight className="size-5" aria-hidden="true" />
            </OwnCta>
            <p className="text-sm text-white/45">Capital + location access preferred.</p>
          </div>
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

function TrustItem({ icon: Icon, title, detail }: { icon: typeof Package; title: string; detail: string }) {
  return (
    <li className="flex flex-col items-start gap-2">
      <span className="border-primary/30 text-primary flex size-9 items-center justify-center rounded-full border">
        <Icon className="size-4" aria-hidden="true" />
      </span>
      <span>
        <span className="block text-xs font-bold tracking-[0.1em] text-white/50 uppercase">{title}</span>
        <span className="block text-sm font-semibold text-white">{detail}</span>
      </span>
    </li>
  );
}

function QualifyCard({
  icon: Icon,
  title,
  body,
  accent,
}: {
  icon: typeof Wallet;
  title: string;
  body: string;
  accent: 'orange' | 'lime' | 'purple';
}) {
  const border = accent === 'orange' ? 'border-primary/40' : accent === 'lime' ? 'border-home-lime/40' : 'border-secondary/40';
  const tone = accent === 'orange' ? ACCENT.orange : accent === 'lime' ? ACCENT.lime : ACCENT.purple;
  const chipBg = accent === 'orange' ? 'bg-primary/15' : accent === 'lime' ? 'bg-home-lime/15' : 'bg-secondary/15';
  return (
    <div className={`rounded-2xl border ${border} bg-white/[0.04] p-7 text-center sm:rounded-3xl`}>
      <span className={`mx-auto mb-4 flex size-11 items-center justify-center rounded-xl ${chipBg} ${tone}`}>
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <span className={`font-display block text-2xl uppercase ${tone}`}>{title}</span>
      <p className="mt-3 text-sm leading-relaxed text-white/70 sm:text-base">{body}</p>
    </div>
  );
}
