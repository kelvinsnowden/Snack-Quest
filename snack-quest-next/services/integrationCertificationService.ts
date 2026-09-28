import 'server-only';

import { randomBytes } from 'node:crypto';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase/admin';
import { isProductionDeployment } from '@/lib/vending/deploymentEnvironment';
import { livenessOfIntegration } from '@/lib/vending/machineLiveness';
import { machineTransactionService } from '@/services/machineTransactionService';
import { dispenseCommandService } from '@/services/dispenseCommandService';
import { manufacturerRegistryService } from '@/services/manufacturerRegistryService';
import { machineIntegrationRepository } from '@/repositories/machineIntegrationRepository';
import { machineDispenseCommandRepository } from '@/repositories/machineDispenseCommandRepository';
import { machineTransactionRepository } from '@/repositories/machineTransactionRepository';
import { machineSlotRepository } from '@/repositories/machineSlotRepository';
import { manufacturerSlotIdFor } from '@/lib/vending/slotMapping';
import { dispenseCommandDocId, type CertificationCheckKey, type MachineDispenseCommand, type MachineIntegration } from '@/types';

/**
 * The integration certification harness — the machine-model onboarding
 * gate (docs/MACHINE_INTEGRATION_READINESS.md §8).
 *
 * It drives a sandbox machine through a fixed script — connect, report,
 * a real sandbox sale, a failed dispense, a retransmitted report, a
 * command that expires before it is executed — and then judges every
 * check from what Snack Quest itself recorded (signals, events, the
 * dispense ledger, the money ledger, stock movements). The subject's
 * own claims are never evidence: a machine that says "dispensed" for an
 * empty slot fails, however confident it sounds.
 *
 * Verdict: CERTIFIED only if every check passed. A check the subject
 * can't be driven through automatically is `not_verified`, and the
 * verdict is NOT CERTIFIED until a human verifies it.
 *
 * Sandbox only. It refuses a production integration and refuses to run
 * on the production deployment. Results can be written into the model's
 * certification checklist — but never from a run against Snack Quest's
 * own simulator: that proves the harness, not the manufacturer.
 */

export type HarnessCheckId =
  | 'connect'
  | 'authentication'
  | 'heartbeat'
  | 'status'
  | 'inventory'
  | 'events'
  | 'command_polling'
  | 'acknowledgement'
  | 'dispense'
  | 'failure_handling'
  | 'idempotency'
  | 'replay_protection'
  | 'timeout_handling';

export const HARNESS_CHECKS: readonly { id: HarnessCheckId; label: string }[] = [
  { id: 'connect', label: 'CONNECT' },
  { id: 'authentication', label: 'AUTHENTICATION' },
  { id: 'heartbeat', label: 'HEARTBEAT' },
  { id: 'status', label: 'STATUS' },
  { id: 'inventory', label: 'INVENTORY' },
  { id: 'events', label: 'EVENTS' },
  { id: 'command_polling', label: 'COMMAND POLLING' },
  { id: 'acknowledgement', label: 'ACKNOWLEDGEMENT' },
  { id: 'dispense', label: 'DISPENSE' },
  { id: 'failure_handling', label: 'FAILURE HANDLING' },
  { id: 'idempotency', label: 'IDEMPOTENCY' },
  { id: 'replay_protection', label: 'REPLAY PROTECTION' },
  { id: 'timeout_handling', label: 'TIMEOUT HANDLING' },
];

export interface HarnessCheckResult {
  id: HarnessCheckId;
  label: string;
  outcome: 'passed' | 'failed' | 'not_verified';
  evidence: string;
}

export interface CertificationReport {
  runId: string;
  machineId: string;
  machineCode: string;
  manufacturerId: string;
  modelId: string;
  firmwareVersion: string | null;
  subjectKind: CertificationSubject['kind'];
  startedAt: string;
  finishedAt: string;
  verdict: 'CERTIFIED' | 'NOT CERTIFIED';
  checks: HarnessCheckResult[];
  failures: string[];
}

/**
 * What the harness needs from the thing under test. For Snack Quest's
 * simulator every step is automatic; for a real machine on a bench,
 * `cycle` is "wait one poll interval" and physical steps are operator
 * prompts.
 */
export interface CertificationSubject {
  readonly kind: 'snack_quest_simulator' | 'manufacturer_machine';
  /** One autonomous cycle of the machine: connect if needed, heartbeat, status, inventory, poll → ack → dispense → report. */
  cycle(): Promise<void>;
  /** Make the machine emit ordinary events (open and close the door). */
  emitDoorEvents(): Promise<void>;
  /** Make one slot physically empty (manufacturer slot name). */
  emptySlot(slotId: string): Promise<void>;
  /** Fetch commands but don't execute them yet — the machine is busy. Omit if the subject can't be driven this way. */
  pollWithoutExecuting?(): Promise<void>;
  /** Re-send the last outcome report as if its response was lost. Omit if the subject can't be driven this way. */
  retransmitLastReport?(): Promise<{ status: number; result: string | null }>;
  /** Nonces and timestamps of every request the subject made, if it can expose them. */
  requestLog?(): { nonce: string; timestamp: number }[];
}

export class CertificationNotAllowedError extends Error {
  constructor(reason: string) {
    super(`Certification run refused: ${reason}`);
    this.name = 'CertificationNotAllowedError';
  }
}

const TERMINAL: MachineDispenseCommand['status'][] = ['dispensed', 'failed', 'rejected', 'timeout', 'unknown'];
const MAX_CYCLES_PER_STEP = 3;

/** Harness check → model checklist key(s) it is evidence for. The rest of the checklist stays with humans. */
const CHECKLIST_EVIDENCE: Partial<Record<CertificationCheckKey, HarnessCheckId[]>> = {
  authentication: ['authentication', 'replay_protection'],
  machine_registration: ['connect'],
  heartbeat: ['heartbeat'],
  status: ['status'],
  inventory: ['inventory'],
  dispense_command: ['command_polling', 'acknowledgement'],
  dispense_confirmation: ['dispense'],
  failed_dispense: ['failure_handling'],
  idempotency: ['idempotency'],
  payment_flow: ['dispense'],
  reconciliation: ['timeout_handling'],
};

class IntegrationCertificationService {
  async run(businessId: string, machineId: string, subject: CertificationSubject, options: { recordToModel?: boolean; actor?: string } = {}): Promise<CertificationReport> {
    if (isProductionDeployment()) {
      throw new CertificationNotAllowedError('the harness creates sandbox sales and never runs on the production deployment');
    }
    const integration = await machineIntegrationRepository.findByMachineId(businessId, machineId);
    if (!integration) throw new CertificationNotAllowedError('machine has no integration');
    if (integration.environment !== 'sandbox') throw new CertificationNotAllowedError('only sandbox integrations are certified by the harness');
    if (integration.state !== 'active') throw new CertificationNotAllowedError(`integration is ${integration.state}; activate it in the sandbox first`);
    if (options.recordToModel && subject.kind !== 'manufacturer_machine') {
      throw new CertificationNotAllowedError("a run against Snack Quest's simulator proves the harness, not the manufacturer — it can't be recorded as model evidence");
    }

    const runId = `cert_${randomBytes(6).toString('hex')}`;
    const started = new Date(Date.now() - 1000);
    const authFailuresBefore = integration.errorCounts?.authentication ?? 0;
    const slot = await this.testSlot(businessId, machineId);

    // 1. The machine comes up and reports.
    await subject.cycle();
    await subject.emitDoorEvents();

    // 2. A sale.
    const sale = await this.sandboxSale(businessId, machineId, slot.slotCode, runId, 1);
    await this.cycleUntilTerminal(businessId, sale, subject);
    // A subject that fails a step is a failed check, never a crashed run.
    const retransmit = subject.retransmitLastReport
      ? await subject.retransmitLastReport().catch((error: unknown) => ({ status: 0, result: `could not retransmit: ${error instanceof Error ? error.message : String(error)}` }))
      : null;

    // 3. A sale the machine can't fulfil.
    await subject.emptySlot(slot.manufacturerSlotId);
    const failingSale = await this.sandboxSale(businessId, machineId, slot.slotCode, runId, 2);
    await this.cycleUntilTerminal(businessId, failingSale, subject);

    // 4. A command that expires while the machine holds it.
    let expiredSale: string | null = null;
    if (subject.pollWithoutExecuting) {
      expiredSale = await this.sandboxSale(businessId, machineId, slot.slotCode, runId, 3);
      await subject.pollWithoutExecuting();
      const command = await machineDispenseCommandRepository.findByTransactionId(businessId, expiredSale);
      if (command && command.status === 'sent') {
        // Expire it on the server while the machine is still holding it.
        await adminFirestore.collection('machineDispenseCommands').doc(dispenseCommandDocId(command.transactionId)).update({ expiresAt: Timestamp.fromDate(new Date(Date.now() - 1000)) });
        await dispenseCommandService.expireUncollected(businessId, command);
      }
      await subject.cycle();
    }

    const checks = await this.evaluate(businessId, machineId, {
      started,
      authFailuresBefore,
      sale,
      failingSale,
      expiredSale,
      retransmit,
      requestLog: subject.requestLog?.() ?? null,
    });
    const failures = checks.filter((check) => check.outcome !== 'passed').map((check) => `${check.label}: ${check.outcome === 'failed' ? '' : '(not verified) '}${check.evidence}`);
    const after = await machineIntegrationRepository.findByMachineId(businessId, machineId);
    const report: CertificationReport = {
      runId,
      machineId,
      machineCode: integration.machineCode,
      manufacturerId: integration.manufacturerId,
      modelId: integration.modelId,
      firmwareVersion: after?.firmwareVersion ?? integration.firmwareVersion ?? null,
      subjectKind: subject.kind,
      startedAt: started.toISOString(),
      finishedAt: new Date().toISOString(),
      verdict: failures.length === 0 ? 'CERTIFIED' : 'NOT CERTIFIED',
      checks,
      failures,
    };
    await adminFirestore.collection('integrationCertificationRuns').doc(runId).set({ businessId, ...report, createdAt: FieldValue.serverTimestamp() });

    if (options.recordToModel) {
      await this.recordToModel(businessId, report, options.actor ?? 'system:certification');
    }
    return report;
  }

  private async testSlot(businessId: string, machineId: string): Promise<{ slotCode: string; manufacturerSlotId: string }> {
    const slots = await machineSlotRepository.listByMachine(businessId, machineId);
    const slot = slots.find((candidate) => candidate.enabled !== false && (candidate.currentQuantity ?? 0) >= 3);
    if (!slot) throw new CertificationNotAllowedError('the machine needs one enabled slot with at least 3 items on the ledger');
    return { slotCode: slot.slotCode, manufacturerSlotId: manufacturerSlotIdFor(slot) };
  }

  private async sandboxSale(businessId: string, machineId: string, slotCode: string, runId: string, n: number): Promise<string> {
    const { id } = await machineTransactionService.createPending({ businessId, machineId, slotId: slotCode, paymentMethod: 'other' });
    await machineTransactionService.markPaymentVerified(businessId, id, `${runId}-${n}`.toUpperCase());
    await machineTransactionService.authorizeVend(businessId, id);
    return id;
  }

  private async cycleUntilTerminal(businessId: string, transactionId: string, subject: CertificationSubject): Promise<void> {
    for (let cycle = 0; cycle < MAX_CYCLES_PER_STEP; cycle += 1) {
      await subject.cycle();
      const command = await machineDispenseCommandRepository.findByTransactionId(businessId, transactionId);
      if (!command || TERMINAL.includes(command.status)) return;
    }
  }

  private async evaluate(
    businessId: string,
    machineId: string,
    run: {
      started: Date;
      authFailuresBefore: number;
      sale: string;
      failingSale: string;
      expiredSale: string | null;
      retransmit: { status: number; result: string | null } | null;
      requestLog: { nonce: string; timestamp: number }[] | null;
    },
  ): Promise<HarnessCheckResult[]> {
    const integration = (await machineIntegrationRepository.findByMachineId(businessId, machineId)) as MachineIntegration;
    const since = (value: { toMillis(): number } | null | undefined) => Boolean(value && value.toMillis() >= run.started.getTime());
    const events = (await adminFirestore.collection('machineEvents').where('machineId', '==', machineId).where('receivedAt', '>=', run.started).get()).docs.map((doc) => doc.data());
    const [sale, saleCommand, failing, failingCommand] = await Promise.all([
      machineTransactionRepository.findById(businessId, run.sale),
      machineDispenseCommandRepository.findByTransactionId(businessId, run.sale),
      machineTransactionRepository.findById(businessId, run.failingSale),
      machineDispenseCommandRepository.findByTransactionId(businessId, run.failingSale),
    ]);
    const saleMovements = async (transactionId: string) =>
      (await adminFirestore.collection('machineInventoryMovements').where('sourceTransactionId', '==', transactionId).where('reason', '==', 'sale').get()).size;
    const authFailures = (integration.errorCounts?.authentication ?? 0) - run.authFailuresBefore;
    const history = (command: MachineDispenseCommand | null) => command?.statusHistory.map((entry) => entry.status) ?? [];
    const ackedBeforeOutcome = (command: MachineDispenseCommand | null) => {
      const statuses = history(command);
      const outcome = statuses.findIndex((status) => ['dispensing', 'dispensed', 'failed', 'unknown'].includes(status));
      return outcome === -1 || statuses.slice(0, outcome).includes('acknowledged');
    };
    const result = (id: HarnessCheckId, passed: boolean | null, evidence: string): HarnessCheckResult => ({
      id,
      label: HARNESS_CHECKS.find((check) => check.id === id)!.label,
      outcome: passed === null ? 'not_verified' : passed ? 'passed' : 'failed',
      evidence,
    });

    const connected = events.find((event) => String(event.dedupeKey).startsWith('v1:connect:'));
    const doorEvents = events.filter((event) => event.type === 'DOOR_OPENED' || event.type === 'DOOR_CLOSED');
    const liveness = livenessOfIntegration(integration);
    const nonces = run.requestLog?.map((entry) => entry.nonce) ?? [];
    const skewed = run.requestLog?.filter((entry) => Math.abs(entry.timestamp - Date.now() / 1000) > 300) ?? [];
    const expired = run.expiredSale ? await machineTransactionRepository.findById(businessId, run.expiredSale) : null;
    const expiredCommand = run.expiredSale ? await machineDispenseCommandRepository.findByTransactionId(businessId, run.expiredSale) : null;

    return [
      result('connect', Boolean(connected), connected ? `connect recorded (firmware ${String(connected.data?.firmwareVersion ?? 'not reported')})` : 'no connect call was received'),
      result('authentication', authFailures === 0 && since(integration.signals?.api_request), authFailures === 0 ? 'every signed request verified' : `${authFailures} authentication failure(s) attributed to this machine during the run`),
      result('heartbeat', since(integration.signals?.heartbeat) && liveness.state === 'ONLINE', since(integration.signals?.heartbeat) ? `heartbeat received; liveness ${liveness.state}` : 'no heartbeat received during the run'),
      result('status', since(integration.lastReportedStatus?.reportedAt), integration.lastReportedStatus ? `status stored (online=${integration.lastReportedStatus.online})` : 'no status report received'),
      result('inventory', since(integration.signals?.inventory_sync), since(integration.signals?.inventory_sync) ? 'inventory report received and compared against the ledger' : 'no inventory report received'),
      result('events', doorEvents.length >= 2, `${doorEvents.length} door event(s) recorded`),
      result('command_polling', Boolean(saleCommand && saleCommand.status !== 'sent'), saleCommand ? `dispense ${saleCommand.commandRef} is "${saleCommand.status}"` : 'no dispense command was created'),
      result('acknowledgement', Boolean(saleCommand) && [saleCommand, failingCommand, expiredCommand].every(ackedBeforeOutcome), `history: ${history(saleCommand).join(' → ')}; failed sale: ${history(failingCommand).join(' → ')}`),
      result('dispense', sale?.status === 'dispensed' && (await saleMovements(run.sale)) === 1, `sale is "${sale?.status}", ${await saleMovements(run.sale)} stock movement(s)`),
      result(
        'failure_handling',
        failing?.status === 'paid_vend_failed' && failingCommand?.status === 'failed' && (await saleMovements(run.failingSale)) === 0,
        `empty-slot sale is "${failing?.status}", dispense "${failingCommand?.status}"${failingCommand?.dispenseResultStatus ? ` (${failingCommand.dispenseResultStatus})` : ''}`,
      ),
      run.retransmit
        ? result('idempotency', run.retransmit.status === 200 && run.retransmit.result === 'duplicate' && (await saleMovements(run.failingSale)) + (await saleMovements(run.sale)) === 1, `retransmitted report answered ${run.retransmit.status} "${run.retransmit.result}" — must be recognised as the same report (same eventId)`)
        : result('idempotency', null, 'subject cannot be made to retransmit a report; verify by hand'),
      run.requestLog
        ? result('replay_protection', new Set(nonces).size === nonces.length && skewed.length === 0 && authFailures === 0, `${nonces.length} requests, ${nonces.length - new Set(nonces).size} reused nonce(s), ${skewed.length} timestamp(s) outside ±300 s`)
        : result('replay_protection', null, 'subject exposes no request log; verify nonce uniqueness by hand'),
      run.expiredSale
        ? result(
            'timeout_handling',
            expired?.status === 'paid_vend_failed' && !expired.outcomeConflict && (await saleMovements(run.expiredSale)) === 0 && ackedBeforeOutcome(expiredCommand),
            `expired command ended "${expiredCommand?.status}", sale "${expired?.status}"${expired?.outcomeConflict ? ' — the machine reported an outcome for a command it was told not to run' : ''}`,
          )
        : result('timeout_handling', null, 'subject cannot hold a command without executing it; verify by hand'),
    ];
  }

  private async recordToModel(businessId: string, report: CertificationReport, actor: string): Promise<void> {
    const byId = new Map(report.checks.map((check) => [check.id, check]));
    for (const [key, ids] of Object.entries(CHECKLIST_EVIDENCE) as [CertificationCheckKey, HarnessCheckId[]][]) {
      const checks = ids.map((id) => byId.get(id)!);
      if (checks.some((check) => check.outcome === 'not_verified')) continue;
      const passed = checks.every((check) => check.outcome === 'passed');
      await manufacturerRegistryService.recordCertificationCheck(
        businessId,
        report.modelId,
        key,
        { outcome: passed ? 'passed' : 'failed', evidence: `harness run ${report.runId} on ${report.machineCode} (firmware ${report.firmwareVersion ?? 'unknown'}): ${checks.map((check) => `${check.label} — ${check.evidence}`).join('; ')}` },
        actor,
      );
    }
  }
}

export const integrationCertificationService = new IntegrationCertificationService();
export { IntegrationCertificationService };
