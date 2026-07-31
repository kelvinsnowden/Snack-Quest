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
}

class DeliveryService {
  async createShipmentForOrder(orderId: string, recipient: ShipmentRecipient): Promise<void> {
    const shipmentId = await shipmentRepository.create(
      {
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

    try {
      const result = await jumiaGateway.createShipment({
        orderId,
        recipientName: recipient.customerName,
        recipientPhone: recipient.phoneNumber,
        deliverTo: { county: recipient.county, method: recipient.deliveryMethod },
      });
      await shipmentRepository.updateStatus(shipmentId, 'created', {
        courierShipmentRef: result.courierShipmentRef,
        trackingUrl: result.trackingUrl,
      });
      await publishEvent('ShipmentCreated', 'order', orderId, {
        shipmentId,
        courierShipmentRef: result.courierShipmentRef,
      });
    } catch (error) {
      await shipmentRepository.updateStatus(shipmentId, 'failed');
      await publishEvent('ShipmentCreationFailed', 'order', orderId, {
        shipmentId,
        reason: error instanceof Error ? error.message : 'unknown error',
      });
    }
  }
}

export const deliveryService = new DeliveryService();
