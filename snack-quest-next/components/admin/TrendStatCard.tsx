'use client';

import type { ReactNode } from 'react';
import { Area, AreaChart, ResponsiveContainer } from 'recharts';
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
      <CardContent className="flex flex-col gap-4 p-6">
        <div className="flex items-center justify-between gap-3">
          <span
            aria-hidden="true"
            className={cn('flex size-10 shrink-0 items-center justify-center rounded-full', TONE_CLASSES[tone])}
          >
            {icon}
          </span>
        </div>

        <div>
          <p className="text-caption text-muted-foreground font-medium tracking-wide uppercase">{label}</p>
          <p className="text-foreground mt-1.5 text-[1.75rem] leading-none font-semibold tabular-nums">{value}</p>
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
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={sparkline.map((v) => ({ v }))} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id={`sparkline-${label.replace(/\s+/g, '-')}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area
                type="monotone"
                dataKey="v"
                stroke="var(--color-primary)"
                strokeWidth={1.5}
                fill={`url(#sparkline-${label.replace(/\s+/g, '-')})`}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : null}
    </Card>
  );
}
