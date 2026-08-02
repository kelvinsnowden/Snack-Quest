import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { PortalCard } from './PortalCard';

/**
 * A single headline metric (§ Creator Portal premium rebuild).
 *
 * Typography-led on purpose. The version this replaces paired every
 * number with a 40px tinted icon tile, which is the exact pattern the
 * design-system rules call out — "never create random dashboard cards
 * with gradients and oversized icons". The icon repeated what the
 * label already said, and competed with the number for the eye.
 *
 * So the number is the only loud thing: `tabular-nums` so digits do not
 * jitter between values, and a size that reads at arm's length on a
 * phone. Label above in caption case, optional context below.
 *
 * `Loading` is colocated rather than left to each caller, because a
 * skeleton whose shape does not match the content it replaces causes
 * exactly the layout shift skeletons exist to prevent.
 */
export function StatTile({
  label,
  value,
  hint,
  emphasis = 'default',
  className,
}: {
  label: string;
  value: string;
  hint?: string;
  /** `strong` marks the one figure a screen is really about. */
  emphasis?: 'default' | 'strong';
  className?: string;
}) {
  return (
    <PortalCard className={className}>
      <p className="text-caption text-muted-foreground font-medium tracking-wide uppercase">
        {label}
      </p>
      <p
        className={cn(
          'mt-2 font-semibold tabular-nums',
          emphasis === 'strong'
            ? 'text-primary text-[2rem] leading-none'
            : 'text-foreground text-[1.75rem] leading-none',
        )}
      >
        {value}
      </p>
      {hint ? (
        <p className="text-small text-muted-foreground mt-2">{hint}</p>
      ) : null}
    </PortalCard>
  );
}

StatTile.Loading = function StatTileLoading() {
  return (
    <PortalCard>
      <Skeleton className="h-3 w-24" />
      <Skeleton className="mt-3 h-7 w-32" />
    </PortalCard>
  );
};
