import React, { useState, useEffect } from 'react';
import {
  LayoutDashboard,
  TrendingUp,
  Package,
  Truck,
  Boxes,
  DollarSign,
  AlertTriangle,
  CheckCircle2,
  Users,
  Clock,
  ArrowUpRight,
  Sparkles,
  Layers,
  ShieldCheck,
  RefreshCw,
  ShoppingBag,
  Award,
  PieChart
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { ChartWrapper } from '../common/ChartWrapper';

type DashboardType = 'executive' | 'operations' | 'inventory' | 'accounting' | 'order';

export const DashboardShell: React.FC = () => {
  const { setActiveTab } = useApp();
  const [activeDash, setActiveDash] = useState<DashboardType>('executive');
  const [dashData, setDashData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const fetchDash = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/dashboards/${activeDash}`);
      const json = await res.json();
      setDashData(json);
    } catch (e) {
      console.error('Failed to load dashboard data', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDash();
  }, [activeDash]);

  const formatKes = (amountCents: number) => `KSh ${(amountCents / 100).toLocaleString()}`;

  // Demo charts data
  const revenueTrendData = [
    { date: 'Mon', revenue: 250000, profit: 98000 },
    { date: 'Tue', revenue: 550000, profit: 210000 },
    { date: 'Wed', revenue: 750000, profit: 290000 },
    { date: 'Thu', revenue: 250000, profit: 86000 },
    { date: 'Fri', revenue: 1200000, profit: 450000 },
    { date: 'Sat', revenue: 1800000, profit: 680000 },
    { date: 'Sun', revenue: 2100000, profit: 820000 }
  ];

  const categoryDistributionData = [
    { name: 'Biscuits & Chocolates', value: 45 },
    { name: 'Chips & Savory', value: 30 },
    { name: 'Gummies & Sweets', value: 15 },
    { name: 'Drinks & Exotic', value: 10 }
  ];

  return (
    <div className="space-y-6">
      {/* Top Banner Header */}
      <div className="p-6 bg-zinc-900 border border-zinc-800 rounded-xl text-white flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-xl relative overflow-hidden">
        <div className="space-y-1 relative z-10">
          <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 text-xs font-bold uppercase tracking-wider">
            <Sparkles className="h-3.5 w-3.5 text-blue-400" />
            <span>Commerce & Operations Dashboard Suite</span>
          </div>
          <h2 className="text-2xl font-extrabold tracking-tight text-white mt-1">
            Snack Quest OS Control Room
          </h2>
          <p className="text-xs text-zinc-400 max-w-xl">
            Five operational dashboards: Executive, Operations, Inventory, Accounting & Orders.
          </p>
        </div>

        <div className="flex items-center gap-2 relative z-10">
          <button
            onClick={fetchDash}
            className="px-3 py-2 text-xs font-medium rounded-lg border border-zinc-700 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Refresh Live Metrics
          </button>
        </div>

        <div className="absolute -right-10 -bottom-10 h-48 w-48 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />
      </div>

      {/* Dashboard Type Switcher Navigation */}
      <div className="flex flex-wrap items-center gap-2 border-b border-zinc-800 pb-3">
        <button
          onClick={() => setActiveDash('executive')}
          className={`px-4 py-2 rounded-lg text-xs font-medium transition-all flex items-center gap-2 cursor-pointer ${
            activeDash === 'executive' ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20' : 'bg-zinc-900 text-zinc-400 hover:text-white border border-zinc-800'
          }`}
        >
          <TrendingUp className="w-3.5 h-3.5" /> Executive Dashboard
        </button>

        <button
          onClick={() => setActiveDash('operations')}
          className={`px-4 py-2 rounded-lg text-xs font-medium transition-all flex items-center gap-2 cursor-pointer ${
            activeDash === 'operations' ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20' : 'bg-zinc-900 text-zinc-400 hover:text-white border border-zinc-800'
          }`}
        >
          <Truck className="w-3.5 h-3.5" /> Operations Dashboard
        </button>

        <button
          onClick={() => setActiveDash('inventory')}
          className={`px-4 py-2 rounded-lg text-xs font-medium transition-all flex items-center gap-2 cursor-pointer ${
            activeDash === 'inventory' ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20' : 'bg-zinc-900 text-zinc-400 hover:text-white border border-zinc-800'
          }`}
        >
          <Boxes className="w-3.5 h-3.5" /> Inventory Dashboard
        </button>

        <button
          onClick={() => setActiveDash('accounting')}
          className={`px-4 py-2 rounded-lg text-xs font-medium transition-all flex items-center gap-2 cursor-pointer ${
            activeDash === 'accounting' ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20' : 'bg-zinc-900 text-zinc-400 hover:text-white border border-zinc-800'
          }`}
        >
          <DollarSign className="w-3.5 h-3.5" /> Accounting Dashboard
        </button>

        <button
          onClick={() => setActiveDash('order')}
          className={`px-4 py-2 rounded-lg text-xs font-medium transition-all flex items-center gap-2 cursor-pointer ${
            activeDash === 'order' ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20' : 'bg-zinc-900 text-zinc-400 hover:text-white border border-zinc-800'
          }`}
        >
          <Package className="w-3.5 h-3.5" /> Order Dashboard
        </button>
      </div>

      {/* DASHBOARD VIEW 1: EXECUTIVE */}
      {activeDash === 'executive' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-5 bg-zinc-900 border border-zinc-800 rounded-xl space-y-2">
              <span className="text-xs text-zinc-400 font-medium">Total Lifetime Revenue</span>
              <p className="text-2xl font-bold font-mono text-emerald-400">{formatKes(dashData?.metrics?.totalRevenue || 0)}</p>
              <span className="text-[10px] text-zinc-500 block">Across confirmed orders</span>
            </div>

            <div className="p-5 bg-zinc-900 border border-zinc-800 rounded-xl space-y-2">
              <span className="text-xs text-zinc-400 font-medium">Net Operating Profit</span>
              <p className="text-2xl font-bold font-mono text-blue-400">{formatKes(dashData?.metrics?.totalNetProfit || 0)}</p>
              <span className="text-[10px] text-zinc-500 block">Net after snacks, delivery & expenses</span>
            </div>

            <div className="p-5 bg-zinc-900 border border-zinc-800 rounded-xl space-y-2">
              <span className="text-xs text-zinc-400 font-medium">Repeat Customer Rate</span>
              <p className="text-2xl font-bold font-mono text-amber-400">{dashData?.metrics?.repeatRate || 0}%</p>
              <span className="text-[10px] text-zinc-500 block">Customers with &gt;1 completed order</span>
            </div>

            <div className="p-5 bg-zinc-900 border border-zinc-800 rounded-xl space-y-2">
              <span className="text-xs text-zinc-400 font-medium">Customer Lifetime Value (CLV)</span>
              <p className="text-2xl font-bold font-mono text-purple-400">{formatKes(dashData?.metrics?.clv || 0)}</p>
              <span className="text-[10px] text-zinc-500 block">Average revenue per customer</span>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <ChartWrapper
              type="line"
              title="7-Day Revenue & Net Profit Trend"
              data={revenueTrendData}
              dataKey="revenue"
              categoryKey="date"
              colors={['#10b981', '#3b82f6']}
            />

            <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-5 space-y-4">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Award className="w-4 h-4 text-amber-400" /> Executive Quick Actions
              </h3>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <button
                  onClick={() => setActiveTab('crm')}
                  className="p-3 rounded-lg bg-zinc-950 hover:bg-zinc-800 border border-zinc-800 text-left cursor-pointer transition-colors"
                >
                  <span className="font-bold text-white block">Inspect VIP Customers</span>
                  <span className="text-zinc-500 text-[10px]">Filter LTV &gt; 20,000 KES</span>
                </button>

                <button
                  onClick={() => setActiveTab('accounting')}
                  className="p-3 rounded-lg bg-zinc-950 hover:bg-zinc-800 border border-zinc-800 text-left cursor-pointer transition-colors"
                >
                  <span className="font-bold text-white block">Audit P&L Ledger</span>
                  <span className="text-zinc-500 text-[10px]">View expenses & Daraja fees</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* DASHBOARD VIEW 2: OPERATIONS */}
      {activeDash === 'operations' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-5 bg-zinc-900 border border-amber-900/50 rounded-xl space-y-2">
              <span className="text-xs text-amber-400 font-medium">Orders Needing Attention</span>
              <p className="text-2xl font-bold font-mono text-amber-400">{dashData?.metrics?.stockShortagesCount || 0}</p>
              <span className="text-[10px] text-amber-200/60 block">Stock shortages or stale payments</span>
            </div>

            <div className="p-5 bg-zinc-900 border border-zinc-800 rounded-xl space-y-2">
              <span className="text-xs text-zinc-400 font-medium">Packing Queue Depth</span>
              <p className="text-2xl font-bold font-mono text-blue-400">{dashData?.metrics?.packingQueueDepth || 0}</p>
              <span className="text-[10px] text-zinc-500 block">Boxes awaiting warehouse packing</span>
            </div>

            <div className="p-5 bg-zinc-900 border border-zinc-800 rounded-xl space-y-2">
              <span className="text-xs text-zinc-400 font-medium">Shipping Queue Depth</span>
              <p className="text-2xl font-bold font-mono text-indigo-400">{dashData?.metrics?.shippingQueueDepth || 0}</p>
              <span className="text-[10px] text-zinc-500 block">Packed boxes ready for courier</span>
            </div>

            <div className="p-5 bg-zinc-900 border border-zinc-800 rounded-xl space-y-2">
              <span className="text-xs text-zinc-400 font-medium">Delivered Today</span>
              <p className="text-2xl font-bold font-mono text-emerald-400">{dashData?.metrics?.deliveredToday || 0}</p>
              <span className="text-[10px] text-zinc-500 block">Completed deliveries</span>
            </div>
          </div>

          <div className="p-5 bg-zinc-900 border border-zinc-800 rounded-xl space-y-3">
            <span className="text-xs font-semibold text-white block">Operations Queue Jump Links</span>
            <div className="flex gap-3">
              <button
                onClick={() => setActiveTab('deliveries')}
                className="px-4 py-2 rounded bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium cursor-pointer"
              >
                Go to Fulfillment Dispatch
              </button>
              <button
                onClick={() => setActiveTab('orders')}
                className="px-4 py-2 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium cursor-pointer"
              >
                Open Attention Queue
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DASHBOARD VIEW 3: INVENTORY */}
      {activeDash === 'inventory' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-5 bg-zinc-900 border border-zinc-800 rounded-xl space-y-2">
              <span className="text-xs text-zinc-400 font-medium">Low Stock Snacks</span>
              <p className="text-2xl font-bold font-mono text-amber-400">{dashData?.metrics?.lowStockCount || 0}</p>
              <span className="text-[10px] text-zinc-500 block">Below minimum stock threshold</span>
            </div>

            <div className="p-5 bg-zinc-900 border border-zinc-800 rounded-xl space-y-2">
              <span className="text-xs text-zinc-400 font-medium">Out of Stock Snacks</span>
              <p className="text-2xl font-bold font-mono text-red-400">{dashData?.metrics?.outOfStockCount || 0}</p>
              <span className="text-[10px] text-zinc-500 block">Zero remaining stock</span>
            </div>

            <div className="p-5 bg-zinc-900 border border-zinc-800 rounded-xl space-y-2">
              <span className="text-xs text-zinc-400 font-medium">Total Inventory Valuation</span>
              <p className="text-2xl font-bold font-mono text-emerald-400">{formatKes(dashData?.metrics?.totalValuation || 0)}</p>
              <span className="text-[10px] text-zinc-500 block">Snacks & packaging cost sum</span>
            </div>

            <div className="p-5 bg-zinc-900 border border-zinc-800 rounded-xl space-y-2">
              <span className="text-xs text-zinc-400 font-medium">Batches Expiring &lt;14 Days</span>
              <p className="text-2xl font-bold font-mono text-pink-400">{dashData?.metrics?.expiringBatchesCount || 0}</p>
              <span className="text-[10px] text-zinc-500 block">FEFO priority items</span>
            </div>
          </div>

          <div className="p-5 bg-zinc-900 border border-zinc-800 rounded-xl space-y-3">
            <span className="text-xs font-semibold text-white block">Inventory Management Quick Action</span>
            <button
              onClick={() => setActiveTab('inventory')}
              className="px-4 py-2 rounded bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium cursor-pointer"
            >
              Open Inventory & Purchase Orders Manager
            </button>
          </div>
        </div>
      )}

      {/* DASHBOARD VIEW 4: ACCOUNTING */}
      {activeDash === 'accounting' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-5 bg-zinc-900 border border-zinc-800 rounded-xl space-y-2">
              <span className="text-xs text-zinc-400 font-medium">Total Revenue</span>
              <p className="text-2xl font-bold font-mono text-emerald-400">{formatKes(dashData?.metrics?.totalRevenue || 0)}</p>
            </div>

            <div className="p-5 bg-zinc-900 border border-zinc-800 rounded-xl space-y-2">
              <span className="text-xs text-zinc-400 font-medium">Gross Profit</span>
              <p className="text-2xl font-bold font-mono text-blue-400">{formatKes(dashData?.metrics?.totalGrossProfit || 0)}</p>
            </div>

            <div className="p-5 bg-zinc-900 border border-zinc-800 rounded-xl space-y-2">
              <span className="text-xs text-zinc-400 font-medium">Operating Expenses</span>
              <p className="text-2xl font-bold font-mono text-amber-400">{formatKes(dashData?.metrics?.operatingExpenses || 0)}</p>
            </div>

            <div className="p-5 bg-zinc-900 border border-zinc-800 rounded-xl space-y-2">
              <span className="text-xs text-zinc-400 font-medium">Net Profit</span>
              <p className="text-2xl font-bold font-mono text-emerald-400">{formatKes(dashData?.metrics?.totalNetProfit || 0)}</p>
            </div>
          </div>
        </div>
      )}

      {/* DASHBOARD VIEW 5: ORDER */}
      {activeDash === 'order' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3 font-mono">
            <div className="p-4 bg-zinc-900 border border-zinc-800 rounded-xl text-center">
              <span className="text-[10px] text-zinc-500 uppercase block">Pending</span>
              <span className="text-xl font-bold text-white mt-1 block">{dashData?.metrics?.pendingCount || 0}</span>
            </div>
            <div className="p-4 bg-zinc-900 border border-zinc-800 rounded-xl text-center">
              <span className="text-[10px] text-zinc-500 uppercase block">Confirmed</span>
              <span className="text-xl font-bold text-blue-400 mt-1 block">{dashData?.metrics?.confirmedCount || 0}</span>
            </div>
            <div className="p-4 bg-zinc-900 border border-zinc-800 rounded-xl text-center">
              <span className="text-[10px] text-zinc-500 uppercase block">Packed</span>
              <span className="text-xl font-bold text-purple-400 mt-1 block">{dashData?.metrics?.packedCount || 0}</span>
            </div>
            <div className="p-4 bg-zinc-900 border border-zinc-800 rounded-xl text-center">
              <span className="text-[10px] text-zinc-500 uppercase block">Dispatched</span>
              <span className="text-xl font-bold text-indigo-400 mt-1 block">{dashData?.metrics?.dispatchedCount || 0}</span>
            </div>
            <div className="p-4 bg-zinc-900 border border-zinc-800 rounded-xl text-center">
              <span className="text-[10px] text-zinc-500 uppercase block">Delivered</span>
              <span className="text-xl font-bold text-emerald-400 mt-1 block">{dashData?.metrics?.deliveredCount || 0}</span>
            </div>
            <div className="p-4 bg-zinc-900 border border-zinc-800 rounded-xl text-center">
              <span className="text-[10px] text-zinc-500 uppercase block">Cancelled</span>
              <span className="text-xl font-bold text-red-400 mt-1 block">{dashData?.metrics?.cancelledCount || 0}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
