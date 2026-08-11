import { FieldValue } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase/admin';
import type { Order, OrderStatus } from '@/types';

/** A minimal, real, fully-shaped `Order` fixture for repository/service/route tests that don't need to drive the whole checkout journey to get one. */
export async function seedOrder(
  overrides: Partial<Order> & { businessId: string },
): Promise<string> {
  const now = FieldValue.serverTimestamp();
  const ref = await adminFirestore.collection('orders').add({
    product: { packageId: 'pkg-1', packageLabel: 'Starter Box' },
    customer: {
      customerId: null,
      phoneNumber: '254712345678',
      customerName: 'Jane Wanjiru',
      county: 'Nairobi',
    },
    delivery: {
      method: 'pickup',
      provider: 'jumia',
      status: 'pending',
      shippingOrigin: 'Nairobi',
      feeKes: 200,
      county: 'Nairobi',
      pickupStationId: 'station-1',
      pickupStationName: 'Test Pickup Station',
      addressText: null,
      landmark: null,
      estate: null,
      contactPhone: null,
      courierShipmentRef: null,
      trackingUrl: null,
    },
    payment: { paymentIntentId: 'intent-1', mpesaReceiptNumber: 'ABC123XYZ' },
    pricing: { subtotalKes: 2500, discountKes: 0, deliveryFeeKes: 200, creditsUsedKes: 0, totalKes: 2700 },
    conversationId: 'conv-1',
    conversationCheckoutSnapshotId: 'snapshot-1',
    status: 'confirmed' satisfies OrderStatus,
    referralLinkId: null,
    attribution: null,
    fulfillmentBatchId: null,
    fulfillment: null,
    packingRecipeVersionId: null,
    packing: null,
    createdAt: now,
    updatedAt: now,
    createdBy: 'system',
    updatedBy: 'system',
    deletedAt: null,
    ...overrides,
  });
  return ref.id;
}
