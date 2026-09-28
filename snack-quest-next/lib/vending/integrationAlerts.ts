/**
 * The integration alert conditions, as pure functions of facts already
 * recorded (dispense ledger, integration signals and errors, credential
 * records, webhook outcomes). `alertService` feeds them data and turns
 * each result into a condition alert — one per subject, deduplicated,
 * auto-resolving when the condition stops being true. Kept pure so every
 * threshold is unit-tested and none is buried in a query.
 */

const MINUTE = 60_000;

export const INTEGRATION_ALERT_THRESHOLDS = {
  /** Dispenses on one machine ending failed/timeout/unknown within the window. */
  dispenseFailures: { count: 3, windowMs: 60 * MINUTE },
  /** Share of a manufacturer's dispenses whose outcome was not known (timeout/unknown) — only with enough volume to mean something. */
  timeoutRate: { rate: 0.2, minDispenses: 10, windowMs: 24 * 60 * MINUTE },
  /** An outbound manufacturer API is "unavailable" when at least this share of its active machines saw connection/timeout errors recently, with nothing succeeding since. */
  apiUnavailable: { share: 0.5, windowMs: 10 * MINUTE },
  /** Authentication failures from a manufacturer's own key against its own machines. */
  authFailures: { windowMs: 15 * MINUTE },
  /** Credential expiry warnings. */
  credentialExpiry: { expiresWithinMs: 7 * 24 * 60 * MINUTE, graceEndsWithinMs: 3 * 24 * 60 * MINUTE, stillUsedWithinMs: 24 * 60 * MINUTE },
  /** Webhook deliveries refused (after authentication) with none accepted since. */
  webhookFailures: { windowMs: 30 * MINUTE },
} as const;

type Ms = number | null | undefined;

export interface CommandFact {
  machineId: string;
  manufacturerId: string | null;
  status: string;
  updatedAtMs: number;
}

/** Machines with repeated failed or unresolved dispenses in the last hour. */
export function repeatedDispenseFailures(commands: CommandFact[], now: number): Map<string, number> {
  const { count, windowMs } = INTEGRATION_ALERT_THRESHOLDS.dispenseFailures;
  const byMachine = new Map<string, number>();
  for (const command of commands) {
    if (now - command.updatedAtMs > windowMs) continue;
    if (!['failed', 'timeout', 'unknown'].includes(command.status)) continue;
    byMachine.set(command.machineId, (byMachine.get(command.machineId) ?? 0) + 1);
  }
  return new Map([...byMachine].filter(([, n]) => n >= count));
}

/** Manufacturers whose share of unresolved (timeout/unknown) dispense outcomes is abnormal. */
export function abnormalTimeoutRates(commands: CommandFact[], now: number): Map<string, { total: number; unresolved: number; rate: number }> {
  const { rate, minDispenses, windowMs } = INTEGRATION_ALERT_THRESHOLDS.timeoutRate;
  const totals = new Map<string, { total: number; unresolved: number }>();
  for (const command of commands) {
    if (!command.manufacturerId || now - command.updatedAtMs > windowMs) continue;
    if (!['dispensed', 'failed', 'timeout', 'unknown'].includes(command.status)) continue;
    const entry = totals.get(command.manufacturerId) ?? { total: 0, unresolved: 0 };
    entry.total += 1;
    if (command.status === 'timeout' || command.status === 'unknown') entry.unresolved += 1;
    totals.set(command.manufacturerId, entry);
  }
  const out = new Map<string, { total: number; unresolved: number; rate: number }>();
  for (const [manufacturerId, { total, unresolved }] of totals) {
    if (total >= minDispenses && unresolved / total >= rate) out.set(manufacturerId, { total, unresolved, rate: unresolved / total });
  }
  return out;
}

export interface IntegrationFact {
  machineId: string;
  manufacturerId: string;
  active: boolean;
  outbound: boolean;
  lastError: { kind: string; atMs: Ms; message: string } | null;
  /** Newest successful contact of any kind (API call succeeded, heartbeat, webhook). */
  lastSuccessMs: Ms;
}

const recentUnrecovered = (fact: IntegrationFact, kinds: string[], windowMs: number, now: number) =>
  Boolean(fact.lastError && kinds.includes(fact.lastError.kind) && fact.lastError.atMs && now - fact.lastError.atMs <= windowMs && fact.lastError.atMs > (fact.lastSuccessMs ?? 0));

/** Outbound manufacturers whose API most of their active machines can't reach right now. */
export function unavailableManufacturerApis(integrations: IntegrationFact[], now: number): Map<string, { failing: number; active: number; lastError: string }> {
  const { share, windowMs } = INTEGRATION_ALERT_THRESHOLDS.apiUnavailable;
  const groups = new Map<string, IntegrationFact[]>();
  for (const fact of integrations) {
    if (!fact.active || !fact.outbound) continue;
    groups.set(fact.manufacturerId, [...(groups.get(fact.manufacturerId) ?? []), fact]);
  }
  const out = new Map<string, { failing: number; active: number; lastError: string }>();
  for (const [manufacturerId, facts] of groups) {
    const failing = facts.filter((fact) => recentUnrecovered(fact, ['connection', 'timeout'], windowMs, now));
    if (failing.length > 0 && failing.length / facts.length >= share) {
      out.set(manufacturerId, { failing: failing.length, active: facts.length, lastError: failing[0].lastError!.message });
    }
  }
  return out;
}

/** Manufacturers whose own keys are failing authentication against their own active machines. */
export function authenticationFailures(integrations: IntegrationFact[], now: number): Map<string, { machines: number; lastError: string }> {
  const out = new Map<string, { machines: number; lastError: string }>();
  for (const fact of integrations) {
    if (!fact.active || !recentUnrecovered(fact, ['authentication'], INTEGRATION_ALERT_THRESHOLDS.authFailures.windowMs, now)) continue;
    const entry = out.get(fact.manufacturerId) ?? { machines: 0, lastError: fact.lastError!.message };
    entry.machines += 1;
    out.set(fact.manufacturerId, entry);
  }
  return out;
}

export interface CredentialFact {
  keyId: string;
  manufacturerId: string;
  revokedAtMs: Ms;
  expiresAtMs: Ms;
  graceEndsAtMs: Ms;
  supersededAtMs: Ms;
  lastUsedAtMs: Ms;
}

/** Signing keys about to stop working while still needed: hard expiry soon, or a rotation grace ending while the old key is still in use. */
export function expiringCredentials(credentials: CredentialFact[], now: number): { keyId: string; manufacturerId: string; reason: 'expires_soon' | 'rotation_grace_ending'; atMs: number }[] {
  const { expiresWithinMs, graceEndsWithinMs, stillUsedWithinMs } = INTEGRATION_ALERT_THRESHOLDS.credentialExpiry;
  const out: { keyId: string; manufacturerId: string; reason: 'expires_soon' | 'rotation_grace_ending'; atMs: number }[] = [];
  for (const credential of credentials) {
    if (credential.revokedAtMs) continue;
    if (credential.supersededAtMs) {
      // A rotated-out key is judged only on its grace period: warn if the fleet still uses it as the grace ends.
      const stillUsed = credential.lastUsedAtMs && now - credential.lastUsedAtMs <= stillUsedWithinMs;
      const endsAt = credential.graceEndsAtMs ?? credential.expiresAtMs;
      if (endsAt && endsAt > now && endsAt - now <= graceEndsWithinMs && stillUsed) {
        out.push({ keyId: credential.keyId, manufacturerId: credential.manufacturerId, reason: 'rotation_grace_ending', atMs: endsAt });
      }
      continue;
    }
    if (credential.expiresAtMs && credential.expiresAtMs > now && credential.expiresAtMs - now <= expiresWithinMs) {
      out.push({ keyId: credential.keyId, manufacturerId: credential.manufacturerId, reason: 'expires_soon', atMs: credential.expiresAtMs });
    }
  }
  return out;
}

export interface WebhookHealthFact {
  manufacturerId: string;
  lastRejectedAtMs: Ms;
  lastRejectedCode: string | null;
  lastAcceptedAtMs: Ms;
}

/** Manufacturers whose webhook deliveries are being refused, with none accepted since. */
export function failingWebhooks(facts: WebhookHealthFact[], now: number): Map<string, { code: string | null; atMs: number }> {
  const out = new Map<string, { code: string | null; atMs: number }>();
  for (const fact of facts) {
    if (!fact.lastRejectedAtMs || now - fact.lastRejectedAtMs > INTEGRATION_ALERT_THRESHOLDS.webhookFailures.windowMs) continue;
    if ((fact.lastAcceptedAtMs ?? 0) > fact.lastRejectedAtMs) continue;
    out.set(fact.manufacturerId, { code: fact.lastRejectedCode, atMs: fact.lastRejectedAtMs });
  }
  return out;
}
