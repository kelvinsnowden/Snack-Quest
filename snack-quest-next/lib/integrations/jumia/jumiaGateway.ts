import 'server-only';

import { getJumiaConfig } from './config';
import { withRetry } from '../shared/withRetry';
import { withCircuitBreaker } from '../shared/withCircuitBreaker';
import type { CourierGateway, ShipmentResult, TrackingStatus } from '../types';

const GATEWAY_NAME = 'jumia';

/**
 * Real HTTP client, modeled on standard courier-API shape (create
 * shipment → get a shipment reference + tracking URL; poll or receive
 * webhook for status). Not yet verified against Jumia's actual API
 * docs/credentials — same honest caveat as DarajaGateway/WhatchimpGateway
 * before their real credentials existed. See PLATFORM_ARCHITECTURE_V2.md §18.
 */
class JumiaGateway implements CourierGateway {
  async createShipment(input: {
    businessId: string;
    orderId: string;
    recipientName: string;
    recipientPhone: string;
    deliverTo: Record<string, unknown>;
  }): Promise<ShipmentResult> {
    const config = await getJumiaConfig(input.businessId);

    // Shipment creation is idempotent by orderId on Jumia's side (a
    // real courier API dedupes on merchant order reference) — safe to
    // retry on a transient network failure, unlike a payment prompt.
    return withCircuitBreaker(`${GATEWAY_NAME}:${input.businessId}`, () =>
      withRetry(async () => {
        const response = await fetch(`${config.baseUrl}/shipments`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${config.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            merchant_id: config.merchantId,
            merchant_order_ref: input.orderId,
            recipient: { name: input.recipientName, phone: input.recipientPhone },
            deliver_to: input.deliverTo,
          }),
        });

        const data = (await response.json()) as {
          shipment_ref?: string;
          tracking_url?: string;
          error?: { message?: string };
        };
        if (!response.ok || !data.shipment_ref) {
          throw new Error(
            `Jumia shipment creation failed: ${data.error?.message ?? response.status}`,
          );
        }
        return {
          courierShipmentRef: data.shipment_ref,
          trackingUrl: data.tracking_url ?? '',
        };
      }),
    );
  }

  async getTrackingStatus(businessId: string, shipmentRef: string): Promise<TrackingStatus> {
    const config = await getJumiaConfig(businessId);
    return withCircuitBreaker(`${GATEWAY_NAME}:${businessId}`, () =>
      withRetry(async () => {
        const response = await fetch(`${config.baseUrl}/shipments/${shipmentRef}`, {
          headers: { Authorization: `Bearer ${config.apiKey}` },
        });
        const data = (await response.json()) as {
          status?: string;
          updated_at?: string;
        };
        if (!response.ok || !data.status) {
          throw new Error(`Jumia tracking lookup failed: ${response.status}`);
        }
        return {
          courierShipmentRef: shipmentRef,
          status: data.status,
          lastUpdatedAt: data.updated_at ?? new Date().toISOString(),
        };
      }),
    );
  }

  parseTrackingWebhook(payload: unknown): TrackingStatus {
    const body = payload as {
      shipment_ref?: string;
      status?: string;
      updated_at?: string;
    };
    if (!body.shipment_ref || !body.status) {
      throw new Error(
        'Malformed Jumia tracking webhook payload: missing shipment_ref/status',
      );
    }
    return {
      courierShipmentRef: body.shipment_ref,
      status: body.status,
      lastUpdatedAt: body.updated_at ?? new Date().toISOString(),
    };
  }
}

export const jumiaGateway: CourierGateway = new JumiaGateway();

/**
 * "Test Connection" (§ Integration Portal) — `GET {baseUrl}/merchants/{merchantId}`
 * is a standard courier-API shape (fetch your own merchant profile),
 * modeled the same honest, disclosed-but-unverified way as the rest of
 * this Gateway (see the class-level doc comment). Read-only: never
 * creates a shipment.
 */
export async function testJumiaConnection(businessId: string): Promise<void> {
  const config = await getJumiaConfig(businessId);
  const response = await fetch(`${config.baseUrl}/merchants/${config.merchantId}`, {
    headers: { Authorization: `Bearer ${config.apiKey}` },
  });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Jumia connection test failed: ${response.status} ${body}`);
  }
}
