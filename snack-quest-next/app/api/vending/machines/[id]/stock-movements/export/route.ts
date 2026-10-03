import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { hasPermission, forbiddenForPermission } from '@/lib/auth/permissions';
import { machineRepository } from '@/repositories/machineRepository';
import { machineInventoryMovementRepository } from '@/repositories/machineInventoryMovementRepository';
import { csvCell } from '@/services/vendingSalesService';
import { recordAuditLog } from '@/lib/audit/recordAuditLog';
import { BUSINESS_TIME_ZONE } from '@/lib/vending/businessClock';

const MAX_ROWS = 10000;
const MAX_DAYS = 366;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1000;
const stamp = new Intl.DateTimeFormat('en-CA', { timeZone: BUSINESS_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });

/** Start of a Nairobi day (UTC+3, no daylight saving), or null for anything that isn't a real day. */
function nairobiDayStart(value: string | null): Date | null {
  if (!value || !DAY.test(value)) return null;
  const date = new Date(`${value}T00:00:00+03:00`);
  return Number.isNaN(date.getTime()) || new Date(date.getTime() + 3 * 60 * 60 * 1000).toISOString().slice(0, 10) !== value ? null : date;
}

/**
 * One machine's stock ledger as CSV (`machine_inventory.export`): every
 * movement between two Nairobi days inclusive (default: the last 30),
 * oldest first, as recorded — before, change, after, why and who. At
 * most 10,000 rows (`X-Truncated: true` when cut). Audited.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) return Response.json({ error: 'unauthorized' }, { status: 401 });
  if (!hasPermission(session, 'machine_inventory.export')) return forbiddenForPermission('machine_inventory.export');
  const { id } = await params;
  const machine = await machineRepository.findById(session.businessId, id);
  if (!machine) return Response.json({ error: 'Machine not found' }, { status: 404 });

  const url = new URL(request.url);
  const fromParam = url.searchParams.get('from');
  const toParam = url.searchParams.get('to');
  const until = toParam ? nairobiDayStart(toParam) : null;
  const since = fromParam ? nairobiDayStart(fromParam) : null;
  if ((fromParam && !since) || (toParam && !until)) return Response.json({ error: 'from and to must be days written YYYY-MM-DD.' }, { status: 400 });
  const end = until ? new Date(until.getTime() + DAY_MS) : new Date();
  const start = since ?? new Date(end.getTime() - 30 * DAY_MS);
  if (start >= end) return Response.json({ error: 'The first day must not be after the last day.' }, { status: 400 });
  if (end.getTime() - start.getTime() > MAX_DAYS * DAY_MS) return Response.json({ error: `At most ${MAX_DAYS} days at a time.` }, { status: 400 });

  const rows = await machineInventoryMovementRepository.listByMachineInRange(session.businessId, id, start, end, MAX_ROWS + 1);
  const truncated = rows.length > MAX_ROWS;
  const header = ['When (Nairobi)', 'Slot', 'Product', 'Reason', 'Before', 'Change', 'After', 'Sale', 'Restock task', 'Batch', 'Note', 'By'];
  const lines = rows.slice(0, MAX_ROWS).map(({ data }) => [
    data.createdAt ? stamp.format(data.createdAt.toDate()).replace(',', '') : '',
    csvCell(data.slotId.split('__').pop() ?? data.slotId),
    csvCell(data.productId ?? ''),
    data.reason,
    String(data.beforeQuantity),
    String(data.quantityDelta),
    String(data.afterQuantity),
    csvCell(data.sourceTransactionId ?? ''),
    csvCell(data.restockTaskId ?? ''),
    csvCell(data.batchId ?? ''),
    csvCell(data.note ?? ''),
    csvCell(data.actor),
  ]);
  const csv = [header.map(csvCell), ...lines].map((line) => line.join(',')).join('\r\n') + '\r\n';
  await recordAuditLog(request, {
    businessId: session.businessId,
    actorId: session.uid,
    action: 'export_stock_movements',
    entityType: 'machine',
    entityId: id,
    machineId: id,
    after: { from: start.toISOString(), to: end.toISOString(), rowCount: lines.length, truncated },
  });
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="stock-${machine.machineCode.replace(/[^A-Za-z0-9-]+/g, '-')}.csv"`,
      'Cache-Control': 'no-store',
      'X-Truncated': truncated ? 'true' : 'false',
    },
  });
}
