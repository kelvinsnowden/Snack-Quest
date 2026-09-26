import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, Boxes, Camera as CameraIcon } from 'lucide-react';
import { requirePartnerSession } from '@/lib/auth/partnerSession';
import { ownerPortalService, PartnerDoesNotOwnMachineError } from '@/services/ownerPortalService';
import { cameraService } from '@/services/cameraService';
import { serializeCamera, serializeCameraSnapshot } from '@/lib/vending/serialize';
import { MachineNotFoundError } from '@/repositories/machineRepository';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { CameraStatusBadge } from '@/components/admin/CameraStatusBadge';
import { PartnerCameraActions } from '@/components/partner/PartnerCameraActions';

export const metadata: Metadata = { title: 'Camera' };

function formatIsoDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-KE', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

/**
 * § CAMERA screen — read/test/capture only (never
 * configure/activate/disable, which stay `ADMIN_ONLY`). Camera
 * evidence here is exactly that: evidence to look at, never a signal
 * that changes a vend's own success/failure outcome (§ CAMERA
 * COMPATIBILITY — dispense-evidence decoupling holds in every UI that
 * reads a camera, not just the admin one).
 */
export default async function PartnerCameraPage({ params }: { params: Promise<{ machineId: string }> }) {
  const session = await requirePartnerSession();
  const { machineId } = await params;

  let cameras: Awaited<ReturnType<typeof ownerPortalService.listCamerasForMachine>>;
  try {
    cameras = await ownerPortalService.listCamerasForMachine(session.businessId, session.partnerId, machineId);
  } catch (error) {
    if (error instanceof MachineNotFoundError || error instanceof PartnerDoesNotOwnMachineError) {
      notFound();
    }
    throw error;
  }

  const cameraRows = await Promise.all(
    cameras.map(async ({ id, data }) => {
      const [diagnostics, snapshots] = await Promise.all([
        cameraService.getDiagnostics(data),
        ownerPortalService.listCameraSnapshotsForOwner(session.businessId, session.partnerId, id),
      ]);
      return { id, camera: serializeCamera(id, data), diagnostics, snapshots: snapshots.map(({ id: snapId, data: snapData }) => serializeCameraSnapshot(snapId, snapData)) };
    }),
  );

  return (
    <div className="flex flex-col gap-6">
      <Link href={`/partner/machines/${machineId}`} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" aria-hidden="true" />
        Back to machine
      </Link>

      <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
        <CameraIcon className="size-5" aria-hidden="true" />
        Camera
      </h1>

      {cameraRows.length === 0 ? (
        <EmptyState icon={Boxes} title="No camera on this machine" description="This machine doesn't have a camera registered yet." />
      ) : (
        <div className="flex flex-col gap-6">
          {cameraRows.map(({ id, camera, diagnostics, snapshots }) => (
            <Card key={id}>
              <CardHeader>
                <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                  {camera.label}
                  <Badge variant="outline">{camera.type}</Badge>
                  <CameraStatusBadge status={camera.status} />
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
                  <div>
                    <p className="text-xs text-muted-foreground">Connection</p>
                    <p className="font-medium capitalize text-foreground">{camera.connectionState}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Last seen</p>
                    <p className="font-medium text-foreground">{camera.lastSeenAt ? formatIsoDateTime(camera.lastSeenAt) : 'Never'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Last health check</p>
                    <p className="font-medium text-foreground">{camera.lastHealthOk === null ? '—' : camera.lastHealthOk ? 'Healthy' : 'Unhealthy'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Last snapshot</p>
                    <p className="font-medium text-foreground">{camera.lastSnapshotAt ? formatIsoDateTime(camera.lastSnapshotAt) : 'Never'}</p>
                  </div>
                </div>

                {!diagnostics.registered ? (
                  <p className="text-sm text-warning">This camera type isn&apos;t integrated yet — contact Snack Quest support.</p>
                ) : (
                  <PartnerCameraActions
                    cameraId={id}
                    canSnapshot={diagnostics.statusByCapability.camera_snapshot === 'supported'}
                    canStream={diagnostics.statusByCapability.camera_stream === 'supported'}
                  />
                )}

                {camera.lastErrorMessage ? <p className="text-sm text-danger">Last error: {camera.lastErrorMessage}</p> : null}

                <div>
                  <p className="mb-2 text-sm font-medium text-foreground">Recent snapshots</p>
                  {snapshots.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No snapshots captured yet.</p>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {snapshots.slice(0, 10).map((snapshot) => (
                        <div key={snapshot.id} className="flex items-center justify-between gap-3 border-b border-border pb-2 text-sm last:border-0 last:pb-0">
                          <span className="text-muted-foreground">{formatIsoDateTime(snapshot.capturedAt)}</span>
                          <Badge variant={snapshot.success ? 'success' : 'danger'}>{snapshot.success ? 'Captured' : 'Failed'}</Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
