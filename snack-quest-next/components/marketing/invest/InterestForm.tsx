'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Check, Loader2 } from 'lucide-react';
import { INVESTOR_TYPES } from '@/types/investorInterest';
import { INTEREST_DISCLAIMER } from '@/lib/invest/raise';
import { trackEvent } from '@/lib/analytics/trackEvent';
import { INVESTOR_EVENTS } from '@/lib/analytics/investorEvents';
import { cn } from '@/lib/utils';

type Status = 'idle' | 'submitting' | 'done';

const FIELD_CLASS =
  'w-full rounded-xl border border-white/15 bg-white/[0.06] px-4 py-3 text-base text-white placeholder:text-white/40 transition-colors focus:border-primary/70 focus:bg-white/10 focus:outline-none';

const LABEL_CLASS = 'mb-2 block text-sm font-medium text-white/85';

/**
 * The expression of interest (§ investor interest page).
 *
 * Collects details and nothing else. There is no amount field that
 * adds up to a total, no allocation, no payment step, and no wording
 * anywhere that could be read as an offer — see `INTEREST_DISCLAIMER`,
 * which is rendered from the same constant the FAQ answer uses so the
 * two can never say different things.
 *
 * Validation is duplicated here and on the server on purpose: this
 * half exists so a person is told early and politely, the server half
 * exists because the route is reachable with `curl`.
 */
export function InterestForm() {
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);
  const successRef = useRef<HTMLDivElement>(null);

  function markStarted() {
    if (started.current) return;
    started.current = true;
    trackEvent(INVESTOR_EVENTS.formStarted);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status === 'submitting') return;

    const form = event.currentTarget;
    const data = new FormData(form);
    const payload = {
      fullName: String(data.get('fullName') ?? '').trim(),
      email: String(data.get('email') ?? '').trim(),
      phone: String(data.get('phone') ?? '').trim(),
      location: String(data.get('location') ?? '').trim(),
      indicativeAmount: String(data.get('indicativeAmount') ?? '').trim(),
      investorType: String(data.get('investorType') ?? ''),
      motivation: String(data.get('motivation') ?? '').trim(),
      heardFrom: String(data.get('heardFrom') ?? '').trim(),
      wantsUpdates: data.get('wantsUpdates') === 'on',
      // Where they arrived from, when the browser tells us.
      referrer: typeof document !== 'undefined' ? document.referrer.slice(0, 120) : '',
    };

    setStatus('submitting');
    setError(null);
    trackEvent(INVESTOR_EVENTS.formSubmitted, { investorType: payload.investorType });

    try {
      const response = await fetch('/api/invest/interest', {
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
      trackEvent(INVESTOR_EVENTS.formCompleted);
      // Moves focus to the confirmation, so a screen reader announces
      // it and everyone else lands on the thing that just changed.
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
    <form
      onSubmit={handleSubmit}
      onChange={markStarted}
      className="flex flex-col gap-5"
      noValidate={false}
    >
      {/*
        `items-end`, so a label that wraps to two lines — "Amount you
        may potentially be interested in" does at every width — cannot
        drag its input below the one beside it. The inputs line up;
        the labels stack upward from them.
      */}
      <div className="grid gap-5 sm:grid-cols-2 sm:items-end">
        <div>
          <label className={LABEL_CLASS} htmlFor="invest-name">
            Full name
          </label>
          <input
            id="invest-name"
            name="fullName"
            required
            autoComplete="name"
            placeholder="Kelvin Kimathi"
            className={FIELD_CLASS}
          />
        </div>
        <div>
          <label className={LABEL_CLASS} htmlFor="invest-email">
            Email
          </label>
          <input
            id="invest-email"
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder="you@example.com"
            className={FIELD_CLASS}
          />
        </div>
        <div>
          <label className={LABEL_CLASS} htmlFor="invest-phone">
            Phone number
          </label>
          <input
            id="invest-phone"
            name="phone"
            type="tel"
            required
            autoComplete="tel"
            inputMode="tel"
            placeholder="0712 345 678"
            className={FIELD_CLASS}
          />
        </div>
        <div>
          <label className={LABEL_CLASS} htmlFor="invest-location">
            Location
          </label>
          <input
            id="invest-location"
            name="location"
            required
            autoComplete="address-level2"
            placeholder="Nairobi, Kenya"
            className={FIELD_CLASS}
          />
        </div>
        <div>
          <label className={LABEL_CLASS} htmlFor="invest-amount">
            Amount you may potentially be interested in{' '}
            <span className="font-normal text-white/50">(optional)</span>
          </label>
          <input
            id="invest-amount"
            name="indicativeAmount"
            placeholder="e.g. around KSh 500,000 — or not sure yet"
            className={FIELD_CLASS}
          />
        </div>
        <div>
          <label className={LABEL_CLASS} htmlFor="invest-type">
            Investor type
          </label>
          <select
            id="invest-type"
            name="investorType"
            required
            defaultValue=""
            className={cn(FIELD_CLASS, 'appearance-none')}
          >
            <option value="" disabled>
              Choose one
            </option>
            {INVESTOR_TYPES.map((option) => (
              <option key={option.value} value={option.value} className="text-[#120c22]">
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className={LABEL_CLASS} htmlFor="invest-why">
          Why are you interested in Snack Quest?{' '}
          <span className="font-normal text-white/50">(optional)</span>
        </label>
        <textarea
          id="invest-why"
          name="motivation"
          rows={4}
          placeholder="What caught your attention?"
          className={cn(FIELD_CLASS, 'resize-y')}
        />
      </div>

      <div>
        <label className={LABEL_CLASS} htmlFor="invest-heard">
          How did you hear about us?{' '}
          <span className="font-normal text-white/50">(optional)</span>
        </label>
        <input
          id="invest-heard"
          name="heardFrom"
          placeholder="TikTok, a friend, an event…"
          className={FIELD_CLASS}
        />
      </div>

      <label className="flex cursor-pointer items-start gap-3 text-sm text-white/80">
        <input
          type="checkbox"
          name="wantsUpdates"
          className="accent-primary mt-0.5 size-4 shrink-0 rounded"
        />
        <span>I’d like to receive future Snack Quest updates.</span>
      </label>

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
          'Express investor interest'
        )}
      </button>

      {/*
        Visible and readable, but not the loudest thing in the section —
        it is a legal statement of what this form is, not the pitch.
      */}
      <p className="text-center text-xs leading-relaxed text-white/45">{INTEREST_DISCLAIMER}</p>
    </form>
  );
}

/**
 * After a submission. Focusable so the confirmation is announced
 * rather than silently replacing the form somebody just filled in.
 */
function SuccessState({ ref }: { ref: React.Ref<HTMLDivElement> }) {
  return (
    <div
      ref={ref}
      tabIndex={-1}
      className="flex flex-col items-center gap-5 rounded-2xl border border-white/10 bg-white/[0.04] p-8 text-center outline-none sm:p-12"
    >
      <span className="bg-primary/15 text-primary flex size-16 items-center justify-center rounded-full">
        <Check className="size-8" strokeWidth={3} aria-hidden="true" />
      </span>
      <h3 className="font-display text-3xl text-white sm:text-4xl">You’re on the list.</h3>
      <p className="max-w-md text-base leading-relaxed text-white/75">
        Thanks for your interest in Snack Quest. We’ve received your details and will be in touch
        when we have more information to share about the opportunity.
      </p>
      <div className="mt-2 flex flex-col items-center gap-3 sm:flex-row">
        <Link
          href="/"
          onClick={() => trackEvent(INVESTOR_EVENTS.exploreClicked, { from: 'success' })}
          className="from-primary to-home-orange-glow inline-flex items-center gap-2 rounded-full bg-gradient-to-br px-7 py-3.5 text-sm font-bold tracking-wide text-white uppercase transition-transform hover:-translate-y-0.5"
        >
          Explore Snack Quest
          <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
        <a
          href="#opportunity"
          className="rounded-full border border-white/20 px-7 py-3.5 text-sm font-bold tracking-wide text-white/90 uppercase transition-colors hover:bg-white/10"
        >
          Back to the story
        </a>
      </div>
    </div>
  );
}
