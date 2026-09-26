'use client';

import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  GraduationCap,
  HelpCircle,
  Hotel,
  Landmark,
  Loader2,
  MapPin,
  ShoppingBag,
  TrainFront,
} from 'lucide-react';
import {
  BUILDING_PORTFOLIO_OPTIONS,
  CAPITAL_RANGES,
  LOCATION_ACCESS_OPTIONS,
  LOCATION_COUNTS,
  LOCATION_TYPES,
  OWNER_PROFILES,
  type BuildingPortfolio,
  type CapitalRange,
  type LocationAccess,
  type LocationCount,
  type LocationType,
  type OwnerProfile,
} from '@/types/machineOwnerInterest';
import { trackEvent } from '@/lib/analytics/trackEvent';
import { MACHINE_OWNER_EVENTS } from '@/lib/analytics/machineOwnerEvents';
import { cn } from '@/lib/utils';

type StepId = 'name' | 'greeting' | 'capital' | 'locationAccess' | 'locationCount' | 'locationType' | 'interest' | 'portfolio' | 'contact' | 'success';

interface Answers {
  fullName: string;
  whatsapp: string;
  email: string;
  capitalRange: CapitalRange | null;
  locationAccess: LocationAccess | null;
  locationCount: LocationCount | null;
  locationTypes: LocationType[];
  ownerProfile: OwnerProfile | null;
  buildingPortfolio: BuildingPortfolio | null;
}

const EMPTY_ANSWERS: Answers = {
  fullName: '',
  whatsapp: '',
  email: '',
  capitalRange: null,
  locationAccess: null,
  locationCount: null,
  locationTypes: [],
  ownerProfile: null,
  buildingPortfolio: null,
};

/** The six questions that count toward "N / 6" — `greeting`, `locationCount` and `portfolio` are bonus screens that share their neighbour's number, so the visible total never grows past six (§ "six steps should feel short"). */
const PROGRESS: Record<StepId, number> = {
  name: 1,
  greeting: 1,
  capital: 2,
  locationAccess: 3,
  locationCount: 3,
  locationType: 4,
  interest: 5,
  portfolio: 5,
  contact: 6,
  success: 6,
};
const TOTAL_STEPS = 6;

const LOCATION_ICON: Record<LocationType, typeof Building2> = {
  mall: ShoppingBag,
  office: Building2,
  hotel: Hotel,
  university: GraduationCap,
  hospital: Landmark,
  apartment: Building2,
  bnb: Hotel,
  transport_hub: TrainFront,
  other: HelpCircle,
};

/** A short, non-committal line that makes the previous answer feel heard before the next question — never a promise about returns (§ "NEVER fabricate earnings"). */
function contextualLine(step: StepId, answers: Answers): string | null {
  if (step === 'locationAccess' && answers.capitalRange === '1m_plus') {
    return 'That gives you room to think beyond one machine.';
  }
  if (step === 'locationCount' || step === 'locationType') {
    switch (answers.locationAccess) {
      case 'yes':
        return 'Great — that’s exactly the kind of access we look for.';
      case 'multiple':
        return 'That’s valuable. Multiple locations can create room to build beyond one machine.';
      case 'not_yet':
        return 'That’s fine — relationships often matter more than an address you already have.';
      case 'looking':
        return 'We can help you think through what to look for.';
      default:
        return null;
    }
  }
  return null;
}

/**
 * The `/own` application form (§ machine-owner lead-generation landing
 * page, interactive qualification form) — one question at a time
 * rather than a stacked contact form. Every rule the old single-page
 * `ApplicationForm` enforced still applies: validation is duplicated
 * here and on the server, because this half only tells someone early
 * and politely, and the route stays reachable with `curl` regardless
 * of what this component does.
 */
export function ApplicationForm() {
  const [step, setStep] = useState<StepId>('name');
  const [history, setHistory] = useState<StepId[]>([]);
  const [answers, setAnswers] = useState<Answers>(EMPTY_ANSWERS);
  const [status, setStatus] = useState<'idle' | 'submitting' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const contactStarted = useRef(false);
  const latest = useRef({ step, done: false });

  useEffect(() => {
    latest.current.step = step;
  }, [step]);

  useEffect(() => {
    trackEvent(MACHINE_OWNER_EVENTS.formStarted);
    return () => {
      // Deliberately read at unmount time, not capture at mount time —
      // `latest` is a plain data ref (not a DOM node), kept current by
      // the effect above precisely so this closure sees whichever step
      // the visitor was actually on when they left, not the first one.
      if (!latest.current.done) {
        // eslint-disable-next-line react-hooks/exhaustive-deps
        trackEvent(MACHINE_OWNER_EVENTS.formAbandoned, { step: latest.current.step });
      }
    };
  }, []);

  function goTo(next: StepId) {
    setHistory((current) => [...current, step]);
    setStep(next);
  }

  function goBack() {
    setHistory((current) => {
      if (current.length === 0) return current;
      const copy = [...current];
      const previous = copy.pop()!;
      setStep(previous);
      return copy;
    });
  }

  function next() {
    if (step === 'name') {
      trackEvent(MACHINE_OWNER_EVENTS.nameCompleted);
      return goTo('greeting');
    }
    if (step === 'greeting') return goTo('capital');
    if (step === 'capital') return goTo('locationAccess');
    if (step === 'locationAccess') {
      return goTo(answers.locationAccess === 'multiple' ? 'locationCount' : 'locationType');
    }
    if (step === 'locationCount') return goTo('locationType');
    if (step === 'locationType') {
      trackEvent(MACHINE_OWNER_EVENTS.locationTypeSelected, { count: answers.locationTypes.length });
      return goTo('interest');
    }
    if (step === 'interest') {
      return goTo(answers.ownerProfile === 'multiple_machines' ? 'portfolio' : 'contact');
    }
    if (step === 'portfolio') return goTo('contact');
  }

  function selectCapital(value: CapitalRange) {
    setAnswers((current) => ({ ...current, capitalRange: value }));
    trackEvent(MACHINE_OWNER_EVENTS.capitalSelected, { capitalRange: value });
    setTimeout(() => goTo('locationAccess'), 260);
  }

  function selectLocationAccess(value: LocationAccess) {
    setAnswers((current) => ({ ...current, locationAccess: value }));
    trackEvent(MACHINE_OWNER_EVENTS.locationAccessSelected, { locationAccess: value });
    setTimeout(() => goTo(value === 'multiple' ? 'locationCount' : 'locationType'), 260);
  }

  function selectLocationCount(value: LocationCount) {
    setAnswers((current) => ({ ...current, locationCount: value }));
    setTimeout(() => goTo('locationType'), 220);
  }

  function toggleLocationType(value: LocationType) {
    setAnswers((current) => ({
      ...current,
      locationTypes: current.locationTypes.includes(value) ? current.locationTypes.filter((item) => item !== value) : [...current.locationTypes, value],
    }));
  }

  function selectInterest(value: OwnerProfile) {
    setAnswers((current) => ({ ...current, ownerProfile: value }));
    trackEvent(MACHINE_OWNER_EVENTS.interestSelected, { ownerProfile: value });
    setTimeout(() => goTo(value === 'multiple_machines' ? 'portfolio' : 'contact'), 260);
  }

  function selectPortfolio(value: BuildingPortfolio) {
    setAnswers((current) => ({ ...current, buildingPortfolio: value }));
    setTimeout(() => goTo('contact'), 220);
  }

  async function submit() {
    if (status === 'submitting') return;
    setStatus('submitting');
    setError(null);

    try {
      const response = await fetch('/api/machine-owners/interest', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          fullName: answers.fullName,
          whatsapp: answers.whatsapp,
          email: answers.email,
          capitalRange: answers.capitalRange,
          locationAccess: answers.locationAccess,
          locationCount: answers.locationCount,
          locationTypes: answers.locationTypes,
          ownerProfile: answers.ownerProfile,
          buildingPortfolio: answers.buildingPortfolio,
        }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? 'Something went wrong. Please try again.');
        setStatus('idle');
        return;
      }

      latest.current.done = true;
      trackEvent(MACHINE_OWNER_EVENTS.applicationSubmitted, {
        capitalRange: answers.capitalRange ?? '',
        locationAccess: answers.locationAccess ?? '',
        ownerProfile: answers.ownerProfile ?? '',
      });
      goTo('success');
    } catch {
      setError('We couldn’t reach the server. Check your connection and try again.');
      setStatus('idle');
    }
  }

  if (step === 'success') {
    return <SuccessState answers={answers} />;
  }

  const progress = PROGRESS[step];
  const canGoBack = history.length > 0;
  const line = contextualLine(step, answers);

  return (
    <div className="flex min-h-[420px] flex-col">
      {/* Progress */}
      <div className="mb-8 flex items-center gap-3">
        {canGoBack ? (
          <button type="button" onClick={goBack} aria-label="Back" className="border-border text-foreground/60 hover:text-foreground flex size-9 shrink-0 items-center justify-center rounded-full border transition-colors hover:bg-background">
            <ArrowLeft className="size-4" aria-hidden="true" />
          </button>
        ) : (
          <span className="size-9 shrink-0" aria-hidden="true" />
        )}
        <div className="flex-1">
          <div className="bg-border h-1.5 w-full overflow-hidden rounded-full">
            <span
              className="from-primary to-home-orange-glow block h-full rounded-full bg-gradient-to-r transition-[width] duration-500 ease-out"
              style={{ width: `${(progress / TOTAL_STEPS) * 100}%` }}
            />
          </div>
        </div>
        <span className="text-foreground/50 shrink-0 text-xs font-semibold tabular-nums">
          {progress} / {TOTAL_STEPS}
        </span>
      </div>

      <div key={step} className="animate-own-step-in flex flex-1 flex-col">
        {line ? <p className="text-primary mb-3 text-sm font-medium">{line}</p> : null}

        {step === 'name' ? <NameStep answers={answers} setAnswers={setAnswers} onNext={next} /> : null}
        {step === 'greeting' ? <GreetingStep onNext={next} /> : null}
        {step === 'capital' ? <CapitalStep selected={answers.capitalRange} onSelect={selectCapital} /> : null}
        {step === 'locationAccess' ? <LocationAccessStep selected={answers.locationAccess} onSelect={selectLocationAccess} /> : null}
        {step === 'locationCount' ? <LocationCountStep selected={answers.locationCount} onSelect={selectLocationCount} /> : null}
        {step === 'locationType' ? (
          <LocationTypeStep looking={answers.locationAccess === 'looking'} selected={answers.locationTypes} onToggle={toggleLocationType} onNext={next} />
        ) : null}
        {step === 'interest' ? <InterestStep selected={answers.ownerProfile} onSelect={selectInterest} /> : null}
        {step === 'portfolio' ? <PortfolioStep selected={answers.buildingPortfolio} onSelect={selectPortfolio} /> : null}
        {step === 'contact' ? (
          <ContactStep
            answers={answers}
            setAnswers={setAnswers}
            onStart={() => {
              if (!contactStarted.current) {
                contactStarted.current = true;
                trackEvent(MACHINE_OWNER_EVENTS.contactStarted);
              }
            }}
            onSubmit={submit}
            submitting={status === 'submitting'}
            error={error}
          />
        ) : null}
      </div>
    </div>
  );
}

/* ── Shared primitives ──────────────────────────────────────────── */

const HEADLINE_CLASS = 'font-display text-foreground text-2xl leading-tight uppercase sm:text-3xl';
const FIELD_CLASS =
  'w-full rounded-xl border border-border bg-background px-4 py-4 text-lg text-foreground placeholder:text-foreground/40 transition-colors focus:border-primary/70 focus:bg-white focus:outline-none';

function ChoiceCard({
  label,
  description,
  selected,
  onClick,
}: {
  label: string;
  description?: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center justify-between gap-3 rounded-2xl border px-5 py-4 text-left transition-all duration-200',
        selected ? 'border-primary bg-primary/10 scale-[1.01]' : 'border-border bg-background hover:bg-white',
      )}
    >
      <span>
        <span className="text-foreground block text-base font-semibold sm:text-lg">{label}</span>
        {description ? <span className="text-foreground/55 mt-0.5 block text-sm">{description}</span> : null}
      </span>
      <span
        className={cn(
          'flex size-6 shrink-0 items-center justify-center rounded-full border transition-colors',
          selected ? 'border-primary bg-primary text-white' : 'border-border text-transparent',
        )}
        aria-hidden="true"
      >
        <Check className="size-3.5" strokeWidth={3} />
      </span>
    </button>
  );
}

function ContinueButton({ onClick, disabled, label = 'Continue' }: { onClick: () => void; disabled?: boolean; label?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="from-primary to-home-orange-glow mt-2 inline-flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-br px-8 py-4 text-base font-bold tracking-wide text-white uppercase shadow-[0_18px_50px_-14px_rgb(255_122_0/0.6)] transition-all hover:-translate-y-0.5 disabled:pointer-events-none disabled:translate-y-0 disabled:opacity-40 sm:text-lg"
    >
      {label}
      <ArrowRight className="size-5" aria-hidden="true" />
    </button>
  );
}

/* ── Steps ──────────────────────────────────────────────────────── */

function NameStep({ answers, setAnswers, onNext }: { answers: Answers; setAnswers: (updater: (a: Answers) => Answers) => void; onNext: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    /*
     * This step is mounted the moment `/own` loads — it's the form's
     * initial state, not something the visitor navigated to — because
     * it sits below the fold inside the full page, not behind a route
     * change. A plain `autoFocus` would fire right then, and focusing
     * an off-screen input makes the browser scroll the whole page down
     * to it: every visitor would land already scrolled past the hero,
     * straight onto the form. Only focus it if it's already on screen —
     * true once someone has actually scrolled or tapped a CTA down to it.
     */
    const element = inputRef.current;
    if (!element) return;
    const rect = element.getBoundingClientRect();
    if (rect.top >= 0 && rect.top < window.innerHeight) {
      element.focus();
    }
  }, []);

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (answers.fullName.trim()) onNext();
      }}
      className="flex flex-1 flex-col justify-center gap-6"
    >
      <h3 className={HEADLINE_CLASS}>Let’s start with your name.</h3>
      <input
        ref={inputRef}
        value={answers.fullName}
        onChange={(event) => setAnswers((current) => ({ ...current, fullName: event.target.value }))}
        placeholder="Your name"
        className={FIELD_CLASS}
      />
      <ContinueButton onClick={onNext} disabled={!answers.fullName.trim()} />
    </form>
  );
}

function GreetingStep({ onNext }: { onNext: () => void }) {
  return (
    <div className="flex flex-1 flex-col justify-center gap-6">
      <h3 className={HEADLINE_CLASS}>Thank you for showing interest.</h3>
      <p className="text-foreground/70 text-base sm:text-lg">Let’s see if the Discovery Machine model could be a fit for you.</p>
      <ContinueButton onClick={onNext} />
    </div>
  );
}

function CapitalStep({ selected, onSelect }: { selected: CapitalRange | null; onSelect: (value: CapitalRange) => void }) {
  return (
    <div className="flex flex-1 flex-col justify-center gap-6">
      <h3 className={HEADLINE_CLASS}>How much capital are you considering?</h3>
      <div className="flex flex-col gap-2.5">
        {CAPITAL_RANGES.map((option) => (
          <ChoiceCard key={option.value} label={option.label} selected={selected === option.value} onClick={() => onSelect(option.value)} />
        ))}
      </div>
      <p className="text-foreground/45 text-sm">No commitment. We’re simply understanding your starting point.</p>
    </div>
  );
}

function LocationAccessStep({ selected, onSelect }: { selected: LocationAccess | null; onSelect: (value: LocationAccess) => void }) {
  return (
    <div className="flex flex-1 flex-col justify-center gap-6">
      <div>
        <span className="bg-primary/15 text-primary mb-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold tracking-[0.14em] uppercase">
          <MapPin className="size-3.5" aria-hidden="true" />
          Location matters
        </span>
        <p className="text-foreground/45 mb-1 text-xs font-bold tracking-[0.18em] uppercase">Now the important question</p>
        <h3 className={HEADLINE_CLASS}>Do you already have access to a strong location?</h3>
      </div>
      <div className="flex flex-col gap-2.5">
        {LOCATION_ACCESS_OPTIONS.map((option) => (
          <ChoiceCard key={option.value} label={option.label} description={option.description} selected={selected === option.value} onClick={() => onSelect(option.value)} />
        ))}
      </div>
    </div>
  );
}

function LocationCountStep({ selected, onSelect }: { selected: LocationCount | null; onSelect: (value: LocationCount) => void }) {
  return (
    <div className="flex flex-1 flex-col justify-center gap-6">
      <h3 className={HEADLINE_CLASS}>Approximately how many potential locations?</h3>
      <div className="grid grid-cols-2 gap-2.5">
        {LOCATION_COUNTS.map((option) => (
          <ChoiceCard key={option.value} label={option.label} selected={selected === option.value} onClick={() => onSelect(option.value)} />
        ))}
      </div>
    </div>
  );
}

function LocationTypeStep({
  looking,
  selected,
  onToggle,
  onNext,
}: {
  looking: boolean;
  selected: LocationType[];
  onToggle: (value: LocationType) => void;
  onNext: () => void;
}) {
  return (
    <div className="flex flex-1 flex-col justify-center gap-6">
      <h3 className={HEADLINE_CLASS}>{looking ? 'What kind of location would you like to target?' : 'Where could you place it?'}</h3>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        {LOCATION_TYPES.map((option) => {
          const Icon = LOCATION_ICON[option.value];
          const checked = selected.includes(option.value);
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onToggle(option.value)}
              className={cn(
                'flex flex-col items-center gap-2 rounded-2xl border px-3 py-5 text-center transition-all duration-200',
                checked ? 'border-primary bg-primary/10 scale-[1.02]' : 'border-border bg-background hover:bg-white',
              )}
            >
              <Icon className={cn('size-6', checked ? 'text-primary' : 'text-foreground/50')} aria-hidden="true" />
              <span className="text-foreground text-sm font-semibold">{option.label}</span>
            </button>
          );
        })}
      </div>
      <ContinueButton onClick={onNext} />
    </div>
  );
}

function InterestStep({ selected, onSelect }: { selected: OwnerProfile | null; onSelect: (value: OwnerProfile) => void }) {
  return (
    <div className="flex flex-1 flex-col justify-center gap-6">
      <p className="text-foreground/45 mb-1 text-xs font-bold tracking-[0.18em] uppercase">The opportunity</p>
      <h3 className={cn(HEADLINE_CLASS, '-mt-4')}>What are you looking to build?</h3>
      <div className="flex flex-col gap-2.5">
        {OWNER_PROFILES.map((option) => (
          <ChoiceCard key={option.value} label={option.label} description={option.description} selected={selected === option.value} onClick={() => onSelect(option.value)} />
        ))}
      </div>
    </div>
  );
}

function PortfolioStep({ selected, onSelect }: { selected: BuildingPortfolio | null; onSelect: (value: BuildingPortfolio) => void }) {
  return (
    <div className="flex flex-1 flex-col justify-center gap-6">
      <h3 className={HEADLINE_CLASS}>Are you thinking about building your own machine portfolio?</h3>
      <div className="grid grid-cols-2 gap-2.5">
        {BUILDING_PORTFOLIO_OPTIONS.map((option) => (
          <ChoiceCard key={option.value} label={option.label} selected={selected === option.value} onClick={() => onSelect(option.value)} />
        ))}
      </div>
    </div>
  );
}

function ContactStep({
  answers,
  setAnswers,
  onStart,
  onSubmit,
  submitting,
  error,
}: {
  answers: Answers;
  setAnswers: (updater: (a: Answers) => Answers) => void;
  onStart: () => void;
  onSubmit: () => void;
  submitting: boolean;
  error: string | null;
}) {
  useEffect(() => {
    onStart();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (answers.whatsapp.trim()) onSubmit();
      }}
      className="flex flex-1 flex-col justify-center gap-5"
    >
      <div>
        <h3 className={HEADLINE_CLASS}>Where should we send the next step?</h3>
        <p className="text-foreground/70 mt-2 text-base">Ready? Let’s see whether there’s a fit.</p>
      </div>

      <div className="flex flex-col gap-4">
        <div>
          <label className="text-foreground/80 mb-2 block text-sm font-medium" htmlFor="own-whatsapp">
            WhatsApp number
          </label>
          <input
            id="own-whatsapp"
            autoFocus
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="0712 345 678"
            value={answers.whatsapp}
            onChange={(event) => setAnswers((current) => ({ ...current, whatsapp: event.target.value }))}
            className={FIELD_CLASS}
          />
        </div>
        <div>
          <label className="text-foreground/80 mb-2 block text-sm font-medium" htmlFor="own-email">
            Email <span className="text-foreground/50 font-normal">(optional)</span>
          </label>
          <input
            id="own-email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={answers.email}
            onChange={(event) => setAnswers((current) => ({ ...current, email: event.target.value }))}
            className={FIELD_CLASS}
          />
        </div>
      </div>

      {error ? (
        <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <ContinueButton onClick={onSubmit} disabled={!answers.whatsapp.trim() || submitting} label={submitting ? 'Checking…' : 'Check my fit'} />
      {submitting ? (
        <span className="text-foreground/50 mx-auto -mt-3 flex items-center gap-2 text-sm">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        </span>
      ) : null}
    </form>
  );
}

function SuccessState({ answers }: { answers: Answers }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);

  const capital = CAPITAL_RANGES.find((option) => option.value === answers.capitalRange)?.label ?? '—';
  const location = LOCATION_ACCESS_OPTIONS.find((option) => option.value === answers.locationAccess)?.label ?? '—';
  const interest = OWNER_PROFILES.find((option) => option.value === answers.ownerProfile)?.label ?? '—';

  return (
    <div ref={ref} tabIndex={-1} className="flex min-h-[420px] flex-col items-center justify-center gap-6 text-center outline-none">
      <span className="bg-primary/15 text-primary flex size-16 items-center justify-center rounded-full">
        <Check className="size-8" strokeWidth={3} aria-hidden="true" />
      </span>
      <h3 className="font-display text-foreground text-3xl uppercase sm:text-4xl">Application received.</h3>
      <p className="text-foreground/70 max-w-md text-base leading-relaxed">
        We’ve got the basics. Our team will review your capital + location profile and contact you about the next step.
      </p>

      <div className="mt-2 grid w-full max-w-sm grid-cols-1 gap-2.5 text-left sm:grid-cols-3">
        <SummaryTile label="Capital" value={capital} />
        <SummaryTile label="Location" value={location} />
        <SummaryTile label="Interest" value={interest} />
      </div>
    </div>
  );
}

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-border rounded-xl border bg-background px-4 py-3">
      <p className="text-foreground/40 text-[10px] font-bold tracking-[0.18em] uppercase">{label}</p>
      <p className="text-foreground mt-1 text-sm font-semibold">{value}</p>
    </div>
  );
}
