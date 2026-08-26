import 'server-only';

import { FieldValue, type Transaction } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase/admin';
import type { AuditFields, Package } from '@/types';

export class OutOfStockError extends Error {
  constructor(packageId: string) {
    super(`Package ${packageId} is out of stock`);
    this.name = 'OutOfStockError';
  }
}

export class PackageNotFoundError extends Error {
  constructor(packageId: string) {
    super(`Package ${packageId} not found`);
    this.name = 'PackageNotFoundError';
  }
}

export class StockNotTrackedError extends Error {
  constructor(packageId: string) {
    super(`Package ${packageId} does not track stock — enable stock tracking before adjusting it`);
    this.name = 'StockNotTrackedError';
  }
}

export class InsufficientStockError extends Error {
  constructor(packageId: string, attempted: number, available: number) {
    super(`Cannot remove ${attempted} units from package ${packageId} — only ${available} in stock`);
    this.name = 'InsufficientStockError';
  }
}

/**
 * Decrements stock inside an existing transaction, if this package
 * tracks stock at all. Undefined `stockCount` means unlimited — most
 * packages today, since no real per-box stock ceiling is set — and is
 * a silent no-op, not an error. Exported as a function (not a class
 * method) because it must run inside `OrderService`'s own transaction
 * alongside order creation, using the same `Transaction` object.
 *
 * `quantity` defaults to 1 — the only value any WhatsApp checkout ever
 * produces. The website checkout (§ Website Becomes the Primary
 * Commerce Channel) is the first path that can order several of the
 * same box, and reserving them one call at a time would let a
 * concurrent order slip in between the reads.
 */
export async function reserveStockInTransaction(
  tx: Transaction,
  packageId: string,
  quantity = 1,
): Promise<void> {
  const ref = adminFirestore.collection('packages').doc(packageId);
  const snapshot = await tx.get(ref);
  const data = snapshot.data() as Package | undefined;
  if (!data || data.stockCount === undefined) {
    return;
  }
  if (data.stockCount < quantity) {
    throw new OutOfStockError(packageId);
  }
  tx.update(ref, { stockCount: data.stockCount - quantity });
}

/**
 * Reserves stock for every box on one order, in one transaction
 * (§ more than one box per order).
 *
 * Exists because the obvious thing — calling
 * `reserveStockInTransaction` once per line — is illegal and only
 * proves it on the second line: that function reads then writes, so
 * the second line's read lands after the first line's write, and
 * Firestore refuses a read after a write outright. A one-box order
 * never hits it, so the failure appears exactly when a customer buys
 * two.
 *
 * Every read is done first, then every check, then every write. That
 * ordering is the whole point of this function, so it is written as
 * three separate passes rather than one loop that happens to be
 * correct today.
 *
 * All-or-nothing by construction: a shortage on any line throws before
 * a single write, so an order can never reserve one box and fail on
 * the other.
 */
export async function reserveStockForLinesInTransaction(
  tx: Transaction,
  lines: { packageId: string; quantity: number }[],
): Promise<void> {
  const reads = await Promise.all(
    lines.map(async (line) => {
      const ref = adminFirestore.collection('packages').doc(line.packageId);
      const snapshot = await tx.get(ref);
      return { ref, line, data: snapshot.data() as Package | undefined };
    }),
  );

  for (const { line, data } of reads) {
    // An untracked box has no stock to run out of — the same meaning
    // `reserveStockInTransaction` gives an absent `stockCount`.
    if (!data || data.stockCount === undefined) continue;
    if (data.stockCount < line.quantity) {
      throw new OutOfStockError(line.packageId);
    }
  }

  for (const { ref, line, data } of reads) {
    if (!data || data.stockCount === undefined) continue;
    tx.update(ref, { stockCount: data.stockCount - line.quantity });
  }
}

/**
 * Applies a manual stock adjustment (§ Admin: Inventory) inside the
 * caller's transaction, tenant-scoped and validated: the package must
 * belong to `businessId`, must actually track stock (`stockCount` set —
 * an "unlimited" box has nothing to adjust), and the result must never
 * go negative. Returns the resulting `stockCount` so the caller can
 * record it on the movement it writes in the same transaction.
 */
export async function adjustStockInTransaction(
  tx: Transaction,
  businessId: string,
  packageId: string,
  delta: number,
): Promise<number> {
  const ref = adminFirestore.collection(COLLECTION).doc(packageId);
  const snapshot = await tx.get(ref);
  const data = snapshot.data() as Package | undefined;
  if (!data || data.businessId !== businessId) {
    throw new PackageNotFoundError(packageId);
  }
  if (data.stockCount === undefined) {
    throw new StockNotTrackedError(packageId);
  }
  const next = data.stockCount + delta;
  if (next < 0) {
    throw new InsufficientStockError(packageId, Math.abs(delta), data.stockCount);
  }
  tx.update(ref, { stockCount: next, updatedAt: FieldValue.serverTimestamp() });
  return next;
}

/**
 * `packages` reads/writes (PLATFORM_ARCHITECTURE_V2.md §5). Minimal —
 * just what the Conversation Domain's box-selection step needs.
 */

const COLLECTION = 'packages';

export type PackageInput = Omit<Package, keyof AuditFields>;
/**
 * What an update may carry. `FieldValue` is allowed for the two
 * optional merchandising fields so clearing one in Admin removes it
 * rather than writing an empty value — an absent field is already how
 * "this box is fully curated" and "no badge" are expressed, and a 0 or
 * an empty string would be a second way to say the same thing.
 */
export type PackageUpdate = Partial<Omit<PackageInput, 'guaranteedPickCount' | 'highlightLabel'>> & {
  guaranteedPickCount?: number | FieldValue;
  highlightLabel?: string | FieldValue;
};

class PackageRepository {
  /**
   * Ordered by price ascending — not cosmetic. The Conversation
   * Domain presents these as a numbered list ("1. Starter Box... 2.
   * Deluxe Box...") and a customer's reply of "1" is resolved back to
   * a package by that same order, so an unordered query here would
   * make the numbered options a customer sees unstable between reads.
   *
   * Excludes any `isRescueOffer` package (§ exit-intent rescue offer)
   * — every caller of this method (Pick Your Box, the full /boxes
   * catalog, the checkout page's own grid, the WhatsApp numbered box
   * list) is a "here are the boxes" surface the rescue offer is
   * deliberately absent from; it's reachable only via its own direct
   * `/checkout?box=<id>` link. Filtered in application code, not the
   * query, since a business has at most a handful of packages — no
   * new composite index earns its cost here.
   */
  async listActive(businessId: string): Promise<{ id: string; data: Package }[]> {
    const snapshot = await adminFirestore
      .collection(COLLECTION)
      .where('businessId', '==', businessId)
      .where('isActive', '==', true)
      .orderBy('priceKes', 'asc')
      .get();
    return snapshot.docs
      .map((doc) => ({ id: doc.id, data: doc.data() as Package }))
      .filter(({ data }) => !data.isRescueOffer);
  }

  /**
   * The exit-intent rescue offer, if one is currently configured (§
   * exit-intent rescue offer) — `isActive`/expiration are left for the
   * caller (`ProductService.getRescueOffer`) to check, same
   * read/validate split as everywhere else in this repository. At most
   * one package should carry `isRescueOffer: true`; the first match is
   * returned if more than one somehow does. Equality-only filter — no
   * composite index needed.
   */
  async findRescueOffer(businessId: string): Promise<{ id: string; data: Package } | null> {
    const snapshot = await adminFirestore
      .collection(COLLECTION)
      .where('businessId', '==', businessId)
      .where('isRescueOffer', '==', true)
      .limit(1)
      .get();
    if (snapshot.empty) {
      return null;
    }
    const doc = snapshot.docs[0];
    return { id: doc.id, data: doc.data() as Package };
  }

  /**
   * Admin: Products & Packages (§ Admin: Products) — every package
   * regardless of `isActive`, since a staff member managing the
   * catalog needs to see (and reactivate) inactive ones too, unlike
   * `listActive()` which is what the customer-facing checkout reads.
   */
  async listAllByBusiness(businessId: string): Promise<{ id: string; data: Package }[]> {
    const snapshot = await adminFirestore
      .collection(COLLECTION)
      .where('businessId', '==', businessId)
      .orderBy('priceKes', 'asc')
      .get();
    return snapshot.docs.map((doc) => ({ id: doc.id, data: doc.data() as Package }));
  }

  async create(data: PackageInput, actor: string): Promise<string> {
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
   * businessId-scoped even for a single-doc lookup — a packageId alone
   * is never trusted as proof it belongs to the caller's tenant (same
   * discipline as `pickupStationRepository.findById`), which matters
   * here specifically because `/api/checkout/start` accepts a
   * caller-supplied product id from an external system (Whatchimp).
   */
  async findById(businessId: string, packageId: string): Promise<Package | null> {
    const snapshot = await adminFirestore.collection(COLLECTION).doc(packageId).get();
    if (!snapshot.exists) {
      return null;
    }
    const data = snapshot.data() as Package;
    return data.businessId === businessId ? data : null;
  }

  async update(packageId: string, patch: PackageUpdate, actor: string): Promise<void> {
    await adminFirestore.collection(COLLECTION).doc(packageId).update({
      ...patch,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: actor,
    });
  }
}

export const packageRepository = new PackageRepository();
