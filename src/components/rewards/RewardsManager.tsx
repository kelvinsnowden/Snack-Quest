import React, { useState, useEffect } from 'react';
import {
  Gift,
  CheckCircle2,
  XCircle,
  Clock,
  ExternalLink,
  Plus,
  ShieldAlert,
  Search,
  Filter,
  Eye,
  Sliders
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { RewardSubmission, RewardType } from '../../types/database';

export const RewardsManager: React.FC = () => {
  const { checkPermission, currentUser } = useApp();
  const canView = checkPermission('rewards', 'view');
  const canCreate = checkPermission('rewards', 'create');
  const canApprove = checkPermission('rewards', 'approve');

  const [activeTab, setActiveTab] = useState<'submissions' | 'types'>('submissions');
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [rewardTypes, setRewardTypes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Proof Modal State
  const [selectedProofUrl, setSelectedProofUrl] = useState<string | null>(null);

  // Reject Modal State
  const [rejectingSubId, setRejectingSubId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');

  // Create/Edit Reward Type Modal State
  const [showTypeModal, setShowTypeModal] = useState(false);
  const [editingType, setEditingType] = useState<any | null>(null);
  const [typeForm, setTypeForm] = useState({
    label: '',
    code: '',
    credit_value_kes: 300,
    requires_approval: true,
    max_submissions: 3,
    cooldown_days: 7
  });

  const fetchSubmissions = async () => {
    try {
      const res = await fetch('/api/v1/rewards/submissions');
      const data = await res.json();
      setSubmissions(data.data || []);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchRewardTypes = async () => {
    try {
      const res = await fetch('/api/v1/rewards/types');
      const data = await res.json();
      setRewardTypes(data.data || []);
    } catch (e) {
      console.error(e);
    }
  };

  const loadData = async () => {
    setLoading(true);
    await Promise.all([fetchSubmissions(), fetchRewardTypes()]);
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleApprove = async (id: string) => {
    if (!canApprove) return alert('Permission denied: You cannot approve submissions.');
    try {
      const res = await fetch(`/api/v1/rewards/submissions/${id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ staff_user_id: currentUser?.id })
      });
      if (res.ok) {
        await fetchSubmissions();
      } else {
        const err = await res.json();
        alert(err.error || 'Failed to approve');
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleRejectSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectingSubId) return;
    try {
      const res = await fetch(`/api/v1/rewards/submissions/${rejectingSubId}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rejection_reason: rejectionReason,
          staff_user_id: currentUser?.id
        })
      });
      if (res.ok) {
        setRejectingSubId(null);
        setRejectionReason('');
        await fetchSubmissions();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleSaveType = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const url = editingType ? `/api/v1/rewards/types/${editingType.id}` : '/api/v1/rewards/types';
      const method = editingType ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label: typeForm.label,
          code: typeForm.code,
          credit_value: typeForm.credit_value_kes * 100, // convert KES to cents
          requires_approval: typeForm.requires_approval,
          max_submissions_per_customer: typeForm.max_submissions,
          cooldown_days: typeForm.cooldown_days,
          staff_user_id: currentUser?.id
        })
      });

      if (res.ok) {
        setShowTypeModal(false);
        setEditingType(null);
        await fetchRewardTypes();
      } else {
        const err = await res.json();
        alert(err.error || 'Failed to save reward type');
      }
    } catch (e) {
      console.error(e);
    }
  };

  if (!canView) {
    return (
      <div className="p-8 text-center text-[#A1A1AA]">
        <ShieldAlert className="h-12 w-12 text-red-500 mx-auto mb-4" />
        <h2 className="text-xl font-semibold text-white">Access Restricted</h2>
        <p className="text-sm mt-1">You do not have permissions to view Quest Rewards.</p>
      </div>
    );
  }

  const filteredSubmissions = submissions.filter((sub) => {
    const matchesStatus = statusFilter === 'all' || sub.status === statusFilter;
    const matchesSearch =
      sub.customer_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      sub.customer_phone?.includes(searchQuery) ||
      sub.reward_label?.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            <Gift className="h-6 w-6 text-blue-500" /> Quest Rewards & Submissions
          </h1>
          <p className="text-xs text-[#A1A1AA]">
            Review community quest submissions, manage reward types, and credit customer Quest Wallets.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canCreate && (
            <button
              onClick={() => {
                setEditingType(null);
                setTypeForm({
                  label: '',
                  code: '',
                  credit_value_kes: 300,
                  requires_approval: true,
                  max_submissions: 3,
                  cooldown_days: 7
                });
                setShowTypeModal(true);
              }}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-md text-sm font-medium transition-colors flex items-center gap-2 cursor-pointer shadow-md"
            >
              <Plus className="h-4 w-4" /> New Reward Type
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-[#27272A] gap-6">
        <button
          onClick={() => setActiveTab('submissions')}
          className={`pb-3 text-sm font-medium transition-colors border-b-2 cursor-pointer ${
            activeTab === 'submissions'
              ? 'border-blue-500 text-white font-semibold'
              : 'border-transparent text-[#A1A1AA] hover:text-white'
          }`}
        >
          Submissions Queue ({submissions.filter((s) => s.status === 'pending').length} Pending)
        </button>
        <button
          onClick={() => setActiveTab('types')}
          className={`pb-3 text-sm font-medium transition-colors border-b-2 cursor-pointer ${
            activeTab === 'types'
              ? 'border-blue-500 text-white font-semibold'
              : 'border-transparent text-[#A1A1AA] hover:text-white'
          }`}
        >
          Reward Types Catalogue ({rewardTypes.length})
        </button>
      </div>

      {activeTab === 'submissions' && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-3 items-center justify-between bg-[#18181B] p-4 rounded-lg border border-[#27272A]">
            <div className="relative flex-1 w-full sm:w-auto">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-[#71717A]" />
              <input
                type="text"
                placeholder="Search customer, phone, or reward type..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-[#09090B] border border-[#27272A] rounded-md pl-9 pr-3 py-2 text-xs text-white placeholder-[#71717A] focus:outline-none focus:border-blue-500"
              />
            </div>
            <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
              <Filter className="h-4 w-4 text-[#71717A]" />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="bg-[#09090B] border border-[#27272A] rounded-md px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500 cursor-pointer"
              >
                <option value="all">All Statuses</option>
                <option value="pending">Pending Review</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
              </select>
            </div>
          </div>

          {/* Submissions Table */}
          <div className="bg-[#18181B] border border-[#27272A] rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-[#FAFAFA]">
                <thead className="bg-[#09090B] text-[#71717A] font-semibold border-b border-[#27272A] uppercase tracking-wider">
                  <tr>
                    <th className="p-4">Customer</th>
                    <th className="p-4">Quest Reward</th>
                    <th className="p-4">Credit Value</th>
                    <th className="p-4">Proof Link</th>
                    <th className="p-4">Submitted At</th>
                    <th className="p-4">Status</th>
                    <th className="p-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#27272A]">
                  {loading ? (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-[#71717A]">
                        Loading quest submissions...
                      </td>
                    </tr>
                  ) : filteredSubmissions.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-[#71717A]">
                        No submissions matching current criteria.
                      </td>
                    </tr>
                  ) : (
                    filteredSubmissions.map((sub) => (
                      <tr key={sub.id} className="hover:bg-[#27272A]/40 transition-colors">
                        <td className="p-4 font-medium">
                          <div className="text-white font-semibold">{sub.customer_name}</div>
                          <div className="text-[10px] text-[#71717A] font-mono">{sub.customer_phone}</div>
                        </td>
                        <td className="p-4">
                          <span className="px-2 py-1 bg-blue-950 text-blue-300 rounded text-[11px] font-medium border border-blue-800/50">
                            {sub.reward_label}
                          </span>
                        </td>
                        <td className="p-4 font-mono font-bold text-emerald-400">
                          +{(sub.credit_value / 100).toLocaleString()} KES
                        </td>
                        <td className="p-4">
                          <button
                            onClick={() => setSelectedProofUrl(sub.proof_url)}
                            className="flex items-center gap-1 text-blue-400 hover:underline cursor-pointer"
                          >
                            <Eye className="h-3.5 w-3.5" /> View Proof
                          </button>
                        </td>
                        <td className="p-4 text-[#A1A1AA] font-mono">
                          {new Date(sub.submitted_at).toLocaleDateString()} {new Date(sub.submitted_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td className="p-4">
                          {sub.status === 'pending' && (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold bg-amber-950/80 text-amber-400 border border-amber-800/60">
                              <Clock className="h-3 w-3" /> Pending Review
                            </span>
                          )}
                          {sub.status === 'approved' && (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold bg-emerald-950/80 text-emerald-400 border border-emerald-800/60">
                              <CheckCircle2 className="h-3 w-3" /> Approved
                            </span>
                          )}
                          {sub.status === 'rejected' && (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold bg-red-950/80 text-red-400 border border-red-800/60" title={sub.rejection_reason || ''}>
                              <XCircle className="h-3 w-3" /> Rejected
                            </span>
                          )}
                        </td>
                        <td className="p-4 text-right">
                          {sub.status === 'pending' ? (
                            <div className="flex items-center justify-end gap-2">
                              {canApprove && (
                                <button
                                  onClick={() => handleApprove(sub.id)}
                                  className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-[11px] font-medium cursor-pointer transition-colors"
                                >
                                  Approve
                                </button>
                              )}
                              <button
                                onClick={() => setRejectingSubId(sub.id)}
                                className="px-2.5 py-1 bg-red-900/60 hover:bg-red-800 text-red-200 border border-red-700/50 rounded text-[11px] font-medium cursor-pointer transition-colors"
                              >
                                Reject
                              </button>
                            </div>
                          ) : (
                            <span className="text-[11px] text-[#71717A] italic">
                              Reviewed by {sub.reviewed_by || 'Staff'}
                            </span>
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
      )}

      {activeTab === 'types' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {rewardTypes.map((rt) => (
            <div key={rt.id} className="bg-[#18181B] border border-[#27272A] rounded-lg p-5 flex flex-col justify-between space-y-4 hover:border-[#3F3F46] transition-all">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="px-2 py-0.5 bg-[#27272A] text-[#A1A1AA] rounded text-[10px] font-mono uppercase">
                    {rt.code}
                  </span>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${rt.is_active ? 'bg-emerald-950 text-emerald-400' : 'bg-red-950 text-red-400'}`}>
                    {rt.is_active ? 'Active' : 'Disabled'}
                  </span>
                </div>
                <h3 className="text-base font-bold text-white">{rt.label}</h3>
                <div className="text-2xl font-extrabold text-emerald-400 font-mono">
                  +{(rt.credit_value / 100).toLocaleString()} KES
                </div>
              </div>

              <div className="text-xs text-[#A1A1AA] space-y-1.5 pt-3 border-t border-[#27272A]">
                <div className="flex justify-between">
                  <span>Approval Mode:</span>
                  <span className="text-white font-medium">{rt.requires_approval ? 'Manual Staff Review' : 'Auto-Approved'}</span>
                </div>
                <div className="flex justify-between">
                  <span>Max Submissions / Customer:</span>
                  <span className="text-white font-medium">{rt.rule?.max_submissions_per_customer || 'Unlimited'}</span>
                </div>
                <div className="flex justify-between">
                  <span>Cooldown Days:</span>
                  <span className="text-white font-medium">{rt.rule?.cooldown_days || 0} days</span>
                </div>
              </div>

              {canCreate && (
                <button
                  onClick={() => {
                    setEditingType(rt);
                    setTypeForm({
                      label: rt.label,
                      code: rt.code,
                      credit_value_kes: rt.credit_value / 100,
                      requires_approval: rt.requires_approval,
                      max_submissions: rt.rule?.max_submissions_per_customer || 3,
                      cooldown_days: rt.rule?.cooldown_days || 7
                    });
                    setShowTypeModal(true);
                  }}
                  className="w-full mt-2 py-1.5 bg-[#27272A] hover:bg-[#3F3F46] text-white text-xs font-medium rounded transition-colors cursor-pointer flex items-center justify-center gap-1"
                >
                  <Sliders className="h-3.5 w-3.5" /> Edit Configuration
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Proof Modal */}
      {selectedProofUrl && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#18181B] border border-[#27272A] rounded-xl max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-[#27272A] pb-3">
              <h3 className="text-base font-bold text-white">Submission Proof Verification</h3>
              <button onClick={() => setSelectedProofUrl(null)} className="text-[#A1A1AA] hover:text-white cursor-pointer">✕</button>
            </div>
            <div className="rounded-lg overflow-hidden border border-[#27272A] max-h-96 flex items-center justify-center bg-black">
              <img src={selectedProofUrl} alt="Proof" className="max-h-96 object-contain" />
            </div>
            <div className="flex justify-between items-center pt-2">
              <a
                href={selectedProofUrl}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-blue-400 hover:underline flex items-center gap-1"
              >
                Open Original Image <ExternalLink className="h-3 w-3" />
              </a>
              <button
                onClick={() => setSelectedProofUrl(null)}
                className="px-4 py-1.5 bg-[#27272A] text-white rounded text-xs font-medium cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rejection Modal */}
      {rejectingSubId && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <form onSubmit={handleRejectSubmit} className="bg-[#18181B] border border-[#27272A] rounded-xl max-w-md w-full p-6 space-y-4">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <XCircle className="h-5 w-5 text-red-500" /> Reject Reward Submission
            </h3>
            <p className="text-xs text-[#A1A1AA]">
              Specify the reason why this proof submission is being rejected. The user will be notified in their profile log.
            </p>
            <div>
              <label className="block text-xs font-medium text-[#A1A1AA] mb-1">Rejection Reason</label>
              <textarea
                required
                rows={3}
                placeholder="e.g. Proof link does not clearly show SQ unboxing tag or review..."
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                className="w-full bg-[#09090B] border border-[#27272A] rounded-md p-2.5 text-xs text-white focus:outline-none focus:border-red-500"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setRejectingSubId(null)}
                className="px-4 py-2 bg-[#27272A] hover:bg-[#3F3F46] text-white rounded text-xs cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white font-medium rounded text-xs cursor-pointer"
              >
                Confirm Rejection
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Reward Type Create/Edit Modal */}
      {showTypeModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <form onSubmit={handleSaveType} className="bg-[#18181B] border border-[#27272A] rounded-xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-[#27272A] pb-3">
              <h3 className="text-base font-bold text-white">
                {editingType ? 'Edit Reward Type' : 'Create New Reward Type'}
              </h3>
              <button type="button" onClick={() => setShowTypeModal(false)} className="text-[#A1A1AA] hover:text-white cursor-pointer">✕</button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-[#A1A1AA] mb-1">Reward Label</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Google Review Reward"
                  value={typeForm.label}
                  onChange={(e) => setTypeForm({ ...typeForm, label: e.target.value })}
                  className="w-full bg-[#09090B] border border-[#27272A] rounded p-2 text-xs text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#A1A1AA] mb-1">Code Alias</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. google_review"
                  value={typeForm.code}
                  onChange={(e) => setTypeForm({ ...typeForm, code: e.target.value })}
                  className="w-full bg-[#09090B] border border-[#27272A] rounded p-2 text-xs text-white font-mono focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[#A1A1AA] mb-1">Credit Value (KES)</label>
                  <input
                    type="number"
                    required
                    min={50}
                    value={typeForm.credit_value_kes}
                    onChange={(e) => setTypeForm({ ...typeForm, credit_value_kes: parseInt(e.target.value) || 0 })}
                    className="w-full bg-[#09090B] border border-[#27272A] rounded p-2 text-xs text-white font-mono focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#A1A1AA] mb-1">Max Submissions</label>
                  <input
                    type="number"
                    min={1}
                    value={typeForm.max_submissions}
                    onChange={(e) => setTypeForm({ ...typeForm, max_submissions: parseInt(e.target.value) || 1 })}
                    className="w-full bg-[#09090B] border border-[#27272A] rounded p-2 text-xs text-white font-mono focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="flex items-center gap-3 pt-2">
                <input
                  type="checkbox"
                  id="req_approval"
                  checked={typeForm.requires_approval}
                  onChange={(e) => setTypeForm({ ...typeForm, requires_approval: e.target.checked })}
                  className="rounded border-[#27272A] bg-[#09090B] text-blue-600 focus:ring-0 cursor-pointer"
                />
                <label htmlFor="req_approval" className="text-xs text-white cursor-pointer select-none">
                  Requires Staff Approval (Uncheck for instant auto-credit)
                </label>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t border-[#27272A]">
              <button
                type="button"
                onClick={() => setShowTypeModal(false)}
                className="px-4 py-2 bg-[#27272A] text-white rounded text-xs cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded text-xs cursor-pointer"
              >
                Save Reward Type
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
