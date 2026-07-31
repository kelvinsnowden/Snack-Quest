import 'server-only';

import { FieldValue } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase/admin';
import type { Shipment, ShipmentStatus } from '@/types';

const COLLECTION = 'shipments';

export type ShipmentInput = Omit<Shipment, 'status' | 'createdAt' | 'updatedAt'>;

class ShipmentRepository {
  async create(input: ShipmentInput, status: ShipmentStatus): Promise<string> {
    const now = FieldValue.serverTimestamp();
    const ref = await adminFirestore.collection(COLLECTION).add({
      ...input,
      status,
      createdAt: now,
      updatedAt: now,
    });
    return ref.id;
  }

  async updateStatus(
    shipmentId: string,
    status: ShipmentStatus,
    extra: Partial<Pick<Shipment, 'courierShipmentRef' | 'trackingUrl'>> = {},
  ): Promise<void> {
    await adminFirestore.collection(COLLECTION).doc(shipmentId).update({
      status,
      ...extra,
      updatedAt: FieldValue.serverTimestamp(),
    });
  }

  async findByOrderId(orderId: string): Promise<{ id: string; data: Shipment } | null> {
    const snapshot = await adminFirestore
      .collection(COLLECTION)
      .where('orderId', '==', orderId)
      .limit(1)
      .get();
    if (snapshot.empty) {
      return null;
    }
    const doc = snapshot.docs[0];
    return { id: doc.id, data: doc.data() as Shipment };
  }
}

export const shipmentRepository = new ShipmentRepository();
