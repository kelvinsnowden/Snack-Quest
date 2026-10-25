'use client';

import dynamic from 'next/dynamic';

/**
 * The charts, loaded after the page instead of with it. They draw nothing on
 * the server (a responsive chart needs the browser's width), so rendering
 * them there gained nothing, while bundling recharts (~90 KB compressed) into
 * the page held up every number on it. Each placeholder takes the chart's
 * height, so nothing moves when it arrives.
 */
function placeholder(height: number) {
  function ChartPlaceholder() {
    return <div className="w-full animate-pulse rounded-lg bg-border/30" style={{ height }} aria-hidden="true" />;
  }
  return ChartPlaceholder;
}

export const RevenueChart = dynamic(() => import('@/components/admin/RevenueChart').then((m) => m.RevenueChart), { ssr: false, loading: placeholder(260) });
export const TrafficChart = dynamic(() => import('@/components/admin/TrafficChart').then((m) => m.TrafficChart), { ssr: false, loading: placeholder(260) });
export const StatusDonutChart = dynamic(() => import('@/components/admin/StatusDonutChart').then((m) => m.StatusDonutChart), { ssr: false, loading: placeholder(112) });
export const SalesTrendChart = dynamic(() => import('@/components/partner/SalesTrendChart').then((m) => m.SalesTrendChart), { ssr: false, loading: placeholder(220) });
export const DailySalesBarChart = dynamic(() => import('@/components/partner/DailySalesBarChart').then((m) => m.DailySalesBarChart), { ssr: false, loading: placeholder(260) });
