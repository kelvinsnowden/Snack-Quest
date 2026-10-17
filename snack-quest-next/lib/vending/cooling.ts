/**
 * A machine's cooling target and how its temperature is judged against
 * it (§ refrigeration). Pure — no Firestore — so the alert sweep, the
 * admin pages and the tests all use the same rules.
 *
 * Two things live on top of this:
 * - **Monitoring**, for every machine whose hardware reports a
 *   temperature: too warm or too cold for longer than
 *   `alertAfterMinutes` raises an alert, and a cooled machine that stops
 *   reporting a temperature raises one too.
 * - **Remote control**, only for a machine whose model declares
 *   `remote_cooling`: the target is sent to the machine as a
 *   `set_cooling` command. The M109E does not declare it until its
 *   acceptance tests prove which output is the compressor and that the
 *   host, not the board, runs the cooling (S11, S12).
 */
export interface MachineCooling {
  /** False for an ambient machine: no temperature alerts, nothing sent. */
  enabled: boolean;
  minCelsius: number;
  maxCelsius: number;
  /** How long the temperature may stay outside the range before an alert. Short excursions (a restock with the door open) are normal. */
  alertAfterMinutes: number;
}

/** A sensible chilled-snack-and-drinks default; staff change it per machine. */
export const DEFAULT_COOLING: MachineCooling = { enabled: true, minCelsius: 3, maxCelsius: 8, alertAfterMinutes: 30 };

export const COOLING_LIMITS = {
  lowestCelsius: -25,
  highestCelsius: 25,
  /** The band must be at least this wide, or a thermostat would switch the compressor constantly. */
  minBandCelsius: 2,
  minAlertMinutes: 5,
  maxAlertMinutes: 24 * 60,
} as const;

/** A cooled machine that hasn't reported a temperature for this long gets a "not reporting" alert. */
export const TEMPERATURE_SILENCE_MS = 30 * 60 * 1000;

export class CoolingValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CoolingValidationError';
  }
}

/** Checks cooling settings from the admin. Throws `CoolingValidationError` with a plain-language reason. */
export function parseCooling(input: unknown): MachineCooling {
  const raw = (input ?? {}) as Record<string, unknown>;
  if (typeof raw.enabled !== 'boolean') throw new CoolingValidationError('Say whether the machine is cooled.');
  const min = Number(raw.minCelsius);
  const max = Number(raw.maxCelsius);
  const after = Number(raw.alertAfterMinutes);
  if (!Number.isFinite(min) || !Number.isFinite(max)) throw new CoolingValidationError('Enter the lowest and highest temperature.');
  if (min < COOLING_LIMITS.lowestCelsius || max > COOLING_LIMITS.highestCelsius) {
    throw new CoolingValidationError(`Keep the range between ${COOLING_LIMITS.lowestCelsius} °C and ${COOLING_LIMITS.highestCelsius} °C.`);
  }
  if (max - min < COOLING_LIMITS.minBandCelsius) {
    throw new CoolingValidationError(`Make the range at least ${COOLING_LIMITS.minBandCelsius} °C wide, so the cooling isn't switched on and off constantly.`);
  }
  if (!Number.isInteger(after) || after < COOLING_LIMITS.minAlertMinutes || after > COOLING_LIMITS.maxAlertMinutes) {
    throw new CoolingValidationError(`Alert after ${COOLING_LIMITS.minAlertMinutes} to ${COOLING_LIMITS.maxAlertMinutes} minutes.`);
  }
  return { enabled: raw.enabled, minCelsius: round1(min), maxCelsius: round1(max), alertAfterMinutes: after };
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export type TemperatureVerdict =
  /** Not cooled, or nothing to judge yet. */
  | { kind: 'not_monitored' }
  | { kind: 'in_range'; celsius: number }
  | { kind: 'too_warm' | 'too_cold'; celsius: number }
  /** Cooled, but the latest reading is older than `TEMPERATURE_SILENCE_MS` (or there has never been one). */
  | { kind: 'no_reading'; lastReadingAtMs: number | null };

/**
 * Where the latest reading stands. `-50 °C` is what the M109E reports with
 * its probe unplugged, so anything at or below −40 °C counts as no reading.
 */
export function judgeTemperature(
  cooling: MachineCooling | null | undefined,
  reading: { celsius: number | null; atMs: number } | null,
  nowMs: number,
): TemperatureVerdict {
  if (!cooling?.enabled) return { kind: 'not_monitored' };
  const usable = reading && reading.celsius !== null && reading.celsius > -40 ? reading : null;
  if (!usable || nowMs - usable.atMs > TEMPERATURE_SILENCE_MS) return { kind: 'no_reading', lastReadingAtMs: usable?.atMs ?? null };
  const celsius = usable.celsius as number;
  if (celsius > cooling.maxCelsius) return { kind: 'too_warm', celsius };
  if (celsius < cooling.minCelsius) return { kind: 'too_cold', celsius };
  return { kind: 'in_range', celsius };
}

/**
 * When the current out-of-range spell started, given the previous value
 * and this verdict: kept while still out of range, started now if it just
 * went out, cleared once back in range.
 */
export function nextBreachSince(previousMs: number | null, verdict: TemperatureVerdict, nowMs: number): number | null {
  if (verdict.kind === 'too_warm' || verdict.kind === 'too_cold') return previousMs ?? nowMs;
  if (verdict.kind === 'no_reading') return previousMs; // unknown: don't restart or forget the spell
  return null;
}

/** True once the spell has lasted long enough to alert on. */
export function breachIsAlertable(cooling: MachineCooling, breachSinceMs: number | null, nowMs: number): boolean {
  return breachSinceMs !== null && nowMs - breachSinceMs >= cooling.alertAfterMinutes * 60 * 1000;
}

/** What gets sent to a machine that can control its own cooling. */
export function coolingCommandPayload(cooling: MachineCooling): Record<string, unknown> {
  return { enabled: cooling.enabled, minCelsius: cooling.minCelsius, maxCelsius: cooling.maxCelsius };
}

/**
 * The range a machine is judged against: its saved one, else the default
 * — but only once it has reported a real temperature. A machine nobody
 * has set up and that never reported one (manual, ambient, or no probe)
 * is not monitored, so it can't raise "no reading" alerts no one asked for.
 */
export function effectiveCooling(saved: MachineCooling | null | undefined, reportedCelsius: number | null | undefined): MachineCooling | null {
  if (saved) return saved;
  return typeof reportedCelsius === 'number' && reportedCelsius > -40 ? DEFAULT_COOLING : null;
}

/** A door reported open this long raises "door left open" — longer than any restock should take. */
export const DOOR_OPEN_ALERT_MS = 15 * 60 * 1000;
