'use client';

import { trackEvent } from '@/lib/analytics/trackEvent';
import { MACHINE_OWNER_EVENTS, type MachineOwnerCtaSource } from '@/lib/analytics/machineOwnerEvents';
import { cn } from '@/lib/utils';

/**
 * The one action this page asks for, wherever it appears
 * (§ machine-owner lead-generation landing page) — mirrors
 * `InvestCta`'s own contract exactly, targeting the application form
 * further down the page instead of the investor one.
 */
export function OwnCta({
  source,
  children,
  className,
  size = 'md',
  variant = 'primary',
  onNavigate,
}: {
  source: MachineOwnerCtaSource;
  children: React.ReactNode;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'primary' | 'ghost';
  onNavigate?: () => void;
}) {
  return (
    <a
      href="#apply"
      data-own-cta="true"
      onClick={() => {
        trackEvent(MACHINE_OWNER_EVENTS.ctaClicked, { source });
        onNavigate?.();
      }}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-full font-semibold tracking-tight transition-all duration-300',
        'focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none',
        size === 'sm' && 'px-4 py-2 text-sm',
        size === 'md' && 'px-6 py-3 text-base',
        size === 'lg' && 'px-8 py-4 text-lg',
        variant === 'primary' &&
          'bg-primary text-primary-foreground focus-visible:ring-primary shadow-[0_14px_34px_-14px_rgb(255_122_0/0.7)] hover:-translate-y-0.5 hover:bg-own-accent-ink hover:shadow-[0_20px_44px_-16px_rgb(194_87_0/0.7)] active:translate-y-0 motion-reduce:transition-none motion-reduce:hover:translate-y-0',
        variant === 'ghost' &&
          'border border-border bg-background text-foreground hover:bg-surface focus-visible:ring-primary',
        className,
      )}
    >
      {children}
    </a>
  );
}
