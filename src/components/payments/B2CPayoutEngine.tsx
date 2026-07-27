import React, { useState, useEffect } from 'react';
import { Send, CheckCircle2, Clock, DollarSign, RefreshCw, Smartphone, ShieldCheck, UserCheck } from 'lucide-react';

export const B2CPayoutEngine: React.FC = () => {
  const [payouts, setPayouts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Form State
  const [recipientPhone, setRecipientPhone] = useState('0712345678');
  const [recipientName, setRecipientName] = useState('');
  const [amountKes, setAmountKes] = useState('1500');
  const [payoutType, setPayoutType] = useState<'creator_withdrawal' | 'customer_refund' | 'staff_reimbursement' | 'manual_transfer'>('creator_withdrawal');
  const [reason, setReason] = useState('Creator Affiliate Commission Payout');

  const fetchPayouts = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/v1/payments/b2c');
      const data = await res.json();
      setPayouts(data.data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPayouts();
  }, []);

  const handleInitiatePayout = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setMessage(null);
    try {
      const res = await fetch('/api/v1/payments/b2c', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payout_type: payoutType,
          recipient_phone: recipientPhone,
          recipient_name: recipientName,
          amount_kes: Number(amountKes),
          reason
        })
      });
      const data = await res.json();
      if (res.ok) {
        setMessage({ type: 'success', text: data.message });
        fetchPayouts();
        setAmountKes('');
      } else {
        setMessage({ type: 'error', text: data.error || 'Payout failed' });
      }
    } catch (e: any) {
      setMessage({ type: 'error', text: e.message });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Payout Form */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
        <div className="border-b border-zinc-800 pb-3 flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Send className="w-5 h-5 text-emerald-400" /> Automated M-Pesa B2C Payout Service
            </h3>
            <p className="text-xs text-zinc-400 mt-0.5">
              Direct disbursements to Creators, Staff, and Customers via Safaricom Daraja B2C API.
            </p>
          </div>
          <span className="px-3 py-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full text-xs font-semibold flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5" /> Daraja B2C Channel Active
          </span>
        </div>

        {message && (
          <div className={`p-3.5 rounded-lg border text-xs font-medium ${message.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' : 'bg-rose-500/10 border-rose-500/30 text-rose-300'}`}>
            {message.text}
          </div>
        )}

        <form onSubmit={handleInitiatePayout} className="grid grid-cols-1 md:grid-cols-4 gap-4 pt-1">
          <div>
            <label className="text-xs font-medium text-zinc-300 block mb-1">Payout Category</label>
            <select
              value={payoutType}
              onChange={(e: any) => setPayoutType(e.target.value)}
              className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-zinc-200 focus:outline-none focus:border-blue-500 font-medium"
            >
              <option value="creator_withdrawal">Creator Commission Withdrawal</option>
              <option value="customer_refund">Customer Order Refund</option>
              <option value="staff_reimbursement">Staff Expense Reimbursement</option>
              <option value="manual_transfer">Finance Manual Transfer</option>
            </select>
          </div>

          <div>
            <label className="text-xs font-medium text-zinc-300 block mb-1">Recipient Phone Number</label>
            <div className="relative">
              <input
                type="text"
                value={recipientPhone}
                onChange={(e) => setRecipientPhone(e.target.value)}
                placeholder="0712345678 or 2547..."
                className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-zinc-200 font-mono pl-8"
                required
              />
              <Smartphone className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-3" />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-zinc-300 block mb-1">Recipient Name</label>
            <input
              type="text"
              value={recipientName}
              onChange={(e) => setRecipientName(e.target.value)}
              placeholder="e.g. Jane Doe"
              className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-zinc-200"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-zinc-300 block mb-1">Amount (KES)</label>
            <div className="relative">
              <input
                type="number"
                value={amountKes}
                onChange={(e) => setAmountKes(e.target.value)}
                placeholder="Amount in KSh"
                className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-zinc-200 font-mono pl-8"
                required
              />
              <DollarSign className="w-3.5 h-3.5 text-emerald-400 absolute left-2.5 top-3" />
            </div>
          </div>

          <div className="md:col-span-3">
            <label className="text-xs font-medium text-zinc-300 block mb-1">Disbursement Reason / Audit Note</label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Audit reason..."
              className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-zinc-200"
            />
          </div>

          <div className="flex items-end">
            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg text-xs flex items-center justify-center gap-2 cursor-pointer transition-colors"
            >
              {submitting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Dispatch B2C Payout
            </button>
          </div>
        </form>
      </div>

      {/* B2C Payout History */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden shadow-xl">
        <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <UserCheck className="w-4 h-4 text-emerald-400" /> B2C Disbursement Ledger ({payouts.length})
          </h3>
          <button onClick={fetchPayouts} className="p-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded text-xs">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-zinc-300">
            <thead className="bg-zinc-950 text-zinc-400 uppercase font-semibold text-[10px] border-b border-zinc-800">
              <tr>
                <th className="p-3">Payout ID</th>
                <th className="p-3">Category</th>
                <th className="p-3">Recipient</th>
                <th className="p-3">Amount (KES)</th>
                <th className="p-3">M-Pesa Receipt</th>
                <th className="p-3">Conversation ID</th>
                <th className="p-3">Status</th>
                <th className="p-3">Settlement Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60 font-mono text-[11px]">
              {payouts.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-zinc-500">
                    No B2C disbursements processed yet.
                  </td>
                </tr>
              ) : (
                payouts.map((p) => (
                  <tr key={p.id} className="hover:bg-zinc-800/40">
                    <td className="p-3 font-bold text-white">{p.id}</td>
                    <td className="p-3 capitalize font-sans text-zinc-400">{(p.payout_type || '').replace('_', ' ')}</td>
                    <td className="p-3">
                      <div className="font-bold text-zinc-200">{p.recipient_name}</div>
                      <div className="text-[10px] text-zinc-500">{p.recipient_phone}</div>
                    </td>
                    <td className="p-3 font-bold text-emerald-400">KSh {p.amount_kes.toLocaleString()}</td>
                    <td className="p-3 text-cyan-400 font-bold">{p.mpesa_receipt_number || 'N/A'}</td>
                    <td className="p-3 text-zinc-400 text-[10px]">{p.conversation_id}</td>
                    <td className="p-3">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        Completed
                      </span>
                    </td>
                    <td className="p-3 text-zinc-400">{new Date(p.created_at).toLocaleString()}</td>
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
