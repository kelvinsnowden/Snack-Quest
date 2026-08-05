import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { faqRepository } from '@/repositories/faqRepository';
import { recordAuditLog } from '@/lib/audit/recordAuditLog';

interface CreateFaqBody {
  question?: unknown;
  answer?: unknown;
}

/** Creates a FAQ entry (§ Admin: FAQ). New entries are active by default. */
export async function POST(request: Request): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }

  let body: CreateFaqBody;
  try {
    body = (await request.json()) as CreateFaqBody;
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  if (typeof body.question !== 'string' || body.question.trim().length === 0) {
    return Response.json({ error: '"question" is required.' }, { status: 400 });
  }
  if (typeof body.answer !== 'string' || body.answer.trim().length === 0) {
    return Response.json({ error: '"answer" is required.' }, { status: 400 });
  }

  const faqInput = {
    businessId: session.businessId,
    question: body.question.trim(),
    answer: body.answer.trim(),
    isActive: true,
  };
  const faqId = await faqRepository.create(faqInput, session.uid);

  await recordAuditLog(request, {
    businessId: session.businessId,
    actorId: session.uid,
    action: 'faq.create',
    entityType: 'faq',
    entityId: faqId,
    after: faqInput,
  });

  return Response.json({ faqId }, { status: 201 });
}
