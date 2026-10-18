'use client';

import { useMemo, useState } from 'react';
import type { TemperatureLogRow } from '@/lib/vending/temperatureLog';

const HOUR_MS = 60 * 60 * 1000;
const WIDTH = 640;
const HEIGHT = 200;
const PAD = { top: 12, right: 12, bottom: 24, left: 36 };
const hourLabel = new Intl.DateTimeFormat('en-KE', { timeZone: 'Africa/Nairobi', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const dayLabel = new Intl.DateTimeFormat('en-KE', { timeZone: 'Africa/Nairobi', weekday: 'short', day: 'numeric' });

/**
 * A machine's temperature, hour by hour: the average as a line, the
 * hour's lowest–highest as a band behind it, and the target range
 * shaded. Hours with no reading break the line rather than being drawn
 * across. Hover (or tap) an hour for its numbers; the CSV export is the
 * table view.
 */
export function TemperatureChart({ rows, fromMs, toMs, target }: { rows: TemperatureLogRow[]; fromMs: number; toMs: number; target: { minCelsius: number; maxCelsius: number } | null }) {
  const [hover, setHover] = useState<TemperatureLogRow | null>(null);

  const scale = useMemo(() => {
    const values = rows.flatMap((row) => [row.minCelsius, row.maxCelsius]).concat(target ? [target.minCelsius, target.maxCelsius] : []);
    const lo = Math.floor(Math.min(...values, 0) - 1);
    const hi = Math.ceil(Math.max(...values, 10) + 1);
    const x = (ms: number) => PAD.left + ((ms - fromMs) / Math.max(1, toMs - fromMs)) * (WIDTH - PAD.left - PAD.right);
    const y = (c: number) => PAD.top + ((hi - c) / (hi - lo)) * (HEIGHT - PAD.top - PAD.bottom);
    return { lo, hi, x, y };
  }, [rows, fromMs, toMs, target]);

  // Consecutive hours form one segment; a missing hour starts a new one.
  const segments = useMemo(() => {
    const out: TemperatureLogRow[][] = [];
    for (const row of rows) {
      const last = out.at(-1)?.at(-1);
      if (last && row.hourStartMs - last.hourStartMs <= HOUR_MS) out.at(-1)!.push(row);
      else out.push([row]);
    }
    return out;
  }, [rows]);

  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">No temperature readings in this period yet.</p>;
  }

  const { x, y, lo, hi } = scale;
  const mid = (row: TemperatureLogRow) => x(row.hourStartMs + HOUR_MS / 2);
  const ticks = [lo, Math.round((lo + hi) / 2), hi];
  const days: number[] = [];
  for (let day = Math.ceil((fromMs + 3 * HOUR_MS) / (24 * HOUR_MS)) * 24 * HOUR_MS - 3 * HOUR_MS; day < toMs; day += 24 * HOUR_MS) days.push(day);

  function onMove(event: React.PointerEvent<SVGSVGElement>) {
    const box = event.currentTarget.getBoundingClientRect();
    const ms = fromMs + (((event.clientX - box.left) / box.width) * WIDTH - PAD.left) / (WIDTH - PAD.left - PAD.right) * (toMs - fromMs);
    let best: TemperatureLogRow | null = null;
    for (const row of rows) if (!best || Math.abs(row.hourStartMs + HOUR_MS / 2 - ms) < Math.abs(best.hourStartMs + HOUR_MS / 2 - ms)) best = row;
    setHover(best && Math.abs(best.hourStartMs + HOUR_MS / 2 - ms) < 3 * HOUR_MS ? best : null);
  }

  return (
    <figure className="flex flex-col gap-2">
      <div className="relative">
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className="h-auto w-full touch-none select-none"
          role="img"
          aria-label={`Temperature by hour, ${rows.length} hours with readings`}
          onPointerMove={onMove}
          onPointerDown={onMove}
          onPointerLeave={() => setHover(null)}
        >
          {ticks.map((tick) => (
            <g key={tick}>
              <line x1={PAD.left} x2={WIDTH - PAD.right} y1={y(tick)} y2={y(tick)} className="stroke-border" strokeWidth={1} />
              <text x={PAD.left - 6} y={y(tick)} dy="0.32em" textAnchor="end" className="fill-muted-foreground text-[10px]">
                {tick}°
              </text>
            </g>
          ))}
          {days.map((day) => (
            <text key={day} x={x(day)} y={HEIGHT - 6} textAnchor="middle" className="fill-muted-foreground text-[10px]">
              {dayLabel.format(new Date(day))}
            </text>
          ))}
          {target ? (
            <rect x={PAD.left} width={WIDTH - PAD.left - PAD.right} y={y(target.maxCelsius)} height={Math.max(0, y(target.minCelsius) - y(target.maxCelsius))} className="fill-success/10" />
          ) : null}
          {segments.map((segment) => (
            <g key={segment[0].hourStartMs}>
              <path
                d={`M${segment.map((row) => `${mid(row)},${y(row.maxCelsius)}`).join('L')}L${[...segment].reverse().map((row) => `${mid(row)},${y(row.minCelsius)}`).join('L')}Z`}
                className="fill-primary/15"
              />
              <path d={`M${segment.map((row) => `${mid(row)},${y(row.avgCelsius)}`).join('L')}`} className="fill-none stroke-primary" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
              {segment.length === 1 ? <circle cx={mid(segment[0])} cy={y(segment[0].avgCelsius)} r={3} className="fill-primary" /> : null}
            </g>
          ))}
          {hover ? (
            <g>
              <line x1={mid(hover)} x2={mid(hover)} y1={PAD.top} y2={HEIGHT - PAD.bottom} className="stroke-muted-foreground" strokeWidth={1} strokeDasharray="3 3" />
              <circle cx={mid(hover)} cy={y(hover.avgCelsius)} r={4} className="fill-primary stroke-background" strokeWidth={2} />
            </g>
          ) : null}
        </svg>
        {hover ? (
          <div
            className="pointer-events-none absolute top-1 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs shadow-sm"
            style={{ left: `${(mid(hover) / WIDTH) * 100}%`, transform: mid(hover) > WIDTH / 2 ? 'translateX(calc(-100% - 8px))' : 'translateX(8px)' }}
          >
            <p className="font-medium text-foreground">{hourLabel.format(new Date(hover.hourStartMs))}</p>
            <p className="text-muted-foreground">
              Average <span className="font-medium text-foreground">{hover.avgCelsius.toFixed(1)} °C</span> · {hover.minCelsius.toFixed(1)}–{hover.maxCelsius.toFixed(1)} °C
            </p>
          </div>
        ) : null}
      </div>
      <figcaption className="text-xs text-muted-foreground">
        Line: hourly average. Band: that hour&rsquo;s lowest to highest.{target ? ' Green: the target range.' : ''} Gaps: no reading.
      </figcaption>
    </figure>
  );
}
