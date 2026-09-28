import type { CertificationSubject } from '@/services/integrationCertificationService';
import type { V1SimulatedMachine } from './v1Machine';

/**
 * Drives Snack Quest's own simulated machine through the certification
 * harness. A run against this subject proves the harness works (and
 * that the simulator is a correct reference); it is never evidence
 * about a manufacturer, and the harness refuses to record it as such.
 */
export class SimulatorCertificationSubject implements CertificationSubject {
  readonly kind = 'snack_quest_simulator' as const;

  constructor(private readonly machine: V1SimulatedMachine) {}

  async cycle(): Promise<void> {
    if (!this.machine.machineCode) {
      await this.machine.connect();
    }
    await this.machine.heartbeat();
    await this.machine.reportStatus();
    await this.machine.reportInventory();
    await this.machine.pollAndExecute();
  }

  async emitDoorEvents(): Promise<void> {
    await this.machine.sendEvents([{ type: 'DOOR_OPENED' }, { type: 'DOOR_CLOSED' }]);
  }

  async emptySlot(slotId: string): Promise<void> {
    this.machine.load(slotId, 0);
  }

  async pollWithoutExecuting(): Promise<void> {
    await this.machine.pollOnly();
  }

  async retransmitLastReport(): Promise<{ status: number; result: string | null }> {
    const response = await this.machine.resendLastReport();
    const data = (response.body as { data?: { result?: string } } | null)?.data;
    return { status: response.status, result: data?.result ?? null };
  }

  requestLog(): { nonce: string; timestamp: number }[] {
    return this.machine.requestLog.map(({ nonce, timestamp }) => ({ nonce, timestamp }));
  }
}
