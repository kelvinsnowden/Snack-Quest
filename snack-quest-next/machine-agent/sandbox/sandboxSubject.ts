import type { M109eMachineAgent } from '../agent/m109eAgent';

/**
 * The certification harness's view of a machine (structurally the same
 * as `CertificationSubject` in the app, declared here so the agent
 * imports nothing from the app).
 */
export interface HarnessSubject {
  readonly kind: 'snack_quest_simulator' | 'manufacturer_machine';
  cycle(): Promise<void>;
  emitDoorEvents(): Promise<void>;
  emptySlot(slotId: string): Promise<void>;
  pollWithoutExecuting?(): Promise<void>;
  retransmitLastReport?(): Promise<{ status: number; result: string | null }>;
  deferNextReport?(): Promise<void>;
  requestLog?(): { nonce: string; timestamp: number }[];
}

/** The physical steps. Automatic against the fake board; operator prompts on a real bench. */
export interface PhysicalHooks {
  openAndCloseDoor(): Promise<void>;
  emptySlot(slotId: string): Promise<void>;
}

/**
 * Drives the agent through the harness. `kind` is `snack_quest_simulator`
 * against the fake board: such a run proves the agent's logic against
 * the document, never the machine, and the harness refuses to record it
 * as model evidence.
 */
export function agentSubject(
  agent: M109eMachineAgent,
  hooks: PhysicalHooks,
  requestLog: () => { nonce: string; timestamp: number }[],
  kind: HarnessSubject['kind'] = 'snack_quest_simulator',
): HarnessSubject {
  return {
    kind,
    cycle: async () => void (await agent.cycle()),
    emitDoorEvents: async () => {
      // The agent notices door changes when it reads the inputs, so read between the two physical steps.
      await hooks.openAndCloseDoor();
    },
    emptySlot: (slotId) => hooks.emptySlot(slotId),
    pollWithoutExecuting: async () => {
      agent.sandbox.holdNextCommands = true;
      await agent.cycle();
    },
    deferNextReport: async () => {
      agent.sandbox.deferNextReport = true;
    },
    retransmitLastReport: () => agent.retransmitLastReport(),
    requestLog,
  };
}
