import { verifyPartnerSessionFromRequest } from '@/lib/auth/partnerSession';
import { recordAuditLog } from '@/lib/audit/recordAuditLog';
import { readBody } from '@/lib/ads/routeHelpers';
import { ownerDesignErrorResponse } from '@/lib/kiosk/ownerDesignHttp';
import { checkKioskExperience, mergeKioskExperience } from '@/lib/kiosk/experienceConfig';
import { kioskOwnerDesignService } from '@/services/kioskOwnerDesignService';

/** The owner's own screen design proposal (§ OWNER SCREEN DESIGN): what their machines inherit, what's live, and their proposal. */
export async function GET(request: Request): Promise<Response> {
  const session = await verifyPartnerSessionFromRequest(request);
  if (!session) return Response.json({ error: 'unauthorized' }, { status: 401 });
  try {
    const state = await kioskOwnerDesignService.ownerState(session.businessId, session.partnerId);
    return Response.json({
      base: state.base,
      live: state.live,
      editing: state.editing,
      check: checkKioskExperience(mergeKioskExperience(state.base, state.editing)),
      proposal: state.proposal
        ? { status: state.proposal.status, reviewNote: state.proposal.reviewNote, submittedAt: state.proposal.submittedAt?.toDate().toISOString() ?? null, reviewedAt: state.proposal.reviewedAt?.toDate().toISOString() ?? null, publishedVersionNumber: state.proposal.publishedVersionNumber }
        : null,
      machines: state.machines,
    });
  } catch (error) {
    return ownerDesignErrorResponse(error);
  }
}

/** Save the proposal: `{ patch, submit }`. Submitting sends it to Snack Quest for review; nothing reaches machines until staff publish it. */
export async function PUT(request: Request): Promise<Response> {
  const session = await verifyPartnerSessionFromRequest(request);
  if (!session) return Response.json({ error: 'unauthorized' }, { status: 401 });
  const body = await readBody(request);
  if (!body) return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  try {
    const submit = body.submit === true;
    const { check } = await kioskOwnerDesignService.saveProposal(session.businessId, session.partnerId, session.uid, body.patch ?? {}, submit);
    await recordAuditLog(request, { businessId: session.businessId, actorId: session.uid, action: submit ? 'kiosk.owner_proposal.submit' : 'kiosk.owner_proposal.save', entityType: 'kioskOwnerProposal', entityId: session.partnerId, after: { submitted: submit }, source: 'owner_portal' });
    return Response.json({ ok: true, check });
  } catch (error) {
    return ownerDesignErrorResponse(error);
  }
}
