'use client';

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';

export interface DonutSlice {
  key: string;
  label: string;
  count: number;
  /** A semantic token color, e.g. 'var(--color-success)' — never an arbitrary hue; see the `dataviz` skill's status-color rule. */
  color: string;
}

function ChartTooltip({ active, payload }: { active?: boolean; payload?: { payload: DonutSlice }[] }) {
  if (!active || !payload?.length) return null;
  const slice = payload[0].payload;
  return (
    <div className="rounded-md border border-border bg-surface px-3 py-2 text-xs shadow-lg">
      <p className="font-medium text-foreground">{slice.label}</p>
      <p className="text-muted-foreground">
        {slice.count} shipment{slice.count === 1 ? '' : 's'}
      </p>
    </div>
  );
}

/**
 * A small status-composition donut (§ Admin: Dashboard) — real counts
 * only, zero-count statuses omitted entirely rather than shown as an
 * empty slice. Color always follows the entity's status (success/
 * secondary/warning/danger/muted), never a cycled categorical palette
 * — the same reserved-status-color rule `OrderStatusBadge` already
 * applies to order status, applied here to shipment status.
 */
export function StatusDonutChart({ slices, totalLabel }: { slices: DonutSlice[]; totalLabel: string }) {
  const total = slices.reduce((sum, s) => sum + s.count, 0);
  const nonZero = slices.filter((s) => s.count > 0);

  return (
    <div className="flex items-center gap-5">
      <div className="relative size-28 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={nonZero}
              dataKey="count"
              nameKey="label"
              innerRadius="72%"
              outerRadius="100%"
              paddingAngle={nonZero.length > 1 ? 3 : 0}
              stroke="none"
              isAnimationActive={false}
            >
              {nonZero.map((slice) => (
                <Cell key={slice.key} fill={slice.color} />
              ))}
            </Pie>
            <Tooltip content={<ChartTooltip />} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xl font-semibold tabular-nums text-foreground">{total}</span>
          <span className="text-[10px] text-muted-foreground">{totalLabel}</span>
        </div>
      </div>
      <ul className="flex flex-1 flex-col gap-1.5">
        {nonZero.length > 0 ? (
          nonZero.map((slice) => (
            <li key={slice.key} className="flex items-center justify-between gap-3 text-sm">
              <span className="flex items-center gap-2 text-muted-foreground">
                <span aria-hidden="true" className="size-2 rounded-full" style={{ backgroundColor: slice.color }} />
                {slice.label}
              </span>
              <span className="tabular-nums font-medium text-foreground">{slice.count}</span>
            </li>
          ))
        ) : (
          <li className="text-sm text-muted-foreground">Nothing recorded yet.</li>
        )}
      </ul>
    </div>
  );
}
