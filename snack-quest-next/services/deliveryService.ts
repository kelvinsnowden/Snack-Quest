import 'server-only';

import { shipmentRepository } from '@/repositories/shipmentRepository';
import { jumiaGateway } from '@/lib/integrations/jumia/jumiaGateway';
import { publishEvent } from '@/lib/events/eventBus';
import type { DeliveryMethod } from '@/types';

/**
 * Owns fulfillment (PLATFORM_ARCHITECTURE_V2.md §12). Jumia is the
 * courier for both delivery methods a customer can pick today — a
 * door-delivery order and a pickup-station order both become a real
 * Jumia shipment; `deliveryMethod` on the shipment record is what
 * differs, not which courier handles it.
 *
 * A shipment-creation failure never fails the order — the payment
 * already succeeded, the order already exists; a courier outage is
 * this Service's problem to retry/escalate, not something that should
 * ever un-confirm a paid order.
 */
export interface ShipmentRecipient {
  customerName: string;
  phoneNumber: string;
  county: string;
  deliveryMethod: DeliveryMethod;
  /** Set only when deliveryMethod is 'jumia_pickup' — the specific station Jumia should route to, not just the county. */
  pickupStationId?: string | null;
  pickupStationName?: string | null;
}

class DeliveryService {
  async createShipmentForOrder(
    businessId: string,
    orderId: string,
    recipient: ShipmentRecipient,
  ): Promise<void> {
    const shipmentId = await shipmentRepository.create(
      {
        businessId,
        orderId,
        courierShipmentRef: null,
        trackingUrl: null,
        recipientName: recipient.customerName,
        recipientPhone: recipient.phoneNumber,
        county: recipient.county,
        deliveryMethod: recipient.deliveryMethod,
        addressText: null,
      },
      'pending',
    );

    const deliverTo: Record<string, unknown> = {
      county: recipient.county,
      method: recipient.deliveryMethod,
    };
    if (recipient.deliveryMethod === 'jumia_pickup') {
      deliverTo.pickupStationId = recipient.pickupStationId ?? null;
      deliverTo.pickupStationName = recipient.pickupStationName ?? null;
    }

    try {
      const result = await jumiaGateway.createShipment({
        businessId,
        orderId,
        recipientName: recipient.customerName,
        recipientPhone: recipient.phoneNumber,
        deliverTo,
      });
      await shipmentRepository.updateStatus(shipmentId, 'created', {
        courierShipmentRef: result.courierShipmentRef,
        trackingUrl: result.trackingUrl,
      });
      await publishEvent(businessId, 'ShipmentCreated', 'order', orderId, {
        shipmentId,
        courierShipmentRef: result.courierShipmentRef,
      });
    } catch (error) {
      await shipmentRepository.updateStatus(shipmentId, 'failed');
      await publishEvent(businessId, 'ShipmentCreationFailed', 'order', orderId, {
        shipmentId,
        reason: error instanceof Error ? error.message : 'unknown error',
      });
    }
  }
}

export const deliveryService = new DeliveryService();
