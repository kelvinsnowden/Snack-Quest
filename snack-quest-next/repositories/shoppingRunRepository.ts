import 'server-only';

import { FieldValue } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase/admin';
import type { AuditFields, ShoppingRun, ShoppingRunLine } from '@/types';

/**
 * `shoppingRuns` reads/writes (§ Box Recipes) — persistence only. What
 * a line's actual cost means, and how the run total is derived from it,
 * is `ShoppingRunService`'s decision.
 */

const COLLECTION = 'shoppingRuns';

export type ShoppingRunInput = Omit<ShoppingRun, keyof AuditFields>;

class ShoppingRunRepository {
  async findById(runId: string): Promise<ShoppingRun | null> {
    const snapshot = await adminFirestore.collection(COLLECTION).doc(runId).get();
    return snapshot.exists ? (snapshot.data() as ShoppingRun) : null;
  }

  async create(data: ShoppingRunInput, actor: string): Promise<string> {
    const now = FieldValue.serverTimestamp();
    const ref = await adminFirestore.collection(COLLECTION).add({
      ...data,
      createdAt: now,
      updatedAt: now,
      createdBy: actor,
      updatedBy: actor,
      deletedAt: null,
    });
    return ref.id;
  }

  /**
   * Replaces the whole line list and the derived total together.
   *
   * One write rather than a per-line update, because `actualTotalKes`
   * is derived from every line: writing a line and its total separately
   * would leave a window where the two disagree, on a document a
   * warehouse phone may be re-reading between them.
   */
  async replaceLines(
    runId: string,
    lines: ShoppingRunLine[],
    actualTotalKes: number,
    actor: string,
  ): Promise<void> {
    await adminFirestore.collection(COLLECTION).doc(runId).update({
      lines,
      actualTotalKes,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: actor,
    });
  }

  async markCompleted(runId: string, actor: string): Promise<void> {
    await adminFirestore.collection(COLLECTION).doc(runId).update({
      status: 'completed',
      completedAt: FieldValue.serverTimestamp(),
      completedBy: actor,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: actor,
    });
  }

  async reopen(runId: string, actor: string): Promise<void> {
    await adminFirestore.collection(COLLECTION).doc(runId).update({
      status: 'open',
      completedAt: null,
      completedBy: null,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: actor,
    });
  }

  async updateNotes(runId: string, notes: string, actor: string): Promise<void> {
    await adminFirestore.collection(COLLECTION).doc(runId).update({
      notes,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: actor,
    });
  }

  /** Runs newest first. Needs the `businessId ASC, createdAt DESC` composite index. */
  async listByBusiness(
    businessId: string,
    options: { limit?: number; cursor?: string } = {},
  ): Promise<{ runs: { id: string; data: ShoppingRun }[]; nextCursor: string | null }> {
    const pageSize = options.limit ?? 25;
    let query = adminFirestore
      .collection(COLLECTION)
      .where('businessId', '==', businessId)
      .orderBy('createdAt', 'desc')
      .limit(pageSize + 1) as FirebaseFirestore.Query;

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
      runs: docs.map((doc) => ({ id: doc.id, data: doc.data() as ShoppingRun })),
      nextCursor: hasMore ? docs[docs.length - 1].id : null,
    };
  }
}

export const shoppingRunRepository = new ShoppingRunRepository();
export { ShoppingRunRepository };
