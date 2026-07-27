import React, { useState, useEffect } from 'react';
import { RotateCcw, ShieldAlert, CheckCircle2, RefreshCw, Search, FileText } from 'lucide-react';

export const ReversalsCenter: React.FC = () => {
  const [reversals, setReversals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Form State
  const [originalReceipt, setOriginalReceipt] = useState('');
  const [reason, setReason] = useState('Accidental duplicate customer payment on checkout');

  const fetchReversals = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/v1/payments/reversal');
      const data = await res.json();
      setReversals(data.data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReversals();
  }, []);

  const handleInitiateReversal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!originalReceipt) return;
    setSubmitting(true);
    setMessage(null);
    try {
      const res = await fetch('/api/v1/payments/reversal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          original_receipt: originalReceipt,
          reason
        })
      });
      const data = await res.json();
      if (res.ok) {
        setMessage({ type: 'success', text: data.message });
        fetchReversals();
        setOriginalReceipt('');
      } else {
        setMessage({ type: 'error', text: data.error || 'Reversal failed' });
      }
    } catch (e: any) {
      setMessage({ type: 'error', text: e.message });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
        <div className="border-b border-zinc-800 pb-3 flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <RotateCcw className="w-5 h-5 text-amber-400" /> Daraja Transaction Reversal Service
            </h3>
            <p className="text-xs text-zinc-400 mt-0.5">
              Submit official M-Pesa transaction reversal requests directly to Safaricom Daraja API.
            </p>
          </div>
          <span className="px-3 py-1 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-full text-xs font-semibold flex items-center gap-1">
            <ShieldAlert className="w-3.5 h-3.5" /> Finance Manager Approval Required
          </span>
        </div>

        {message && (
          <div className={`p-3.5 rounded-lg border text-xs font-medium ${message.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' : 'bg-rose-500/10 border-rose-500/30 text-rose-300'}`}>
            {message.text}
          </div>
        )}

        <form onSubmit={handleInitiateReversal} className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-1">
          <div>
            <label className="text-xs font-medium text-zinc-300 block mb-1">Original M-Pesa Receipt Number</label>
            <input
              type="text"
              value={originalReceipt}
              onChange={(e) => setOriginalReceipt(e.target.value)}
              placeholder="e.g. RJK12345678"
              className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-zinc-200 font-mono"
              required
            />
          </div>

          <div>
            <label className="text-xs font-medium text-zinc-300 block mb-1">Reversal Reason / Audit Note</label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-zinc-200"
              required
            />
          </div>

          <div className="flex items-end">
            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2.5 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded-lg text-xs flex items-center justify-center gap-2 cursor-pointer transition-colors"
            >
              {submitting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />} Request Daraja Reversal
            </button>
          </div>
        </form>
      </div>

      {/* Reversal Ledger */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden shadow-xl">
        <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <FileText className="w-4 h-4 text-amber-400" /> Reversal Requests & Audit Log ({reversals.length})
          </h3>
          <button onClick={fetchReversals} className="p-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded text-xs">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-zinc-300">
            <thead className="bg-zinc-950 text-zinc-400 uppercase font-semibold text-[10px] border-b border-zinc-800">
              <tr>
                <th className="p-3">Reversal ID</th>
                <th className="p-3">Original Receipt</th>
                <th className="p-3">Reversal Receipt</th>
                <th className="p-3">Amount</th>
                <th className="p-3">Reason</th>
                <th className="p-3">Approver</th>
                <th className="p-3">Status</th>
                <th className="p-3">Date Requested</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60 font-mono text-[11px]">
              {reversals.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-zinc-500">
                    No reversal records found.
                  </td>
                </tr>
              ) : (
                reversals.map((r) => (
                  <tr key={r.id} className="hover:bg-zinc-800/40">
                    <td className="p-3 font-bold text-white">{r.id}</td>
                    <td className="p-3 text-amber-400 font-bold">{r.original_receipt}</td>
                    <td className="p-3 text-emerald-400 font-bold">{r.reversal_receipt || 'N/A'}</td>
                    <td className="p-3 font-bold text-white">KSh {(r.amount_cents / 100).toLocaleString()}</td>
                    <td className="p-3 font-sans text-zinc-300 text-xs">{r.reason}</td>
                    <td className="p-3 text-zinc-400">{r.approved_by || r.requested_by}</td>
                    <td className="p-3">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        {r.status}
                      </span>
                    </td>
                    <td className="p-3 text-zinc-400">{new Date(r.created_at).toLocaleString()}</td>
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
