import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, Building2, GraduationCap, Hotel, Landmark, ShoppingBag, TrainFront } from 'lucide-react';
import { buildPageMetadata } from '@/lib/seo/pageMetadata';
import { OwnNav } from '@/components/marketing/own/OwnNav';
import { OwnCta } from '@/components/marketing/own/OwnCta';
import { MobileOwnBar } from '@/components/marketing/own/MobileOwnBar';
import { ApplicationForm } from '@/components/marketing/own/ApplicationForm';
import { DiscoveryMachineGraphic } from '@/components/marketing/own/DiscoveryMachineGraphic';
import { OwnerPortalMockup } from '@/components/marketing/own/OwnerPortalMockup';
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
const CREAM = 'bg-[#fff8ee]';

function Eyebrow({ children, dark }: { children: React.ReactNode; dark?: boolean }) {
  return (
    <span className={`mb-4 inline-block text-xs font-bold tracking-[0.2em] uppercase ${dark ? 'text-primary' : 'text-primary'}`}>
      {children}
    </span>
  );
}

function Section({ id, className, children }: { id?: string; className?: string; children: React.ReactNode }) {
  return (
    <section id={id} className={`scroll-mt-20 px-5 py-16 sm:px-8 sm:py-24 ${className ?? ''}`}>
      <div className="mx-auto w-full max-w-[1200px]">{children}</div>
    </section>
  );
}

/** Headlines on this page render in caps deliberately — see the page's own doc comment: "Direct. Confident. Commercial. Specific. Slightly provocative" calls for a bolder register than the /invest page's sentence case. */
function Statement({ children, dark }: { children: React.ReactNode; dark?: boolean }) {
  return (
    <h2
      className={`font-display text-[clamp(1.9rem,6vw,3.25rem)] leading-[1.08] tracking-tight text-balance uppercase ${
        dark ? 'text-[#1f1f1f]' : 'text-white'
      }`}
    >
      {children}
    </h2>
  );
}

function Lede({ children, dark }: { children: React.ReactNode; dark?: boolean }) {
  return <p className={`mt-5 max-w-2xl text-base leading-relaxed sm:text-lg ${dark ? 'text-[#1f1f1f]/70' : 'text-white/70'}`}>{children}</p>;
}

const LOCATION_ICON: Record<string, typeof Building2> = {
  mall: ShoppingBag,
  office: Building2,
  hotel: Hotel,
  university: GraduationCap,
  hospital: Landmark,
  apartment: Building2,
  bnb: Hotel,
  transport_hub: TrainFront,
  other: Building2,
};

export default function OwnPage() {
  return (
    <>
      <OwnNav />
      <MobileOwnBar />

      {/* ── SECTION 1 — THE HOOK ─────────────────────────────── */}
      <section className={`${INK} relative overflow-hidden px-5 pt-28 pb-16 sm:px-8 sm:pt-36 sm:pb-24`}>
        <div className="relative mx-auto w-full max-w-[1200px]">
          <div className="mx-auto max-w-3xl text-center">
            <Statement>What if you could own the retail asset without building the retail operation?</Statement>
            <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-white/70 sm:text-lg">
              Buy a Snack Quest Discovery Machine. Secure the right location. We provide the system that keeps it running.
            </p>
          </div>

          <div className="mx-auto mt-14 max-w-sm sm:mt-16">
            <DiscoveryMachineGraphic />
          </div>

          <div className="mx-auto mt-14 grid max-w-3xl gap-4 sm:mt-16 sm:grid-cols-3">
            <RoleCard label="You" body="Own the machine." accent="orange" />
            <RoleCard label="Your connections" body="Secure the location." accent="lime" />
            <RoleCard label="Snack Quest" body="Manages the retail operation." accent="purple" />
          </div>

          <div className="mt-12 flex flex-col items-center gap-3 sm:mt-14">
            <OwnCta source="hero" size="lg">
              See if this fits you
              <ArrowRight className="size-5" aria-hidden="true" />
            </OwnCta>
            <p className="text-sm text-white/45">For people with capital, location access, or both.</p>
          </div>
        </div>
      </section>

      {/* ── SECTION 2 — THE LOCATION MATTERS MOST ───────────── */}
      <Section id="location" className={INK_SOFT}>
        <Eyebrow>What actually drives this</Eyebrow>
        <Statement>The machine isn’t the most important part. The location is.</Statement>

        <div className="mt-10 rounded-2xl border border-white/10 bg-white/[0.04] p-6 text-center sm:mt-12 sm:rounded-3xl sm:p-10">
          <p className="font-display text-[clamp(1.3rem,4vw,2rem)] leading-tight text-white uppercase">
            Right machine <span className="text-primary">+</span> right location{' '}
            <span className="text-primary">=</span> the opportunity
          </p>
        </div>

        <div className="mt-10 grid gap-8 sm:mt-12 lg:grid-cols-2 lg:gap-14">
          <div className="flex flex-col gap-4 text-base leading-relaxed text-white/75 sm:text-lg">
            <p>A great machine in a weak location can struggle.</p>
            <p>A great location gives the machine access to the people who can actually buy from it.</p>
            <p>That’s why we’re looking for owners who can bring more than capital.</p>
          </div>
          <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
            {LOCATION_TYPES.filter((option) => option.value !== 'other').map((option) => {
              const Icon = LOCATION_ICON[option.value];
              return (
                <div key={option.value} className="flex items-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3">
                  <Icon className="text-primary size-4 shrink-0" aria-hidden="true" />
                  <span className="text-sm font-medium text-white/85">{option.label}</span>
                </div>
              );
            })}
          </div>
        </div>

        <p className="mt-10 max-w-2xl text-lg font-semibold text-white sm:mt-12 sm:text-xl">
          If you can open doors, we can help you build what goes behind them.
        </p>
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-white/50 sm:text-base">
          Location performance depends on traffic, customer profile, product mix, pricing and operating conditions. We don’t promise
          that any particular location will be profitable — your network is an advantage, not a guarantee.
        </p>
      </Section>

      {/* ── SECTION 3 — THE OFFER STACK ─────────────────────── */}
      <Section id="stack" className={CREAM}>
        <Eyebrow dark>What you’re actually getting</Eyebrow>
        <Statement dark>You’re not just buying a machine.</Statement>

        <div className="mt-10 flex flex-col gap-3 sm:mt-12">
          <StackRow title="Discovery Machine" body="The physical retail asset." />
          <StackRow title="Snack Quest OS" body="Your connected management layer." />
          <StackRow title="International snack supply" body="Products selected and replenished through Snack Quest." />
          <StackRow title="Payments" body="Connected transaction infrastructure." />
          <StackRow title="Management service" body="Snack Quest helps operate and manage the machine after deployment." />
          <StackRow title="Data" body="Sales, products, transactions and machine performance." />
          <StackRow title="Remote visibility" body="Owners can monitor their machines through their portal." />
        </div>

        <div className="mt-12 rounded-2xl border border-[#1f1f1f]/10 bg-[#1f1f1f] p-8 text-center sm:mt-14 sm:rounded-3xl sm:p-12">
          <p className="font-display text-[clamp(1.5rem,4.5vw,2.5rem)] leading-tight text-white uppercase">
            You own the asset. We help you run what’s inside it.
          </p>
        </div>
      </Section>

      {/* ── SECTION 4 — THE OWNER PORTAL ────────────────────── */}
      <Section id="portal" className={INK}>
        <Eyebrow>The differentiator</Eyebrow>
        <Statement>Your machines. Your dashboard. Your data.</Statement>
        <Lede>Own one machine or several. Manage them from one place.</Lede>

        <div className="mt-10 sm:mt-12">
          <OwnerPortalMockup />
        </div>

        <div className="mt-12 rounded-2xl border border-white/10 bg-white/[0.04] p-8 text-center sm:mt-14 sm:rounded-3xl sm:p-12">
          <p className="font-display text-[clamp(1.5rem,4.5vw,2.5rem)] leading-tight text-white uppercase">One portal. Every machine you own.</p>
        </div>
      </Section>

      {/* ── SECTION 5 — THE REPEAT ──────────────────────────── */}
      <Section id="repeat" className={INK_SOFT}>
        <Eyebrow>The real opportunity</Eyebrow>
        <Statement>The first machine is the test. The second is the repeat.</Statement>

        <ol className="mt-10 flex flex-col gap-2.5 sm:mt-12">
          {[
            ['Buy', 'Discovery Machine'],
            ['Place', 'Your location'],
            ['Operate', 'Snack Quest management'],
            ['Learn', 'Sales + demand data'],
            ['Expand', 'Acquire another machine'],
            ['Repeat', 'Multiple locations'],
          ].map(([step, body], index, all) => (
            <li key={step} className="flex items-start gap-4">
              <span className="flex flex-col items-center self-stretch">
                <span className="bg-primary/20 text-primary flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-bold tabular-nums">
                  {index + 1}
                </span>
                {index === all.length - 1 ? null : <span aria-hidden="true" className="mt-1 w-px flex-1 bg-white/15" />}
              </span>
              <span className="pt-1.5 pb-4">
                <b className="block text-sm font-bold tracking-[0.12em] text-white uppercase sm:text-base">{step}</b>
                <span className="mt-1 block text-sm text-white/60 sm:text-base">{body}</span>
              </span>
            </li>
          ))}
        </ol>

        <p className="mt-4 max-w-2xl text-base leading-relaxed text-white/75 sm:text-lg">
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
        <p className="mt-6 max-w-2xl text-base leading-relaxed text-white/75 sm:text-lg">So the next machine can plug into the same system.</p>

        <div className="mt-12 rounded-2xl border border-white/10 bg-white/[0.04] p-8 text-center sm:mt-14 sm:rounded-3xl sm:p-12">
          <p className="font-display text-[clamp(1.5rem,4.5vw,2.5rem)] leading-tight text-white uppercase">
            One machine can become as many as you choose to own.
          </p>
          <p className="mt-4 text-sm text-white/50 sm:text-base">Expansion depends on your capital, available locations and machine performance.</p>
        </div>
      </Section>

      {/* ── SECTION 6 — QUALIFICATION ────────────────────────── */}
      <Section className={INK}>
        <Eyebrow>The offer</Eyebrow>
        <Statement>Who should own a Snack Quest machine?</Statement>

        <div className="mt-10 grid gap-4 sm:mt-12 sm:grid-cols-3">
          <QualifyCard title="Capital" body="You can comfortably acquire and deploy the machine." accent="orange" />
          <QualifyCard title="Connections" body="You can access strong commercial locations." accent="lime" />
          <QualifyCard title="Ambition" body="You want the option to build beyond one machine." accent="purple" />
        </div>

        <p className="mt-10 text-center font-display text-[clamp(1.3rem,4vw,2rem)] leading-tight text-white uppercase sm:mt-12">
          If you have two of the three, we should talk.
        </p>

        <div className="mt-8 flex flex-col items-center gap-3 sm:mt-10">
          <OwnCta source="qualification" size="lg">
            Apply to become a machine owner
            <ArrowRight className="size-5" aria-hidden="true" />
          </OwnCta>
          <p className="text-sm text-white/45">Tell us what you have access to. We’ll determine whether the model fits.</p>
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
          <DiscoveryMachineGraphic />
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

function RoleCard({ label, body, accent }: { label: string; body: string; accent: 'orange' | 'lime' | 'purple' }) {
  const dot = accent === 'orange' ? 'bg-primary' : accent === 'lime' ? 'bg-home-lime' : 'bg-secondary';
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-6 text-left">
      <span aria-hidden="true" className={`mb-4 block size-2.5 rounded-full ${dot}`} />
      <p className="text-xs font-bold tracking-[0.18em] text-white/60 uppercase">{label}</p>
      <p className="mt-2 text-lg font-semibold text-white">{body}</p>
    </div>
  );
}

function StackRow({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex flex-col gap-1 border-b border-[#1f1f1f]/10 pb-4 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6">
      <span className="text-base font-bold tracking-tight text-[#1f1f1f] sm:text-lg">{title}</span>
      <span className="text-sm text-[#1f1f1f]/65 sm:max-w-md sm:text-right sm:text-base">{body}</span>
    </div>
  );
}

function QualifyCard({ title, body, accent }: { title: string; body: string; accent: 'orange' | 'lime' | 'purple' }) {
  const ring = accent === 'orange' ? 'text-primary' : accent === 'lime' ? 'text-home-lime' : 'text-secondary';
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-7 text-center sm:rounded-3xl">
      <span className={`font-display block text-2xl uppercase ${ring}`}>{title}</span>
      <p className="mt-3 text-sm leading-relaxed text-white/70 sm:text-base">{body}</p>
    </div>
  );
}
