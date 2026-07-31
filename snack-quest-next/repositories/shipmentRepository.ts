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

  async findById(businessId: string, shipmentId: string): Promise<Shipment | null> {
    const snapshot = await adminFirestore.collection(COLLECTION).doc(shipmentId).get();
    if (!snapshot.exists) {
      return null;
    }
    const data = snapshot.data() as Shipment;
    return data.businessId === businessId ? data : null;
  }

  /** Admin: Delivery monitoring (§ Admin: Delivery monitoring) — every shipment for the business, newest first, optionally narrowed to one status (e.g. `pending_manual_booking` for the manual-booking queue). */
  async listByBusiness(
    businessId: string,
    options: { status?: ShipmentStatus; limit?: number; cursor?: string } = {},
  ): Promise<{ shipments: { id: string; data: Shipment }[]; nextCursor: string | null }> {
    const pageSize = options.limit ?? 25;
    let query = adminFirestore
      .collection(COLLECTION)
      .where('businessId', '==', businessId) as FirebaseFirestore.Query;

    if (options.status) {
      query = query.where('status', '==', options.status);
    }
    query = query.orderBy('createdAt', 'desc').limit(pageSize + 1);

    if (options.cursor) {
      const cursorDoc = await adminFirestore.collection(COLLECTION).doc(options.cursor).get();
      if (cursorDoc.exists) {
        query = query.startAfter(cursorDoc);
      }
    }

    const snapshot = await query.get();
    const docs = snapshot.docs.slice(0, pageSize);
    const hasMore = snapshot.docs.length > pageSize;

    return {
      shipments: docs.map((doc) => ({ id: doc.id, data: doc.data() as Shipment })),
      nextCursor: hasMore ? docs[docs.length - 1].id : null,
    };
  }
}

export const shipmentRepository = new ShipmentRepository();
