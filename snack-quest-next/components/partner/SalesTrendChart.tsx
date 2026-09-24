'use client';

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { OwnerSalesTrendPoint } from '@/services/ownerPortalService';

/**
 * The Owner Portal's own sales-trend chart — same recharts primitive
 * and token usage as `components/admin/RevenueChart.tsx`, without
 * that component's admin-only i18n dictionary coupling (the Owner
 * Portal has one locale, `en-KE`, the same as every other owner-facing
 * currency figure in this codebase already uses).
 */
function formatShortDate(date: string): string {
  return new Date(date).toLocaleDateString('en-KE', { day: 'numeric', month: 'short' });
}

function ChartTooltip({ active, payload }: { active?: boolean; payload?: { payload: OwnerSalesTrendPoint }[] }) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  return (
    <div className="rounded-md border border-border bg-surface px-3 py-2 text-xs shadow-lg">
      <p className="font-medium text-foreground">{formatShortDate(point.date)}</p>
      <p className="text-muted-foreground">
        KES {point.revenueKes.toLocaleString('en-KE')} · {point.unitsSold} unit{point.unitsSold === 1 ? '' : 's'}
      </p>
    </div>
  );
}

export function SalesTrendChart({ points }: { points: OwnerSalesTrendPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={points} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
        <defs>
          <linearGradient id="ownerSalesTrendFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.25} />
            <stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
        <XAxis
          dataKey="date"
          tickFormatter={formatShortDate}
          tick={{ fill: 'var(--color-muted-foreground)', fontSize: 12 }}
          axisLine={{ stroke: 'var(--color-border)' }}
          tickLine={false}
          interval="preserveStartEnd"
        />
        <YAxis tick={{ fill: 'var(--color-muted-foreground)', fontSize: 12 }} axisLine={false} tickLine={false} width={48} />
        <Tooltip content={<ChartTooltip />} cursor={{ stroke: 'var(--color-border)' }} />
        <Area type="monotone" dataKey="revenueKes" stroke="var(--color-primary)" strokeWidth={2} fill="url(#ownerSalesTrendFill)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}
