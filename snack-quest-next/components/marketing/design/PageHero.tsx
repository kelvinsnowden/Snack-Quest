import type { LucideIcon } from 'lucide-react';
import { Reveal } from './Reveal';

/**
 * The home hero's typographic treatment, reduced to what an inner page
 * needs (§ Website consistency): the eyebrow pill, the `font-display`
 * uppercase headline with a colour-accented tail, and the subtitle —
 * staged on the same 0/120/200ms Reveal cadence the home page uses.
 *
 * Inner pages get a smaller clamp than the home hero's
 * `clamp(2.75rem,8vw,5.5rem)` on purpose. The home page is the entry
 * point and earns the larger type; a policy or FAQ page opening at the
 * same scale reads as shouting rather than as the same design system.
 */
/**
 * A closed set rather than a free `className`, so a page cannot invent
 * a heading colour outside the palette. `danger` exists for the status
 * page's disruption state, where "operational" orange would be a lie.
 */
const ACCENT_TONE = {
  primary: 'text-primary',
  secondary: 'text-secondary',
  danger: 'text-danger',
} as const;

export function PageHero({
  eyebrow,
  eyebrowIcon: EyebrowIcon,
  title,
  accent,
  accentTone = 'primary',
  subtitle,
}: {
  eyebrow: string;
  eyebrowIcon?: LucideIcon;
  title: string;
  /** Trailing words rendered in the accent colour, as on the home hero. */
  accent?: string;
  accentTone?: keyof typeof ACCENT_TONE;
  subtitle?: React.ReactNode;
}) {
  return (
    <header>
      <Reveal>
        <p className="border-foreground/10 text-caption text-foreground/70 inline-flex items-center gap-2 rounded-full border bg-white/70 px-4 py-1.5 font-semibold tracking-wide uppercase backdrop-blur-sm">
          {EyebrowIcon ? (
            <EyebrowIcon className="text-primary size-3.5" aria-hidden="true" />
          ) : null}
          {eyebrow}
        </p>
      </Reveal>

      <Reveal delayMs={120}>
        <h1 className="font-display mt-6 text-[clamp(2.25rem,6vw,3.5rem)] leading-[0.95] font-normal tracking-tight text-balance uppercase">
          <span className="text-foreground">{title}</span>
          {accent ? (
            <span className={ACCENT_TONE[accentTone]}> {accent}</span>
          ) : null}
        </h1>
      </Reveal>

      {subtitle ? (
        <Reveal delayMs={200}>
          <p className="text-subtitle text-foreground/75 mt-6 max-w-2xl">
            {subtitle}
          </p>
        </Reveal>
      ) : null}
    </header>
  );
}
