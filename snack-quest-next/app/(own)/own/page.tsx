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
} from 'lucide-react';
import { buildPageMetadata } from '@/lib/seo/pageMetadata';
import { OwnNav } from '@/components/marketing/own/OwnNav';
import { OwnCta } from '@/components/marketing/own/OwnCta';
import { MobileOwnBar } from '@/components/marketing/own/MobileOwnBar';
import { ApplicationForm } from '@/components/marketing/own/ApplicationForm';
import { MachinePhoto } from '@/components/marketing/own/MachinePhoto';
import { OwnerPortalPhoto } from '@/components/marketing/own/OwnerPortalPhoto';
import { LocationsCollagePhoto } from '@/components/marketing/own/LocationsCollagePhoto';
import { FaqAccordion } from '@/components/marketing/own/FaqAccordion';
import { RestockingVideo } from '@/components/marketing/own/RestockingVideo';

const TITLE = 'Own a Snack Quest Discovery Machine | Machine Ownership';
const DESCRIPTION =
  'Own the retail asset without building the retail operation. Buy a Snack Quest Discovery Machine, secure the location, and Snack Quest runs the system that keeps it operating.';

export const metadata: Metadata = buildPageMetadata({
  title: TITLE,
  description: DESCRIPTION,
  path: '/own',
  image: '/deck/og.jpg',
});

/**
 * Accents for the icon grids, chosen to read on white: brand orange (in
 * its darker "ink" shade for anything small), purple, green and blue.
 * The earlier neon pink and lime only worked on black.
 */
const ACCENT = {
  orange: 'text-own-accent-ink bg-primary/10',
  purple: 'text-secondary bg-secondary/10',
  green: 'text-success bg-success/10',
  blue: 'text-info bg-info/10',
} as const;

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <span className="mb-5 inline-flex items-center gap-2 text-xs font-bold tracking-[0.2em] text-own-accent-ink uppercase">
      <span aria-hidden="true" className="size-1.5 rounded-full bg-primary" />
      {children}
    </span>
  );
}

function Section({ id, className, children }: { id?: string; className?: string; children: React.ReactNode }) {
  return (
    <section id={id} className={`scroll-mt-20 border-t border-border px-5 py-14 sm:px-8 sm:py-24 ${className ?? ''}`}>
      <div className="mx-auto w-full max-w-[1200px]">{children}</div>
    </section>
  );
}

/** Headlines on this page render in caps deliberately — see the page's own doc comment: "Direct. Confident. Commercial. Specific. Slightly provocative" calls for a bolder register than the /invest page's sentence case. */
function Statement({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="font-display text-[clamp(1.9rem,6vw,3.25rem)] leading-[1.06] tracking-tight text-balance text-foreground uppercase">
      {children}
    </h2>
  );
}

function Lede({ children }: { children: React.ReactNode }) {
  return <p className="mt-5 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">{children}</p>;
}

/** The one line in a section that has to land: large type on a stone panel, an orange chip, nothing louder. */
function EmphasisCard({ icon: Icon, children }: { icon: typeof ArrowRight; children: React.ReactNode }) {
  return (
    <div className="mt-10 flex flex-col items-center gap-3 rounded-3xl bg-surface p-7 text-center sm:mt-14 sm:gap-4 sm:p-12">
      <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
        <Icon className="size-5" aria-hidden="true" />
      </span>
      {children}
    </div>
  );
}

/** Highlighted words inside a statement: the brand orange, darkened just enough to read as large text on white. */
function Hl({ children }: { children: React.ReactNode }) {
  return <span className="text-own-accent-ink">{children}</span>;
}

const STACK_ITEMS = [
  { icon: Package, title: 'Discovery Machine', body: 'The physical retail asset.', accent: ACCENT.orange },
  { icon: Globe, title: 'International Snack Supply', body: 'Products selected and replenished through Snack Quest.', accent: ACCENT.purple },
  { icon: Smartphone, title: 'Software', body: 'Your connected management layer.', accent: ACCENT.purple },
  { icon: CreditCard, title: 'Payments', body: 'Connected transaction infrastructure.', accent: ACCENT.orange },
  { icon: Truck, title: 'Restocking', body: 'Ongoing supply and inventory management.', accent: ACCENT.green },
  { icon: Settings, title: 'Operations', body: 'We help run the operational layer.', accent: ACCENT.orange },
  { icon: Megaphone, title: 'Marketing', body: 'Brand support to drive awareness.', accent: ACCENT.orange },
  { icon: Camera, title: 'Data + Cameras', body: 'Sales, product data and remote monitoring.', accent: ACCENT.purple },
] as const;

const PORTAL_ITEMS = [
  { icon: Package, label: 'Multiple machines', accent: ACCENT.orange },
  { icon: LineChart, label: 'Sales & transactions', accent: ACCENT.green },
  { icon: Boxes, label: 'Inventory levels', accent: ACCENT.blue },
  { icon: Settings, label: 'Machine status', accent: ACCENT.orange },
  { icon: MapPin, label: 'Location management', accent: ACCENT.purple },
  { icon: TrendingUp, label: 'Product performance', accent: ACCENT.orange },
  { icon: Camera, label: 'Live camera monitoring', accent: ACCENT.purple },
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
      <section className="relative overflow-hidden px-5 pt-28 pb-16 sm:px-8 sm:pt-36 sm:pb-24">
        <div className="relative mx-auto grid w-full max-w-[1200px] gap-14 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:items-center lg:gap-16">
          <div>
            <Statement>
              What if one machine could become the start of{' '}
              <span className="bg-gradient-to-r from-primary to-own-accent-ink bg-clip-text text-transparent">your own retail network?</span>
            </Statement>
            <p className="mt-6 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
              Buy a Snack Quest Discovery Machine. Secure the right location. We provide the system that keeps it running.
            </p>

            <ul className="mt-10 grid grid-cols-3 gap-3 border-t border-border pt-8 sm:gap-4">
              <TrustItem icon={Package} title="You" detail="Own the machine" />
              <TrustItem icon={MapPin} title="Connections" detail="Secure the location" />
              <TrustItem icon={Settings} title="Snack Quest" detail="Runs the operation" />
            </ul>

            <div className="mt-10 flex flex-col items-start gap-3">
              <OwnCta source="hero" size="lg" className="uppercase">
                Apply to own a machine
                <ArrowRight className="size-5" aria-hidden="true" />
              </OwnCta>
              <p className="text-sm text-muted-foreground">For people with capital, location access, or both.</p>
            </div>
          </div>

          <div className="mx-auto w-full max-w-md lg:mx-0 lg:max-w-none">
            <MachinePhoto variant="landscape" />
          </div>
        </div>
      </section>

      {/* ── SECTION 2 — THE LOCATION MATTERS MOST ───────────── */}
      <Section id="locations">
        <Eyebrow>01 · The opportunity</Eyebrow>
        <Statement>
          The <Hl>location</Hl> is the most important part of the business.
        </Statement>

        <div className="mt-10 grid gap-8 sm:mt-12 lg:grid-cols-2 lg:gap-14">
          <div className="flex flex-col gap-4 text-base leading-relaxed text-muted-foreground sm:text-lg">
            <p>A great machine in a weak location can struggle.</p>
            <p>A great location gives the machine access to the people who can actually buy from it.</p>
            <p>That’s why we’re looking for owners who can bring more than capital.</p>
          </div>
          <LocationsCollagePhoto />
        </div>

        <div className="mt-10 rounded-3xl bg-surface p-6 sm:mt-12 sm:p-8">
          <p className="text-lg font-semibold text-foreground sm:text-xl">
            If you can secure a good location for the machine, we will run the business for you.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-base">
            Location performance depends on traffic, customer profile, product mix, pricing and operating conditions. We don’t promise
            that any particular location will be profitable — your network is an advantage, not a guarantee.
          </p>
        </div>
      </Section>

      {/* ── SECTION 3 — THE OFFER STACK ─────────────────────── */}
      <Section id="stack">
        <Eyebrow>02 · The offer</Eyebrow>
        <Statement>
          You’re not <Hl>just</Hl> buying a machine.
        </Statement>
        <Lede>You get a physical asset and a complete system around it.</Lede>

        <div className="mt-10 grid grid-cols-2 gap-2.5 sm:mt-12 sm:gap-3 lg:grid-cols-4">
          {STACK_ITEMS.map((item) => (
            <div key={item.title} className="rounded-2xl border border-border bg-background p-4 transition-shadow duration-200 hover:shadow-[var(--sq-shadow-md)] sm:p-5">
              <span className={`mb-3 flex size-10 items-center justify-center rounded-xl ${item.accent}`}>
                <item.icon className="size-5" aria-hidden="true" />
              </span>
              <p className="text-sm font-bold text-foreground">{item.title}</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground sm:text-sm">{item.body}</p>
            </div>
          ))}
        </div>

        <div id="restocking" className="mt-12 grid scroll-mt-20 gap-10 sm:mt-16 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-center lg:gap-16">
          <RestockingVideo className="mx-auto w-full max-w-[300px] sm:max-w-[340px] lg:mx-0 lg:justify-self-center" />
          <div>
            <span className={`mb-4 flex size-10 items-center justify-center rounded-xl ${ACCENT.green}`}>
              <Truck className="size-5" aria-hidden="true" />
            </span>
            <h3 className="font-display text-[clamp(1.5rem,4.5vw,2.25rem)] leading-tight text-foreground uppercase">
              We keep it <Hl>full</Hl>.
            </h3>
            <ul className="mt-6 flex flex-col gap-3 text-base leading-relaxed text-muted-foreground sm:text-lg">
              {[
                'Snack Quest restocks the machine — you don’t carry boxes.',
                'Each refill is planned from what your machine actually sells, so the fast movers don’t run out.',
                'Every item loaded is recorded, and you see stock levels in your owner portal.',
              ].map((line) => (
                <li key={line} className="flex gap-3">
                  <span aria-hidden="true" className="mt-2.5 size-1.5 shrink-0 rounded-full bg-primary" />
                  {line}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <EmphasisCard icon={Boxes}>
          <p className="font-display text-[clamp(1.5rem,4.5vw,2.5rem)] leading-tight text-foreground uppercase">
            You own the machine. We provide the operating layer.
          </p>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground sm:text-base">
            Performance depends on your location, demand, product mix, pricing and operating conditions — not a guarantee we make you.
          </p>
        </EmphasisCard>
      </Section>

      {/* ── SECTION 4 — THE OWNER PORTAL ────────────────────── */}
      <Section id="portal">
        <Eyebrow>03 · Your dashboard</Eyebrow>
        <Statement>
          Your machines. Your data. All <Hl>in</Hl> one place.
        </Statement>
        <Lede>Manage one machine or several from your own owner portal.</Lede>

        <div className="mt-10 grid gap-8 sm:mt-12 lg:grid-cols-2 lg:items-center lg:gap-12">
          <OwnerPortalPhoto className="mx-auto w-full max-w-sm lg:mx-0 lg:max-w-none" />

          <ul className="grid grid-cols-2 gap-2.5">
            {PORTAL_ITEMS.map((item) => (
              <li key={item.label} className="flex items-center gap-2.5 rounded-xl border border-border bg-background px-3 py-3 sm:gap-3 sm:px-4">
                <span className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${item.accent}`}>
                  <item.icon className="size-4" aria-hidden="true" />
                </span>
                <span className="text-sm font-medium text-foreground">{item.label}</span>
              </li>
            ))}
          </ul>
        </div>

        <EmphasisCard icon={Boxes}>
          <p className="font-display text-[clamp(1.3rem,4vw,2rem)] leading-tight text-foreground uppercase">One portal. Every machine you own.</p>
        </EmphasisCard>
      </Section>

      {/* ── SECTION 5 — HOW IT WORKS / THE REPEAT ───────────── */}
      <Section id="how-it-works">
        <Eyebrow>04 · Scale it</Eyebrow>
        <Statement>The first machine is the test. The second is the repeat.</Statement>

        <ol className="mt-10 grid grid-cols-2 gap-2.5 sm:mt-12 sm:gap-3 lg:grid-cols-3">
          {PROCESS_STEPS.map((item, index) => (
            <li key={item.step} className="flex flex-col items-start gap-2 rounded-2xl border border-border bg-background p-4 sm:flex-row sm:items-start sm:gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-own-accent-ink">
                <item.icon className="size-4.5" aria-hidden="true" />
              </span>
              <span>
                <b className="block text-xs font-bold tracking-[0.12em] text-muted-foreground uppercase">
                  {String(index + 1).padStart(2, '0')} · {item.step}
                </b>
                <span className="mt-0.5 block text-sm font-semibold text-foreground">{item.body}</span>
              </span>
            </li>
          ))}
        </ol>

        <p className="mt-10 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
          If your first machine performs well, you don’t have to start from zero again. You already have:
        </p>
        <ul className="mt-6 grid grid-cols-2 gap-2 sm:gap-2.5">
          {[
            'the relationship with Snack Quest',
            'the management system',
            'the supply network',
            'the software',
            'the operating process',
            'the data',
            'the experience',
          ].map((item) => (
            <li key={item} className="flex items-center gap-2 rounded-xl bg-surface px-3 py-2.5 text-xs text-foreground sm:px-4 sm:py-3 sm:text-base">
              <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-primary" />
              {item}
            </li>
          ))}
        </ul>

        <EmphasisCard icon={TrendingUp}>
          <p className="font-display text-[clamp(1.3rem,4vw,2rem)] leading-tight text-foreground uppercase">One machine can become a portfolio.</p>
          <p className="max-w-md text-sm text-muted-foreground sm:text-base">Each additional machine plugs into the same Snack Quest operating layer.</p>
          <p className="text-xs text-muted-foreground sm:text-sm">Expansion depends on capital, location access and machine performance.</p>
        </EmphasisCard>
      </Section>

      {/* ── SECTION 6 — QUALIFICATION ────────────────────────── */}
      <Section>
        <Eyebrow>05 · Is this for you?</Eyebrow>
        <Statement>This is for people who have capital, connections or both.</Statement>

        <div className="mt-10 grid gap-4 sm:mt-12 sm:grid-cols-3">
          <QualifyCard icon={Wallet} title="Capital" body="You can comfortably acquire and deploy the machine." accent="orange" />
          <QualifyCard icon={MapPin} title="Connections" body="You can access strong commercial locations." accent="green" />
          <QualifyCard icon={Rocket} title="Ambition" body="You want the option to build beyond one machine." accent="purple" />
        </div>

        <EmphasisCard icon={ArrowRight}>
          <p className="font-display text-[clamp(1.2rem,3.5vw,1.75rem)] leading-tight text-foreground uppercase">
            If you have two of the three, we should talk.
          </p>
        </EmphasisCard>

        <div className="mt-8 flex flex-col items-center gap-3 sm:mt-10">
          <OwnCta source="qualification" size="lg">
            Apply to own a machine
            <ArrowRight className="size-5" aria-hidden="true" />
          </OwnCta>
          <p className="text-sm text-muted-foreground">Tell us what you have access to. We’ll determine whether the model fits.</p>
        </div>
      </Section>

      {/* ── SECTION 7 — FAQ ──────────────────────────────────── */}
      <Section id="faq">
        <div className="mx-auto max-w-3xl">
          <Eyebrow>FAQ</Eyebrow>
          <Statement>Questions people ask before applying.</Statement>

          <FaqAccordion items={FAQS} />
        </div>
      </Section>

      {/* ── LEAD FORM ────────────────────────────────────────── */}
      <Section id="apply" className="bg-surface">
        <div className="mx-auto max-w-3xl text-center">
          <Eyebrow>Apply</Eyebrow>
          <Statement>Let’s see what you can build.</Statement>
        </div>
        <div className="mx-auto mt-10 w-full max-w-2xl rounded-2xl border border-border bg-background p-6 shadow-[var(--sq-shadow-lg)] sm:mt-12 sm:rounded-3xl sm:p-10">
          <ApplicationForm />
        </div>
      </Section>

      {/* ── FINAL SCREEN ─────────────────────────────────────── */}
      <section className="relative flex min-h-[80vh] flex-col items-center justify-center overflow-hidden border-t border-border px-5 py-24 text-center sm:px-8">
        <div className="mx-auto w-full max-w-xs sm:max-w-sm">
          <MachinePhoto />
        </div>
        <div className="relative mx-auto mt-12 max-w-3xl sm:mt-16">
          <Statement>Own the first one. Let the system help you build the next.</Statement>
          <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
            Your capital buys the asset. Your connections create the opportunity. Snack Quest provides the operating layer.
          </p>
          <div className="mt-9 flex flex-col items-center gap-3">
            <OwnCta source="final" size="lg">
              Apply to own a machine
              <ArrowRight className="size-5" aria-hidden="true" />
            </OwnCta>
            <p className="text-sm text-muted-foreground">Capital + location access preferred.</p>
          </div>
        </div>
      </section>

      <footer className="border-t border-border px-5 py-8 text-center sm:px-8">
        <p className="text-xs text-muted-foreground">
          © {new Date().getFullYear()} Snack Quest ·{' '}
          <Link href="/" className="underline underline-offset-4 hover:text-foreground">
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
      <span className="flex size-9 items-center justify-center rounded-full bg-primary/10 text-own-accent-ink">
        <Icon className="size-4" aria-hidden="true" />
      </span>
      <span>
        <span className="block text-xs font-bold tracking-[0.1em] text-muted-foreground uppercase">{title}</span>
        <span className="block text-sm font-semibold text-foreground">{detail}</span>
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
  accent: 'orange' | 'green' | 'purple';
}) {
  const tone = accent === 'orange' ? 'text-own-accent-ink' : accent === 'green' ? 'text-success' : 'text-secondary';
  return (
    <div className="rounded-3xl border border-border bg-background p-7 text-center">
      <span className={`mx-auto mb-4 flex size-11 items-center justify-center rounded-xl ${ACCENT[accent]}`}>
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <span className={`font-display block text-2xl uppercase ${tone}`}>{title}</span>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-base">{body}</p>
    </div>
  );
}
