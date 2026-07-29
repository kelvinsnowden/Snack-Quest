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
  ExternalLink,
  Eye,
  Truck,
  Zap,
  UserCheck,
  FileText,
  Lock,
  AlertTriangle,
  ChevronRight,
  Send,
  PauseCircle,
  History,
  ShieldCheck,
  User
} from 'lucide-react';
import { useApp } from '../../context/AppContext';

export const AdminWithdrawalsQueue: React.FC = () => {
  const { currentUser, addToast } = useApp();
  const [withdrawals, setWithdrawals] = useState<any[]>([]);
  const [settings, setSettings] = useState<any>({
    min_withdrawal_kes: 1000,
    max_withdrawal_kes: 50000,
    commission_per_referral_kes: 500,
    return_window_days: 7,
    auto_approve_below_kes: 2000,
    max_auto_approve_risk_score: 25,
    dual_approval_above_kes: 20000
  });
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRequest, setSelectedRequest] = useState<any>(null);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
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
      if (setData.data) setSettings(setData.data);
    } catch (err) {
      console.error('Failed to load withdrawal queue', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadWithdrawals();
  }, []);

  const handleHold = async (id: string) => {
    setProcessingId(id);
    try {
      const res = await fetch(`/api/v1/admin/affiliate/withdrawals/${id}/hold`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          staff_user_id: currentUser?.id,
          reviewer: currentUser?.full_name || 'Finance Officer',
          notes: adminNote || 'Placed under compliance review by Risk Officer'
        })
      });
      if (res.ok) {
        addToast({ type: 'info', title: 'Request Held', message: `Withdrawal ${id} placed under review.` });
        setSelectedRequest(null);
        setAdminNote('');
        loadWithdrawals();
      }
    } catch (err) {
      addToast({ type: 'error', title: 'Action Failed', message: 'Could not update request status.' });
    } finally {
      setProcessingId(null);
    }
  };

  const handleApprove = async (id: string) => {
    setProcessingId(id);
    try {
      const res = await fetch(`/api/v1/admin/affiliate/withdrawals/${id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          staff_user_id: currentUser?.id,
          reviewer: currentUser?.full_name || 'Finance Admin',
          notes: adminNote || 'Approved by Finance Administrator'
        })
      });
      if (res.ok) {
        addToast({ type: 'success', title: 'Withdrawal Approved', message: `Request ${id} approved for payout.` });
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

  const handleProcessPayout = async (id: string) => {
    setProcessingId(id);
    try {
      const res = await fetch(`/api/v1/admin/affiliate/withdrawals/${id}/process-payout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          staff_user_id: currentUser?.id,
          reviewer: currentUser?.full_name || 'B2C Payout Engine',
          notes: adminNote || 'Dispatched via Safaricom Daraja B2C API'
        })
      });
      const data = await res.json();
      if (res.ok) {
        addToast({ type: 'success', title: 'Daraja B2C Payout Dispatched', message: data.message });
        setSelectedRequest(null);
        setAdminNote('');
        loadWithdrawals();
      } else {
        addToast({ type: 'error', title: 'Payout Failed', message: data.error || 'Daraja B2C dispatch failed.' });
      }
    } catch (err) {
      addToast({ type: 'error', title: 'Action Failed', message: 'Could not process B2C payout.' });
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
          reviewer: currentUser?.full_name || 'Risk Officer',
          reason: rejectionReason,
          notes: adminNote
        })
      });
      if (res.ok) {
        addToast({ type: 'info', title: 'Withdrawal Rejected', message: `Request ${id} rejected. Funds returned.` });
        setSelectedRequest(null);
        setRejectionReason('');
        setAdminNote('');
        loadWithdrawals();
      }
    } catch (err) {
      addToast({ type: 'error', title: 'Action Failed', message: 'Could not reject request.' });
    } finally {
      setProcessingId(null);
    }
  };

  const handleSaveSettings = async () => {
    try {
      const res = await fetch('/api/v1/admin/affiliate/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
      });
      if (res.ok) {
        addToast({ type: 'success', title: 'Settings Saved', message: 'Finance payout thresholds updated.' });
        setShowSettingsModal(false);
      }
    } catch (err) {
      addToast({ type: 'error', title: 'Save Failed', message: 'Could not save settings.' });
    }
  };

  const exportCSV = () => {
    const headers = 'ID,Customer,Phone,Amount KES,Method,Account,Status,Risk Score,Requested At,Payout Ref\n';
    const rows = withdrawals.map((w) =>
      `"${w.id}","${w.customer_name}","${w.customer_phone}",${w.amount_kes},"${w.method}","${w.account_number}","${w.status}",${w.fraud_score},"${w.requested_at}","${w.payment_reference || ''}"`
    ).join('\n');

    const blob = new Blob([headers + rows], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `affiliate_payouts_audit_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  // Finance KPI Summary Stats
  const pendingKes = withdrawals
    .filter((w) => w.status === 'pending')
    .reduce((s, w) => s + w.amount_kes, 0);

  const underReviewKes = withdrawals
    .filter((w) => w.status === 'under_review')
    .reduce((s, w) => s + w.amount_kes, 0);

  const approvedKes = withdrawals
    .filter((w) => w.status === 'approved')
    .reduce((s, w) => s + w.amount_kes, 0);

  const totalPaidKes = withdrawals
    .filter((w) => w.status === 'paid')
    .reduce((s, w) => s + w.amount_kes, 0);

  const highRiskCount = withdrawals.filter((w) => (w.fraud_score || 0) >= 50).length;

  const filtered = withdrawals.filter((w) => {
    const matchesStatus = statusFilter === 'all' || w.status === statusFilter;
    const matchesQuery =
      w.customer_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      w.customer_phone?.includes(searchQuery) ||
      w.id?.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesStatus && matchesQuery;
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'paid':
        return <span className="px-2.5 py-1 rounded-full text-[10px] font-black bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Paid</span>;
      case 'approved':
        return <span className="px-2.5 py-1 rounded-full text-[10px] font-black bg-blue-500/20 text-blue-400 border border-blue-500/30 flex items-center gap-1"><Check className="w-3 h-3" /> Approved</span>;
      case 'under_review':
        return <span className="px-2.5 py-1 rounded-full text-[10px] font-black bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center gap-1"><PauseCircle className="w-3 h-3" /> Under Review</span>;
      case 'pending':
        return <span className="px-2.5 py-1 rounded-full text-[10px] font-black bg-zinc-800 text-zinc-300 border border-zinc-700 flex items-center gap-1"><Clock className="w-3 h-3 text-amber-400" /> Pending</span>;
      case 'rejected':
        return <span className="px-2.5 py-1 rounded-full text-[10px] font-black bg-rose-500/20 text-rose-400 border border-rose-500/30 flex items-center gap-1"><XCircle className="w-3 h-3" /> Rejected</span>;
      case 'cancelled':
        return <span className="px-2.5 py-1 rounded-full text-[10px] font-black bg-zinc-900 text-zinc-500 border border-zinc-800 flex items-center gap-1"><X className="w-3 h-3" /> Cancelled</span>;
      default:
        return <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-zinc-800 text-zinc-400">{status}</span>;
    }
  };

  const getRiskBadge = (score: number) => {
    if (score >= 75) {
      return <span className="px-2 py-0.5 rounded text-[10px] font-black bg-rose-500/20 text-rose-400 border border-rose-500/30 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> CRITICAL ({score})</span>;
    } else if (score >= 50) {
      return <span className="px-2 py-0.5 rounded text-[10px] font-black bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center gap-1"><ShieldAlert className="w-3 h-3" /> HIGH ({score})</span>;
    } else if (score >= 25) {
      return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">MEDIUM ({score})</span>;
    } else {
      return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1"><ShieldCheck className="w-3 h-3" /> LOW ({score})</span>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-zinc-900 border border-zinc-800/90 rounded-3xl p-5 shadow-2xl">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 uppercase tracking-wider">
              Finance & Compliance Center
            </span>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-500/20 text-amber-300 border border-amber-500/30 uppercase tracking-wider">
              Daraja B2C Enabled
            </span>
          </div>
          <h2 className="text-xl font-black text-white tracking-tight mt-1.5 flex items-center gap-2">
            <Lock className="w-5 h-5 text-amber-400" />
            Creator Payout & Withdrawal Approval Queue
          </h2>
          <p className="text-xs text-zinc-400 mt-0.5">Enterprise financial controls, multi-stage review, automated risk scoring, and audit trails.</p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowSettingsModal(true)}
            className="px-3.5 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-bold text-xs rounded-xl border border-zinc-700 transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <Sliders className="w-4 h-4 text-amber-400" />
            <span>Policy Rules</span>
          </button>
          <button
            onClick={exportCSV}
            className="px-3.5 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-bold text-xs rounded-xl border border-zinc-700 transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <Download className="w-4 h-4 text-emerald-400" />
            <span>Export CSV</span>
          </button>
          <button
            onClick={loadWithdrawals}
            className="p-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl border border-zinc-700 cursor-pointer"
            title="Refresh Queue"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* KPI Financial Overview Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="bg-zinc-900/90 border border-zinc-800/90 rounded-2xl p-4 space-y-1">
          <span className="text-[10px] font-mono uppercase font-bold text-zinc-400">Pending Queue</span>
          <p className="text-lg font-black text-amber-400">KSh {pendingKes.toLocaleString()}</p>
          <span className="text-[10px] text-zinc-500 font-medium">{withdrawals.filter((w) => w.status === 'pending').length} requests awaiting review</span>
        </div>

        <div className="bg-zinc-900/90 border border-zinc-800/90 rounded-2xl p-4 space-y-1">
          <span className="text-[10px] font-mono uppercase font-bold text-zinc-400">Under Review</span>
          <p className="text-lg font-black text-indigo-400">KSh {underReviewKes.toLocaleString()}</p>
          <span className="text-[10px] text-zinc-500 font-medium">{withdrawals.filter((w) => w.status === 'under_review').length} held for compliance</span>
        </div>

        <div className="bg-zinc-900/90 border border-zinc-800/90 rounded-2xl p-4 space-y-1">
          <span className="text-[10px] font-mono uppercase font-bold text-zinc-400">Approved (Ready B2C)</span>
          <p className="text-lg font-black text-blue-400">KSh {approvedKes.toLocaleString()}</p>
          <span className="text-[10px] text-zinc-500 font-medium">{withdrawals.filter((w) => w.status === 'approved').length} ready for payout</span>
        </div>

        <div className="bg-zinc-900/90 border border-zinc-800/90 rounded-2xl p-4 space-y-1">
          <span className="text-[10px] font-mono uppercase font-bold text-zinc-400">Total Paid Out</span>
          <p className="text-lg font-black text-emerald-400">KSh {totalPaidKes.toLocaleString()}</p>
          <span className="text-[10px] text-zinc-500 font-medium">{withdrawals.filter((w) => w.status === 'paid').length} completed payouts</span>
        </div>

        <div className="bg-zinc-900/90 border border-zinc-800/90 rounded-2xl p-4 space-y-1 col-span-2 md:col-span-1">
          <span className="text-[10px] font-mono uppercase font-bold text-zinc-400">High Risk Alerts</span>
          <p className="text-lg font-black text-rose-400">{highRiskCount} Flags</p>
          <span className="text-[10px] text-zinc-500 font-medium">Risk score ≥ 50%</span>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          {[
            { id: 'all', label: 'All Requests' },
            { id: 'pending', label: 'Pending' },
            { id: 'under_review', label: 'Under Review' },
            { id: 'approved', label: 'Approved' },
            { id: 'paid', label: 'Paid' },
            { id: 'rejected', label: 'Rejected' }
          ].map((st) => (
            <button
              key={st.id}
              onClick={() => setStatusFilter(st.id)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                statusFilter === st.id
                  ? 'bg-amber-500 text-slate-950 font-black shadow-md'
                  : 'bg-zinc-900 text-zinc-400 hover:text-white border border-zinc-800'
              }`}
            >
              {st.label} ({st.id === 'all' ? withdrawals.length : withdrawals.filter((w) => w.status === st.id).length})
            </button>
          ))}
        </div>

        <div className="relative min-w-[240px]">
          <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search creator name, phone or ID..."
            className="w-full bg-zinc-900 border border-zinc-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
          />
        </div>
      </div>

      {/* Main Queue Table / Cards */}
      <div className="bg-zinc-900 border border-zinc-800/90 rounded-3xl overflow-hidden shadow-2xl">
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-zinc-950 text-zinc-400 uppercase font-mono border-b border-zinc-800/80">
              <tr>
                <th className="py-3.5 px-4">Request ID</th>
                <th className="py-3.5 px-4">Creator</th>
                <th className="py-3.5 px-4">Amount KES</th>
                <th className="py-3.5 px-4">Method & Account</th>
                <th className="py-3.5 px-4">Risk Evaluation</th>
                <th className="py-3.5 px-4">Status</th>
                <th className="py-3.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60">
              {filtered.map((w) => {
                return (
                  <tr key={w.id} className="hover:bg-zinc-800/40 transition-all">
                    <td className="py-3.5 px-4 font-mono text-zinc-300 font-bold">
                      {w.id}
                      <span className="block text-[10px] text-zinc-500 font-normal">{new Date(w.requested_at).toLocaleDateString()}</span>
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-2">
                        <div>
                          <div className="font-extrabold text-white text-xs">{w.customer_name}</div>
                          <div className="text-[10px] text-zinc-400">{w.customer_phone} • {w.creator_account_age_days}d account</div>
                        </div>
                        {w.customer_tier && (
                          <span className="px-1.5 py-0.5 text-[9px] font-mono font-bold uppercase rounded bg-amber-500/10 text-amber-300 border border-amber-500/20">
                            {w.customer_tier}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3.5 px-4 font-black text-amber-400 text-sm">
                      KSh {w.amount_kes?.toLocaleString()}
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="font-bold text-zinc-200">
                        {w.method === 'mpesa' ? '📱 M-Pesa B2C' : '🏦 Equity Bank'}
                      </div>
                      <div className="text-[10px] font-mono text-zinc-400">{w.account_number}</div>
                    </td>
                    <td className="py-3.5 px-4">
                      {getRiskBadge(w.fraud_score || 0)}
                    </td>
                    <td className="py-3.5 px-4">
                      {getStatusBadge(w.status)}
                    </td>
                    <td className="py-3.5 px-4 text-right space-x-1.5">
                      <button
                        onClick={() => setSelectedRequest(w)}
                        className="px-2.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-bold rounded-xl text-[11px] border border-zinc-700 transition-all cursor-pointer inline-flex items-center gap-1"
                      >
                        <Eye className="w-3.5 h-3.5 text-amber-400" /> Inspect
                      </button>

                      {w.status === 'pending' && (
                        <button
                          onClick={() => handleApprove(w.id)}
                          disabled={processingId === w.id}
                          className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-black rounded-xl text-[11px] shadow-md transition-all cursor-pointer"
                        >
                          Approve
                        </button>
                      )}

                      {w.status === 'approved' && (
                        <button
                          onClick={() => handleProcessPayout(w.id)}
                          disabled={processingId === w.id}
                          className="px-3 py-1.5 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-400 hover:to-amber-400 text-slate-950 font-black rounded-xl text-[11px] shadow-md transition-all cursor-pointer inline-flex items-center gap-1"
                        >
                          <Zap className="w-3.5 h-3.5" /> Dispatch B2C
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}

              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-zinc-500 text-xs">
                    No withdrawal requests matching the selected filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile View Cards */}
        <div className="md:hidden divide-y divide-zinc-800/80 p-3 space-y-3">
          {filtered.map((w) => (
            <div key={w.id} className="p-3.5 bg-zinc-950 rounded-2xl space-y-2.5 border border-zinc-800/80">
              <div className="flex justify-between items-start">
                <div>
                  <span className="text-[10px] font-mono text-zinc-500">{w.id}</span>
                  <h4 className="font-extrabold text-white text-sm">{w.customer_name}</h4>
                  <span className="text-xs text-zinc-400">{w.customer_phone}</span>
                </div>
                <div className="text-right">
                  <span className="text-base font-black text-amber-400 block">KSh {w.amount_kes?.toLocaleString()}</span>
                  {getStatusBadge(w.status)}
                </div>
              </div>

              <div className="flex justify-between items-center text-xs text-zinc-400 border-t border-zinc-800/60 pt-2">
                <span>Account: {w.method} ({w.account_number})</span>
                {getRiskBadge(w.fraud_score || 0)}
              </div>

              <div className="pt-1 flex gap-2">
                <button
                  onClick={() => setSelectedRequest(w)}
                  className="flex-1 py-2 bg-zinc-800 text-zinc-200 font-bold text-xs rounded-xl border border-zinc-700"
                >
                  Inspect Audit
                </button>
                {w.status === 'approved' && (
                  <button
                    onClick={() => handleProcessPayout(w.id)}
                    className="flex-1 py-2 bg-orange-500 text-slate-950 font-black text-xs rounded-xl"
                  >
                    Dispatch B2C
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Policy Settings Configuration Modal */}
      {showSettingsModal && (
        <div className="fixed inset-0 z-50 bg-zinc-950/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl max-w-lg w-full p-6 text-zinc-100 shadow-2xl relative space-y-5">
            <div className="flex justify-between items-center border-b border-zinc-800 pb-3">
              <div className="flex items-center gap-2">
                <Sliders className="w-5 h-5 text-amber-400" />
                <h3 className="text-base font-extrabold text-white">Finance Payout Policy Controls</h3>
              </div>
              <button onClick={() => setShowSettingsModal(false)} className="text-zinc-400 hover:text-white cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-zinc-300 mb-1">Min Withdrawal (KSh)</label>
                  <input
                    type="number"
                    value={settings.min_withdrawal_kes}
                    onChange={(e) => setSettings({ ...settings, min_withdrawal_kes: Number(e.target.value) })}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block font-bold text-zinc-300 mb-1">Max Withdrawal (KSh)</label>
                  <input
                    type="number"
                    value={settings.max_withdrawal_kes}
                    onChange={(e) => setSettings({ ...settings, max_withdrawal_kes: Number(e.target.value) })}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-white font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-zinc-300 mb-1">Auto-Approve Below (KSh)</label>
                  <input
                    type="number"
                    value={settings.auto_approve_below_kes}
                    onChange={(e) => setSettings({ ...settings, auto_approve_below_kes: Number(e.target.value) })}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-white font-mono"
                  />
                  <p className="text-[10px] text-zinc-500 mt-1">Automatic approval threshold for low value</p>
                </div>
                <div>
                  <label className="block font-bold text-zinc-300 mb-1">Max Risk Score for Auto %</label>
                  <input
                    type="number"
                    value={settings.max_auto_approve_risk_score}
                    onChange={(e) => setSettings({ ...settings, max_auto_approve_risk_score: Number(e.target.value) })}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-white font-mono"
                  />
                  <p className="text-[10px] text-zinc-500 mt-1">Requests with risk &gt; this go to Queue</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-zinc-300 mb-1">Dual-Approval Threshold (KSh)</label>
                  <input
                    type="number"
                    value={settings.dual_approval_above_kes}
                    onChange={(e) => setSettings({ ...settings, dual_approval_above_kes: Number(e.target.value) })}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block font-bold text-zinc-300 mb-1">Return Window Days</label>
                  <input
                    type="number"
                    value={settings.return_window_days}
                    onChange={(e) => setSettings({ ...settings, return_window_days: Number(e.target.value) })}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-white font-mono"
                  />
                  <p className="text-[10px] text-zinc-500 mt-1">Unsettled return window lock duration</p>
                </div>
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={handleSaveSettings}
                className="w-full py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs rounded-xl shadow-lg cursor-pointer"
              >
                Save Policy Configuration
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Deep Inspection, Risk & Audit Modal */}
      {selectedRequest && (
        <div className="fixed inset-0 z-50 bg-zinc-950/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in overflow-y-auto">
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl max-w-2xl w-full p-6 text-zinc-100 shadow-2xl relative space-y-5 my-8">
            <button
              onClick={() => setSelectedRequest(null)}
              className="absolute top-4 right-4 text-zinc-400 hover:text-white cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
                <FileText className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-black text-white">
                  Payout Request Inspection & Risk Audit
                </h3>
                <span className="text-xs font-mono text-zinc-400">{selectedRequest.id} • Submitted {new Date(selectedRequest.requested_at).toLocaleString()}</span>
              </div>
            </div>

            {/* Creator Overview & Financial Breakdown */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 bg-zinc-950 p-3.5 rounded-2xl border border-zinc-800/80 text-xs">
              <div>
                <span className="text-[10px] font-mono text-zinc-500 uppercase block">Creator</span>
                <span className="font-bold text-white block truncate">{selectedRequest.customer_name}</span>
                <span className="text-[10px] text-zinc-400">{selectedRequest.customer_phone}</span>
              </div>
              <div>
                <span className="text-[10px] font-mono text-zinc-500 uppercase block">Withdrawal Amount</span>
                <span className="font-black text-amber-400 text-sm">KSh {selectedRequest.amount_kes?.toLocaleString()}</span>
              </div>
              <div>
                <span className="text-[10px] font-mono text-zinc-500 uppercase block">Channel</span>
                <span className="font-bold text-zinc-200">{selectedRequest.method}</span>
                <span className="text-[10px] text-zinc-400 font-mono block">{selectedRequest.account_number}</span>
              </div>
              <div>
                <span className="text-[10px] font-mono text-zinc-500 uppercase block">Current Status</span>
                {getStatusBadge(selectedRequest.status)}
              </div>
            </div>

            {/* Risk Scoring & Triggered Indicators */}
            <div className="bg-zinc-950 p-4 rounded-2xl border border-zinc-800/80 space-y-2.5">
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-zinc-300 flex items-center gap-1.5">
                  <ShieldAlert className="w-4 h-4 text-amber-400" /> Fraud Risk Analysis
                </span>
                {getRiskBadge(selectedRequest.fraud_score || 0)}
              </div>

              {selectedRequest.fraud_flags && selectedRequest.fraud_flags.length > 0 ? (
                <div className="space-y-1 pt-1">
                  <span className="text-[10px] font-mono uppercase text-zinc-500 font-bold">Triggered Risk Indicators:</span>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedRequest.fraud_flags.map((flag: string, idx: number) => (
                      <span key={idx} className="px-2 py-1 rounded bg-rose-500/10 text-rose-300 border border-rose-500/20 text-[10px] font-medium flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3 text-rose-400 shrink-0" /> {flag}
                      </span>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-emerald-400 font-medium flex items-center gap-1">
                  <ShieldCheck className="w-4 h-4" /> No suspicious fraud signals or risk indicators detected for this request.
                </p>
              )}
            </div>

            {/* Linked Orders & Referrals */}
            {selectedRequest.linked_orders && selectedRequest.linked_orders.length > 0 && (
              <div className="space-y-2">
                <span className="text-xs font-bold text-zinc-300 flex items-center gap-1.5">
                  <UserCheck className="w-4 h-4 text-emerald-400" /> Linked Referral Orders ({selectedRequest.linked_orders.length})
                </span>
                <div className="bg-zinc-950 rounded-2xl border border-zinc-800/80 overflow-hidden max-h-32 overflow-y-auto">
                  <table className="w-full text-left text-[11px]">
                    <thead className="bg-zinc-900/80 text-zinc-400 font-mono">
                      <tr>
                        <th className="p-2">Referee</th>
                        <th className="p-2">Order Ref</th>
                        <th className="p-2">Commission</th>
                        <th className="p-2">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/60">
                      {selectedRequest.linked_orders.map((ord: any, idx: number) => (
                        <tr key={idx}>
                          <td className="p-2 font-bold text-white">{ord.referee_name}</td>
                          <td className="p-2 font-mono text-zinc-400">{ord.order_id}</td>
                          <td className="p-2 font-black text-amber-400">KSh {ord.commission_kes}</td>
                          <td className="p-2 text-emerald-400 font-bold uppercase text-[10px]">{ord.status}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Audit Trail Log */}
            <div className="space-y-2">
              <span className="text-xs font-bold text-zinc-300 flex items-center gap-1.5">
                <History className="w-4 h-4 text-indigo-400" /> Complete Audit Trail Log
              </span>
              <div className="bg-zinc-950 p-3 rounded-2xl border border-zinc-800/80 space-y-2 max-h-36 overflow-y-auto">
                {(selectedRequest.audit_trail || []).map((log: any, idx: number) => (
                  <div key={idx} className="flex items-start justify-between text-[11px] border-b border-zinc-900 pb-1.5 last:border-0">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-amber-400 font-mono uppercase">{log.action}</span>
                        <span className="text-zinc-400">by {log.performed_by}</span>
                      </div>
                      <p className="text-zinc-300 text-[10px] mt-0.5">{log.notes}</p>
                      {log.payout_ref && <span className="text-[10px] font-mono text-emerald-400 font-bold">Ref: {log.payout_ref}</span>}
                    </div>
                    <span className="text-[10px] font-mono text-zinc-500 shrink-0">{new Date(log.timestamp).toLocaleTimeString()}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Admin Note Input */}
            <div className="space-y-3 pt-1">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-zinc-300 mb-1">Administrative Note</label>
                  <input
                    type="text"
                    value={adminNote}
                    onChange={(e) => setAdminNote(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white"
                    placeholder="Audit reason / internal note..."
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-zinc-300 mb-1">Rejection Reason (if rejecting)</label>
                  <input
                    type="text"
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white"
                    placeholder="e.g. Account name mismatch"
                  />
                </div>
              </div>
            </div>

            {/* Multi-Stage Action Bar */}
            <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-zinc-800">
              {selectedRequest.status === 'pending' && (
                <>
                  <button
                    onClick={() => handleApprove(selectedRequest.id)}
                    disabled={processingId === selectedRequest.id}
                    className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-black text-xs rounded-xl shadow-lg cursor-pointer"
                  >
                    Approve Request
                  </button>
                  <button
                    onClick={() => handleHold(selectedRequest.id)}
                    disabled={processingId === selectedRequest.id}
                    className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-black text-xs rounded-xl shadow-lg cursor-pointer"
                  >
                    Place Under Review
                  </button>
                  <button
                    onClick={() => handleReject(selectedRequest.id)}
                    disabled={processingId === selectedRequest.id}
                    className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-500 text-white font-black text-xs rounded-xl shadow-lg cursor-pointer"
                  >
                    Reject Request
                  </button>
                </>
              )}

              {selectedRequest.status === 'under_review' && (
                <>
                  <button
                    onClick={() => handleApprove(selectedRequest.id)}
                    disabled={processingId === selectedRequest.id}
                    className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-black text-xs rounded-xl shadow-lg cursor-pointer"
                  >
                    Approve Request
                  </button>
                  <button
                    onClick={() => handleReject(selectedRequest.id)}
                    disabled={processingId === selectedRequest.id}
                    className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-500 text-white font-black text-xs rounded-xl shadow-lg cursor-pointer"
                  >
                    Reject Request
                  </button>
                </>
              )}

              {selectedRequest.status === 'approved' && (
                <>
                  <button
                    onClick={() => handleProcessPayout(selectedRequest.id)}
                    disabled={processingId === selectedRequest.id}
                    className="flex-1 py-3 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-400 hover:to-amber-400 text-slate-950 font-black text-xs rounded-xl shadow-xl flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Zap className="w-4 h-4" /> Dispatch Daraja B2C Payout
                  </button>
                  <button
                    onClick={() => handleReject(selectedRequest.id)}
                    disabled={processingId === selectedRequest.id}
                    className="px-4 py-3 bg-zinc-800 hover:bg-zinc-700 text-rose-400 font-bold text-xs rounded-xl cursor-pointer"
                  >
                    Cancel / Reject
                  </button>
                </>
              )}

              {selectedRequest.status === 'paid' && (
                <div className="w-full p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span className="font-bold text-emerald-300">Payout successfully dispatched via Daraja B2C</span>
                  </div>
                  <span className="font-mono text-emerald-400 font-bold">{selectedRequest.payment_reference}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminWithdrawalsQueue;

