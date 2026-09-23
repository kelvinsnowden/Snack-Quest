import type { Timestamp } from 'firebase/firestore';
import type { MachineConnectivityStatus } from '@/types';

/**
 * Derives `MachineConnectivityStatus` from `Machine.lastSeenAt`
 * (§ MACHINE HEARTBEAT / REALTIME STATUS: "the admin should
 * immediately see 🟢 Online 🟡 Stale 🔴 Offline"). Never stored as its
 * own field — a status computed at read time from one timestamp
 * cannot drift out of sync with that timestamp, which a
 * separately-written field could.
 *
 * Thresholds are parameters, not constants baked in here
 * (§ "do not hardcode arbitrary thresholds without making them
 * configurable") — the caller (a Service reading a business's own
 * settings, once such a setting exists) decides what "stale" means
 * for a given fleet. `DEFAULT_CONNECTIVITY_THRESHOLDS` is only a
 * starting point.
 */
export interface ConnectivityThresholds {
  /** No heartbeat within this many minutes → `stale`. */
  staleAfterMinutes: number;
  /** No heartbeat within this many minutes → `offline`. Must exceed `staleAfterMinutes`. */
  offlineAfterMinutes: number;
}

export const DEFAULT_CONNECTIVITY_THRESHOLDS: ConnectivityThresholds = {
  staleAfterMinutes: 5,
  offlineAfterMinutes: 15,
};

export function deriveConnectivityStatus(
  lastSeenAt: Timestamp | null,
  now: Date = new Date(),
  thresholds: ConnectivityThresholds = DEFAULT_CONNECTIVITY_THRESHOLDS,
): MachineConnectivityStatus {
  if (!lastSeenAt) {
    return 'unknown';
  }
  const minutesSinceLastSeen = (now.getTime() - lastSeenAt.toMillis()) / 60000;
  if (minutesSinceLastSeen < thresholds.staleAfterMinutes) {
    return 'online';
  }
  if (minutesSinceLastSeen < thresholds.offlineAfterMinutes) {
    return 'stale';
  }
  return 'offline';
}
