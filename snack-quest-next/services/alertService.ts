import 'server-only';

import { machineRepository } from '@/repositories/machineRepository';
import { machineSlotRepository } from '@/repositories/machineSlotRepository';
import { machineSubscriptionRepository } from '@/repositories/machineSubscriptionRepository';
import { machineSettlementRepository } from '@/repositories/machineSettlementRepository';
import { machineTelemetryEventRepository } from '@/repositories/machineTelemetryEventRepository';
import { machineInventoryMovementRepository } from '@/repositories/machineInventoryMovementRepository';
import { alertRepository, AlertNotFoundError, AlertNotOpenError, type AlertConditionInput } from '@/repositories/alertRepository';
import { vendingReconciliationService } from '@/services/vendingReconciliationService';
import { LOW_STOCK_THRESHOLD_FRACTION } from '@/services/machineSlotService';
import { deriveConnectivityStatus } from '@/lib/vending/connectivity';
import { ALERT_SEVERITY_BY_TYPE, type Alert, type AlertSeverity, type AlertType } from '@/types';

const DEFAULT_EXPIRY_WARNING_DAYS = 7;
const DEFAULT_SETTLEMENT_STALE_AFTER_DAYS = 3;
const DEFAULT_EVENT_LOOKBACK_DAYS = 14;

type ConditionDraft = Omit<AlertConditionInput, 'severity'>;

/**
 * § PART 6 — ALERT CENTER. `evaluateAndSync` is the whole service: a
 * sweep, safe to call on every Alert Center page load (or from a
 * future cron, unchanged), that re-derives every alert type from the
 * live state the rest of this codebase already keeps — never a
 * second, independently-maintained copy of "is this machine okay."
 * See `types/alert.ts` for the condition-alert vs event-alert split
 * every method below follows, and each private `evaluate*` method's
 * own doc comment for exactly which existing signal it reads and why.
 */
class AlertService {
  async evaluateAndSync(businessId: string): Promise<void> {
    const machines = await machineRepository.listAllStatuses(businessId);
    const locationByMachine = new Map(machines.map((m) => [m.id, m.locationId]));

    await Promise.all([
      this.evaluateConnectivity(businessId, machines),
      this.evaluateInventory(businessId, machines, locationByMachine),
      this.evaluateReconciliation(businessId, locationByMachine),
      this.evaluateSubscriptions(businessId, locationByMachine),
      this.evaluateSettlements(businessId, locationByMachine),
      this.evaluateFaults(businessId, locationByMachine),
      this.evaluateInventoryDiscrepancies(businessId, locationByMachine),
      this.evaluateExpiryRisk(businessId, locationByMachine),
    ]);
  }

  private async open(draft: ConditionDraft): Promise<void> {
    await alertRepository.upsertOpenCondition({ ...draft, severity: ALERT_SEVERITY_BY_TYPE[draft.type] });
  }

  private async recordEvent(draft: ConditionDraft, dedupeDocId: string): Promise<void> {
    await alertRepository.recordEventOnce({ ...draft, severity: ALERT_SEVERITY_BY_TYPE[draft.type] }, dedupeDocId);
  }

  /**
   * `machine_offline`/`heartbeat_missing` — read straight off
   * `lib/vending/connectivity.ts`'s own `deriveConnectivityStatus`,
   * the exact function the admin fleet view already uses to render
   * 🟢/🟡/🔴. `stale` becomes the warning-level `heartbeat_missing`,
   * `offline` becomes the critical `machine_offline` — two alert
   * types over one derived signal, not two separate detections.
   * Scoped to `active` machines only: a machine mid-install, in
   * maintenance, or already staff-marked `offline` has no useful
   * "is it unexpectedly quiet" signal — staff already know.
   */
  private async evaluateConnectivity(businessId: string, machines: Awaited<ReturnType<typeof machineRepository.listAllStatuses>>): Promise<void> {
    const offlineKeys = new Set<string>();
    const staleKeys = new Set<string>();
    for (const m of machines) {
      if (m.status !== 'active') continue;
      const connectivity = deriveConnectivityStatus(m.lastSeenAt);
      if (connectivity === 'offline') {
        const key = `machine_offline:${m.id}`;
        offlineKeys.add(key);
        await this.open({ businessId, type: 'machine_offline', machineId: m.id, locationId: m.locationId, dedupeKey: key, title: 'Machine offline', detail: 'No heartbeat received past the offline threshold.' });
      } else if (connectivity === 'stale') {
        const key = `heartbeat_missing:${m.id}`;
        staleKeys.add(key);
        await this.open({ businessId, type: 'heartbeat_missing', machineId: m.id, locationId: m.locationId, dedupeKey: key, title: 'Heartbeat missing', detail: 'No heartbeat received recently — not yet offline, but later than expected.' });
      }
    }
    await alertRepository.autoResolveMissing(businessId, 'machine_offline', offlineKeys);
    await alertRepository.autoResolveMissing(businessId, 'heartbeat_missing', staleKeys);
  }

  /**
   * `stockout`/`stockout_risk` — read straight off `machineSlots`,
   * the same `currentQuantity`/`capacity` pair
   * `machineSlotService.checkLowStock` already uses to auto-queue a
   * restock, with the exact same `LOW_STOCK_THRESHOLD_FRACTION`. This
   * is a second, independent surface for the same fact — the restock
   * queue is an *action*, this is *visibility* — not a second
   * threshold to keep in sync by hand.
   */
  private async evaluateInventory(
    businessId: string,
    machines: Awaited<ReturnType<typeof machineRepository.listAllStatuses>>,
    locationByMachine: Map<string, string | null>,
  ): Promise<void> {
    const activeMachineIds = new Set(machines.filter((m) => m.status === 'active').map((m) => m.id));
    const slots = await machineSlotRepository.listByBusiness(businessId);
    const stockoutKeys = new Set<string>();
    const riskKeys = new Set<string>();
    for (const slot of slots) {
      if (!slot.enabled || !slot.productId || !activeMachineIds.has(slot.machineId)) continue;
      const locationId = locationByMachine.get(slot.machineId) ?? null;
      if (slot.currentQuantity <= 0) {
        const key = `stockout:${slot.machineId}:${slot.slotCode}`;
        stockoutKeys.add(key);
        await this.open({ businessId, type: 'stockout', machineId: slot.machineId, locationId, dedupeKey: key, title: 'Slot out of stock', detail: `Slot ${slot.slotCode} is empty.` });
      } else if (slot.capacity > 0 && slot.currentQuantity / slot.capacity <= LOW_STOCK_THRESHOLD_FRACTION) {
        const key = `stockout_risk:${slot.machineId}:${slot.slotCode}`;
        riskKeys.add(key);
        await this.open({ businessId, type: 'stockout_risk', machineId: slot.machineId, locationId, dedupeKey: key, title: 'Low stock', detail: `Slot ${slot.slotCode} is at ${slot.currentQuantity}/${slot.capacity}.` });
      }
    }
    await alertRepository.autoResolveMissing(businessId, 'stockout', stockoutKeys);
    await alertRepository.autoResolveMissing(businessId, 'stockout_risk', riskKeys);
  }

  /**
   * `payment_reconciliation_issue` — reads `vendingReconciliationService`'s
   * own two honest signals (its own doc comment explains exactly what
   * they are and are not) rather than re-deriving them. Both issue
   * kinds share this one alert type: a customer's money is in a state
   * that needs a human, whichever specific state it is.
   */
  private async evaluateReconciliation(businessId: string, locationByMachine: Map<string, string | null>): Promise<void> {
    const summary = await vendingReconciliationService.getReconciliationIssues(businessId);
    const keys = new Set<string>();
    for (const issue of summary.manualReviewTransactions) {
      const key = `payment_reconciliation_issue:txn:${issue.transactionId}`;
      keys.add(key);
      await this.open({
        businessId,
        type: 'payment_reconciliation_issue',
        machineId: issue.machineId,
        locationId: locationByMachine.get(issue.machineId) ?? null,
        dedupeKey: key,
        title: 'Payment needs review',
        detail: issue.failureReason ?? `Transaction ${issue.transactionId} is in manual review.`,
      });
    }
    for (const issue of summary.unmatchedVendReports) {
      const key = `payment_reconciliation_issue:event:${issue.eventId}`;
      keys.add(key);
      await this.open({
        businessId,
        type: 'payment_reconciliation_issue',
        machineId: issue.machineId,
        locationId: locationByMachine.get(issue.machineId) ?? null,
        dedupeKey: key,
        title: 'Unmatched vend report',
        detail: issue.processingError,
      });
    }
    await alertRepository.autoResolveMissing(businessId, 'payment_reconciliation_issue', keys);
  }

  /** `subscription_issue` — a machine subscription already sitting in `in_arrears`, the state's own name for exactly this issue. */
  private async evaluateSubscriptions(businessId: string, locationByMachine: Map<string, string | null>): Promise<void> {
    const inArrears = await machineSubscriptionRepository.listInArrears(businessId);
    const keys = new Set<string>();
    for (const { data } of inArrears) {
      const key = `subscription_issue:${data.machineId}`;
      keys.add(key);
      await this.open({
        businessId,
        type: 'subscription_issue',
        machineId: data.machineId,
        locationId: locationByMachine.get(data.machineId) ?? null,
        dedupeKey: key,
        title: 'Subscription in arrears',
        detail: `KES ${data.arrearsKes.toLocaleString('en-KE')} overdue on this machine's subscription.`,
      });
    }
    await alertRepository.autoResolveMissing(businessId, 'subscription_issue', keys);
  }

  /** `settlement_failure` — a settlement still `draft` well past its own period end, via `machineSettlementRepository.listStaleDrafts`. Resolves itself the moment staff finalize it, since it then stops appearing in that read. */
  private async evaluateSettlements(businessId: string, locationByMachine: Map<string, string | null>): Promise<void> {
    const before = new Date(Date.now() - DEFAULT_SETTLEMENT_STALE_AFTER_DAYS * 24 * 60 * 60 * 1000);
    const stale = await machineSettlementRepository.listStaleDrafts(businessId, before);
    const keys = new Set<string>();
    for (const { id, data } of stale) {
      const key = `settlement_failure:${id}`;
      keys.add(key);
      await this.open({
        businessId,
        type: 'settlement_failure',
        machineId: data.machineId,
        locationId: locationByMachine.get(data.machineId) ?? null,
        dedupeKey: key,
        title: 'Settlement stalled',
        detail: `Draft settlement for the period ending ${data.periodEnd.toDate().toDateString()} was never finalized.`,
      });
    }
    await alertRepository.autoResolveMissing(businessId, 'settlement_failure', keys);
  }

  /** `machine_fault` — an event alert, one per real `fault` telemetry report (§ types/alert.ts: there is no "fault cleared" signal to detect, so this never auto-resolves; a human closes it). */
  private async evaluateFaults(businessId: string, locationByMachine: Map<string, string | null>): Promise<void> {
    const since = new Date(Date.now() - DEFAULT_EVENT_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
    for await (const { id, data } of machineTelemetryEventRepository.streamRange(businessId, { since, eventType: 'fault' })) {
      const code = typeof data.payload?.code === 'string' ? data.payload.code : 'unknown';
      await this.recordEvent(
        {
          businessId,
          type: 'machine_fault',
          machineId: data.machineId,
          locationId: locationByMachine.get(data.machineId) ?? null,
          dedupeKey: `machine_fault:event:${id}`,
          title: 'Machine fault reported',
          detail: `Fault code ${code}.`,
        },
        `machine_fault:event:${id}`,
      );
    }
  }

  /** `inventory_discrepancy` — an event alert, one per staff-recorded discrepancy adjustment (`machineInventoryMovementService.recordDiscrepancyAdjustment`, always written with `reason: 'manual_adjustment'`). Surfaces that a discrepancy was found and corrected; never auto-resolved, since the correction already happened the moment it was recorded. */
  private async evaluateInventoryDiscrepancies(businessId: string, locationByMachine: Map<string, string | null>): Promise<void> {
    const since = new Date(Date.now() - DEFAULT_EVENT_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
    for await (const { id, data } of machineInventoryMovementRepository.streamMovementsInRange(businessId, { reason: 'manual_adjustment', since })) {
      if (data.quantityDelta === 0) continue;
      await this.recordEvent(
        {
          businessId,
          type: 'inventory_discrepancy',
          machineId: data.machineId,
          locationId: locationByMachine.get(data.machineId) ?? null,
          dedupeKey: `inventory_discrepancy:movement:${id}`,
          title: 'Inventory discrepancy recorded',
          detail: `Slot ${data.slotId}: ${data.quantityDelta > 0 ? '+' : ''}${data.quantityDelta} vs the ledger (${data.note ?? 'no reason given'}).`,
        },
        `inventory_discrepancy:movement:${id}`,
      );
    }
  }

  /**
   * `expiry_risk` — a condition alert over each slot's *most recent*
   * `restock` movement with `expiresAt` set (the newest-first order
   * `streamMovementsInRange` already returns, so the first one seen
   * per slot is the most recent). Treating that as "the batch
   * currently in the slot" is an approximation, not a real batch
   * ledger — exactly the honest limitation `MachineInventoryMovement.batchId`'s
   * own doc comment already names ("descriptive, not a live draw
   * against a batch-inventory ledger"). Auto-resolves once that
   * slot's most recent restock no longer carries an imminent
   * `expiresAt` — a fresh restock with a later date, or the risk
   * window simply passing forward, both correctly clear it.
   */
  private async evaluateExpiryRisk(businessId: string, locationByMachine: Map<string, string | null>): Promise<void> {
    const since = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000);
    const now = new Date();
    const warnBefore = new Date(now.getTime() + DEFAULT_EXPIRY_WARNING_DAYS * 24 * 60 * 60 * 1000);
    const seenSlots = new Set<string>();
    const keys = new Set<string>();
    for await (const { data } of machineInventoryMovementRepository.streamMovementsInRange(businessId, { reason: 'restock', since })) {
      const slotKey = `${data.machineId}:${data.slotId}`;
      if (seenSlots.has(slotKey)) continue;
      seenSlots.add(slotKey);
      if (!data.expiresAt) continue;
      const expiresAtDate = data.expiresAt.toDate();
      if (expiresAtDate > now && expiresAtDate < warnBefore) {
        const key = `expiry_risk:${slotKey}`;
        keys.add(key);
        await this.open({
          businessId,
          type: 'expiry_risk',
          machineId: data.machineId,
          locationId: locationByMachine.get(data.machineId) ?? null,
          dedupeKey: key,
          title: 'Stock expiring soon',
          detail: `Slot ${data.slotId}'s current batch expires ${expiresAtDate.toDateString()}.`,
        });
      }
    }
    await alertRepository.autoResolveMissing(businessId, 'expiry_risk', keys);
  }

  async listOpen(businessId: string, filters: { type?: AlertType; severity?: AlertSeverity; machineId?: string } = {}): Promise<{ id: string; data: Alert }[]> {
    return alertRepository.listOpen(businessId, filters);
  }

  async acknowledge(businessId: string, alertId: string, actor: string): Promise<Alert> {
    return alertRepository.acknowledge(businessId, alertId, actor);
  }

  async resolve(businessId: string, alertId: string, actor: string, resolution: string): Promise<Alert> {
    if (!resolution.trim()) {
      throw new ResolutionRequiredError();
    }
    return alertRepository.resolve(businessId, alertId, actor, resolution);
  }
}

export class ResolutionRequiredError extends Error {
  constructor() {
    super('A resolution note is required to resolve an alert');
    this.name = 'ResolutionRequiredError';
  }
}

export const alertService = new AlertService();
export { AlertService, AlertNotFoundError, AlertNotOpenError };
