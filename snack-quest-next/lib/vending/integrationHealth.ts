import type { Timestamp } from 'firebase/firestore';
import type { IntegrationHealthState, MachineIntegration } from '@/types';

export interface IntegrationHealthThresholds {
  /** No contact for this long → `degraded`. */
  staleAfterMinutes: number;
  /** No contact for this long → `disconnected`. */
  disconnectedAfterMinutes: number;
  /** An error this recent keeps a contacting integration `degraded`. */
  recentErrorMinutes: number;
}

export const DEFAULT_INTEGRATION_HEALTH_THRESHOLDS: IntegrationHealthThresholds = {
  staleAfterMinutes: 5,
  disconnectedAfterMinutes: 15,
  recentErrorMinutes: 60,
};

export interface IntegrationHealth {
  state: IntegrationHealthState;
  /** One sentence an admin can act on. */
  reason: string;
  lastContactAt: Date | null;
}

function toDate(value: Timestamp | null | undefined): Date | null {
  return value ? value.toDate() : null;
}

function latest(dates: (Date | null)[]): Date | null {
  return dates.reduce<Date | null>((max, date) => (date && (!max || date > max) ? date : max), null);
}

/**
 * CONNECTED / DEGRADED / DISCONNECTED / ERROR, derived at read time
 * from the integration's own signals — never stored, so it can never
 * disagree with the timestamps it's computed from.
 *
 * "Contact" is any evidence the other side is alive: a heartbeat, a
 * successful API request in either direction, a webhook. An error only
 * outranks contact when nothing has succeeded since it — an integration
 * that failed once an hour ago and has heartbeated every minute since
 * is degraded, not in error.
 */
export function deriveIntegrationHealth(
  integration: Pick<MachineIntegration, 'signals' | 'lastError'>,
  now: Date = new Date(),
  thresholds: IntegrationHealthThresholds = DEFAULT_INTEGRATION_HEALTH_THRESHOLDS,
): IntegrationHealth {
  const lastContactAt = latest([
    toDate(integration.signals.heartbeat),
    toDate(integration.signals.api_request),
    toDate(integration.signals.webhook),
  ]);
  const lastErrorAt = toDate(integration.lastError?.at ?? null);
  const minutesSince = (date: Date) => (now.getTime() - date.getTime()) / 60000;

  if (lastErrorAt && (!lastContactAt || lastErrorAt >= lastContactAt) && minutesSince(lastErrorAt) < thresholds.disconnectedAfterMinutes) {
    const kind = integration.lastError!.kind;
    return {
      state: 'error',
      reason:
        kind === 'authentication'
          ? `Credentials rejected: ${integration.lastError!.message}`
          : `Last ${kind} attempt failed and nothing has succeeded since: ${integration.lastError!.message}`,
      lastContactAt,
    };
  }
  if (!lastContactAt) {
    return { state: 'disconnected', reason: 'No contact has ever been recorded for this integration.', lastContactAt };
  }
  const idleMinutes = minutesSince(lastContactAt);
  if (idleMinutes >= thresholds.disconnectedAfterMinutes) {
    return { state: 'disconnected', reason: `No contact for ${Math.floor(idleMinutes)} minutes.`, lastContactAt };
  }
  if (idleMinutes >= thresholds.staleAfterMinutes) {
    return { state: 'degraded', reason: `Last contact ${Math.floor(idleMinutes)} minutes ago.`, lastContactAt };
  }
  if (lastErrorAt && minutesSince(lastErrorAt) < thresholds.recentErrorMinutes) {
    return {
      state: 'degraded',
      reason: `Responding, but a ${integration.lastError!.kind} error occurred ${Math.floor(minutesSince(lastErrorAt))} minutes ago.`,
      lastContactAt,
    };
  }
  return { state: 'connected', reason: 'Responding normally.', lastContactAt };
}
