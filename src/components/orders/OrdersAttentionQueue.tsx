import React, { useState, useEffect } from 'react';
import { AlertTriangle, Clock, RefreshCw, Eye, CheckCircle, Package } from 'lucide-react';

interface Props {
  onSelectOrder: (orderId: string) => void;
}

export const OrdersAttentionQueue: React.FC<Props> = ({ onSelectOrder }) => {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchQueue = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/v1/orders/attention-queue');
      const json = await res.json();
      setItems(json.data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchQueue();
  }, []);

  const formatKes = (amountCents: number) => `KSh ${(amountCents / 100).toLocaleString()}`;

  return (
    <div className="bg-zinc-900/80 border border-amber-900/50 rounded-xl p-6 space-y-4 shadow-lg">
      <div className="flex items-center justify-between pb-3 border-b border-amber-900/30">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white">Orders Needing Staff Attention Queue</h3>
            <p className="text-xs text-amber-200/70">
              Surfacing orders with active inventory stock shortages or stale payment verification (&gt;10 minutes).
            </p>
          </div>
        </div>

        <button
          onClick={fetchQueue}
          className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium border border-zinc-700 transition-colors flex items-center gap-1.5 cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Refresh Queue
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs text-zinc-300">
          <thead className="bg-zinc-950/80 border-b border-zinc-800 uppercase font-mono text-[10px] text-zinc-400">
            <tr>
              <th className="px-4 py-3">Issue Reason</th>
              <th className="px-4 py-3">Order ID</th>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Package</th>
              <th className="px-4 py-3">Order Date</th>
              <th className="px-4 py-3">Paid Amount</th>
              <th className="px-4 py-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/60">
            {loading ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-zinc-500">
                  Scanning attention queue...
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-emerald-400 font-medium">
                  <div className="flex items-center justify-center gap-2">
                    <CheckCircle className="w-4 h-4 text-emerald-400" /> All orders clear! No stock shortages or stale payments in queue.
                  </div>
                </td>
              </tr>
            ) : (
              items.map((item) => (
                <tr key={item.id} className="hover:bg-amber-950/20 transition-colors">
                  <td className="px-4 py-3">
                    {item.attention_type === 'stock_shortage' ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-red-500/10 text-red-400 font-semibold text-xs border border-red-500/20">
                        <Package className="w-3 h-3" /> Snack / Pack Shortage
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-amber-500/10 text-amber-400 font-semibold text-xs border border-amber-500/20">
                        <Clock className="w-3 h-3" /> Stale Payment Verification
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono font-bold text-white">{item.id}</td>
                  <td className="px-4 py-3">
                    <div>
                      <span className="font-medium text-white block">{item.customer_name}</span>
                      <span className="text-[11px] font-mono text-zinc-500 block">{item.customer_phone}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-zinc-300 font-medium">{item.package_name}</td>
                  <td className="px-4 py-3 text-zinc-400">{new Date(item.order_date).toLocaleString()}</td>
                  <td className="px-4 py-3 font-mono text-emerald-400 font-semibold">{formatKes(item.final_amount_paid)}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => onSelectOrder(item.id)}
                      className="px-3 py-1.5 rounded bg-amber-600 hover:bg-amber-500 text-white font-medium text-xs transition-colors cursor-pointer"
                    >
                      Resolve Issue
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
