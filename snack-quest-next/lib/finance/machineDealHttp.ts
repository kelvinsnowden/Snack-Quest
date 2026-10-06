import 'server-only';

import { MachineDealNotFoundError, MachineDealStateError } from '@/repositories/machineDealRepository';
import { MachineDealValidationError } from '@/services/machineDealService';
import type { MachineCostLine, MachineSaleRecord } from '@/types/machineDeal';

/** Maps machine deal failures to responses; "not found" never says whose. */
export function machineDealErrorResponse(error: unknown): Response {
  if (error instanceof MachineDealValidationError) return Response.json({ error: error.message }, { status: error.message === 'Machine not found.' ? 404 : 400 });
  if (error instanceof MachineDealNotFoundError) return Response.json({ error: 'not found' }, { status: 404 });
  if (error instanceof MachineDealStateError) return Response.json({ error: error.message }, { status: 409 });
  throw error;
}

const iso = (t: { toDate(): Date } | null | undefined) => (t ? t.toDate().toISOString() : null);

export function serializeCostLine(id: string, line: MachineCostLine) {
  return { id, category: line.category, description: line.description, amountKes: line.amountKes, occurredOn: line.occurredOn, recordedBy: line.recordedBy, createdAt: iso(line.createdAt), voided: line.voided ? { at: iso(line.voided.at), by: line.voided.by, reason: line.voided.reason } : null };
}

export function serializeSale(sale: MachineSaleRecord | null) {
  return sale ? { ...sale, recordedAt: iso(sale.recordedAt) } : null;
}
