'use client';

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
  emphasis = false,
}) => {
  if (loading) {
    return (
      <div
        className="bg-creator-surface border-creator-border rounded-creator-card animate-pulse border p-6"
        aria-hidden="true"
      >
        <div className="bg-creator-surface-hover h-3 w-20 rounded-full" />
        <div className="bg-creator-surface-hover mt-4 h-8 w-28 rounded-full" />
        <div className="bg-creator-surface-hover mt-3 h-3 w-16 rounded-full" />
      </div>
    );
  }

  const trendGood = trend
    ? (trend.positiveIsGood ?? true) === (trend.direction === 'up')
    : true;
  const TrendIcon = trend
    ? trend.direction === 'up'
      ? ArrowUpRight
      : trend.direction === 'down'
        ? ArrowDownRight
        : Minus
    : null;

  return (
    <div
      className={`rounded-creator-card border p-6 transition-colors ${
        emphasis
          ? 'bg-creator-brand/10 border-creator-brand/30'
          : 'bg-creator-surface border-creator-border'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="text-creator-caption text-creator-ink-faint font-semibold tracking-wide uppercase">
          {label}
        </span>
        {Icon && (
          <Icon
            className={`h-4 w-4 shrink-0 ${emphasis ? 'text-creator-brand' : 'text-creator-ink-faint'}`}
            aria-hidden="true"
          />
        )}
      </div>

      <p className="text-creator-card-title text-creator-ink mt-2 font-bold tabular-nums">
        {value}
      </p>

      {(helpText || trend) && (
        <div className="mt-3 flex items-center gap-2">
          {trend && TrendIcon && (
            <span
              className={`text-creator-caption inline-flex items-center gap-0.5 font-semibold ${
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
          {helpText && (
            <span className="text-creator-caption text-creator-ink-faint">
              {helpText}
            </span>
          )}
        </div>
      )}
    </div>
  );
};
