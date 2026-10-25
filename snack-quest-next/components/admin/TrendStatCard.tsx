'use client';

import type { ReactNode } from 'react';
import { TrendingDown, TrendingUp } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

const TONE_CLASSES: Record<'primary' | 'success' | 'warning' | 'danger' | 'secondary', string> = {
  primary: 'bg-primary/10 text-primary',
  success: 'bg-success/10 text-success',
  warning: 'bg-warning/10 text-warning',
  danger: 'bg-danger/10 text-danger',
  secondary: 'bg-secondary/10 text-secondary',
};

export interface TrendStatCardProps {
  label: string;
  value: string;
  /** A rendered icon element (e.g. `<Banknote className="size-5" />`), not a component reference — this card is a Client Component, and a Server Component caller can only pass an already-resolved element across that boundary, not a raw function. */
  icon: ReactNode;
  tone?: keyof typeof TONE_CLASSES;
  /**
   * A real, computed comparison against a prior equal-length window
   * (e.g. `businessAnalyticsService`'s `previousPeriod`) — omit this
   * prop entirely for a metric with no honest "vs X" comparison
   * (a point-in-time count, an all-time total) rather than inventing
   * one. `percent` is signed; the arrow/colour follow its sign, never
   * spun positive when the real number is a decline.
   */
  trend?: {
    percent: number;
    comparisonLabel: string;
  };
  /** A real daily series (e.g. 30 days of revenue) to sketch as a sparkline — omit when no such series exists for this metric. */
  sparkline?: number[];
}

/**
 * The dashboard KPI card shared across Admin's dashboard/analytics and
 * Finance's revenue view (§ dashboard reference-image quality pass) —
 * one component so the three surfaces read as one product instead of
 * three different card styles for the same kind of number.
 *
 * Trend and sparkline are both optional and independent: a metric
 * with a real previous-period comparison but no daily series (or vice
 * versa) renders exactly that much, never a fabricated placeholder
 * for the part that isn't real.
 */
export function TrendStatCard({ label, value, icon, tone = 'primary', trend, sparkline }: TrendStatCardProps) {
  const trendIsUp = trend ? trend.percent >= 0 : null;

  return (
    <Card className="overflow-hidden">
      {/*
        Tighter on a phone (§ Admin mobile density pass). At desktop
        padding these cards were about 180px tall each and stacked one
        per row, so four numbers cost most of a screen. The figure
        itself stays large — it is the content; what shrank is the
        chrome around it.
      */}
      <CardContent className="flex flex-col gap-2.5 p-4 md:gap-4 md:p-6">
        <div className="flex items-center justify-between gap-3">
          <span
            aria-hidden="true"
            className={cn(
              'flex size-8 shrink-0 items-center justify-center rounded-full md:size-10',
              TONE_CLASSES[tone],
            )}
          >
            {icon}
          </span>
        </div>

        <div>
          <p className="text-caption text-muted-foreground font-medium tracking-wide uppercase">{label}</p>
          <p className="text-foreground mt-1.5 text-2xl leading-none font-semibold tabular-nums md:text-[1.75rem]">
            {value}
          </p>
        </div>

        {trend ? (
          <p
            className={cn(
              'inline-flex w-fit items-center gap-1 text-sm font-medium',
              trendIsUp ? 'text-success' : 'text-danger',
            )}
          >
            {trendIsUp ? (
              <TrendingUp className="size-3.5" aria-hidden="true" />
            ) : (
              <TrendingDown className="size-3.5" aria-hidden="true" />
            )}
            {Math.abs(trend.percent).toFixed(1)}% {trend.comparisonLabel}
          </p>
        ) : null}
      </CardContent>

      {sparkline && sparkline.length > 1 ? (
        <div className="h-12 w-full" aria-hidden="true">
          <Sparkline values={sparkline} gradientId={`sparkline-${label.replace(/\s+/g, '-')}`} />
        </div>
      ) : null}
    </Card>
  );
}

/**
 * A daily series as a filled line, drawn as plain SVG: it stretches to the
 * card's width and needs no charting library, so the many pages with a stat
 * card don't download one (recharts is ~90 KB compressed) just for this.
 */
function Sparkline({ values, gradientId }: { values: number[]; gradientId: string }) {
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const step = 100 / (values.length - 1);
  // Two units of headroom keep the stroke from being clipped at the top and bottom.
  const points = values.map((value, index) => `${(index * step).toFixed(2)},${(2 + (1 - (value - min) / span) * 46).toFixed(2)}`);
  const line = `M${points.join(' L')}`;
  return (
    <svg viewBox="0 0 100 50" preserveAspectRatio="none" className="size-full">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.35} />
          <stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={`${line} L100,50 L0,50 Z`} fill={`url(#${gradientId})`} />
      <path d={line} fill="none" stroke="var(--color-primary)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
