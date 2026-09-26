import type { Metadata } from 'next';
import { requireStaffSession } from '@/lib/auth/session';
import { recommendationEngineService } from '@/services/recommendationEngineService';
import { serializeIntelligenceRecommendation } from '@/lib/vending/serialize';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { RecommendationActions } from '@/components/admin/RecommendationActions';
import type { RecommendationStatus } from '@/types';

export const metadata: Metadata = { title: 'Recommendations' };

const STATUS_VARIANT: Record<RecommendationStatus, 'warning' | 'success' | 'outline'> = {
  pending: 'warning',
  approved: 'success',
  dismissed: 'outline',
};

/**
 * Every recommendation this codebase has produced (§ RECOMMENDATION
 * ENGINE) — restock, dead-stock removal, product opportunities.
 * Every card states WHY (`reason` + `supportingMetrics`), per §24.
 * Only a `pending` recommendation can be approved/dismissed here.
 */
export default async function AdminRecommendationsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const session = await requireStaffSession();
  const { status } = await searchParams;
  const filterStatus = (status as RecommendationStatus | undefined) ?? 'pending';

  const rows = await recommendationEngineService.listByBusiness(session.businessId, { status: filterStatus, limit: 100 });
  const recommendations = rows.map(({ id, data }) => serializeIntelligenceRecommendation(id, data));

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Recommendations</h1>
          <p className="text-sm text-muted-foreground">Restock, assortment, and product-opportunity recommendations — every one explainable, none auto-executed.</p>
        </div>
        <div className="flex gap-2">
          {(['pending', 'approved', 'dismissed'] as const).map((s) => (
            <a
              key={s}
              href={`/admin/vending/intelligence/recommendations?status=${s}`}
              className={`rounded-md border px-3 py-1.5 text-sm ${filterStatus === s ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground'}`}
            >
              {s}
            </a>
          ))}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{recommendations.length} {filterStatus} recommendation(s)</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {recommendations.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing here yet.</p>
          ) : (
            recommendations.map((r) => (
              <div key={r.id} className="rounded-md border border-border p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Badge variant={STATUS_VARIANT[r.status]}>{r.status}</Badge>
                    <Badge variant="secondary">{r.type.replace(/_/g, ' ')}</Badge>
                    <Badge variant="outline">confidence: {r.confidence}</Badge>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {new Date(r.createdAt).toLocaleString('en-KE', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })}
                  </span>
                </div>
                <p className="mt-2 text-sm text-foreground">{r.reason}</p>
                <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                  {Object.entries(r.supportingMetrics).map(([key, value]) => (
                    <span key={key} className="rounded bg-muted px-2 py-0.5">{key}: {String(value)}</span>
                  ))}
                </div>
                {r.status === 'approved' && r.actionTaken ? (
                  <p className="mt-2 text-xs text-muted-foreground">Action: {r.actionTaken} {r.outcome ? `· Outcome: ${r.outcome}` : ''}</p>
                ) : null}
                {r.status === 'pending' ? (
                  <div className="mt-3">
                    <RecommendationActions recommendationId={r.id} />
                  </div>
                ) : null}
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
