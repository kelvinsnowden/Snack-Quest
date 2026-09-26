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
      onClick={() => {
        trackEvent(MACHINE_OWNER_EVENTS.ctaClicked, { source });
        onNavigate?.();
      }}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-full font-semibold tracking-tight transition-all duration-300',
        'focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent focus-visible:outline-none',
        size === 'sm' && 'px-4 py-2 text-sm',
        size === 'md' && 'px-6 py-3 text-base',
        size === 'lg' && 'px-8 py-4 text-lg',
        variant === 'primary' &&
          'from-primary to-home-orange-glow focus-visible:ring-primary bg-gradient-to-br text-white shadow-[0_18px_50px_-14px_rgb(255_122_0/0.6)] hover:-translate-y-0.5 hover:shadow-[0_26px_60px_-14px_rgb(255_122_0/0.75)] active:translate-y-0',
        variant === 'ghost' &&
          'border border-white/25 bg-white/5 text-white hover:bg-white/15 focus-visible:ring-white/60',
        className,
      )}
    >
      {children}
    </a>
  );
}
