import {
  hasStaffRole,
  ADMIN_ONLY,
  forbiddenResponse,
} from '@/lib/auth/requireStaffRole';
import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { recordAuditLog } from '@/lib/audit/recordAuditLog';
import { walletService, WalletValidationError } from '@/services/walletService';
import { InsufficientWalletBalanceError } from '@/repositories/customerWalletRepository';

interface AdjustWalletBody {
  amountKes?: unknown;
  note?: unknown;
}

/** A customer's wallet balance + recent ledger entries (§ Admin: Customers, § Phase 4: Customer loyalty / Quest system). */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ phoneNumber: string }> },
): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!hasStaffRole(session, ADMIN_ONLY)) {
    return forbiddenResponse();
  }

  const { phoneNumber: encodedPhoneNumber } = await params;
  const phoneNumber = decodeURIComponent(encodedPhoneNumber);

  const [balance, ledger] = await Promise.all([
    walletService.getBalance(session.businessId, phoneNumber),
    walletService.getLedger(session.businessId, phoneNumber),
  ]);

  return Response.json({ balance, ledger });
}

/** A manual staff adjustment — a goodwill credit, or correcting a mistake. Positive `amountKes` credits, negative debits. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ phoneNumber: string }> },
): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!hasStaffRole(session, ADMIN_ONLY)) {
    return forbiddenResponse();
  }

  const { phoneNumber: encodedPhoneNumber } = await params;
  const phoneNumber = decodeURIComponent(encodedPhoneNumber);

  let body: AdjustWalletBody;
  try {
    body = (await request.json()) as AdjustWalletBody;
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  if (typeof body.amountKes !== 'number' || typeof body.note !== 'string') {
    return Response.json(
      { error: '"amountKes" (number) and "note" (string) are required.' },
      { status: 400 },
    );
  }

  try {
    const balance = await walletService.adjust(
      session.businessId,
      phoneNumber,
      body.amountKes,
      body.note,
      session.uid,
    );

    await recordAuditLog(request, {
      businessId: session.businessId,
      actorId: session.uid,
      action: 'customerWallet.adjust',
      entityType: 'customerWallet',
      entityId: phoneNumber,
      after: {
        amountKes: body.amountKes,
        note: body.note,
        balanceAfterKes: balance.balanceKes,
      },
    });

    return Response.json({ balance });
  } catch (error) {
    if (
      error instanceof WalletValidationError ||
      error instanceof InsufficientWalletBalanceError
    ) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Could not adjust this wallet.',
      },
      { status: 400 },
    );
  }
}
