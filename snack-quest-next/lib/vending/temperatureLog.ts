/**
 * The temperature record (§ refrigeration): one row per machine per
 * hour — lowest, highest and average reading — kept for as long as the
 * machine runs, for venues and inspectors who ask "was it kept cold?".
 *
 * Built from the status reports machines already send, without extra
 * writes per report: the current hour accumulates on the integration
 * document (written by the same transaction that stores the report),
 * and is copied into `machineTemperatureLog` once the hour is over.
 * A reading counts at most once a minute, so an hour's average isn't
 * skewed by how often the machine happened to report. Unplugged-probe
 * readings (−40 °C and below) never count.
 */
export interface TemperatureHour {
  hourStartMs: number;
  minCelsius: number;
  maxCelsius: number;
  sumCelsius: number;
  samples: number;
  lastSampleAtMs: number;
}

export interface TemperatureLogRow {
  hourStartMs: number;
  minCelsius: number;
  maxCelsius: number;
  avgCelsius: number;
  samples: number;
}

const HOUR_MS = 60 * 60 * 1000;
const SAMPLE_EVERY_MS = 60 * 1000;

export function hourStart(atMs: number): number {
  return Math.floor(atMs / HOUR_MS) * HOUR_MS;
}

export function closeHour(hour: TemperatureHour): TemperatureLogRow {
  return {
    hourStartMs: hour.hourStartMs,
    minCelsius: hour.minCelsius,
    maxCelsius: hour.maxCelsius,
    avgCelsius: Math.round((hour.sumCelsius / hour.samples) * 10) / 10,
    samples: hour.samples,
  };
}

/**
 * Adds one reading. Returns the hour now accumulating (unchanged when
 * the reading doesn't count) and, when the reading starts a new hour,
 * the finished one to store.
 */
export function addReading(
  current: TemperatureHour | null | undefined,
  celsius: number | null | undefined,
  atMs: number,
): { hour: TemperatureHour | null; finished: TemperatureLogRow | null; changed: boolean } {
  const existing = current ?? null;
  if (typeof celsius !== 'number' || !Number.isFinite(celsius) || celsius <= -40) return { hour: existing, finished: null, changed: false };
  const start = hourStart(atMs);
  if (existing && start < existing.hourStartMs) return { hour: existing, finished: null, changed: false }; // a late reading for an hour already closed
  if (!existing || start > existing.hourStartMs) {
    return {
      hour: { hourStartMs: start, minCelsius: celsius, maxCelsius: celsius, sumCelsius: celsius, samples: 1, lastSampleAtMs: atMs },
      finished: existing ? closeHour(existing) : null,
      changed: true,
    };
  }
  if (atMs - existing.lastSampleAtMs < SAMPLE_EVERY_MS) return { hour: existing, finished: null, changed: false };
  return {
    hour: {
      ...existing,
      minCelsius: Math.min(existing.minCelsius, celsius),
      maxCelsius: Math.max(existing.maxCelsius, celsius),
      sumCelsius: existing.sumCelsius + celsius,
      samples: existing.samples + 1,
      lastSampleAtMs: atMs,
    },
    finished: null,
    changed: true,
  };
}

/** `SQ1_2026101709` — sortable, so one machine's rows are a document-id range (no index needed). */
export function temperatureLogDocId(machineId: string, hourStartMs: number): string {
  const d = new Date(hourStartMs);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${machineId}_${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}${pad(d.getUTCHours())}`;
}
