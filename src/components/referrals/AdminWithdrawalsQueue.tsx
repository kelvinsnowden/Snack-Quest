import React, { useState, useEffect } from 'react';
import {
  DollarSign,
  Search,
  CheckCircle2,
  XCircle,
  Clock,
  ShieldAlert,
  Download,
  AlertCircle,
  Building2,
  Phone,
  RefreshCw,
  Sliders,
  Check,
  X,
  ExternalLink
} from 'lucide-react';
import { useApp } from '../../context/AppContext';

export const AdminWithdrawalsQueue: React.FC = () => {
  const { currentUser, addToast } = useApp();
  const [withdrawals, setWithdrawals] = useState<any[]>([]);
  const [settings, setSettings] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRequest, setSelectedRequest] = useState<any>(null);
  const [adminNote, setAdminNote] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');
  const [processingId, setProcessingId] = useState<string | null>(null);

  const loadWithdrawals = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/v1/admin/affiliate/withdrawals');
      const data = await res.json();
      setWithdrawals(data.data || []);

      const setRes = await fetch('/api/v1/admin/affiliate/settings');
      const setData = await setRes.json();
      setSettings(setData.data || null);
    } catch (err) {
      console.error('Failed to load withdrawal queue', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadWithdrawals();
  }, []);

  const handleApprove = async (id: string) => {
    setProcessingId(id);
    try {
      const res = await fetch(`/api/v1/admin/affiliate/withdrawals/${id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          staff_user_id: currentUser?.id,
          notes: adminNote || 'Approved by Finance Admin'
        })
      });
      if (res.ok) {
        addToast({ type: 'success', title: 'Withdrawal Approved', message: `Request ${id} approved.` });
        setSelectedRequest(null);
        setAdminNote('');
        loadWithdrawals();
      }
    } catch (err) {
      addToast({ type: 'error', title: 'Action Failed', message: 'Could not approve request.' });
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (id: string) => {
    if (!rejectionReason) return alert('Please enter a rejection reason.');
    setProcessingId(id);
    try {
      const res = await fetch(`/api/v1/admin/affiliate/withdrawals/${id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          staff_user_id: currentUser?.id,
          reason: rejectionReason,
          notes: adminNote
        })
      });
      if (res.ok) {
        addToast({ type: 'info', title: 'Withdrawal Rejected', message: `Request ${id} rejected.` });
        setSelectedRequest(null);
        setRejectionReason('');
        loadWithdrawals();
      }
    } catch (err) {
      addToast({ type: 'error', title: 'Action Failed', message: 'Could not reject request.' });
    } finally {
      setProcessingId(null);
    }
  };

  const handleMarkPaid = async (id: string) => {
    setProcessingId(id);
    try {
      const res = await fetch(`/api/v1/admin/affiliate/withdrawals/${id}/mark-paid`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          staff_user_id: currentUser?.id,
          notes: adminNote || 'Dispatched via Safaricom Daraja B2C API'
        })
      });
      if (res.ok) {
        addToast({ type: 'success', title: 'Payout Dispatched', message: `Marked ${id} as Paid.` });
        setSelectedRequest(null);
        loadWithdrawals();
      }
    } catch (err) {
      addToast({ type: 'error', title: 'Action Failed', message: 'Could not mark payout as paid.' });
    } finally {
      setProcessingId(null);
    }
  };

  const exportCSV = () => {
    const headers = 'ID,Customer,Phone,Amount KES,Method,Account,Status,Fraud Score,Requested At\n';
    const rows = withdrawals.map((w) =>
      `"${w.id}","${w.customer_name}","${w.customer_phone}",${w.amount_kes},"${w.method}","${w.account_number}","${w.status}",${w.fraud_score},"${w.requested_at}"`
    ).join('\n');

    const blob = new Blob([headers + rows], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `affiliate_payouts_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  const filtered = withdrawals.filter((w) => {
    const matchesStatus = statusFilter === 'all' || w.status === statusFilter;
    const matchesQuery =
      w.customer_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      w.customer_phone?.includes(searchQuery) ||
      w.id?.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesStatus && matchesQuery;
  });

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl">
        <div>
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 uppercase tracking-wider">
            Finance & Risk Center
          </span>
          <h2 className="text-xl font-extrabold text-white tracking-tight mt-1">
            Affiliate Cash Withdrawal Queue
          </h2>
          <p className="text-xs text-slate-400">Review, audit, approve, and dispatch cash commissions to creators.</p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={exportCSV}
            className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs rounded-xl border border-slate-700 transition-all flex items-center gap-1.5"
          >
            <Download className="w-4 h-4 text-emerald-400" />
            <span>Export CSV</span>
          </button>
          <button
            onClick={loadWithdrawals}
            className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl border border-slate-700"
            title="Refresh Queue"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          {['all', 'pending', 'approved', 'paid', 'rejected'].map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold capitalize transition-all whitespace-nowrap ${
                statusFilter === st
                  ? 'bg-amber-500 text-slate-950 font-black shadow-md'
                  : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
              }`}
            >
              {st} ({st === 'all' ? withdrawals.length : withdrawals.filter((w) => w.status === st).length})
            </button>
          ))}
        </div>

        <div className="relative min-w-[240px]">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search creator name, phone or ID..."
            className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
          />
        </div>
      </div>

      {/* Table / Mobile Cards */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950 text-slate-400 uppercase font-mono border-b border-slate-800">
              <tr>
                <th className="py-3 px-4">Request ID</th>
                <th className="py-3 px-4">Creator</th>
                <th className="py-3 px-4">Amount KES</th>
                <th className="py-3 px-4">Method & Account</th>
                <th className="py-3 px-4">Fraud Risk Score</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {filtered.map((w) => {
                const isHighRisk = w.fraud_score >= 40;
                return (
                  <tr key={w.id} className="hover:bg-slate-800/50 transition-all">
                    <td className="py-3 px-4 font-mono text-slate-300 font-bold">{w.id}</td>
                    <td className="py-3 px-4">
                      <div className="font-extrabold text-white">{w.customer_name}</div>
                      <div className="text-[10px] text-slate-400">{w.customer_phone}</div>
                    </td>
                    <td className="py-3 px-4 font-black text-amber-400 text-sm">
                      KSh {w.amount_kes?.toLocaleString()}
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-bold text-slate-200">
                        {w.method === 'mpesa' ? '📱 M-Pesa' : '🏦 Bank'}
                      </div>
                      <div className="text-[10px] font-mono text-slate-400">{w.account_number}</div>
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-extrabold ${
                          isHighRisk
                            ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                            : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                        }`}
                      >
                        {w.fraud_score}% Score
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-extrabold uppercase ${
                          w.status === 'paid'
                            ? 'bg-emerald-500/20 text-emerald-300'
                            : w.status === 'approved'
                            ? 'bg-blue-500/20 text-blue-300'
                            : w.status === 'pending'
                            ? 'bg-amber-500/20 text-amber-300'
                            : 'bg-red-500/20 text-red-300'
                        }`}
                      >
                        {w.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right space-x-2">
                      {w.status === 'pending' && (
                        <>
                          <button
                            onClick={() => setSelectedRequest(w)}
                            className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg text-[11px]"
                          >
                            Review & Approve
                          </button>
                        </>
                      )}
                      {w.status === 'approved' && (
                        <button
                          onClick={() => handleMarkPaid(w.id)}
                          disabled={processingId === w.id}
                          className="px-2.5 py-1 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg text-[11px]"
                        >
                          Mark Paid (B2C)
                        </button>
                      )}
                      {w.status === 'paid' && (
                        <span className="text-[10px] text-emerald-400 font-mono">Completed</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Mobile View Cards */}
        <div className="md:hidden divide-y divide-slate-800 p-3 space-y-3">
          {filtered.map((w) => (
            <div key={w.id} className="p-3 bg-slate-950 rounded-xl space-y-2">
              <div className="flex justify-between items-start">
                <div>
                  <span className="text-[10px] font-mono text-slate-500">{w.id}</span>
                  <h4 className="font-extrabold text-white text-sm">{w.customer_name}</h4>
                  <span className="text-xs text-slate-400">{w.customer_phone}</span>
                </div>
                <span className="text-lg font-black text-amber-400">KSh {w.amount_kes}</span>
              </div>

              <div className="flex justify-between items-center text-xs text-slate-400 border-t border-slate-900 pt-2">
                <span>Channel: {w.method} ({w.account_number})</span>
                <span className="font-bold text-amber-400">{w.status}</span>
              </div>

              {w.status === 'pending' && (
                <button
                  onClick={() => setSelectedRequest(w)}
                  className="w-full py-2 bg-emerald-600 text-white font-bold text-xs rounded-xl mt-2"
                >
                  Inspect & Approve Payout
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Inspection & Action Modal */}
      {selectedRequest && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-lg w-full p-6 text-slate-100 shadow-2xl relative">
            <button
              onClick={() => setSelectedRequest(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-lg font-black text-white mb-2">
              Inspect Payout Request {selectedRequest.id}
            </h3>

            <div className="bg-slate-950 p-4 rounded-2xl space-y-2 mb-4 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-400">Creator Name:</span>
                <span className="font-extrabold text-white">{selectedRequest.customer_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Amount Requested:</span>
                <span className="font-black text-amber-400 text-sm">KSh {selectedRequest.amount_kes}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Method & Account:</span>
                <span className="font-bold text-white">{selectedRequest.method} ({selectedRequest.account_number})</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Fraud Score:</span>
                <span className="font-extrabold text-emerald-400">{selectedRequest.fraud_score}% Risk</span>
              </div>
            </div>

            {/* Note & Rejection Input */}
            <div className="space-y-3 mb-5">
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">Admin Notes</label>
                <input
                  type="text"
                  value={adminNote}
                  onChange={(e) => setAdminNote(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
                  placeholder="Internal audit notes..."
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">Rejection Reason (if rejecting)</label>
                <input
                  type="text"
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
                  placeholder="e.g. Account details mismatch"
                />
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => handleApprove(selectedRequest.id)}
                disabled={processingId === selectedRequest.id}
                className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs rounded-xl shadow-lg"
              >
                Approve Request
              </button>
              <button
                onClick={() => handleReject(selectedRequest.id)}
                disabled={processingId === selectedRequest.id}
                className="flex-1 py-2.5 bg-red-600 hover:bg-red-500 text-white font-black text-xs rounded-xl shadow-lg"
              >
                Reject Request
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminWithdrawalsQueue;
