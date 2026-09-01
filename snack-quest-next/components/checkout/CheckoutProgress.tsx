'use client';

import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { StageDefinition } from '@/lib/checkout/stages';

/**
 * Where the customer is in the journey (§ checkout redesign).
 *
 * Orientation, not navigation. It says how far along you are and how
 * much is left, which is the question a long checkout raises and a
 * single scrolling page answers badly.
 *
 * A completed stage is a button; the current one and anything ahead of
 * it are not. Jumping back to change a box is a real thing customers
 * do, and making them press "back" three times to reach it is worse
 * than letting them tap the step they mean. Jumping *forward* is not
 * offered, because the stage ahead may be blocked by a field they have
 * not filled — a control that sometimes silently refuses is worse than
 * one that is plainly not there.
 *
 * The list is derived from the box, so a box with no picks shows three
 * stages rather than a fourth that will never be reached.
 */
export function CheckoutProgress({
  stages,
  currentIndex,
  onJumpTo,
}: {
  stages: StageDefinition[];
  currentIndex: number;
  onJumpTo: (index: number) => void;
}) {
  return (
    <nav aria-label="Checkout progress" className="border-border bg-surface rounded-xl border p-4">
      <ol className="flex items-start">
        {stages.map((stage, index) => {
          const done = index < currentIndex;
          const current = index === currentIndex;
          return (
            <li key={stage.id} className="flex min-w-0 flex-1 items-start">
              <div className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
                {done ? (
                  <button
                    type="button"
                    onClick={() => onJumpTo(index)}
                    className="bg-primary text-primary-foreground focus-visible:ring-primary flex size-8 shrink-0 items-center justify-center rounded-full focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
                    aria-label={`Back to ${stage.label}`}
                  >
                    <Check className="size-4" strokeWidth={3} aria-hidden="true" />
                  </button>
                ) : (
                  <span
                    className={cn(
                      'flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold',
                      current
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-border/60 text-muted-foreground',
                    )}
                    // The current stage is announced; the ones ahead are
                    // scenery until they are reachable.
                    aria-current={current ? 'step' : undefined}
                  >
                    {index + 1}
                  </span>
                )}
                <span
                  className={cn(
                    'text-caption w-full text-center leading-tight text-balance',
                    current ? 'text-primary font-semibold' : 'text-muted-foreground',
                  )}
                >
                  {stage.label}
                </span>
              </div>

              {/*
                The connector sits between circles rather than beside
                labels, and is hidden from assistive technology — it is
                a line, and announcing it would interrupt the list of
                actual steps.
              */}
              {index < stages.length - 1 ? (
                <span
                  aria-hidden="true"
                  className={cn(
                    'mt-4 h-0.5 min-w-4 flex-1 rounded-full',
                    index < currentIndex ? 'bg-primary' : 'bg-border',
                  )}
                />
              ) : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
