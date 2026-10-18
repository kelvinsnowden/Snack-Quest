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
import { EmptyState } from '@/components/ui/empty-state';
import { TechnicianJobCard, type JobCardData } from '@/components/warehouse/TechnicianJobCard';

export const metadata: Metadata = { title: 'My jobs' };

/** The jobs given to the person signed in, oldest first, each with where to go and its checklist. */
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
      if (job.kind === 'maintenance') {
        const request = await maintenanceRepository.findRequest(session.businessId, job.refId);
        title = request ? MAINTENANCE_REQUEST_CATEGORY_LABEL[request.category] : 'Maintenance';
        detail = request ? `${request.urgency === 'urgent' ? 'Urgent. ' : ''}${request.description}${request.scheduledFor ? ` · visit ${request.scheduledFor}` : ''}` : null;
      } else {
        const task = await restockTaskRepository.findById(session.businessId, job.refId);
        detail = task ? `${task.items.reduce((sum, item) => sum + (item.quantityDispatched ?? item.quantityNeeded), 0)} items · stage: ${task.status.replace('_', ' ')}. Picking, dispatch and receipt are on the Machines page.` : null;
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
      };
    }),
  );

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">My jobs</h1>
        <p className="text-sm text-muted-foreground">{cards.length === 0 ? 'Nothing assigned to you right now.' : `${cards.length} to do`}</p>
      </div>
      {cards.length === 0 ? <EmptyState icon={ClipboardCheck} title="No jobs" description="When a restock or a maintenance visit is given to you, it shows here with its checklist." /> : null}
      {cards.map((card) => (
        <TechnicianJobCard key={card.id} job={card} />
      ))}
    </div>
  );
}
