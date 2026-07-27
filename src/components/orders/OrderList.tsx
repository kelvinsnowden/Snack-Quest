import React, { useState, useEffect } from 'react';
import { Order } from '../../types/database';
import { Search, Filter, Package, AlertCircle, CheckCircle2, Clock, Truck, XCircle, RefreshCw, Plus, Eye, DollarSign } from 'lucide-react';
import { OrderDetailModal } from './OrderDetailModal';
import { OrdersAttentionQueue } from './OrdersAttentionQueue';

export const OrderList: React.FC = () => {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'all' | 'attention'>('all');

  const fetchOrders = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.append('search', search);
      if (statusFilter) params.append('order_status', statusFilter);

      const res = await fetch(`/api/v1/orders?${params.toString()}`);
      const json = await res.json();
      setOrders(json.data || []);
    } catch (e) {
      console.error('Failed to fetch orders', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, [search, statusFilter]);

  const getOrderStatusBadge = (status: string, stockShortage: boolean) => {
    if (stockShortage) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/30">
          <AlertCircle className="w-3 h-3" /> Stock Shortage
        </span>
      );
    }
    switch (status) {
      case 'confirmed':
        return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20"><CheckCircle2 className="w-3 h-3" /> Confirmed</span>;
      case 'packed':
        return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-purple-500/10 text-purple-400 border border-purple-500/20"><Package className="w-3 h-3" /> Packed</span>;
      case 'dispatched':
        return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20"><Truck className="w-3 h-3" /> Dispatched</span>;
      case 'delivered':
        return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"><CheckCircle2 className="w-3 h-3" /> Delivered</span>;
      case 'cancelled':
        return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-500/10 text-red-400 border border-red-500/20"><XCircle className="w-3 h-3" /> Cancelled</span>;
      case 'refunded':
        return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-pink-500/10 text-pink-400 border border-pink-500/20"><DollarSign className="w-3 h-3" /> Refunded</span>;
      default:
        return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-zinc-800 text-zinc-300"><Clock className="w-3 h-3" /> {status}</span>;
    }
  };

  const formatKes = (amountCents: number) => `KSh ${(amountCents / 100).toLocaleString()}`;

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
            Order Lifecycle Engine
          </h2>
          <p className="text-xs text-zinc-400 mt-1">
            Order status progression, automatic stock/packaging deduction, stock shortage alerts, and financial profit margins.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={fetchOrders}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium border border-zinc-700 transition-colors cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-zinc-800 pb-3">
        <button
          onClick={() => setActiveTab('all')}
          className={`px-4 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
            activeTab === 'all'
              ? 'bg-blue-600 text-white'
              : 'bg-zinc-900 text-zinc-400 hover:text-white border border-zinc-800'
          }`}
        >
          All Orders Lifecycle
        </button>
        <button
          onClick={() => setActiveTab('attention')}
          className={`px-4 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer flex items-center gap-1.5 ${
            activeTab === 'attention'
              ? 'bg-amber-600 text-white'
              : 'bg-zinc-900 text-amber-400 hover:bg-zinc-800 border border-zinc-800'
          }`}
        >
          <AlertCircle className="w-3.5 h-3.5" /> Orders Needing Attention Queue
        </button>
      </div>

      {activeTab === 'attention' ? (
        <OrdersAttentionQueue onSelectOrder={(id) => setSelectedOrderId(id)} />
      ) : (
        <>
          {/* Toolbar */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-3 text-zinc-500" />
              <input
                type="text"
                placeholder="Search by Order ID, Customer Name, Phone, or Courier Tracking #..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-800 rounded-lg pl-9 pr-3 py-2 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-300 focus:outline-none focus:border-blue-500"
              >
                <option value="">All Order Statuses</option>
                <option value="pending">Pending Payment Verification</option>
                <option value="confirmed">Confirmed (Stock Deducted)</option>
                <option value="packed">Packed</option>
                <option value="dispatched">Dispatched (In Transit)</option>
                <option value="delivered">Delivered</option>
                <option value="cancelled">Cancelled</option>
                <option value="refunded">Refunded</option>
              </select>
            </div>
          </div>

          {/* Table */}
          <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-zinc-300">
                <thead className="bg-zinc-950/80 border-b border-zinc-800 uppercase font-mono text-[11px] text-zinc-400">
                  <tr>
                    <th className="px-4 py-3">Order ID</th>
                    <th className="px-4 py-3">Customer</th>
                    <th className="px-4 py-3">Package</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Payment</th>
                    <th className="px-4 py-3">Paid Amount</th>
                    <th className="px-4 py-3">Net Profit</th>
                    <th className="px-4 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60">
                  {loading ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-8 text-center text-zinc-500">
                        Loading order lifecycle data...
                      </td>
                    </tr>
                  ) : orders.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-8 text-center text-zinc-500">
                        No orders found matching search filters.
                      </td>
                    </tr>
                  ) : (
                    orders.map((o) => (
                      <tr key={o.id} className="hover:bg-zinc-800/40 transition-colors">
                        <td className="px-4 py-3 font-mono font-bold text-white">{o.id}</td>
                        <td className="px-4 py-3">
                          <div>
                            <span className="font-medium text-white block">{o.customer_name}</span>
                            <span className="text-[11px] font-mono text-zinc-500 block">{o.customer_phone}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-zinc-300 font-medium">{o.package_name}</td>
                        <td className="px-4 py-3">{getOrderStatusBadge(o.order_status, o.stock_shortage)}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-mono uppercase font-semibold ${
                            o.payment_status === 'paid' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-amber-500/10 text-amber-400'
                          }`}>
                            {o.payment_status}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-mono font-bold text-emerald-400">{formatKes(o.final_amount_paid)}</td>
                        <td className="px-4 py-3 font-mono text-blue-400">{formatKes(o.net_profit)}</td>
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => setSelectedOrderId(o.id)}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-blue-600/10 hover:bg-blue-600/20 text-blue-400 text-xs font-medium border border-blue-500/20 transition-colors cursor-pointer"
                          >
                            <Eye className="w-3.5 h-3.5" /> Details
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {selectedOrderId && (
        <OrderDetailModal
          orderId={selectedOrderId}
          onClose={() => setSelectedOrderId(null)}
          onUpdate={fetchOrders}
        />
      )}
    </div>
  );
};
