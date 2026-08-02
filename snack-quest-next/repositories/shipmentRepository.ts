import 'server-only';

import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase/admin';
import type { Shipment, ShipmentStatus, ShipmentTrackingEvent } from '@/types';

const COLLECTION = 'shipments';

export type ShipmentInput = Omit<Shipment, 'status' | 'createdAt' | 'updatedAt' | 'trackingEvents' | 'deliveredAt'>;

class ShipmentRepository {
  async create(input: ShipmentInput, status: ShipmentStatus): Promise<string> {
    const now = FieldValue.serverTimestamp();
    const ref = await adminFirestore.collection(COLLECTION).add({
      ...input,
      status,
      trackingEvents: [],
      deliveredAt: null,
      createdAt: now,
      updatedAt: now,
    });
    return ref.id;
  }

  /** `deliveredAt` is stamped automatically the moment `status` becomes `delivered` — real for both the manual-override path and the tracking-webhook path, never set any other way. */
  async updateStatus(
    shipmentId: string,
    status: ShipmentStatus,
    extra: Partial<Pick<Shipment, 'courierShipmentRef' | 'trackingUrl'>> = {},
  ): Promise<void> {
    await adminFirestore
      .collection(COLLECTION)
      .doc(shipmentId)
      .update({
        status,
        ...extra,
        ...(status === 'delivered' ? { deliveredAt: FieldValue.serverTimestamp() } : {}),
        updatedAt: FieldValue.serverTimestamp(),
      });
  }

  /**
   * The tracking-webhook write (§ Logistics: wire tracking webhook
   * consumption) — always appends the raw event to `trackingEvents`
   * for a full audit trail, and additionally transitions `status`
   * (stamping `deliveredAt` too, same as `updateStatus`) only when the
   * caller resolved a valid next status to move to.
   */
  async recordTrackingUpdate(
    shipmentId: string,
    input: { event: Omit<ShipmentTrackingEvent, 'occurredAt'> & { occurredAt: Date }; nextStatus?: ShipmentStatus },
  ): Promise<void> {
    const event: ShipmentTrackingEvent = {
      status: input.event.status,
      description: input.event.description,
      occurredAt: Timestamp.fromDate(input.event.occurredAt) as unknown as ShipmentTrackingEvent['occurredAt'],
    };
    await adminFirestore
      .collection(COLLECTION)
      .doc(shipmentId)
      .update({
        trackingEvents: FieldValue.arrayUnion(event),
        ...(input.nextStatus ? { status: input.nextStatus } : {}),
        ...(input.nextStatus === 'delivered' ? { deliveredAt: FieldValue.serverTimestamp() } : {}),
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

  /** The tracking webhook's lookup — resolves the courier's own shipment reference (from the webhook payload) back to the real shipment, scoped to the business the webhook URL is registered under. */
  async findByCourierShipmentRef(businessId: string, courierShipmentRef: string): Promise<{ id: string; data: Shipment } | null> {
    const snapshot = await adminFirestore
      .collection(COLLECTION)
      .where('businessId', '==', businessId)
      .where('courierShipmentRef', '==', courierShipmentRef)
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
