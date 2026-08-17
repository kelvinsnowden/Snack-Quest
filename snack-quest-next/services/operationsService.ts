import 'server-only';

import { domainEventRepository } from '@/repositories/domainEventRepository';
import { webhookEventRepository } from '@/repositories/webhookEventRepository';
import { paymentIntentRepository } from '@/repositories/paymentIntentRepository';
import { shipmentRepository } from '@/repositories/shipmentRepository';
import { inventoryBatchRepository } from '@/repositories/inventoryBatchRepository';
import { scheduledJobRunRepository } from '@/repositories/scheduledJobRunRepository';
import { packageRepository } from '@/repositories/packageRepository';
import { integrationSettingsService, type IntegrationSummary } from '@/services/integrationSettingsService';
import type { DomainEvent, PaymentIntent, ScheduledJobRun, Shipment, WebhookEvent } from '@/types';
import type { Timestamp } from 'firebase-admin/firestore';

const EXPIRING_SOON_DAYS = 14;

/**
 * A `PaymentIntent` is created, then the STK push is attempted, in the
 * same request — there's no legitimate flow where it sits at `pending`
 * for long. Older than this means the push never reached Daraja at all
 * (e.g. no Daraja secret configured yet) and nothing else will ever
 * move it out of `pending`, so it's a real abandoned checkout, not a
 * customer mid-PIN-entry (that's `processing`, a different status).
 */
const ABANDONED_PENDING_AFTER_MS = 2 * 60 * 1000;

export interface ExpiringBatchRow {
  id: string;
  packageLabel: string;
  quantityRemaining: number;
  expiresAt: Timestamp | null;
}

export interface OperationsSnapshot {
  failedDomainEvents: { id: string; data: DomainEvent }[];
  failedWebhookEvents: { id: string; data: WebhookEvent }[];
  failedPaymentIntents: { id: string; data: PaymentIntent }[];
  abandonedPaymentIntents: { id: string; data: PaymentIntent }[];
  manualBookingShipments: { id: string; data: Shipment }[];
  integrationIssues: IntegrationSummary[];
  expiringBatches: ExpiringBatchRow[];
  scheduledJobRuns: { id: string; data: ScheduledJobRun }[];
  /** Sum of every failure count above — the "system health" rollup, deliberately a real count, never a fabricated score (§ Phase 5). */
  totalIssueCount: number;
}

/**
 * Assembles the Operations dashboard (§ Phase 5: Observability) from
 * signals that already exist across the platform — no new monitoring
 * system, no third-party APM, just real reads over collections every
 * other Service already writes to honestly on failure. "System
 * health" here is a rollup of the other six real counts, not a
 * synthetic uptime/error-rate score this codebase has no data to back.
 */
class OperationsService {
  async getSnapshot(businessId: string): Promise<OperationsSnapshot> {
    const [
      failedDomainEvents,
      failedWebhookEvents,
      failedPaymentIntents,
      pendingPaymentIntents,
      manualBookingShipments,
      integrationSummaries,
      expiringBatches,
      scheduledJobRuns,
    ] = await Promise.all([
      domainEventRepository.listRecentFailures(businessId),
      webhookEventRepository.listFailed(businessId),
      paymentIntentRepository.listByStatus(businessId, ['failed', 'expired']),
      paymentIntentRepository.listByStatus(businessId, ['pending']),
      shipmentRepository.listByBusiness(businessId, { status: 'pending_manual_booking' }).then((r) => r.shipments),
      integrationSettingsService.listSummaries(businessId),
      inventoryBatchRepository.listExpiringSoon(businessId, EXPIRING_SOON_DAYS),
      scheduledJobRunRepository.listRecent(businessId),
    ]);

    const abandonedCutoffMs = Date.now() - ABANDONED_PENDING_AFTER_MS;
    const abandonedPaymentIntents = pendingPaymentIntents.filter(
      ({ data }) => data.createdAt.toMillis() < abandonedCutoffMs,
    );

    const integrationIssues = integrationSummaries.filter((s) => s.status === 'invalid' || s.status === 'connection_failed');

    const packageLabels = new Map<string, string>();
    await Promise.all(
      [...new Set(expiringBatches.map(({ data }) => data.packageId))].map(async (packageId) => {
        const pkg = await packageRepository.findById(businessId, packageId);
        packageLabels.set(packageId, pkg?.name ?? packageId);
      }),
    );
    const expiringBatchRows: ExpiringBatchRow[] = expiringBatches.map(({ id, data }) => ({
      id,
      packageLabel: packageLabels.get(data.packageId) ?? data.packageId,
      quantityRemaining: data.quantityRemaining,
      expiresAt: data.expiresAt,
    }));

    const totalIssueCount =
      failedDomainEvents.length +
      failedWebhookEvents.length +
      failedPaymentIntents.length +
      abandonedPaymentIntents.length +
      manualBookingShipments.length +
      integrationIssues.length +
      scheduledJobRuns.filter((r) => r.data.status === 'failed').length;

    return {
      failedDomainEvents,
      failedWebhookEvents,
      failedPaymentIntents,
      abandonedPaymentIntents,
      manualBookingShipments,
      integrationIssues,
      expiringBatches: expiringBatchRows,
      scheduledJobRuns,
      totalIssueCount,
    };
  }
}

export const operationsService = new OperationsService();
export { OperationsService };
