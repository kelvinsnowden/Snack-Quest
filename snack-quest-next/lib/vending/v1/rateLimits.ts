import type { RateLimitRule } from '@/lib/rateLimit/rateLimiter';

/**
 * Rate limits for the Machine API v1 (docs/SNACK_QUEST_MACHINE_API_V1.md
 * §4.4 publishes this table; tests/lib/machineApiContract.test.ts keeps
 * the two in step).
 *
 * The design goal is isolation, not a global cap:
 *
 * - **Per machine, per endpoint class.** One misbehaving machine hits
 *   its own ceiling long before it can dent anyone else's. Every
 *   ceiling sits at roughly 10× the cadence we recommend, so a correct
 *   client never sees a 429.
 * - **Per credential.** A fleet-wide budget per key (overridable per
 *   credential for large fleets), so a compromised or looping key is
 *   contained to its own manufacturer.
 * - **Failures, per source IP.** Only *failed* authentication counts
 *   against an IP — machines behind carrier-grade NAT share addresses,
 *   so valid traffic is never limited by IP.
 *
 * Limits are counted only *after* a request's signature verifies, so
 * nobody can exhaust a machine's budget by sending forged requests in
 * its name.
 */

export type MachineEndpointClass =
  | 'connect'
  | 'describe'
  | 'heartbeat'
  | 'status'
  | 'inventory'
  | 'events'
  | 'event_items'
  | 'command_poll'
  | 'command_ack'
  | 'command_status';

export interface MachineApiRateLimits {
  perMachine: Record<MachineEndpointClass, { limit: number; windowSeconds: number }>;
  /** Requests per minute across every machine a credential speaks for. */
  perCredentialPerMinute: number;
  /** Webhook deliveries per minute per webhook credential. */
  webhookPerCredentialPerMinute: number;
  /** Failed authentications per minute from one IP before that IP is refused outright for the rest of the window. */
  authFailuresPerIpPerMinute: number;
  /** Requests that authenticate but are malformed/invalid, per machine per minute, before further requests are refused. */
  clientErrorsPerMachinePerMinute: number;
}

export const DEFAULT_MACHINE_API_RATE_LIMITS: MachineApiRateLimits = {
  perMachine: {
    connect: { limit: 10, windowSeconds: 60 },
    describe: { limit: 30, windowSeconds: 60 },
    heartbeat: { limit: 12, windowSeconds: 60 },
    status: { limit: 30, windowSeconds: 60 },
    inventory: { limit: 12, windowSeconds: 60 },
    events: { limit: 60, windowSeconds: 60 },
    event_items: { limit: 600, windowSeconds: 60 },
    command_poll: { limit: 60, windowSeconds: 60 },
    command_ack: { limit: 120, windowSeconds: 60 },
    command_status: { limit: 120, windowSeconds: 60 },
  },
  perCredentialPerMinute: 30_000,
  webhookPerCredentialPerMinute: 1_200,
  authFailuresPerIpPerMinute: 120,
  clientErrorsPerMachinePerMinute: 60,
};

let cached: { raw: string | undefined; limits: MachineApiRateLimits } | null = null;

/**
 * Defaults, deep-merged with `MACHINE_API_RATE_LIMITS` (JSON) when set —
 * e.g. `{"perMachine":{"command_poll":{"limit":120,"windowSeconds":60}}}`.
 * An invalid override is ignored rather than taking the API down.
 */
export function machineApiRateLimits(): MachineApiRateLimits {
  const raw = process.env.MACHINE_API_RATE_LIMITS;
  if (cached && cached.raw === raw) {
    return cached.limits;
  }
  let limits = DEFAULT_MACHINE_API_RATE_LIMITS;
  if (raw) {
    try {
      const override = JSON.parse(raw) as Partial<MachineApiRateLimits>;
      limits = {
        ...DEFAULT_MACHINE_API_RATE_LIMITS,
        ...pickNumbers(override),
        perMachine: { ...DEFAULT_MACHINE_API_RATE_LIMITS.perMachine, ...validPerMachine(override.perMachine) },
      };
    } catch {
      limits = DEFAULT_MACHINE_API_RATE_LIMITS;
    }
  }
  cached = { raw, limits };
  return limits;
}

function pickNumbers(override: Partial<MachineApiRateLimits>): Partial<MachineApiRateLimits> {
  const out: Partial<MachineApiRateLimits> = {};
  for (const key of ['perCredentialPerMinute', 'webhookPerCredentialPerMinute', 'authFailuresPerIpPerMinute', 'clientErrorsPerMachinePerMinute'] as const) {
    const value = override[key];
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
      out[key] = value;
    }
  }
  return out;
}

function validPerMachine(value: unknown): Partial<MachineApiRateLimits['perMachine']> {
  if (!value || typeof value !== 'object') {
    return {};
  }
  const out: Partial<MachineApiRateLimits['perMachine']> = {};
  for (const [key, rule] of Object.entries(value as Record<string, unknown>)) {
    const candidate = rule as { limit?: unknown; windowSeconds?: unknown };
    if (key in DEFAULT_MACHINE_API_RATE_LIMITS.perMachine && typeof candidate?.limit === 'number' && candidate.limit > 0 && typeof candidate.windowSeconds === 'number' && candidate.windowSeconds > 0) {
      out[key as MachineEndpointClass] = { limit: candidate.limit, windowSeconds: candidate.windowSeconds };
    }
  }
  return out;
}

export function machineRule(endpoint: MachineEndpointClass): RateLimitRule {
  const { limit, windowSeconds } = machineApiRateLimits().perMachine[endpoint];
  return { name: `machine.${endpoint}`, limit, windowSeconds };
}

export function credentialRule(override: number | null | undefined): RateLimitRule {
  return { name: 'credential.requests', limit: override ?? machineApiRateLimits().perCredentialPerMinute, windowSeconds: 60 };
}

export function webhookRule(override: number | null | undefined): RateLimitRule {
  return { name: 'credential.webhooks', limit: override ?? machineApiRateLimits().webhookPerCredentialPerMinute, windowSeconds: 60 };
}

export function authFailureRule(): RateLimitRule {
  return { name: 'ip.auth_failures', limit: machineApiRateLimits().authFailuresPerIpPerMinute, windowSeconds: 60 };
}

export function clientErrorRule(): RateLimitRule {
  return { name: 'machine.client_errors', limit: machineApiRateLimits().clientErrorsPerMachinePerMinute, windowSeconds: 60 };
}
