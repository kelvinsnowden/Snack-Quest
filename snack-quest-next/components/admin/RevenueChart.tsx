'use client';

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { RevenueDay } from '@/services/businessAnalyticsService';

import { useI18n, useLocale } from './i18n/LocaleProvider';
import { LOCALE_HTML_LANG } from '@/lib/i18n/locales';

const PRIMARY = '#ff7a00';

function formatShortDate(date: string, locale: string): string {
  // The portal's language, not a fixed locale: "27 Jul" printed under a
  // Chinese heading is exactly the sort of half-translation that makes
  // a localised screen still read as foreign.
  return new Date(date).toLocaleDateString(locale, { day: 'numeric', month: 'short' });
}

function ChartTooltip({ active, payload }: { active?: boolean; payload?: { payload: RevenueDay }[] }) {
  const dateLocale = LOCALE_HTML_LANG[useLocale()];
  const { dict, t } = useI18n();
  if (!active || !payload?.length) return null;
  const day = payload[0].payload;
  return (
    <div className="rounded-md border border-border bg-surface px-3 py-2 text-xs shadow-lg">
      <p className="font-medium text-foreground">{formatShortDate(day.date, dateLocale)}</p>
      <p className="text-muted-foreground">
        KES {day.revenueKes.toLocaleString('en-KE')} ·{' '}
        {t(
          day.orderCount === 1 ? dict.dashboard.orderCountOne : dict.dashboard.orderCountMany,
          { count: day.orderCount },
        )}
      </p>
    </div>
  );
}

export function RevenueChart({ days }: { days: RevenueDay[] }) {
  const dateLocale = LOCALE_HTML_LANG[useLocale()];
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={days} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
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
          width={48}
        />
        <Tooltip content={<ChartTooltip />} cursor={{ fill: 'var(--color-border)', opacity: 0.3 }} />
        <Bar dataKey="revenueKes" fill={PRIMARY} radius={[4, 4, 0, 0]} maxBarSize={28} />
      </BarChart>
    </ResponsiveContainer>
  );
}
