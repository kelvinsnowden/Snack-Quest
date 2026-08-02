import type { LucideIcon } from 'lucide-react';
import { Reveal } from './Reveal';

/**
 * Second-level heading in the home page's voice (§ Website
 * consistency) — `font-display`, uppercase, revealed on scroll. The
 * `id` is required rather than optional so every section it titles can
 * be wired to its parent's `aria-labelledby`.
 */
export function SectionHeading({
  id,
  children,
  icon: Icon,
}: {
  id: string;
  children: React.ReactNode;
  icon?: LucideIcon;
}) {
  return (
    <Reveal>
      <h2
        id={id}
        className="font-display text-section-title flex items-center gap-3 font-normal tracking-tight uppercase"
      >
        {Icon ? (
          <Icon className="text-secondary size-6 shrink-0" aria-hidden="true" />
        ) : null}
        {children}
      </h2>
    </Reveal>
  );
}
