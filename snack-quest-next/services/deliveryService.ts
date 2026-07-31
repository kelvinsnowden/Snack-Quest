import 'server-only';

import { shipmentRepository } from '@/repositories/shipmentRepository';
import { getDeliveryProviderDefinition } from '@/lib/delivery/providers';
import { publishEvent } from '@/lib/events/eventBus';
import type { DeliveryDetails } from '@/types';

/**
 * Owns fulfillment (PLATFORM_ARCHITECTURE_V2.md §12, redesigned for
 * multiple delivery providers). Looks up which courier handles this
 * shipment from `lib/delivery/providers.ts` — never hardcodes a
 * courier — and branches on that provider's `pricingMode`:
 *
 * - `'automatic'` (Jumia today): calls the provider's `CourierGateway`
 *   for a real shipment reference + tracking URL, same as before.
 * - `'manual'` (Bolt today): there is no automated Bolt integration to
 *   call — a human agent books the courier themselves after the order
 *   is paid. The shipment record is created as `pending_manual_booking`
 *   and an event is published so an agent/admin surface can pick it up;
 *   no HTTP call is made because there is nothing real to call.
 *
 * A shipment-creation failure never fails the order — the payment
 * already succeeded, the order already exists; a courier outage is
 * this Service's problem to retry/escalate, not something that should
 * ever un-confirm a paid order.
 */
export interface ShipmentRecipient {
  customerName: string;
  phoneNumber: string;
  delivery: DeliveryDetails;
}

class DeliveryService {
  async createShipmentForOrder(
    businessId: string,
    orderId: string,
    recipient: ShipmentRecipient,
  ): Promise<void> {
    const { delivery } = recipient;
    const definition = getDeliveryProviderDefinition(delivery.provider);

    const addressText =
      delivery.method === 'door'
        ? [delivery.addressText, delivery.estate, delivery.landmark].filter(Boolean).join(', ')
        : null;

    if (definition.pricingMode === 'manual' || !definition.gateway) {
      const shipmentId = await shipmentRepository.create(
        {
          businessId,
          orderId,
          method: delivery.method,
          provider: delivery.provider,
          courierShipmentRef: null,
          trackingUrl: null,
          recipientName: recipient.customerName,
          recipientPhone: recipient.phoneNumber,
          county: delivery.county,
          addressText,
        },
        'pending_manual_booking',
      );
      await publishEvent(businessId, 'ShipmentAwaitingManualBooking', 'order', orderId, {
        shipmentId,
        provider: delivery.provider,
      });
      return;
    }

    const shipmentId = await shipmentRepository.create(
      {
        businessId,
        orderId,
        method: delivery.method,
        provider: delivery.provider,
        courierShipmentRef: null,
        trackingUrl: null,
        recipientName: recipient.customerName,
        recipientPhone: recipient.phoneNumber,
        county: delivery.county,
        addressText,
      },
      'pending',
    );

    const deliverTo: Record<string, unknown> = {
      county: delivery.county,
      method: delivery.method,
    };
    if (delivery.method === 'pickup') {
      deliverTo.pickupStationId = delivery.pickupStationId;
      deliverTo.pickupStationName = delivery.pickupStationName;
    }

    try {
      const result = await definition.gateway.createShipment({
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
