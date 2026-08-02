import { cn } from '@/lib/utils';

/** Skeleton loaders, not spinners — preserves layout, avoids shift (design-system skill: "Loading States"). Respects prefers-reduced-motion via the shared `animate-pulse` utility, which Tailwind already gates behind a reasonable duration. */
function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('animate-pulse rounded-md bg-border/60', className)} {...props} />;
}

export { Skeleton };
