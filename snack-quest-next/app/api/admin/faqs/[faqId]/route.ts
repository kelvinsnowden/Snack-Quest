import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { faqRepository, type FaqInput } from '@/repositories/faqRepository';
import { recordAuditLog } from '@/lib/audit/recordAuditLog';

interface UpdateFaqBody {
  question?: unknown;
  answer?: unknown;
  isActive?: unknown;
}

function buildPatch(body: UpdateFaqBody): { patch: Partial<FaqInput> } | { error: string } {
  const patch: Partial<FaqInput> = {};

  if (body.question !== undefined) {
    if (typeof body.question !== 'string' || body.question.trim().length === 0) {
      return { error: '"question" must be a non-empty string when provided.' };
    }
    patch.question = body.question.trim();
  }
  if (body.answer !== undefined) {
    if (typeof body.answer !== 'string' || body.answer.trim().length === 0) {
      return { error: '"answer" must be a non-empty string when provided.' };
    }
    patch.answer = body.answer.trim();
  }
  if (body.isActive !== undefined) {
    if (typeof body.isActive !== 'boolean') {
      return { error: '"isActive" must be a boolean when provided.' };
    }
    patch.isActive = body.isActive;
  }

  return { patch };
}

/** Edits a FAQ entry, or a one-field `{ isActive: false }` patch to hide it without deleting it (§ Admin: FAQ). */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ faqId: string }> },
): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { faqId } = await params;

  const existing = await faqRepository.findById(session.businessId, faqId);
  if (!existing) {
    return Response.json({ error: `FAQ ${faqId} not found` }, { status: 404 });
  }

  let body: UpdateFaqBody;
  try {
    body = (await request.json()) as UpdateFaqBody;
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const result = buildPatch(body);
  if ('error' in result) {
    return Response.json({ error: result.error }, { status: 400 });
  }

  await faqRepository.update(faqId, result.patch, session.uid);
  const updated = await faqRepository.findById(session.businessId, faqId);

  await recordAuditLog(request, {
    businessId: session.businessId,
    actorId: session.uid,
    action: 'faq.update',
    entityType: 'faq',
    entityId: faqId,
    before: existing as unknown as Record<string, unknown>,
    after: updated as unknown as Record<string, unknown>,
  });

  return Response.json({ faq: updated });
}

/** Soft-deletes a FAQ entry (§ Admin: FAQ) — removed from both the homepage section and /faq immediately. */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ faqId: string }> },
): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { faqId } = await params;

  const existing = await faqRepository.findById(session.businessId, faqId);
  if (!existing) {
    return Response.json({ error: `FAQ ${faqId} not found` }, { status: 404 });
  }

  await faqRepository.softDelete(faqId, session.uid);

  await recordAuditLog(request, {
    businessId: session.businessId,
    actorId: session.uid,
    action: 'faq.delete',
    entityType: 'faq',
    entityId: faqId,
    before: existing as unknown as Record<string, unknown>,
  });

  return Response.json({ ok: true });
}
