import 'server-only';

import { FieldValue } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase/admin';
import type { AuditLog } from '@/types';

const COLLECTION = 'auditLogs';

export type AuditLogEntryInput = Omit<AuditLog, 'createdAt'>;

/**
 * `auditLogs` — write-only from the server, never updated or deleted
 * (rules §9, `types/auditLog.ts`). Persistence only; deciding *what*
 * counts as an auditable action, and computing the before/after
 * snapshot, is the caller's job (§ Admin: Settings, Withdrawals,
 * Products, Creators, Analytics — every staff-initiated mutation that
 * writes one).
 */
class AuditLogRepository {
  async record(entry: AuditLogEntryInput): Promise<void> {
    await adminFirestore.collection(COLLECTION).add({
      ...entry,
      createdAt: FieldValue.serverTimestamp(),
    });
  }

  async listByBusiness(
    businessId: string,
    options: { entityType?: string; limit?: number; cursor?: string } = {},
  ): Promise<{ logs: { id: string; data: AuditLog }[]; nextCursor: string | null }> {
    const pageSize = options.limit ?? 50;
    let query = adminFirestore
      .collection(COLLECTION)
      .where('businessId', '==', businessId) as FirebaseFirestore.Query;

    if (options.entityType) {
      query = query.where('entityType', '==', options.entityType);
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
      logs: docs.map((doc) => ({ id: doc.id, data: doc.data() as AuditLog })),
      nextCursor: hasMore ? docs[docs.length - 1].id : null,
    };
  }
}

export const auditLogRepository = new AuditLogRepository();
