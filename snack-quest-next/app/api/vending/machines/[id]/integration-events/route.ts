import { ADMIN_FINANCE_OR_WAREHOUSE } from '@/lib/auth/requireStaffRole';
import { withStaffRoles } from '@/lib/vending/adminIntegrationRoute';
import { toJsonSafe } from '@/lib/vending/serializeIntegration';
import { machineEventService } from '@/services/machineEventService';
import { dispenseCommandService } from '@/services/dispenseCommandService';

/** Recent normalized machine events and dispense commands for one machine — the admin view of what the integration layer saw and did. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  return withStaffRoles(request, ADMIN_FINANCE_OR_WAREHOUSE, async (session) => {
    const [events, dispenseCommands] = await Promise.all([
      machineEventService.listForMachine(session.businessId, id, 50),
      dispenseCommandService.listForMachine(session.businessId, id, 25),
    ]);
    return Response.json(
      toJsonSafe({
        events: events.map(({ id: eventId, data }) => ({ id: eventId, ...data })),
        dispenseCommands,
      }),
    );
  });
}
