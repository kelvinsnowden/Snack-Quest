import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import type { NextStep } from '@/lib/creator/nextStep';

/**
 * The single most useful thing a creator can do right now
 * (§ Creator Portal premium rebuild).
 *
 * Sits directly under the balance because the two together are the
 * whole opening question: here is your money, here is what moves it.
 * Everything below is detail a creator scrolls to, not something they
 * need in the first three seconds.
 *
 * One step, never a list. Five suggestions is a backlog, and a backlog
 * is the cognitive load this exists to remove.
 *
 * Tone is carried by a single accent stripe rather than by tinting the
 * whole card. A full-bleed warning colour under the saturated balance
 * card makes the top of the screen shout twice, and the balance should
 * always win.
 */

const TONE_ACCENT: Record<NextStep['tone'], string> = {
  neutral: 'bg-primary',
  positive: 'bg-success',
  blocked: 'bg-warning',
};

export function NextStepCard({ step }: { step: NextStep }) {
  return (
    <section
      aria-labelledby="next-step-heading"
      className="border-border bg-surface relative overflow-hidden rounded-lg border p-4 pl-5 md:p-6 md:pl-7"
    >
      <span
        aria-hidden="true"
        className={`absolute inset-y-0 left-0 w-1 ${TONE_ACCENT[step.tone]}`}
      />

      <p className="text-caption text-muted-foreground font-medium tracking-wide uppercase">
        Next
      </p>
      <h2
        id="next-step-heading"
        className="text-foreground mt-1.5 text-lg font-semibold"
      >
        {step.title}
      </h2>
      <p className="text-muted-foreground mt-1.5 max-w-prose text-sm">
        {step.body}
      </p>

      {/*
        Wrapped so the two links sit side by side with room to breathe
        on a wide screen and stack on a phone — never so close together
        that a thumb aiming for one lands on the other.
      */}
      {step.cta || step.secondaryCta ? (
        <div className="mt-4 flex flex-col gap-x-6 gap-y-2.5 sm:flex-row sm:items-center">
          {step.cta ? (
            <Link
              href={step.cta.href}
              className="text-primary focus-visible:ring-primary focus-visible:ring-offset-background inline-flex w-fit items-center gap-1.5 rounded-md text-sm font-semibold transition-transform duration-150 ease-out hover:translate-x-0.5 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
            >
              {step.cta.label}
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          ) : null}
          {step.secondaryCta ? (
            <Link
              href={step.secondaryCta.href}
              className="text-muted-foreground hover:text-foreground focus-visible:ring-primary focus-visible:ring-offset-background inline-flex w-fit items-center gap-1.5 rounded-md text-sm font-medium underline underline-offset-4 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
            >
              {step.secondaryCta.label}
            </Link>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
