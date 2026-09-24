import type { Metadata } from 'next';
import { requireStaffSession } from '@/lib/auth/session';
import { productIntelligenceService } from '@/services/productIntelligenceService';
import { peerLearningService } from '@/services/peerLearningService';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export const metadata: Metadata = { title: 'Product Intelligence' };

/**
 * Network-wide per-SKU performance and the product opportunity engine
 * (§ PRODUCT INTELLIGENCE, § PRODUCT OPPORTUNITY ENGINE). Every
 * opportunity card states its reason and supporting metrics — never a
 * bare score, and never called machine learning (§23).
 */
export default async function AdminProductIntelligencePage() {
  const session = await requireStaffSession();
  const [products, opportunities] = await Promise.all([
    productIntelligenceService.getNetworkProductPerformance(session.businessId, 30),
    peerLearningService.findProductOpportunities(session.businessId, 30),
  ]);
  const sorted = [...products].sort((a, b) => b.revenueKes - a.revenueKes);

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Product Intelligence</h1>
        <p className="text-sm text-muted-foreground">Every SKU that has moved through the fleet in the last 30 days.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Product opportunities ({opportunities.length})</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {opportunities.length === 0 ? (
            <p className="text-sm text-muted-foreground">No opportunities detected in this window.</p>
          ) : (
            opportunities.map((o, i) => (
              <div key={`${o.type}-${o.productId ?? o.category}-${i}`} className="rounded-md border border-border p-3">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">{o.type.replace(/_/g, ' ')}</Badge>
                  {o.productId ? <span className="text-xs text-muted-foreground">{o.productId}</span> : null}
                  {o.category ? <span className="text-xs text-muted-foreground">{o.category}</span> : null}
                </div>
                <p className="mt-1 text-sm text-foreground">{o.reason}</p>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Product performance ({sorted.length} SKUs)</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {sorted.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">No sales data yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="px-6 py-3 font-medium">Product</th>
                    <th className="px-6 py-3 font-medium">Category</th>
                    <th className="px-6 py-3 font-medium">Units</th>
                    <th className="px-6 py-3 font-medium">Revenue</th>
                    <th className="px-6 py-3 font-medium">Margin</th>
                    <th className="px-6 py-3 font-medium">Velocity/day</th>
                    <th className="px-6 py-3 font-medium">Locations (stocked / selling)</th>
                    <th className="px-6 py-3 font-medium">Stockout freq.</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((p) => (
                    <tr key={p.productId} className="border-b border-border last:border-0">
                      <td className="px-6 py-3 font-medium text-foreground">{p.productId}</td>
                      <td className="px-6 py-3 text-muted-foreground">{p.category ?? '—'}</td>
                      <td className="px-6 py-3 text-muted-foreground">{p.unitsSold}</td>
                      <td className="px-6 py-3 text-muted-foreground">KES {p.revenueKes.toLocaleString('en-KE')}</td>
                      <td className="px-6 py-3 text-muted-foreground">{p.marginPct !== null ? `${p.marginPct}%` : '—'}</td>
                      <td className="px-6 py-3 text-muted-foreground">{p.velocityPerDay}</td>
                      <td className="px-6 py-3 text-muted-foreground">{p.locationsStocked} / {p.locationsSelling}</td>
                      <td className="px-6 py-3 text-muted-foreground">{p.stockoutFrequencyPct}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
