import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { forbiddenForPermission, hasPermission } from '@/lib/auth/permissions';
import { recordAuditLog } from '@/lib/audit/recordAuditLog';
import { kioskErrorResponse, readJson } from '@/lib/kiosk/routeErrors';
import { kioskExperienceService } from '@/services/kioskExperienceService';
import type { KioskLayerScope } from '@/types';

type Params = { params: Promise<{ scope: string; scopeId: string }> };

/**
 * One screen design layer (§ KIOSK EXPERIENCE BUILDER). GET needs
 * `kiosk.view`; saving the draft needs `kiosk.design`; taking the layer
 * off its machines (DELETE) needs `kiosk.publish`, like publishing.
 */
export async function GET(request: Request, { params }: Params): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) return Response.json({ error: 'unauthorized' }, { status: 401 });
  if (!hasPermission(session, 'kiosk.view')) return forbiddenForPermission('kiosk.view');
  const { scope, scopeId } = await params;
  try {
    const state = await kioskExperienceService.editorState(session.businessId, scope as KioskLayerScope, scopeId);
    return Response.json({
      draft: state.draft,
      inherited: state.inherited,
      result: state.result,
      check: state.check,
      liveVersionNumber: state.live?.versionNumber ?? null,
      draftDiffersFromLive: state.draftDiffersFromLive,
      versions: state.versions.map(({ data }) => ({
        versionNumber: data.versionNumber,
        note: data.note,
        rolledBackFrom: data.rolledBackFrom,
        publishedBy: data.publishedBy,
        publishedAt: data.publishedAt ? (data.publishedAt as unknown as { toDate(): Date }).toDate().toISOString() : null,
      })),
    });
  } catch (error) {
    return kioskErrorResponse(error);
  }
}

export async function PUT(request: Request, { params }: Params): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) return Response.json({ error: 'unauthorized' }, { status: 401 });
  if (!hasPermission(session, 'kiosk.design')) return forbiddenForPermission('kiosk.design');
  const { scope, scopeId } = await params;
  const body = await readJson(request);
  if (!body) return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  try {
    const result = await kioskExperienceService.saveDraft(session.businessId, scope as KioskLayerScope, scopeId, body.draft, session.uid);
    await recordAuditLog(request, {
      businessId: session.businessId,
      actorId: session.uid,
      action: 'kiosk_layer.save_draft',
      entityType: 'kioskLayer',
      entityId: `${scope}:${scopeId}`,
      after: { draft: result.draft },
      machineId: scope === 'machine' ? scopeId : null,
    });
    return Response.json(result);
  } catch (error) {
    return kioskErrorResponse(error);
  }
}

export async function DELETE(request: Request, { params }: Params): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) return Response.json({ error: 'unauthorized' }, { status: 401 });
  if (!hasPermission(session, 'kiosk.publish')) return forbiddenForPermission('kiosk.publish');
  const { scope, scopeId } = await params;
  try {
    await kioskExperienceService.withdraw(session.businessId, scope as KioskLayerScope, scopeId);
    await recordAuditLog(request, {
      businessId: session.businessId,
      actorId: session.uid,
      action: 'kiosk_layer.withdraw',
      entityType: 'kioskLayer',
      entityId: `${scope}:${scopeId}`,
      machineId: scope === 'machine' ? scopeId : null,
    });
    return Response.json({ withdrawn: true });
  } catch (error) {
    return kioskErrorResponse(error);
  }
}
