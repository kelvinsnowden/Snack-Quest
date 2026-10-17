/**
 * The cooling thermostat the agent runs when the acceptance record shows
 * the host, not the board, switches the compressor (S11, S12). Pure: it
 * decides; the agent writes the output.
 *
 * - Cools when the cabinet is above `maxCelsius`, stops once it is below
 *   `minCelsius` (hysteresis — the range is at least 2 °C wide).
 * - Never switches the compressor sooner than `minOnMs` after starting
 *   it or `minOffMs` after stopping it: rapid cycling burns compressors
 *   out, and the restart wait lets the refrigerant pressure equalise.
 * - With no usable reading (probe unplugged reads −50 °C) the compressor
 *   is switched off rather than run blind, which could freeze drinks;
 *   Snack Quest alerts on the missing reading.
 * - Starts from the last range it was given (kept on disk by the agent)
 *   or, on a first start, `DEFAULT_COOLING_TARGET` — a reboot never
 *   leaves a stocked fridge switched off. When Snack Quest says the
 *   machine is not cooled, the compressor stays off.
 */
export interface CoolingTarget {
  enabled: boolean;
  minCelsius: number;
  maxCelsius: number;
}

/** Matches Snack Quest's default range (`lib/vending/cooling.ts`). */
export const DEFAULT_COOLING_TARGET: CoolingTarget = { enabled: true, minCelsius: 3, maxCelsius: 8 };

export const THERMOSTAT_TIMING = { minOnMs: 3 * 60_000, minOffMs: 5 * 60_000 } as const;

export class CoolingTargetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CoolingTargetError';
  }
}

/** Checks a `set_cooling` payload. Throws `CoolingTargetError` with the reason, which goes back to Snack Quest as the failure. */
export function parseCoolingTarget(payload: unknown): CoolingTarget {
  const raw = (payload ?? {}) as Record<string, unknown>;
  if (typeof raw.enabled !== 'boolean') throw new CoolingTargetError('payload.enabled must be true or false');
  const min = Number(raw.minCelsius);
  const max = Number(raw.maxCelsius);
  if (!Number.isFinite(min) || !Number.isFinite(max)) throw new CoolingTargetError('payload.minCelsius and maxCelsius must be numbers');
  if (min < -25 || max > 25 || max - min < 2) throw new CoolingTargetError('cooling range must be within −25…25 °C and at least 2 °C wide');
  return { enabled: raw.enabled, minCelsius: min, maxCelsius: max };
}

export class Thermostat {
  private target: CoolingTarget;
  private on = false;
  private lastSwitchAt = Number.NEGATIVE_INFINITY;

  constructor(initial: CoolingTarget | null = null, private readonly timing: { minOnMs: number; minOffMs: number } = THERMOSTAT_TIMING) {
    this.target = initial ?? DEFAULT_COOLING_TARGET;
  }

  setTarget(target: CoolingTarget): void {
    this.target = target;
  }

  get compressorOn(): boolean {
    return this.on;
  }

  get currentTarget(): CoolingTarget {
    return this.target;
  }

  /**
   * What the compressor should be now, given the latest reading. Returns
   * the new state when it should switch, or null to leave it as it is.
   * Call `switched` once the output write succeeded.
   */
  decide(celsius: number | null, nowMs: number): boolean | null {
    const usable = celsius !== null && celsius > -40 ? celsius : null;
    let want: boolean;
    if (!this.target.enabled || usable === null) want = false;
    else if (usable > this.target.maxCelsius) want = true;
    else if (usable < this.target.minCelsius) want = false;
    else want = this.on; // inside the band: keep going the way it was
    if (want === this.on) return null;
    const held = nowMs - this.lastSwitchAt;
    if (this.on && held < this.timing.minOnMs) return null;
    if (!this.on && held < this.timing.minOffMs) return null;
    return want;
  }

  switched(on: boolean, nowMs: number): void {
    this.on = on;
    this.lastSwitchAt = nowMs;
  }
}
