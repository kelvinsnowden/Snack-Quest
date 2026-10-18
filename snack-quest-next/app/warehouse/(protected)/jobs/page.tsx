import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { ClipboardCheck } from 'lucide-react';
import { requireStaffSession } from '@/lib/auth/session';
import { hasPermission } from '@/lib/auth/permissions';
import { technicianJobService } from '@/services/technicianJobService';
import { maintenanceRepository } from '@/repositories/maintenanceRepository';
import { restockTaskRepository } from '@/repositories/restockTaskRepository';
import { machineRepository } from '@/repositories/machineRepository';
import { locationService } from '@/services/locationService';
import { MAINTENANCE_REQUEST_CATEGORY_LABEL } from '@/types/maintenance';
import { resolveVendingProducts } from '@/lib/vending/productDetails';
import type { RestockJobData } from '@/components/warehouse/RestockJobFlow';
import { EmptyState } from '@/components/ui/empty-state';
import { TechnicianJobCard, type JobCardData } from '@/components/warehouse/TechnicianJobCard';
import { RouteCard } from '@/components/vending/RouteCard';
import { machineRouteStops } from '@/lib/vending/machineRouteStops';
import { planRoute } from '@/lib/vending/routePlanner';
import { tripPackList } from '@/lib/vending/tripPackList';
import { TripPackCard } from '@/components/warehouse/TripPackCard';

export const metadata: Metadata = { title: 'My jobs' };

/**
 * The jobs given to the person signed in. Restocks not yet on the road
 * are packed together from one trip list at the top; below it, one card
 * per job in the order of the shortest route, each with only what that
 * machine needs.
 */
export default async function MyJobsPage() {
  const session = await requireStaffSession();
  if (!hasPermission(session, 'maintenance.manage') && !hasPermission(session, 'restock.execute')) redirect('/warehouse');

  const jobs = await technicianJobService.listMine(session.businessId, session.uid);
  const [machines, locations] = await Promise.all([
    Promise.all(jobs.map((job) => machineRepository.findById(session.businessId, job.machineId))),
    locationService.listByBusiness(session.businessId),
  ]);
  const place = new Map(locations.map(({ id, data }) => [id, data]));
  const cards: JobCardData[] = await Promise.all(
    jobs.map(async (job, index) => {
      const machine = machines[index];
      const location = machine?.locationId ? place.get(machine.locationId) : undefined;
      let title = 'Restock';
      let detail: string | null = null;
      let urgent = false;
      let restock: RestockJobData | undefined;
      if (job.kind === 'maintenance') {
        const request = await maintenanceRepository.findRequest(session.businessId, job.refId);
        title = request ? MAINTENANCE_REQUEST_CATEGORY_LABEL[request.category] : 'Maintenance';
        urgent = request?.urgency === 'urgent';
        detail = request ? `${request.description}${request.scheduledFor ? ` · visit ${request.scheduledFor}` : ''}` : null;
      } else {
        const task = await restockTaskRepository.findById(session.businessId, job.refId);
        if (task && ['draft', 'approved', 'picking', 'dispatched', 'in_transit'].includes(task.status)) {
          const products = await resolveVendingProducts(session.businessId, task.items.map((item) => item.productId ?? ''));
          const lines = task.items.map((item) => ({
            slotId: item.slotId,
            slotCode: item.slotId.split('__').pop() ?? item.slotId,
            productId: item.productId,
            name: item.productId ? (products.get(item.productId)?.name ?? item.productId) : 'Empty slot',
            imageUrl: item.productId ? (products.get(item.productId)?.imageUrl ?? null) : null,
            quantity: item.quantityDispatched ?? item.quantityNeeded,
          }));
          const total = lines.reduce((sum, line) => sum + line.quantity, 0);
          title = `${total} item${total === 1 ? '' : 's'} into ${lines.length} slot${lines.length === 1 ? '' : 's'}`;
          urgent = task.priority === 'high';
          restock = { taskId: job.refId, status: task.status as RestockJobData['status'], lines };
        }
      }
      return {
        id: job.id,
        kind: job.kind,
        machineCode: machine?.machineCode ?? job.machineId,
        title,
        detail,
        place: location
          ? {
              name: location.name,
              address: location.address,
              mapUrl: location.latitude !== null && location.longitude !== null ? `https://www.google.com/maps/dir/?api=1&destination=${location.latitude},${location.longitude}` : null,
            }
          : null,
        checklist: job.checklist.map(({ label, done }) => ({ label, done })),
        urgent,
        restock,
      };
    }),
  );

  // One stop per machine, however many jobs are at it.
  const visited = new Map<string, NonNullable<(typeof machines)[number]>>();
  jobs.forEach((job, index) => {
    const machine = machines[index];
    if (machine && !visited.has(job.machineId)) visited.set(job.machineId, machine);
  });
  const jobsAt = (machineId: string) =>
    cards.filter((_, index) => jobs[index].machineId === machineId).map((card) => (card.kind === 'restock' ? 'Restock' : card.title)).join(', ');
  const route = machineRouteStops([...visited].map(([id, data]) => ({ id, data })), locations, jobsAt);
  const order = new Map(planRoute(route.stops).stops.map((stop, index) => [stop.id, index]));
  const ordered = cards
    .map((card, index) => ({ card, machineId: jobs[index].machineId, index }))
    .sort((a, b) => (order.get(a.machineId) ?? order.size) - (order.get(b.machineId) ?? order.size) || a.index - b.index);

  // The trip list: every restock that's approved but not yet on the road.
  const toPack = ordered.filter(({ card }) => card.restock && ['approved', 'picking', 'dispatched'].includes(card.restock.status));
  const trip = tripPackList(toPack.map(({ card, machineId }) => ({ machineId, machineCode: card.machineCode, lines: card.restock!.lines })));
  const waitingForApproval = cards.filter((card) => card.restock?.status === 'draft').length;

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">My jobs</h1>
        <p className="text-sm text-muted-foreground">{cards.length === 0 ? 'Nothing assigned to you right now.' : `${cards.length} to do`}</p>
      </div>
      {toPack.length > 0 ? (
        <TripPackCard
          tripKey={toPack.map(({ card }) => card.restock!.taskId).sort().join(',')}
          products={trip.products}
          totalItems={trip.totalItems}
          machineCount={new Set(toPack.map(({ machineId }) => machineId)).size}
          canStartPacking={toPack.some(({ card }) => card.restock!.status === 'approved')}
          waitingForApproval={waitingForApproval}
        />
      ) : null}
      {visited.size > 1 ? (
        <section className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4">
          <h2 className="text-lg font-semibold text-foreground">My route</h2>
          <RouteCard stops={route.stops} missing={route.missing} intro="The shortest way round your machines. Open it in Google Maps and follow it stop by stop." />
        </section>
      ) : null}
      {cards.length === 0 ? <EmptyState icon={ClipboardCheck} title="No jobs" description="When a restock or a maintenance visit is given to you, it shows here with its checklist." /> : null}
      {ordered.map(({ card }) => (
        <TechnicianJobCard key={card.id} job={card} />
      ))}
    </div>
  );
}
