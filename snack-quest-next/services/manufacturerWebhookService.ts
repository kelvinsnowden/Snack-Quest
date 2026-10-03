import 'server-only';

import { manufacturerRepository } from '@/repositories/manufacturerRepository';
import { machineRepository } from '@/repositories/machineRepository';
import { machineIntegrationRepository } from '@/repositories/machineIntegrationRepository';
import { webhookEventRepository } from '@/repositories/webhookEventRepository';
import { machineEventService } from '@/services/machineEventService';
import { machineTransactionService } from '@/services/machineTransactionService';
import { defaultVendingAdapterResolver, type VendingAdapterResolver } from '@/lib/vending/adapterRegistry';
import type { AdapterMachineEvent, DispenseResultStatus } from '@/lib/vending/hardwareAdapter';
import type { IntegrationCredential } from '@/types';

const DISPENSE_RESULT_STATUSES: DispenseResultStatus[] = ['success', 'failed', 'timeout', 'unknown', 'jam', 'no_product', 'sensor_failure', 'machine_offline'];

export class WebhookRejectedError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
    this.name = 'WebhookRejectedError';
  }
}

export interface WebhookIngestResult {
  deliveryId: string;
  duplicate: boolean;
  eventsRecorded: number;
  eventsDuplicate: number;
  dispenseOutcomesApplied: number;
  unmatchedMachines: string[];
  unknownEventTypes: string[];
  /** Event ids already received with different content — the sender reused an id for a different fact. */
  conflictingEventIds: string[];
}

/**
 * Manufacturer webhook ingestion (§ WEBHOOKS). By the time a delivery
 * reaches this service its signature, timestamp and nonce have already
 * been verified by the route (`handleIntegrationRequest`), so this is
 * about *what* was said, not *who* said it:
 *
 * 1. The manufacturer in the URL must be the one the credential belongs
 *    to — one manufacturer's key can never post as another.
 * 2. The body goes only to that manufacturer's own adapter parser; no
 *    untrusted payload reaches business logic before translation.
 * 3. The delivery is recorded in the shared `webhookEvents` ledger. A
 *    delivery already processed is acknowledged and ignored; one that
 *    failed part-way is processed again — safe, because every event
 *    and every dispense outcome underneath is itself idempotent.
 * 4. Each event is resolved to a Snack Quest machine through the
 *    integration record (manufacturer + their machine id + environment).
 *    Unknown machines are reported back, never guessed.
 * 5. Dispense outcomes go through `applyVendReport` — the one path that
 *    moves money and inventory. Everything else becomes a normalized
 *    machine event.
 */
class ManufacturerWebhookService {
  constructor(private readonly resolveAdapter: VendingAdapterResolver = defaultVendingAdapterResolver) {}

  async ingest(businessId: string, credential: IntegrationCredential, slug: string, body: unknown): Promise<WebhookIngestResult> {
    const found = await manufacturerRepository.findBySlug(businessId, slug);
    if (!found || found.id !== credential.manufacturerId) {
      throw new WebhookRejectedError(404, 'manufacturer_not_found', 'No such manufacturer for these credentials');
    }
    if (found.data.status !== 'active') {
      throw new WebhookRejectedError(403, 'manufacturer_suspended', 'This manufacturer is suspended');
    }
    const adapter = this.resolveAdapter(found.data.defaultAdapterKey);
    if (!adapter.parseWebhook) {
      throw new WebhookRejectedError(422, 'webhooks_not_supported', `The ${found.data.defaultAdapterKey} integration does not accept webhooks`);
    }
    const parsed = adapter.parseWebhook(body); // UnrecognisedHardwarePayloadError → 422 at the route

    const manufacturerId = found.id;
    const providerEventId = `${manufacturerId}:${parsed.deliveryId}`;
    const { isNew } = await webhookEventRepository.recordIfNew({
      businessId,
      provider: 'machine_manufacturer',
      eventKind: 'machine_webhook',
      providerEventId,
      payload: body as Record<string, unknown>,
    });
    if (!isNew) {
      const existing = await webhookEventRepository.findByProviderEventId(businessId, 'machine_manufacturer', providerEventId);
      if (existing?.status === 'processed') {
        return { deliveryId: parsed.deliveryId, duplicate: true, eventsRecorded: 0, eventsDuplicate: 0, dispenseOutcomesApplied: 0, unmatchedMachines: [], unknownEventTypes: [], conflictingEventIds: [] };
      }
    }

    try {
      const result = await this.process(businessId, manufacturerId, credential, parsed.events);
      await webhookEventRepository.markProcessed(businessId, 'machine_manufacturer', providerEventId);
      return { deliveryId: parsed.deliveryId, duplicate: false, ...result };
    } catch (error) {
      await webhookEventRepository.markFailed(businessId, 'machine_manufacturer', providerEventId, error instanceof Error ? error.message : 'processing failed');
      throw error;
    }
  }

  private async process(businessId: string, manufacturerId: string, credential: IntegrationCredential, events: AdapterMachineEvent[]) {
    const result = { eventsRecorded: 0, eventsDuplicate: 0, dispenseOutcomesApplied: 0, unmatchedMachines: [] as string[], unknownEventTypes: [] as string[], conflictingEventIds: [] as string[] };
    const signalled = new Set<string>();

    for (const event of events) {
      const integration = await machineIntegrationRepository.findByManufacturerMachineId(businessId, manufacturerId, event.manufacturerMachineId);
      if (!integration || integration.environment !== credential.environment) {
        result.unmatchedMachines.push(event.manufacturerMachineId);
        continue;
      }
      const machine = await machineRepository.findById(businessId, integration.machineId);
      if (!machine) {
        result.unmatchedMachines.push(event.manufacturerMachineId);
        continue;
      }
      if (!signalled.has(integration.machineId)) {
        await machineIntegrationRepository.recordSignal(integration.machineId, 'webhook');
        signalled.add(integration.machineId);
      }

      const type = event.type.trim().toUpperCase();
      if ((type === 'DISPENSE_SUCCESS' || type === 'DISPENSE_FAILED') && typeof event.data.vendRef === 'string') {
        const declared = event.data.status;
        const status: DispenseResultStatus =
          typeof declared === 'string' && DISPENSE_RESULT_STATUSES.includes(declared as DispenseResultStatus)
            ? (declared as DispenseResultStatus)
            : type === 'DISPENSE_SUCCESS'
              ? 'success'
              : 'failed';
        const { applied } = await machineTransactionService.applyVendReport({
          businessId,
          machineId: integration.machineId,
          report: {
            vendRef: event.data.vendRef,
            dispensed: status === 'success',
            status,
            failureReason: typeof event.data.failureReason === 'string' ? event.data.failureReason : null,
            deviceTimestamp: event.occurredAt,
            idempotencyKey: `webhook:${manufacturerId}:${event.eventId}`,
          },
          rawPayload: { ...event },
          source: 'webhook',
          actor: `manufacturer:${manufacturerId}`,
        });
        if (applied) {
          result.dispenseOutcomesApplied += 1;
        }
        continue;
      }

      const recorded = await machineEventService.recordExternal(
        businessId,
        { ...machine, id: integration.machineId },
        [{ type: event.type, eventId: event.eventId, occurredAt: event.occurredAt, manufacturerSlotId: event.manufacturerSlotId, data: event.data }],
        'webhook',
        `webhook:${manufacturerId}`,
      );
      result.eventsRecorded += recorded.recorded;
      result.eventsDuplicate += recorded.duplicates;
      result.unknownEventTypes.push(...recorded.unknownTypes);
      result.conflictingEventIds.push(...recorded.conflictingEventIds);
    }
    return result;
  }
}

export const manufacturerWebhookService = new ManufacturerWebhookService();
export { ManufacturerWebhookService };
