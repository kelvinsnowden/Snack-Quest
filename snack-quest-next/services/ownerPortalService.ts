import 'server-only';

import { machineService, PartnerDoesNotOwnMachineError } from '@/services/machineService';
import { partnerService } from '@/services/partnerService';
import { locationService } from '@/services/locationService';
import { ownerIntelligenceService, type OwnerMachineSummary } from '@/services/ownerIntelligenceService';
import { machineSettlementService } from '@/services/machineSettlementService';
import { machineSubscriptionService } from '@/services/machineSubscriptionService';
import { machineTransactionRepository } from '@/repositories/machineTransactionRepository';
import { machineDailySummaryRepository } from '@/repositories/machineDailySummaryRepository';
import { restockTaskRepository } from '@/repositories/restockTaskRepository';
import { snackItemRepository } from '@/repositories/snackItemRepository';
import { packageRepository } from '@/repositories/packageRepository';
import { withdrawalService } from '@/services/withdrawalService';
import { alertService } from '@/services/alertService';
import { machineSlotService, LOW_STOCK_THRESHOLD_FRACTION } from '@/services/machineSlotService';
import { restockTaskService } from '@/services/restockTaskService';
import { cameraService, CameraNotFoundError } from '@/services/cameraService';
import { machineTelemetryEventRepository } from '@/repositories/machineTelemetryEventRepository';
import { defaultVendingAdapterResolver, UnsupportedManufacturerError } from '@/lib/vending/adapterRegistry';
import { ProtocolNotConfiguredError } from '@/lib/vending/hardwareAdapter';
import { trailingWindow } from '@/services/machineAssortmentIntelligenceService';
import { deriveConnectivityStatus } from '@/lib/vending/connectivity';
import type { Location, Machine, MachineConnectivityStatus, MachineSubscription } from '@/types';

export { PartnerDoesNotOwnMachineError, CameraNotFoundError };

/** Every window § MACHINE DETAIL — Performance names ("Today / 7 days / 30 days / 90 days"). */
export const OWNER_PERFORMANCE_WINDOWS_DAYS = [1, 7, 30, 90] as const;

export interface OwnerMachineCard {
  machineId: string;
  machineCode: string;
  status: Machine['status'];
  connectivity: ReturnType<typeof deriveConnectivityStatus>;
  locationName: string | null;
  revenueKes: number;
  unitsSold: number;
  stockHealth: OwnerMachineSummary['stockHealth'];
  subscriptionStatus: MachineSubscription['status'] | null;
}

export interface OwnerDashboard {
  partner: { id: string; name: string; contactEmail: string | null };
  wallet: { earnedKes: number; availableKes: number; pendingKes: number; withdrawnKes: number };
  machines: OwnerMachineCard[];
  summary: OwnerDashboardSummary;
}

const PENDING_WITHDRAWAL_STATUSES = new Set(['pending', 'submitting', 'approved']);

/**
 * Sums this partner's own withdrawals into `pendingKes`/`withdrawnKes`
 * (§ OWNER WALLET). Bounded pagination rather than an unbounded
 * scan — a lifetime of one partner's own withdrawal requests is never
 * remotely transaction-volume-sized, so a firm page cap here is a
 * safety bound, not a real limit anyone will hit.
 */
async function sumWithdrawals(businessId: string, partnerId: string): Promise<{ pendingKes: number; withdrawnKes: number }> {
  let pendingKes = 0;
  let withdrawnKes = 0;
  let cursor: string | undefined;
  for (let page = 0; page < 20; page += 1) {
    const { withdrawals, nextCursor } = await withdrawalService.listWithdrawalsForOwner(businessId, partnerId, { cursor });
    for (const { data } of withdrawals) {
      if (data.status === 'paid') {
        withdrawnKes += data.amountKes;
      } else if (PENDING_WITHDRAWAL_STATUSES.has(data.status)) {
        pendingKes += data.amountKes;
      }
    }
    if (!nextCursor) break;
    cursor = nextCursor;
  }
  return { pendingKes, withdrawnKes };
}

export interface OwnerSalesTrendPoint {
  date: string;
  revenueKes: number;
  unitsSold: number;
}

export interface OwnerTopProduct {
  productId: string;
  name: string;
  unitsSold: number;
  revenueKes: number;
}

export interface OwnerRecentActivityItem {
  transactionId: string;
  machineId: string;
  machineCode: string;
  productName: string;
  amountKes: number;
  dispensedAt: string;
}

export interface OwnerAlertItem {
  id: string;
  type: string;
  severity: string;
  machineId: string | null;
  machineCode: string | null;
  title: string;
  detail: string;
  createdAt: string;
}

export interface OwnerMachineHealthEvent {
  id: string;
  label: string;
  detail: string | null;
  occurredAt: string;
}

export interface OwnerMachineHealth {
  machineId: string;
  overallHealthy: boolean;
  connectivity: MachineConnectivityStatus;
  controllerOnline: boolean;
  paymentSystemOk: boolean;
  temperatureCelsius: number | null;
  doorOpen: boolean | null;
  cameraStatus: 'none' | 'active' | 'issue' | 'not_configured';
  networkOk: boolean;
  recentEvents: OwnerMachineHealthEvent[];
}

export type OwnerSlotStatus = 'in_stock' | 'low_stock' | 'out_of_stock' | 'empty_slot';

export interface OwnerSlotInventoryItem {
  slotCode: string;
  productId: string | null;
  productName: string | null;
  currentQuantity: number;
  capacity: number;
  priceKes: number;
  status: OwnerSlotStatus;
}

export interface OwnerMachineInventory {
  machineId: string;
  items: OwnerSlotInventoryItem[];
  counts: { all: number; lowStock: number; outOfStock: number };
}

export interface OwnerDashboardSummary {
  windowDays: number;
  totalSalesKes: number;
  totalSalesTrendPct: number | null;
  netEarningsKes: number;
  netEarningsTrendPct: number | null;
  totalVends: number;
  totalVendsTrendPct: number | null;
  activeMachineCount: number;
  totalMachineCount: number;
}

export class NothingToRestockError extends Error {
  constructor(machineId: string) {
    super(`Machine ${machineId} has no low-stock or out-of-stock slots to restock`);
    this.name = 'NothingToRestockError';
  }
}

export interface OwnerMachineDetail {
  machineId: string;
  machineCode: string;
  status: Machine['status'];
  connectivity: ReturnType<typeof deriveConnectivityStatus>;
  lastHeartbeatAt: string | null;
  lastSaleAt: string | null;
  lastRestock: { taskId: string; status: string; createdAt: string } | null;
  location: { id: string; name: string; city: string; area: string | null } | null;
  performanceByWindow: Record<(typeof OWNER_PERFORMANCE_WINDOWS_DAYS)[number], OwnerMachineSummary>;
  /** Distributable profit summed from this machine's own finalized/paid settlements — machine-attributable, unlike the pooled wallet balance (§ OWNER WALLET: never pretend a per-machine split of a pooled balance). */
  lifetimeDistributableProfitKes: number;
}

/**
 * Everything the Owner Portal itself needs, composed entirely from
 * services Phases 1–3 already built (§ PART 2 — OWNER PORTAL) — no
 * new financial or intelligence computation lives here, only
 * assembly, and every read still goes through
 * `machineService.assertPartnerOwnsMachine` (via `ownerIntelligenceService`
 * or directly) so a partner can never reach another partner's
 * machine by trying a different id.
 */
class OwnerPortalService {
  async getDashboard(businessId: string, partnerId: string, windowDays = 30): Promise<OwnerDashboard> {
    const partner = await partnerService.findById(businessId, partnerId);
    if (!partner) {
      throw new PartnerDoesNotOwnMachineError(partnerId, '(no machine)');
    }
    const machines = await partnerService.listMachines(businessId, partnerId);
    const [locations, subscriptions, summary] = await Promise.all([
      locationService.listByBusiness(businessId),
      machineSubscriptionService.listByPartner(businessId, partnerId),
      this.getDashboardSummary(businessId, partnerId, windowDays),
    ]);
    const locationById = new Map<string, Location>(locations.map(({ id, data }) => [id, data]));
    const subscriptionByMachine = new Map<string, MachineSubscription>(subscriptions.map(({ data }) => [data.machineId, data]));

    const cards: OwnerMachineCard[] = await Promise.all(
      machines.map(async ({ id: machineId, data: machine }) => {
        const summary = await ownerIntelligenceService.getMachineOwnerSummary(businessId, partnerId, machineId, 30);
        return {
          machineId,
          machineCode: machine.machineCode,
          status: machine.status,
          connectivity: deriveConnectivityStatus(machine.lastSeenAt),
          locationName: machine.locationId ? locationById.get(machine.locationId)?.name ?? null : null,
          revenueKes: summary.revenueKes,
          unitsSold: summary.unitsSold,
          stockHealth: summary.stockHealth,
          subscriptionStatus: subscriptionByMachine.get(machineId)?.status ?? null,
        };
      }),
    );

    // `availableCashKes`/`lifetimeEarnedKes` are already the running
    // totals § OWNER WALLET requires ("never present gross central
    // Snack Quest cash as owner balance") — `pendingKes`/`withdrawnKes`
    // are the one thing not already cached anywhere, so they're summed
    // from the partner's own withdrawal history.
    const { pendingKes, withdrawnKes } = await sumWithdrawals(businessId, partnerId);

    return {
      partner: { id: partnerId, name: partner.name, contactEmail: partner.contactEmail },
      wallet: { earnedKes: partner.lifetimeEarnedKes, availableKes: partner.availableCashKes, pendingKes, withdrawnKes },
      machines: cards,
      summary,
    };
  }

  async getMachineDetail(businessId: string, partnerId: string, machineId: string): Promise<OwnerMachineDetail> {
    const machine = await machineService.assertPartnerOwnsMachine(businessId, partnerId, machineId);

    const [performanceEntries, lastSalePage, restockRows, settlements, location] = await Promise.all([
      Promise.all(OWNER_PERFORMANCE_WINDOWS_DAYS.map((days) => ownerIntelligenceService.getMachineOwnerSummary(businessId, partnerId, machineId, days))),
      machineTransactionRepository.listByBusiness(businessId, { machineId, status: 'dispensed', limit: 1 }),
      restockTaskRepository.listByMachine(businessId, machineId, 1),
      machineSettlementService.listByMachine(businessId, machineId),
      machine.locationId ? locationService.findById(businessId, machine.locationId) : Promise.resolve(null),
    ]);

    const performanceByWindow = Object.fromEntries(
      OWNER_PERFORMANCE_WINDOWS_DAYS.map((days, index) => [days, performanceEntries[index]]),
    ) as Record<(typeof OWNER_PERFORMANCE_WINDOWS_DAYS)[number], OwnerMachineSummary>;

    const lastSale = lastSalePage.transactions[0] ?? null;
    const lastRestockRow = restockRows[0] ?? null;
    const lifetimeDistributableProfitKes = settlements
      .filter(({ data }) => data.status === 'finalized' || data.status === 'paid')
      .reduce((sum, { data }) => sum + data.distributableOwnerKes, 0);

    return {
      machineId,
      machineCode: machine.machineCode,
      status: machine.status,
      connectivity: deriveConnectivityStatus(machine.lastSeenAt),
      lastHeartbeatAt: machine.lastSeenAt ? machine.lastSeenAt.toDate().toISOString() : null,
      lastSaleAt: lastSale ? lastSale.data.dispensedAt?.toDate().toISOString() ?? null : null,
      lastRestock: lastRestockRow ? { taskId: lastRestockRow.id, status: lastRestockRow.data.status, createdAt: lastRestockRow.data.createdAt.toDate().toISOString() } : null,
      location: location ? { id: machine.locationId as string, name: location.name, city: location.city, area: location.area } : null,
      performanceByWindow,
      lifetimeDistributableProfitKes,
    };
  }

  /** Every owned machine, or just one — `assertPartnerOwnsMachine` still runs for the single-machine case, so a caller can never widen scope by passing an id that isn't actually theirs. */
  private async resolveOwnedMachineIds(businessId: string, partnerId: string, machineId?: string): Promise<{ id: string; machineCode: string }[]> {
    if (machineId) {
      const machine = await machineService.assertPartnerOwnsMachine(businessId, partnerId, machineId);
      return [{ id: machineId, machineCode: machine.machineCode }];
    }
    const machines = await partnerService.listMachines(businessId, partnerId);
    return machines.map(({ id, data }) => ({ id, machineCode: data.machineCode }));
  }

  /**
   * `machineDailySummary.byProduct` only ever carries a `productId` —
   * never which catalogue it came from — so a human-readable name
   * means checking both real catalogues rather than guessing.
   * `snackItemRepository.findManyById` first (the common case), then
   * `packageRepository.findById` per remaining id (bounded — a
   * window's own distinct-product count, never transaction-volume
   * sized). Falls back to the raw id, never a fabricated label, for
   * a product that has since been deleted from both.
   */
  private async resolveProductNames(businessId: string, productIds: string[]): Promise<Map<string, string>> {
    const names = new Map<string, string>();
    if (productIds.length === 0) {
      return names;
    }
    const snackItems = await snackItemRepository.findManyById(productIds);
    const missing: string[] = [];
    for (const id of productIds) {
      const item = snackItems.get(id);
      if (item) {
        names.set(id, item.name);
      } else {
        missing.push(id);
      }
    }
    if (missing.length > 0) {
      const packages = await Promise.all(missing.map((id) => packageRepository.findById(businessId, id)));
      missing.forEach((id, index) => {
        names.set(id, packages[index]?.name ?? id);
      });
    }
    return names;
  }

  /**
   * § SALES TREND — one daily point per date in the window, summed
   * across every machine in scope, real zeros for a day nothing sold
   * rather than a gap in the series (a chart with holes reads as
   * missing data, not as "nothing happened").
   */
  async getSalesTrend(businessId: string, partnerId: string, windowDays = 30, machineId?: string): Promise<OwnerSalesTrendPoint[]> {
    const machines = await this.resolveOwnedMachineIds(businessId, partnerId, machineId);
    const { startDate, endDate } = trailingWindow(windowDays);

    const byDate = new Map<string, { revenueKes: number; unitsSold: number }>();
    for (const { id } of machines) {
      const rollups = await machineDailySummaryRepository.listRange(businessId, id, startDate, endDate);
      for (const [date, rollup] of rollups) {
        const existing = byDate.get(date) ?? { revenueKes: 0, unitsSold: 0 };
        existing.revenueKes += rollup.grossSalesKes;
        existing.unitsSold += rollup.unitsSold;
        byDate.set(date, existing);
      }
    }

    const points: OwnerSalesTrendPoint[] = [];
    const cursor = new Date(`${startDate}T00:00:00.000Z`);
    const end = new Date(`${endDate}T00:00:00.000Z`);
    while (cursor <= end) {
      const date = cursor.toISOString().slice(0, 10);
      const entry = byDate.get(date);
      points.push({ date, revenueKes: entry?.revenueKes ?? 0, unitsSold: entry?.unitsSold ?? 0 });
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return points;
  }

  /** § TOP SELLING PRODUCTS — summed across every machine in scope, sorted by revenue, real names resolved from the actual catalogue rows. */
  async getTopProducts(businessId: string, partnerId: string, windowDays = 30, machineId?: string, limit = 10): Promise<OwnerTopProduct[]> {
    const machines = await this.resolveOwnedMachineIds(businessId, partnerId, machineId);
    const { startDate, endDate } = trailingWindow(windowDays);

    const totals = new Map<string, { unitsSold: number; revenueKes: number }>();
    for (const { id } of machines) {
      const rollups = await machineDailySummaryRepository.listRange(businessId, id, startDate, endDate);
      for (const rollup of rollups.values()) {
        for (const [productId, product] of Object.entries(rollup.byProduct)) {
          const existing = totals.get(productId) ?? { unitsSold: 0, revenueKes: 0 };
          existing.unitsSold += product.unitsSold;
          existing.revenueKes += product.grossSalesKes;
          totals.set(productId, existing);
        }
      }
    }

    const names = await this.resolveProductNames(businessId, Array.from(totals.keys()));
    return Array.from(totals.entries())
      .map(([productId, total]) => ({ productId, name: names.get(productId) ?? productId, unitsSold: total.unitsSold, revenueKes: total.revenueKes }))
      .sort((a, b) => b.revenueKes - a.revenueKes)
      .slice(0, limit);
  }

  /**
   * § ALERTS & NOTIFICATIONS — the same fleet-wide sweep the staff
   * Alert Center runs (`alertService.evaluateAndSync`/`listOpen`),
   * filtered down to only this owner's own machines afterward, never
   * a separate detection path. An alert with no `machineId` at all
   * (a fleet-level condition — none exist today, per `types/alert.ts`'s
   * own doc comment) is excluded rather than shown to every owner by
   * default; nothing here is ever attributable to a machine this
   * partner doesn't own.
   */
  async getAlerts(businessId: string, partnerId: string): Promise<OwnerAlertItem[]> {
    const machines = await this.resolveOwnedMachineIds(businessId, partnerId);
    const ownedMachineIds = new Set(machines.map((m) => m.id));
    const machineCodeById = new Map(machines.map((m) => [m.id, m.machineCode]));

    await alertService.evaluateAndSync(businessId);
    const openAlerts = await alertService.listOpen(businessId);

    return openAlerts
      .filter(({ data }) => data.machineId && ownedMachineIds.has(data.machineId))
      .map(({ id, data }) => ({
        id,
        type: data.type,
        severity: data.severity,
        machineId: data.machineId,
        machineCode: data.machineId ? machineCodeById.get(data.machineId) ?? null : null,
        title: data.title,
        detail: data.detail,
        createdAt: data.createdAt.toDate().toISOString(),
      }));
  }

  /** § RECENT ACTIVITY — the owner's own most recent dispensed sales, newest first, across every machine in scope. */
  async getRecentActivity(businessId: string, partnerId: string, limit = 10, machineId?: string): Promise<OwnerRecentActivityItem[]> {
    const machines = await this.resolveOwnedMachineIds(businessId, partnerId, machineId);
    const machineCodeById = new Map(machines.map((m) => [m.id, m.machineCode]));

    const perMachine = await Promise.all(
      machines.map(({ id }) => machineTransactionRepository.listByBusiness(businessId, { machineId: id, status: 'dispensed', limit })),
    );
    const transactions = perMachine.flatMap((page) => page.transactions);
    transactions.sort((a, b) => (b.data.dispensedAt?.toMillis() ?? 0) - (a.data.dispensedAt?.toMillis() ?? 0));
    const top = transactions.slice(0, limit);

    const names = await this.resolveProductNames(businessId, Array.from(new Set(top.map(({ data }) => data.productId))));

    return top.map(({ id, data }) => ({
      transactionId: id,
      machineId: data.machineId,
      machineCode: machineCodeById.get(data.machineId) ?? data.machineId,
      productName: names.get(data.productId) ?? data.productId,
      amountKes: data.amountKes,
      dispensedAt: (data.dispensedAt ?? data.createdAt).toDate().toISOString(),
    }));
  }

  /**
   * § MACHINE HEALTH tab. `controllerOnline`/`networkOk` are both
   * restatements of the one real connectivity fact this codebase has
   * (`deriveConnectivityStatus`) — this codebase does not have two
   * independent signals for "is the controller reachable" and "is the
   * network good"; presenting them as two rows without inventing a
   * second measurement is a UI convenience, not a second fact. Live
   * temperature/door readings are best-effort — a stub adapter or an
   * unregistered manufacturer resolves to `null` rather than a crash
   * or a fabricated reading, the same honesty
   * `app/admin/(protected)/vending/[machineId]/page.tsx`'s own
   * `runDiagnostics` already holds for staff.
   */
  async getMachineHealth(businessId: string, partnerId: string, machineId: string): Promise<OwnerMachineHealth> {
    const machine = await machineService.assertPartnerOwnsMachine(businessId, partnerId, machineId);
    const connectivity = deriveConnectivityStatus(machine.lastSeenAt);
    const controllerOnline = connectivity === 'online';

    const [openAlerts, cameras, telemetryEvents, recentDispensed] = await Promise.all([
      alertService.listOpen(businessId, { machineId }),
      cameraService.listByMachine(businessId, machineId),
      machineTelemetryEventRepository.listByMachine(businessId, machineId, { limit: 10 }),
      machineTransactionRepository.listByBusiness(businessId, { machineId, status: 'dispensed', limit: 5 }),
    ]);

    const paymentSystemOk = !openAlerts.some(({ data }) => data.type === 'payment_reconciliation_issue');

    let temperatureCelsius: number | null = null;
    let doorOpen: boolean | null = null;
    try {
      const adapter = defaultVendingAdapterResolver(machine.manufacturer);
      const status = await adapter.getMachineStatus(machineId);
      temperatureCelsius = status.temperatureCelsius;
      doorOpen = status.doorOpen;
    } catch (error) {
      if (!(error instanceof UnsupportedManufacturerError) && !(error instanceof ProtocolNotConfiguredError)) {
        throw error;
      }
    }

    let cameraStatus: OwnerMachineHealth['cameraStatus'] = 'none';
    if (cameras.length > 0) {
      if (cameras.some(({ data }) => data.status === 'active' && data.lastHealthOk !== false)) {
        cameraStatus = 'active';
      } else if (cameras.some(({ data }) => data.status === 'error' || data.lastHealthOk === false)) {
        cameraStatus = 'issue';
      } else {
        cameraStatus = 'not_configured';
      }
    }

    const events: OwnerMachineHealthEvent[] = [
      ...telemetryEvents.map(({ id, data }) => ({
        id,
        label: TELEMETRY_EVENT_LABEL[data.eventType] ?? data.eventType,
        detail: data.processingError,
        occurredAt: data.receivedAt.toDate().toISOString(),
      })),
      ...recentDispensed.transactions.map(({ id, data }) => ({
        id,
        label: 'Vend completed',
        detail: `KES ${data.amountKes.toLocaleString('en-KE')}`,
        occurredAt: (data.dispensedAt ?? data.createdAt).toDate().toISOString(),
      })),
      ...openAlerts.map(({ id, data }) => ({ id, label: data.title, detail: data.detail, occurredAt: data.createdAt.toDate().toISOString() })),
    ].sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());

    return {
      machineId,
      overallHealthy: controllerOnline && paymentSystemOk && cameraStatus !== 'issue' && openAlerts.length === 0,
      connectivity,
      controllerOnline,
      paymentSystemOk,
      temperatureCelsius,
      doorOpen,
      cameraStatus,
      networkOk: controllerOnline,
      recentEvents: events.slice(0, 8),
    };
  }

  /** § INVENTORY tab — this machine's own slots, with the same low-stock threshold `machineSlotService.checkLowStock` already uses, never a second one to keep in sync by hand. */
  async getMachineInventory(businessId: string, partnerId: string, machineId: string): Promise<OwnerMachineInventory> {
    await machineService.assertPartnerOwnsMachine(businessId, partnerId, machineId);
    const slots = await machineSlotService.listByMachine(businessId, machineId);
    const names = await this.resolveProductNames(businessId, slots.map((s) => s.productId).filter((id): id is string => id !== null));

    const items: OwnerSlotInventoryItem[] = slots.map((slot) => {
      let status: OwnerSlotStatus;
      if (!slot.productId) {
        status = 'empty_slot';
      } else if (slot.currentQuantity <= 0) {
        status = 'out_of_stock';
      } else if (slot.capacity > 0 && slot.currentQuantity / slot.capacity <= LOW_STOCK_THRESHOLD_FRACTION) {
        status = 'low_stock';
      } else {
        status = 'in_stock';
      }
      return {
        slotCode: slot.slotCode,
        productId: slot.productId,
        productName: slot.productId ? names.get(slot.productId) ?? slot.productId : null,
        currentQuantity: slot.currentQuantity,
        capacity: slot.capacity,
        priceKes: slot.priceKes,
        status,
      };
    });

    return {
      machineId,
      items,
      counts: {
        all: items.length,
        lowStock: items.filter((i) => i.status === 'low_stock').length,
        outOfStock: items.filter((i) => i.status === 'out_of_stock').length,
      },
    };
  }

  /**
   * § QUICK ACTIONS: "Request Restock". Reuses the exact
   * `restockTaskService.createDraft` staff/system path already
   * proven by `machineSlotService.checkLowStock`'s own auto-opened
   * drafts — an owner-requested draft is the same real task, still
   * subject to the full approve/pick/dispatch/receive workflow, never
   * a shortcut that skips it. Refuses (`NothingToRestockError`)
   * rather than opening an empty or meaningless task when nothing on
   * this machine is actually low.
   */
  async requestRestock(businessId: string, partnerId: string, machineId: string, actor: string): Promise<string> {
    await machineService.assertPartnerOwnsMachine(businessId, partnerId, machineId);
    const slots = await machineSlotService.listByMachine(businessId, machineId);
    const needsRestock = slots.filter(
      (slot) => slot.productId && slot.capacity > 0 && slot.currentQuantity / slot.capacity <= LOW_STOCK_THRESHOLD_FRACTION,
    );
    if (needsRestock.length === 0) {
      throw new NothingToRestockError(machineId);
    }

    return restockTaskService.createDraft({
      businessId,
      machineId,
      items: needsRestock.map((slot) => ({
        slotId: slot.slotCode,
        productId: slot.productId,
        quantityNeeded: Math.max(1, slot.capacity - slot.currentQuantity),
      })),
      priority: 'normal',
      note: 'Requested by the machine owner via the Owner Portal.',
      actor,
    });
  }

  /** Every camera call below scopes through the camera's own `machineId` — an owner can never reach a camera on a machine they don't own by guessing a `cameraId`. */
  private async assertPartnerOwnsCamera(businessId: string, partnerId: string, cameraId: string) {
    const camera = await cameraService.findById(businessId, cameraId);
    if (!camera) {
      throw new CameraNotFoundError(cameraId);
    }
    await machineService.assertPartnerOwnsMachine(businessId, partnerId, camera.machineId);
    return camera;
  }

  /** § CAMERA tab. Deliberately read + test + capture only — configuring credentials or activating a camera stays a staff-only action, the same `ADMIN_ONLY` bar the admin routes already hold; an owner sees and uses a camera, never reconfigures one. */
  async listCamerasForMachine(businessId: string, partnerId: string, machineId: string) {
    await machineService.assertPartnerOwnsMachine(businessId, partnerId, machineId);
    return cameraService.listByMachine(businessId, machineId);
  }

  async getCameraDiagnosticsForOwner(businessId: string, partnerId: string, cameraId: string) {
    const camera = await this.assertPartnerOwnsCamera(businessId, partnerId, cameraId);
    return { camera, diagnostics: await cameraService.getDiagnostics(camera) };
  }

  async testCameraConnectionForOwner(businessId: string, partnerId: string, cameraId: string, actor: string) {
    await this.assertPartnerOwnsCamera(businessId, partnerId, cameraId);
    return cameraService.testConnection(businessId, cameraId, actor);
  }

  /** `reason: 'manual_capture'` — an owner-initiated capture, never `dispense_evidence` (that reason is reserved for a real vend's own transactionId, which an owner action here never has). */
  async captureCameraSnapshotForOwner(businessId: string, partnerId: string, cameraId: string, actor: string) {
    await this.assertPartnerOwnsCamera(businessId, partnerId, cameraId);
    return cameraService.captureSnapshot(businessId, { cameraId, reason: 'manual_capture', actor });
  }

  async listCameraSnapshotsForOwner(businessId: string, partnerId: string, cameraId: string) {
    await this.assertPartnerOwnsCamera(businessId, partnerId, cameraId);
    return cameraService.listSnapshotsByCamera(businessId, cameraId);
  }

  async getCameraStreamInfoForOwner(businessId: string, partnerId: string, cameraId: string) {
    await this.assertPartnerOwnsCamera(businessId, partnerId, cameraId);
    return cameraService.getStreamInfo(businessId, cameraId);
  }

  private async sumRollupsAcross(businessId: string, machineIds: string[], startDate: string, endDate: string): Promise<{ revenueKes: number; unitsSold: number; grossProfitKes: number }> {
    if (new Date(startDate) > new Date(endDate)) {
      return { revenueKes: 0, unitsSold: 0, grossProfitKes: 0 };
    }
    let revenueKes = 0;
    let unitsSold = 0;
    let grossProfitKes = 0;
    for (const machineId of machineIds) {
      const rollups = await machineDailySummaryRepository.listRange(businessId, machineId, startDate, endDate);
      for (const rollup of rollups.values()) {
        revenueKes += rollup.grossSalesKes;
        unitsSold += rollup.unitsSold;
        for (const product of Object.values(rollup.byProduct)) {
          grossProfitKes += product.grossProfitKes;
        }
      }
    }
    return { revenueKes, unitsSold, grossProfitKes };
  }

  /**
   * § DASHBOARD stat tiles. `netEarningsKes` is real-time (from the
   * same daily rollups `totalSalesKes` already reads), not the
   * lagging, settlement-cycle-bound `lifetimeDistributableProfitKes`
   * figure — a partner viewing "last 30 days" before this month's
   * settlement has even been drafted should not see KES 0 just
   * because nothing has been finalized yet. It is gross profit
   * (revenue − COGS, both already real per-product rollup figures)
   * minus this window's own prorated subscription charge — an
   * honest estimate of the same number `machineSettlementService`
   * will eventually finalize, not that number itself. Trend percents
   * are real prior-equal-length-window comparisons, `null` (never a
   * fabricated 0% or an infinite%) when the prior window had nothing
   * to compare against.
   */
  async getDashboardSummary(businessId: string, partnerId: string, windowDays = 30): Promise<OwnerDashboardSummary> {
    const machines = await partnerService.listMachines(businessId, partnerId);
    const machineIds = machines.map(({ id }) => id);
    const activeMachineCount = machines.filter(({ data }) => data.status === 'active').length;

    const { startDate: curStart, endDate: curEnd } = trailingWindow(windowDays);
    const prevEnd = shiftDateKey(curStart, -1);
    const prevStart = shiftDateKey(curStart, -windowDays);

    const [current, previous, subscriptions] = await Promise.all([
      this.sumRollupsAcross(businessId, machineIds, curStart, curEnd),
      this.sumRollupsAcross(businessId, machineIds, prevStart, prevEnd),
      machineSubscriptionService.listByPartner(businessId, partnerId),
    ]);

    const proratedSubscriptionKes = subscriptions.reduce((sum, { data }) => {
      if (data.status !== 'active' && data.status !== 'in_arrears') {
        return sum;
      }
      const periodDays = data.frequency === 'weekly' ? 7 : 30;
      return sum + (data.amountKes / periodDays) * windowDays;
    }, 0);

    const netEarningsKes = Math.round(current.grossProfitKes - proratedSubscriptionKes);
    const previousNetEarningsKes = Math.round(previous.grossProfitKes - proratedSubscriptionKes);

    return {
      windowDays,
      totalSalesKes: current.revenueKes,
      totalSalesTrendPct: percentChange(current.revenueKes, previous.revenueKes),
      netEarningsKes,
      netEarningsTrendPct: percentChange(netEarningsKes, previousNetEarningsKes),
      totalVends: current.unitsSold,
      totalVendsTrendPct: percentChange(current.unitsSold, previous.unitsSold),
      activeMachineCount,
      totalMachineCount: machines.length,
    };
  }
}

/** `YYYY-MM-DD` arithmetic without pulling in a date library — every caller here already works in UTC day keys (`trailingWindow`'s own convention). */
function shiftDateKey(dateKey: string, days: number): string {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** `null`, never a fabricated 0% or an infinite%, when there is nothing real to compare against (§ TrendStatCard's own doc comment). */
function percentChange(current: number, previous: number): number | null {
  if (previous === 0) {
    return null;
  }
  return ((current - previous) / Math.abs(previous)) * 100;
}

const TELEMETRY_EVENT_LABEL: Record<string, string> = {
  heartbeat: 'Heartbeat received',
  fault: 'Fault reported',
  vend_result: 'Dispense result received',
  door_status: 'Door status changed',
  temperature: 'Temperature reading',
};

export const ownerPortalService = new OwnerPortalService();
export { OwnerPortalService };
