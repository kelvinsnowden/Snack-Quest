/**
 * `CloudTransport` — the real-time nudge, kept decoupled from the
 * command model it serves (§ H "NEXT" of
 * docs/HARDWARE_COMPATIBILITY_ARCHITECTURE.md: "don't force MQTT into
 * the cloud architecture until needed. The gateway should be able to
 * communicate over HTTPS initially. MQTT can become the real-time
 * transport later.").
 *
 * `MachineCommandService.issueCommand` calls `notifyMachine` after
 * writing a command, but never depends on it succeeding, mattering, or
 * existing: polling (`GET /api/vending/commands`) already delivers
 * every pending command correctly on its own, on the machine's next
 * scheduled call-in. A real-time transport only shortens that wait —
 * it is a latency optimisation, never a correctness requirement, which
 * is exactly why `defaultCloudTransport` is a safe no-op today.
 *
 * No real MQTT (or WebSocket) implementation exists here, and building
 * one now would mean guessing at a specific broker/service's actual
 * API before one is chosen — the same "TODO: adapter interface, not
 * fake integration" discipline already applied to MDB's peripheral
 * command tables and to `ShengmaAdapter`. What's real is the
 * interface and the fact that `MachineCommandService` already depends
 * on it rather than on HTTP polling directly, so a real
 * `MqttCloudTransport` drops in later without touching the service.
 */
export interface CloudTransport {
  readonly name: string;
  /**
   * Best-effort only. A transport that cannot reach the machine right
   * now (offline, no broker configured, no live subscription) should
   * resolve normally rather than throw — a failed nudge changes
   * nothing about whether the command is eventually delivered.
   */
  notifyMachine(machineId: string, commandId: string): Promise<void>;
}

/** No real-time transport is configured. Commands are delivered by polling alone — correct and complete on its own, just higher latency than a push would give. */
export class NullCloudTransport implements CloudTransport {
  readonly name = 'none';

  async notifyMachine(): Promise<void> {
    // Deliberately nothing — see this file's own doc comment.
  }
}

/** In-memory, test-only — proves `MachineCommandService` actually calls the transport, without needing a real broker to do it. */
export class MockCloudTransport implements CloudTransport {
  readonly name = 'mock';
  readonly notified: { machineId: string; commandId: string }[] = [];

  async notifyMachine(machineId: string, commandId: string): Promise<void> {
    this.notified.push({ machineId, commandId });
  }
}

export const defaultCloudTransport: CloudTransport = new NullCloudTransport();
