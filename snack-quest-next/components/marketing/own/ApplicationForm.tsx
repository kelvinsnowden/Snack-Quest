'use client';

import { useRef, useState } from 'react';
import { ArrowRight, Check, Loader2 } from 'lucide-react';
import { CAPITAL_RANGES, LOCATION_ACCESS_OPTIONS, LOCATION_TYPES, OWNER_PROFILES } from '@/types/machineOwnerInterest';
import { trackEvent } from '@/lib/analytics/trackEvent';
import { MACHINE_OWNER_EVENTS } from '@/lib/analytics/machineOwnerEvents';
import { cn } from '@/lib/utils';

type Status = 'idle' | 'submitting' | 'done';

const FIELD_CLASS =
  'w-full rounded-xl border border-white/15 bg-white/[0.06] px-4 py-3 text-base text-white placeholder:text-white/40 transition-colors focus:border-primary/70 focus:bg-white/10 focus:outline-none';

const LABEL_CLASS = 'mb-2 block text-sm font-medium text-white/85';

/**
 * The qualification application (§ machine-owner lead-generation
 * landing page — "make the form feel like a qualification application
 * rather than a boring contact form"). Deliberately short: name,
 * WhatsApp, optional email, then the three questions that actually
 * decide whether this model fits — capital, location access, and
 * what the applicant is trying to build.
 *
 * Validation is duplicated here and on the server for the same reason
 * `InterestForm` duplicates its own: this half tells someone early and
 * politely, the server half is what actually holds because the route
 * is reachable with `curl`.
 */
export function ApplicationForm() {
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);
  const [locationAccess, setLocationAccess] = useState<string>('');
  const [locationTypes, setLocationTypes] = useState<string[]>([]);
  const started = useRef(false);
  const successRef = useRef<HTMLDivElement>(null);

  function markStarted() {
    if (started.current) return;
    started.current = true;
    trackEvent(MACHINE_OWNER_EVENTS.formStarted);
  }

  function toggleLocationType(value: string) {
    setLocationTypes((current) => (current.includes(value) ? current.filter((item) => item !== value) : [...current, value]));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status === 'submitting') return;

    const form = event.currentTarget;
    const data = new FormData(form);
    const payload = {
      fullName: String(data.get('fullName') ?? '').trim(),
      whatsapp: String(data.get('whatsapp') ?? '').trim(),
      email: String(data.get('email') ?? '').trim(),
      capitalRange: String(data.get('capitalRange') ?? ''),
      locationAccess: String(data.get('locationAccess') ?? ''),
      locationTypes: locationAccess === 'no' ? [] : locationTypes,
      ownerProfile: String(data.get('ownerProfile') ?? ''),
    };

    setStatus('submitting');
    setError(null);
    trackEvent(MACHINE_OWNER_EVENTS.formSubmitted, { ownerProfile: payload.ownerProfile });

    try {
      const response = await fetch('/api/machine-owners/interest', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? 'Something went wrong. Please try again.');
        setStatus('idle');
        return;
      }

      setStatus('done');
      trackEvent(MACHINE_OWNER_EVENTS.formCompleted);
      requestAnimationFrame(() => successRef.current?.focus());
    } catch {
      setError('We couldn’t reach the server. Check your connection and try again.');
      setStatus('idle');
    }
  }

  if (status === 'done') {
    return <SuccessState ref={successRef} />;
  }

  return (
    <form onSubmit={handleSubmit} onChange={markStarted} className="flex flex-col gap-6">
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label className={LABEL_CLASS} htmlFor="own-name">
            Name
          </label>
          <input id="own-name" name="fullName" required autoComplete="name" placeholder="Your full name" className={FIELD_CLASS} />
        </div>
        <div>
          <label className={LABEL_CLASS} htmlFor="own-whatsapp">
            WhatsApp number
          </label>
          <input id="own-whatsapp" name="whatsapp" type="tel" required autoComplete="tel" inputMode="tel" placeholder="0712 345 678" className={FIELD_CLASS} />
        </div>
        <div className="sm:col-span-2">
          <label className={LABEL_CLASS} htmlFor="own-email">
            Email <span className="font-normal text-white/50">(optional)</span>
          </label>
          <input id="own-email" name="email" type="email" autoComplete="email" placeholder="you@example.com" className={FIELD_CLASS} />
        </div>
      </div>

      <ChoiceGroup name="capitalRange" legend="How much capital are you prepared to deploy?" options={CAPITAL_RANGES} required />

      <div>
        <ChoiceGroup
          name="locationAccess"
          legend="Do you already have access to a potential location?"
          options={LOCATION_ACCESS_OPTIONS}
          required
          onChangeValue={setLocationAccess}
        />
      </div>

      {locationAccess !== 'no' ? (
        <fieldset>
          <legend className={LABEL_CLASS}>
            What kind of locations can you access?{' '}
            <span className="font-normal text-white/50">(select all that apply)</span>
          </legend>
          <div className="flex flex-wrap gap-2">
            {LOCATION_TYPES.map((option) => {
              const checked = locationTypes.includes(option.value);
              return (
                <label
                  key={option.value}
                  className={cn(
                    'cursor-pointer rounded-full border px-4 py-2 text-sm font-medium transition-colors',
                    checked ? 'border-primary/60 bg-primary/20 text-white' : 'border-white/15 bg-white/[0.04] text-white/70 hover:bg-white/10',
                  )}
                >
                  <input type="checkbox" className="sr-only" checked={checked} onChange={() => toggleLocationType(option.value)} />
                  {option.label}
                </label>
              );
            })}
          </div>
        </fieldset>
      ) : null}

      <ChoiceGroup name="ownerProfile" legend="Which describes you best?" options={OWNER_PROFILES} required stacked />

      {error ? (
        <p role="alert" className="rounded-xl border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-200">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={status === 'submitting'}
        className="from-primary to-home-orange-glow inline-flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-br px-8 py-4 text-base font-bold tracking-wide text-white uppercase shadow-[0_18px_50px_-14px_rgb(255_122_0/0.6)] transition-all hover:-translate-y-0.5 disabled:translate-y-0 disabled:opacity-70 sm:text-lg"
      >
        {status === 'submitting' ? (
          <>
            <Loader2 className="size-5 animate-spin" aria-hidden="true" />
            Sending…
          </>
        ) : (
          <>
            Check my fit
            <ArrowRight className="size-5" aria-hidden="true" />
          </>
        )}
      </button>
    </form>
  );
}

function ChoiceGroup({
  name,
  legend,
  options,
  required,
  stacked,
  onChangeValue,
}: {
  name: string;
  legend: string;
  options: readonly { value: string; label: string }[];
  required?: boolean;
  stacked?: boolean;
  onChangeValue?: (value: string) => void;
}) {
  return (
    <fieldset>
      <legend className={LABEL_CLASS}>{legend}</legend>
      <div className={cn('flex flex-wrap gap-2', stacked && 'flex-col')}>
        {options.map((option) => (
          <label
            key={option.value}
            className="has-checked:border-primary/60 has-checked:bg-primary/20 has-checked:text-white flex cursor-pointer items-center rounded-full border border-white/15 bg-white/[0.04] px-4 py-2.5 text-sm font-medium text-white/75 transition-colors hover:bg-white/10"
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              required={required}
              onChange={() => onChangeValue?.(option.value)}
              className="sr-only"
            />
            {option.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** After a submission — focusable so the confirmation is announced, not silently swapped in under a person who was still looking at the form. */
function SuccessState({ ref }: { ref: React.Ref<HTMLDivElement> }) {
  return (
    <div ref={ref} tabIndex={-1} className="flex flex-col items-center gap-5 rounded-2xl border border-white/10 bg-white/[0.04] p-8 text-center outline-none sm:p-12">
      <span className="bg-primary/15 text-primary flex size-16 items-center justify-center rounded-full">
        <Check className="size-8" strokeWidth={3} aria-hidden="true" />
      </span>
      <h3 className="font-display text-3xl text-white sm:text-4xl">Application received.</h3>
      <p className="max-w-md text-base leading-relaxed text-white/75">
        We’ll review your details and contact you about the next step.
      </p>
    </div>
  );
}
