import type { ReactNode } from 'react';
import { Check, Loader2, X } from 'lucide-react';
import { Confetti } from './PaymentShell';

/**
 * The pieces the three payment screens share (§ payment screen
 * rebuild). Kept together because their job is to make the waiting,
 * paid and failed states read as one family — a badge, a headline, a
 * receipt, the box — differing only in tone.
 */

type Tone = 'success' | 'failed' | 'waiting';

const BADGE: Record<Tone, string> = {
  success: 'bg-home-lime text-black',
  failed: 'bg-[#ff4d5e] text-black',
  waiting: 'bg-white/10 text-home-lime ring-1 ring-inset ring-white/15',
};

/**
 * The big circular status mark, with the confetti field behind it.
 *
 * The confetti belongs to the badge rather than the page so it stays
 * concentrated around the thing it is celebrating — spread over the
 * whole screen it stops reading as a burst and starts reading as
 * wallpaper.
 */
export function StatusBadge({ tone }: { tone: Tone }) {
  return (
    <div className="relative flex h-40 w-full items-center justify-center">
      <Confetti tone={tone === 'success' ? 'festive' : 'subdued'} />
      <span
        className={`flex size-[88px] items-center justify-center rounded-full ${BADGE[tone]} ${
          tone === 'success' ? 'shadow-[0_0_60px_-8px_rgba(200,255,0,0.55)]' : ''
        } ${tone === 'failed' ? 'shadow-[0_0_60px_-8px_rgba(255,77,94,0.5)]' : ''}`}
      >
        {tone === 'success' ? <Check className="size-11" strokeWidth={3.5} aria-hidden="true" /> : null}
        {tone === 'failed' ? <X className="size-11" strokeWidth={3.5} aria-hidden="true" /> : null}
        {tone === 'waiting' ? (
          <Loader2 className="size-11 motion-safe:animate-spin" strokeWidth={2.5} aria-hidden="true" />
        ) : null}
      </span>
    </div>
  );
}

/**
 * The display headline. Two lines, because the mock's rhythm depends on
 * it: a short coloured first word over a longer emphasised second.
 * `text-balance` is deliberately not used — the break is chosen, not
 * computed.
 */
export function StatusHeadline({
  lead,
  rest,
  leadClassName,
  restClassName,
}: {
  lead: string;
  rest: string;
  leadClassName: string;
  restClassName: string;
}) {
  return (
    // 2.25rem at the base width, not 2.5: "NOT COMPLETED" in this
    // display face runs edge to edge at 390px, and a 360px handset —
    // still common here — would clip it outright.
    <h1 className="font-display text-[2.25rem] leading-[0.95] font-normal uppercase min-[400px]:text-[2.5rem] sm:text-5xl">
      <span className={leadClassName}>{lead}</span>
      <br />
      <span className={restClassName}>{rest}</span>
    </h1>
  );
}

/** The receipt. A definition list, not a table — these are label/value pairs, and it reads correctly to a screen reader that way. */
export function DetailCard({ children }: { children: ReactNode }) {
  return (
    <dl className="w-full divide-y divide-white/10 rounded-2xl border border-white/10 bg-white/[0.04] px-4">
      {children}
    </dl>
  );
}

export function DetailRow({
  label,
  children,
  valueClassName = 'text-white',
}: {
  label: string;
  children: ReactNode;
  valueClassName?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3.5">
      <dt className="text-sm text-white/55">{label}</dt>
      <dd className={`text-right text-sm font-semibold tabular-nums ${valueClassName}`}>{children}</dd>
    </div>
  );
}

/**
 * M-PESA set as type rather than shipped as an image asset — it is two
 * words and a colour, it stays crisp at any density, and it costs no
 * extra request. Safaricom's own lockup is a wordmark, so this reads
 * as the brand without redistributing their logo file.
 */
export function MpesaMark() {
  return (
    <span className="inline-flex items-baseline gap-[1px] font-semibold tracking-tight">
      <span className="text-white">M</span>
      <span className="text-[#43b02a]">-PESA</span>
    </span>
  );
}
