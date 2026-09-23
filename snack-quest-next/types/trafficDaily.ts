import type { Timestamp } from 'firebase-admin/firestore';

/**
 * `trafficDaily/{businessId}__{YYYY-MM-DD}` — one document per business
 * per day, holding everything the traffic cards need
 * (§ analytics rollups).
 *
 * The collection it replaces reading: `pageViews` held 24,740 documents
 * against a query capped at 20,000 with no `orderBy`, and the last 30
 * days alone matched 21,426 of them. Firestore returned an arbitrary
 * 20,000 and the dashboard presented the result as exact. Rolling each
 * completed day up once means the range query reads one small document
 * per day — thirty documents for a month — and counts every page view
 * rather than a sample of them.
 *
 * `byPath` is a complete map rather than a top-N list: the site has 60
 * distinct paths in sixty days, so storing all of them costs almost
 * nothing and means the "top pages" ranking is computed over the whole
 * range instead of over a ranking of rankings, which is not the same
 * thing and is not correctable afterwards.
 */
export interface TrafficDaily {
  businessId: string;
  /** `YYYY-MM-DD`, UTC — the same key the admin charts bucket by. */
  date: string;
  visits: number;
  /** Distinct `visitorId`s seen on this day. Exact for the day; see `visitorShards` for ranges. */
  uniqueVisitors: number;
  /** Every path seen that day, mapped to its visit count. */
  byPath: Record<string, number>;
  /** How many shard documents hold this day's visitor ids. */
  visitorShardCount: number;
  rebuiltAt: Timestamp;
}

/**
 * `trafficDaily/{...}/visitorShards/{index}` — the day's distinct
 * visitor ids, split across documents.
 *
 * Unique visitors over a *range* is a union, not a sum: somebody who
 * visits on Monday and Tuesday is one visitor for the week and two for
 * the days. The only way to keep that exact is to keep the ids, and the
 * only way to keep the ids without a ceiling is to shard them — the
 * busiest day so far carried 1,690 of them, which is 64 KB, comfortably
 * inside a document today and not something to leave unbounded when the
 * machine network starts adding its own traffic.
 */
export interface TrafficVisitorShard {
  ids: string[];
}

/** Visitor ids per shard document. 5,000 × 36 chars ≈ 180 KB, well inside Firestore's 1 MB limit. */
export const VISITOR_IDS_PER_SHARD = 5000;
