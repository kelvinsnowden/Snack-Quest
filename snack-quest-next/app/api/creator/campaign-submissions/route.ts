import { verifyCreatorSessionFromRequest } from '@/lib/auth/creatorSession';
import {
  campaignService,
  CampaignNotFoundError,
  CampaignNotJoinableError,
  InvalidSubmissionError,
} from '@/services/campaignService';

interface SubmitDeliverableBody {
  campaignId?: unknown;
  submissionType?: unknown;
  fileUrl?: unknown;
  socialLink?: unknown;
  notes?: unknown;
}

/** A creator submitting proof of a campaign deliverable (§ Creator Portal campaigns browse) — always scoped to the signed-in creator's own uid. */
export async function POST(request: Request): Promise<Response> {
  const session = await verifyCreatorSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }

  let body: SubmitDeliverableBody;
  try {
    body = (await request.json()) as SubmitDeliverableBody;
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  if (typeof body.campaignId !== 'string' || !body.campaignId.trim()) {
    return Response.json({ error: '"campaignId" is required.' }, { status: 400 });
  }
  if (typeof body.submissionType !== 'string' || !body.submissionType.trim()) {
    return Response.json({ error: '"submissionType" is required.' }, { status: 400 });
  }
  if (body.fileUrl !== undefined && body.fileUrl !== null && typeof body.fileUrl !== 'string') {
    return Response.json({ error: '"fileUrl" must be a string or null.' }, { status: 400 });
  }
  if (body.socialLink !== undefined && body.socialLink !== null && typeof body.socialLink !== 'string') {
    return Response.json({ error: '"socialLink" must be a string or null.' }, { status: 400 });
  }
  if (body.notes !== undefined && typeof body.notes !== 'string') {
    return Response.json({ error: '"notes" must be a string.' }, { status: 400 });
  }

  try {
    const submissionId = await campaignService.submitDeliverable(session.businessId, {
      campaignId: body.campaignId,
      creatorId: session.uid,
      submissionType: body.submissionType,
      fileUrl: body.fileUrl as string | null | undefined,
      socialLink: body.socialLink as string | null | undefined,
      notes: body.notes as string | undefined,
    });
    return Response.json({ submissionId }, { status: 201 });
  } catch (error) {
    if (error instanceof CampaignNotFoundError) {
      return Response.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof CampaignNotJoinableError || error instanceof InvalidSubmissionError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    return Response.json(
      { error: error instanceof Error ? error.message : 'Could not submit deliverable' },
      { status: 400 },
    );
  }
}
