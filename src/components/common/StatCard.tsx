import React from 'react';
import { ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react';

export interface StatCardTrend {
  value: string;
  direction: 'up' | 'down' | 'neutral';
  /** When false, an "up" trend reads as bad news (e.g. refund rate) and is shown in danger tone. */
  positiveIsGood?: boolean;
}

interface StatCardProps {
  label: string;
  value: React.ReactNode;
  icon?: React.ElementType;
  helpText?: string;
  trend?: StatCardTrend;
  loading?: boolean;
  emphasis?: boolean;
}

export const StatCard: React.FC<StatCardProps> = ({
  label,
  value,
  icon: Icon,
  helpText,
  trend,
  loading = false,
  emphasis = false
}) => {
  if (loading) {
    return (
      <div
        className="bg-creator-surface border border-creator-border rounded-creator-card p-6 animate-pulse"
        aria-hidden="true"
      >
        <div className="h-3 w-20 bg-creator-surface-hover rounded-full" />
        <div className="h-8 w-28 bg-creator-surface-hover rounded-full mt-4" />
        <div className="h-3 w-16 bg-creator-surface-hover rounded-full mt-3" />
      </div>
    );
  }

  const trendGood = trend ? (trend.positiveIsGood ?? true) === (trend.direction === 'up') : true;
  const TrendIcon = trend ? (trend.direction === 'up' ? ArrowUpRight : trend.direction === 'down' ? ArrowDownRight : Minus) : null;

  return (
    <div
      className={`rounded-creator-card p-6 border transition-colors ${
        emphasis
          ? 'bg-creator-brand/10 border-creator-brand/30'
          : 'bg-creator-surface border-creator-border'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="text-creator-caption font-semibold uppercase tracking-wide text-creator-ink-faint">
          {label}
        </span>
        {Icon && (
          <Icon className={`h-4 w-4 shrink-0 ${emphasis ? 'text-creator-brand' : 'text-creator-ink-faint'}`} aria-hidden="true" />
        )}
      </div>

      <p className="text-creator-card-title font-bold text-creator-ink mt-2 tabular-nums">{value}</p>

      {(helpText || trend) && (
        <div className="flex items-center gap-2 mt-3">
          {trend && TrendIcon && (
            <span
              className={`inline-flex items-center gap-0.5 text-creator-caption font-semibold ${
                trend.direction === 'neutral'
                  ? 'text-creator-ink-faint'
                  : trendGood
                  ? 'text-creator-success'
                  : 'text-creator-danger'
              }`}
            >
              <TrendIcon className="h-3.5 w-3.5" aria-hidden="true" />
              {trend.value}
            </span>
          )}
          {helpText && <span className="text-creator-caption text-creator-ink-faint">{helpText}</span>}
        </div>
      )}
    </div>
  );
};
