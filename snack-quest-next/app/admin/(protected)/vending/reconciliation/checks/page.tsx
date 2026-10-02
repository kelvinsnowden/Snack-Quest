import type { Metadata } from 'next';
import Link from 'next/link';
import { AlertTriangle, ArrowLeft, CheckCircle2, XCircle } from 'lucide-react';
import { requireAdminPage } from '@/lib/auth/requireAdminSection';
import { reconciliationChecksService, type CheckStatus } from '@/services/reconciliationChecksService';
import { Card, CardContent } from '@/components/ui/card';

export const metadata: Metadata = { title: 'Record checks' };
export const dynamic = 'force-dynamic';

const ICON: Record<CheckStatus, typeof CheckCircle2> = { ok: CheckCircle2, warn: AlertTriangle, fail: XCircle };
const TONE: Record<CheckStatus, string> = { ok: 'text-success', warn: 'text-warning', fail: 'text-danger' };

/**
 * § RECONCILIATION CHECKS — do prices, sales, owner stock purchases,
 * settlements, ad revenue and machine screens still agree with each other?
 * Read-only; each check links to where its records are fixed. Shows counts,
 * never amounts, so it needs only `sales.view`.
 */
export default async function ReconciliationChecksPage() {
  const session = await requireAdminPage('vending', 'sales.view');
  const checks = await reconciliationChecksService.run(session.businessId);
  const problems = checks.filter((check) => check.status !== 'ok').length;

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6">
      <div>
        <Link href="/admin/vending/reconciliation" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" aria-hidden="true" />
          Payment reconciliation
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-foreground">Record checks</h1>
        <p className="max-w-prose text-sm text-muted-foreground">{problems === 0 ? 'Every check passed.' : `${problems} of ${checks.length} checks need a look.`} Run each time this page opens; nothing here changes any record.</p>
      </div>
      <div className="flex flex-col gap-3">
        {checks.map((check) => {
          const Icon = ICON[check.status];
          return (
            <Card key={check.key}>
              <CardContent className="flex items-start gap-3 p-4">
                <Icon className={`mt-0.5 size-5 shrink-0 ${TONE[check.status]}`} aria-label={check.status} />
                <div className="flex flex-1 flex-col gap-1">
                  <p className="font-medium text-foreground">{check.label}</p>
                  <p className="text-sm text-muted-foreground">
                    {check.detail}
                    {check.partial ? ' (Read the most recent 5,000 records only.)' : ''}
                  </p>
                </div>
                {check.href && check.status !== 'ok' ? (
                  <Link href={check.href} className="shrink-0 text-sm text-primary hover:underline">
                    Go there
                  </Link>
                ) : null}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
