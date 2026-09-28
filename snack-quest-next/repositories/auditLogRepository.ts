import 'server-only';

import { FieldValue } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase/admin';
import type { AuditLog } from '@/types';

const COLLECTION = 'auditLogs';

export type AuditLogEntryInput = Omit<AuditLog, 'createdAt' | 'source' | 'machineId'> & {
  /** Defaults to `'admin_portal'` — see `AuditLog.source`'s own doc comment for why every pre-existing call site is safe to leave unchanged. */
  source?: string;
  machineId?: string | null;
};

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
      source: entry.source ?? 'admin_portal',
      machineId: entry.machineId ?? null,
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

  /**
   * The newest entries about any of these entities (e.g. every credential
   * of one manufacturer), merged across Firestore's 30-value `in` limit.
   */
  async listForEntities(businessId: string, entityIds: string[], limit = 50): Promise<{ id: string; data: AuditLog }[]> {
    const unique = [...new Set(entityIds)].slice(0, 300);
    const chunks: string[][] = [];
    for (let i = 0; i < unique.length; i += 30) chunks.push(unique.slice(i, i + 30));
    const pages = await Promise.all(
      chunks.map((ids) =>
        adminFirestore.collection(COLLECTION).where('businessId', '==', businessId).where('entityId', 'in', ids).orderBy('createdAt', 'desc').limit(limit).get(),
      ),
    );
    return pages
      .flatMap((page) => page.docs.map((doc) => ({ id: doc.id, data: doc.data() as AuditLog })))
      .sort((a, b) => (b.data.createdAt?.toMillis?.() ?? 0) - (a.data.createdAt?.toMillis?.() ?? 0))
      .slice(0, limit);
  }
}

export const auditLogRepository = new AuditLogRepository();
