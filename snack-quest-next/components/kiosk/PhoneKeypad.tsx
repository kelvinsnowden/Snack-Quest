'use client';

import { Delete } from 'lucide-react';
import { PHONE_MAX_DIGITS } from './format';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'clear', '0', 'back'] as const;

/**
 * An on-screen number pad for the M-Pesa number. A machine's touchscreen
 * has no keyboard, and the system one covers half the screen and offers
 * letters nobody needs here; big number keys are faster and cannot type
 * anything that is not a digit.
 */
export function PhoneKeypad({ digits, onChange, disabled = false }: { digits: string; onChange: (digits: string) => void; disabled?: boolean }) {
  function press(key: (typeof KEYS)[number]) {
    if (key === 'clear') onChange('');
    else if (key === 'back') onChange(digits.slice(0, -1));
    else if (digits.length < PHONE_MAX_DIGITS) onChange(digits + key);
  }

  return (
    <div role="group" aria-label="Number pad" className="grid grid-cols-3 gap-3">
      {KEYS.map((key) => (
        <button
          key={key}
          type="button"
          disabled={disabled || (key === 'back' && digits.length === 0) || (key === 'clear' && digits.length === 0)}
          onClick={() => press(key)}
          aria-label={key === 'back' ? 'Delete last digit' : key === 'clear' ? 'Clear number' : undefined}
          className={`flex h-16 items-center justify-center rounded-lg text-card-title font-semibold tabular-nums transition-colors duration-100 ease-out outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-40 motion-reduce:transition-none lg:h-20 ${
            key === 'clear' || key === 'back' ? 'bg-transparent text-small font-medium text-muted-foreground active:bg-border/40' : 'bg-background text-foreground active:bg-border/60'
          }`}
        >
          {key === 'back' ? <Delete className="size-7" aria-hidden="true" /> : key === 'clear' ? 'Clear' : key}
        </button>
      ))}
    </div>
  );
}
