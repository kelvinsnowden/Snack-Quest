import { cn } from '@/lib/utils';

/**
 * A small fill-level indicator — used for a machine's overall stock
 * level (My Machines list, machine Overview) and, per-slot, in the
 * Inventory tab. Colour bands mirror the same low-stock threshold
 * `machineSlotService.checkLowStock` already uses
 * (`LOW_STOCK_THRESHOLD_FRACTION = 0.2`), restated here as a 0–100
 * scale rather than imported directly — this is a presentation band,
 * not the threshold decision itself, which stays server-side.
 */
export function StockLevelBar({ percent, className }: { percent: number; className?: string }) {
  const clamped = Math.max(0, Math.min(100, percent));
  const tone = clamped <= 20 ? 'bg-danger' : clamped <= 50 ? 'bg-warning' : 'bg-success';

  return (
    <div className={cn('h-1.5 w-full overflow-hidden rounded-full bg-border', className)} role="progressbar" aria-valuenow={Math.round(clamped)} aria-valuemin={0} aria-valuemax={100}>
      <div className={cn('h-full rounded-full transition-[width]', tone)} style={{ width: `${clamped}%` }} />
    </div>
  );
}
