import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { hasPermission, forbiddenForPermission } from '@/lib/auth/permissions';
import { machinePnlService } from '@/services/machinePnlService';
import { MachineNotFoundError } from '@/repositories/machineRepository';
import { resolvePeriod } from '@/lib/finance/periods';

/**
 * § MACHINE-LEVEL P&L — `?preset=…&from=&to=&perspective=snack_quest|owner`.
 * `finance.machine_pnl.view`. The Snack Quest view of a Snack Quest machine
 * uses landed costs, so it also needs `products.cost.view`; the owner view
 * shows what the owner sees.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) return Response.json({ error: 'unauthorized' }, { status: 401 });
  if (!hasPermission(session, 'finance.machine_pnl.view')) return forbiddenForPermission('finance.machine_pnl.view');
  const { id } = await params;
  const query = new URL(request.url).searchParams;
  const perspective = query.get('perspective') === 'owner' ? 'owner' : 'snack_quest';
  if (perspective === 'snack_quest' && !hasPermission(session, 'products.cost.view')) return forbiddenForPermission('products.cost.view');
  const period = resolvePeriod({ preset: query.get('preset'), from: query.get('from'), to: query.get('to') });
  try {
    const pnl = await machinePnlService.forMachine({ businessId: session.businessId, machineId: id, periodStart: period.start, periodEnd: period.end, perspective });
    return Response.json({ period: { preset: period.preset, from: period.fromKey, to: period.toKey }, pnl });
  } catch (error) {
    if (error instanceof MachineNotFoundError) return Response.json({ error: error.message }, { status: 404 });
    throw error;
  }
}
