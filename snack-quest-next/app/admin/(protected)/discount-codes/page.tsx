import type { Metadata } from 'next';
import { requireStaffSession } from '@/lib/auth/session';
import { discountCodeRepository } from '@/repositories/discountCodeRepository';
import {
  DiscountCodesManager,
  type DiscountCodeRow,
} from '@/components/admin/DiscountCodesManager';

export const metadata: Metadata = { title: 'Discount codes' };

/**
 * Discount codes (§ discount codes).
 *
 * Read on the server and handed down as plain values: a Firestore
 * Timestamp cannot cross into a Client Component, and converting here
 * keeps that conversion in one place rather than at every use.
 */
export default async function AdminDiscountCodesPage() {
  const session = await requireStaffSession();
  const codes = await discountCodeRepository.listByBusiness(session.businessId);

  const rows: DiscountCodeRow[] = codes.map((code) => ({
    code: code.code,
    kind: code.kind,
    value: code.value,
    waivesDelivery: code.waivesDelivery === true,
    maxRedemptions: code.maxRedemptions,
    redemptionCount: code.redemptionCount ?? 0,
    startsAt: code.startsAt?.toMillis?.() ?? null,
    expiresAt: code.expiresAt?.toMillis?.() ?? null,
    isActive: code.isActive,
    note: code.note,
  }));

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <div>
        <h1 className="text-2xl md:text-3xl text-foreground font-bold tracking-tight">
          Discount codes
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Codes customers type at checkout. A 100% code with free delivery is a PR box: nothing is
          charged and no M-Pesa prompt is sent.
        </p>
      </div>

      <DiscountCodesManager initialCodes={rows} />
    </div>
  );
}
