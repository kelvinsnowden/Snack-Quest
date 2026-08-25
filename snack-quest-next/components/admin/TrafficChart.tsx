'use client';

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { TrafficDay } from '@/services/businessAnalyticsService';

import { useI18n, useLocale } from './i18n/LocaleProvider';
import { LOCALE_HTML_LANG } from '@/lib/i18n/locales';

const PRIMARY = '#ff7a00';
const SECONDARY = '#8a63ff';

function formatShortDate(date: string, locale: string): string {
  // The portal's language, not a fixed locale: "27 Jul" printed under a
  // Chinese heading is exactly the sort of half-translation that makes
  // a localised screen still read as foreign.
  return new Date(date).toLocaleDateString(locale, { day: 'numeric', month: 'short' });
}

function ChartTooltip({ active, payload }: { active?: boolean; payload?: { payload: TrafficDay }[] }) {
  const dateLocale = LOCALE_HTML_LANG[useLocale()];
  const { dict, t } = useI18n();
  if (!active || !payload?.length) return null;
  const day = payload[0].payload;
  return (
    <div className="rounded-md border border-border bg-surface px-3 py-2 text-xs shadow-lg">
      <p className="font-medium text-foreground">{formatShortDate(day.date, dateLocale)}</p>
      <p className="text-muted-foreground">
        {t(day.visits === 1 ? dict.dashboard.visitCountOne : dict.dashboard.visitCountMany, {
          count: day.visits,
        })}{' '}
        ·{' '}
        {t(
          day.uniqueVisitors === 1
            ? dict.dashboard.visitorCountOne
            : dict.dashboard.visitorCountMany,
          { count: day.uniqueVisitors },
        )}
      </p>
    </div>
  );
}

export function TrafficChart({ days }: { days: TrafficDay[] }) {
  const dateLocale = LOCALE_HTML_LANG[useLocale()];
  const { dict } = useI18n();
  return (
    <ResponsiveContainer width="100%" height={260}>
      <AreaChart data={days} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
        <defs>
          <linearGradient id="traffic-visits" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={PRIMARY} stopOpacity={0.3} />
            <stop offset="100%" stopColor={PRIMARY} stopOpacity={0} />
          </linearGradient>
          <linearGradient id="traffic-visitors" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={SECONDARY} stopOpacity={0.3} />
            <stop offset="100%" stopColor={SECONDARY} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
        <XAxis
          dataKey="date"
          tickFormatter={(date: string) => formatShortDate(date, dateLocale)}
          tick={{ fill: 'var(--color-muted-foreground)', fontSize: 12 }}
          axisLine={{ stroke: 'var(--color-border)' }}
          tickLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          tick={{ fill: 'var(--color-muted-foreground)', fontSize: 12 }}
          axisLine={false}
          tickLine={false}
          width={40}
          allowDecimals={false}
        />
        <Tooltip content={<ChartTooltip />} cursor={{ stroke: 'var(--color-border)' }} />
        <Area
          type="monotone"
          dataKey="visits"
          stroke={PRIMARY}
          strokeWidth={2}
          fill="url(#traffic-visits)"
          name={dict.dashboard.pageViews}
        />
        <Area
          type="monotone"
          dataKey="uniqueVisitors"
          stroke={SECONDARY}
          strokeWidth={2}
          fill="url(#traffic-visitors)"
          name={dict.dashboard.uniqueVisitors}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
