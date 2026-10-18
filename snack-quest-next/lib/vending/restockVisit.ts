import type { RestockTask } from '@/types/restockTask';

/**
 * What a machine's owner is told about restocking: the one visit that
 * matters right now. A rider on the way beats one being packed, which
 * beats one only planned; a visit finished in the last day is shown so
 * the owner knows it happened. Internal detail (pick lists, warehouse,
 * who approved it) stays out.
 */
export type RestockVisitStage = 'requested' | 'planned' | 'packing' | 'on_the_way' | 'restocked';

export interface RestockVisit {
  stage: RestockVisitStage;
  /** When it reached this stage (ISO), when known. */
  at: string | null;
  /** Items being brought, or that went in for a finished visit. */
  items: number;
  /** The rider's first name, when one is assigned and has a real name. */
  riderFirstName: string | null;
}

const RECENT_MS = 24 * 60 * 60 * 1000;

const RANK: Record<RestockVisitStage, number> = { on_the_way: 4, packing: 3, planned: 2, requested: 1, restocked: 0 };

type Stamp = { toDate(): Date } | null | undefined;
const iso = (value: Stamp) => (value ? value.toDate().toISOString() : null);

/** A first name fit to show an owner — never an email address. */
export function riderFirstName(name: string | null | undefined): string | null {
  const first = name?.trim().split(/\s+/)[0] ?? '';
  return first && !first.includes('@') ? first : null;
}

export function visitOf(task: RestockTask, riderName: string | null, now: Date): RestockVisit | null {
  const planned = task.items.reduce((sum, item) => sum + (item.quantityDispatched ?? item.quantityNeeded), 0);
  const rider = riderFirstName(riderName);
  switch (task.status) {
    case 'draft':
      return { stage: 'requested', at: iso(task.createdAt), items: planned, riderFirstName: null };
    case 'approved':
      return { stage: 'planned', at: iso(task.updatedAt), items: planned, riderFirstName: rider };
    case 'picking':
      return { stage: 'packing', at: iso(task.pickedAt), items: planned, riderFirstName: rider };
    case 'dispatched':
    case 'in_transit':
      return { stage: 'on_the_way', at: iso(task.inTransitAt ?? task.dispatchedAt), items: planned, riderFirstName: rider };
    case 'received':
    case 'partially_received': {
      const done = task.completedAt?.toDate();
      if (!done || now.getTime() - done.getTime() > RECENT_MS) return null;
      const loaded = task.items.reduce((sum, item) => sum + (item.quantityReceived ?? 0), 0);
      return { stage: 'restocked', at: done.toISOString(), items: loaded, riderFirstName: rider };
    }
    default:
      return null;
  }
}

/** The visit to show for one machine, from its recent restocks. */
export function currentVisit(tasks: { task: RestockTask; riderName: string | null }[], now: Date): RestockVisit | null {
  let best: RestockVisit | null = null;
  for (const { task, riderName } of tasks) {
    const visit = visitOf(task, riderName, now);
    if (!visit) continue;
    if (!best || RANK[visit.stage] > RANK[best.stage] || (visit.stage === 'restocked' && best.stage === 'restocked' && (visit.at ?? '') > (best.at ?? ''))) best = visit;
  }
  return best;
}
