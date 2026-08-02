import type { FunnelStage } from '@/services/businessAnalyticsService';

export function FunnelChart({ stages }: { stages: FunnelStage[] }) {
  const max = Math.max(1, ...stages.map((s) => s.count));

  return (
    <div className="flex flex-col gap-4">
      {stages.map((stage, index) => {
        const widthPct = Math.max(4, Math.round((stage.count / max) * 100));
        const previous = index > 0 ? stages[index - 1].count : null;
        const conversionPct = previous && previous > 0 ? Math.round((stage.count / previous) * 100) : null;

        return (
          <div key={stage.step} className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between text-sm">
              <span className="font-medium text-foreground">{stage.step}</span>
              <span className="tabular-nums text-muted-foreground">
                {stage.count.toLocaleString('en-KE')}
                {conversionPct !== null ? ` · ${conversionPct}% of previous` : ''}
              </span>
            </div>
            <div className="h-3 w-full rounded-full bg-border/30">
              <div
                className="h-3 rounded-full bg-primary transition-[width]"
                style={{ width: `${widthPct}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
