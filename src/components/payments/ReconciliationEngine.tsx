import React, { useState, useEffect } from 'react';
import { BarChart3, AlertTriangle, CheckCircle2, RefreshCw, Search, CheckCheck, ArrowUpRight } from 'lucide-react';

export const ReconciliationEngine: React.FC = () => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [reconcilingId, setReconcilingId] = useState<string | null>(null);

  const fetchReconciliation = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/v1/payments/reconciliation/dashboard');
      const json = await res.json();
      setData(json);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReconciliation();
  }, []);

  const handleResolveDiscrepancy = async (discrepancy: any) => {
    if (!discrepancy.order_id) return;
    setReconcilingId(discrepancy.id);
    try {
      const res = await fetch('/api/v1/payments/reconcile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'match',
          unmatched_id: discrepancy.id,
          order_id: discrepancy.order_id,
          notes: 'Auto-reconciled missing callback via Reconciliation Engine'
        })
      });
      if (res.ok) {
        fetchReconciliation();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setReconcilingId(null);
    }
  };

  if (loading || !data) {
    return (
      <div className="p-8 text-center text-zinc-400">
        <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-blue-500" />
        Running Automated Reconciliation Engine...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Reconciliation Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-xl">
          <div className="text-xs font-medium text-zinc-400">Internal Orders</div>
          <div className="text-lg font-bold text-white mt-1">{data.total_internal_orders}</div>
          <div className="text-[10px] text-zinc-500 mt-0.5">Tracked in system</div>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-xl">
          <div className="text-xs font-medium text-zinc-400">Daraja Receipts</div>
          <div className="text-lg font-bold text-cyan-400 mt-1">{data.total_daraja_transactions}</div>
          <div className="text-[10px] text-zinc-500 mt-0.5">M-Pesa confirmations</div>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-xl">
          <div className="text-xs font-medium text-zinc-400">Perfectly Reconciled</div>
          <div className="text-lg font-bold text-emerald-400 mt-1">{data.matched_count}</div>
          <div className="text-[10px] text-zinc-500 mt-0.5">KSh {data.matched_volume_kes.toLocaleString()} volume</div>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-xl">
          <div className="text-xs font-medium text-zinc-400">Discrepancies Flagged</div>
          <div className="text-lg font-bold text-rose-400 mt-1">{data.discrepancy_count}</div>
          <div className="text-[10px] text-zinc-500 mt-0.5">Requires audit</div>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-xl">
          <div className="text-xs font-medium text-zinc-400">Reconciliation Rate</div>
          <div className="text-lg font-bold text-blue-400 mt-1">
            {Math.round((data.matched_count / (data.total_daraja_transactions || 1)) * 100)}%
          </div>
          <div className="text-[10px] text-zinc-500 mt-0.5">Automated match rate</div>
        </div>
      </div>

      {/* Discrepancy Table */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden shadow-xl">
        <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400" /> Active Payment Discrepancy Ledger ({data.discrepancies.length})
            </h3>
            <p className="text-xs text-zinc-400 mt-0.5">
              Automated comparison between internal order balances and Daraja M-Pesa receipts.
            </p>
          </div>

          <button onClick={fetchReconciliation} className="p-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded text-xs">
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-zinc-300">
            <thead className="bg-zinc-950 text-zinc-400 uppercase font-semibold text-[10px] border-b border-zinc-800">
              <tr>
                <th className="p-3">Discrepancy ID</th>
                <th className="p-3">Type</th>
                <th className="p-3">Order ID</th>
                <th className="p-3">M-Pesa Receipt</th>
                <th className="p-3">Expected (KES)</th>
                <th className="p-3">Actual Paid (KES)</th>
                <th className="p-3">Audit Details</th>
                <th className="p-3">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60 font-mono text-[11px]">
              {data.discrepancies.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-zinc-500">
                    <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2 opacity-80" />
                    All payments perfectly reconciled! No active discrepancies found.
                  </td>
                </tr>
              ) : (
                data.discrepancies.map((d: any) => (
                  <tr key={d.id} className="hover:bg-zinc-800/40">
                    <td className="p-3 font-bold text-white">{d.id}</td>
                    <td className="p-3 capitalize text-amber-400 font-sans font-semibold">{(d.type || '').replace('_', ' ')}</td>
                    <td className="p-3 text-blue-400 font-bold">{d.order_id || 'N/A'}</td>
                    <td className="p-3 text-cyan-400 font-bold">{d.mpesa_receipt_number || 'N/A'}</td>
                    <td className="p-3 font-bold text-zinc-200">KSh {(d.expected_cents / 100).toLocaleString()}</td>
                    <td className="p-3 font-bold text-emerald-400">KSh {(d.actual_cents / 100).toLocaleString()}</td>
                    <td className="p-3 font-sans text-xs text-zinc-400 max-w-xs">{d.notes}</td>
                    <td className="p-3">
                      {d.order_id ? (
                        <button
                          onClick={() => handleResolveDiscrepancy(d)}
                          disabled={reconcilingId === d.id}
                          className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded text-[11px] flex items-center gap-1 cursor-pointer"
                        >
                          {reconcilingId === d.id ? <RefreshCw className="w-3 h-3 animate-spin" /> : <CheckCheck className="w-3 h-3" />} Reconcile
                        </button>
                      ) : (
                        <span className="text-zinc-500 text-[10px]">Manual Review</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
