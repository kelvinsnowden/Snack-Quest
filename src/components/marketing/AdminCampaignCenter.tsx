import React, { useState, useEffect } from 'react';
import {
  Megaphone,
  Plus,
  Edit2,
  Trash2,
  Calendar,
  DollarSign,
  FileText,
  Link as LinkIcon,
  CheckCircle2,
  Clock,
  XCircle,
  Search,
  Filter,
  RefreshCw,
  ExternalLink,
  Tag,
  AlertTriangle,
  UploadCloud,
  File,
  Image as ImageIcon,
  Video,
  Check,
  MessageSquare,
  Eye,
  UserCheck
} from 'lucide-react';
import { useApp } from '../../context/AppContext';

export interface CampaignItem {
  id: string;
  title: string;
  status: 'active' | 'scheduled' | 'completed' | 'draft';
  commission_rate_kes: number;
  rules: string;
  assets_url: string;
  deadline: string;
  cta_text: string;
  brand_guidelines: string;
  target_niche: string;
  created_at?: string;
  updated_at?: string;
}

export interface SubmissionItem {
  id: string;
  campaign_id: string;
  campaign_title: string;
  creator_id: string;
  creator_name: string;
  creator_phone: string;
  submission_type: 'document' | 'image' | 'video' | 'link' | 'multi';
  file_url: string;
  file_name: string;
  media_type: string;
  social_link: string;
  notes: string;
  status: 'pending' | 'approved' | 'rejected';
  admin_feedback?: string;
  commission_amount_kes: number;
  created_at: string;
  reviewed_at?: string;
  reviewed_by?: string;
}

export const AdminCampaignCenter: React.FC = () => {
  const { addToast, currentUser } = useApp();
  const [activeTab, setActiveTab] = useState<'campaigns' | 'submissions'>('campaigns');
  const [campaigns, setCampaigns] = useState<CampaignItem[]>([]);
  const [submissions, setSubmissions] = useState<SubmissionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [submissionsLoading, setSubmissionsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [subFilter, setSubFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');

  // Review Feedback Modal
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [selectedSub, setSelectedSub] = useState<SubmissionItem | null>(null);
  const [feedbackInput, setFeedbackInput] = useState('');
  const [reviewingAction, setReviewingAction] = useState<'approve' | 'reject'>('approve');
  const [reviewSubmitting, setReviewSubmitting] = useState(false);

  // Campaign Create/Edit Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<CampaignItem | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Form State
  const [formData, setFormData] = useState({
    title: '',
    status: 'active' as 'active' | 'scheduled' | 'completed' | 'draft',
    commission_rate_kes: 500,
    rules: '',
    assets_url: '',
    deadline: '',
    cta_text: 'Order Now',
    brand_guidelines: '',
    target_niche: 'Food & Lifestyle'
  });

  const fetchCampaigns = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/v1/admin/creator-campaigns');
      const data = await res.json();
      if (res.ok) {
        setCampaigns(data.data || []);
      }
    } catch (e) {
      console.error('Failed to fetch admin campaigns', e);
    } finally {
      setLoading(false);
    }
  };

  const fetchSubmissions = async () => {
    setSubmissionsLoading(true);
    try {
      const res = await fetch('/api/v1/admin/campaign-submissions');
      const data = await res.json();
      if (res.ok) {
        setSubmissions(data.data || []);
      }
    } catch (e) {
      console.error('Failed to fetch submissions', e);
    } finally {
      setSubmissionsLoading(false);
    }
  };

  useEffect(() => {
    fetchCampaigns();
    fetchSubmissions();
  }, []);

  const openReviewModal = (sub: SubmissionItem, action: 'approve' | 'reject') => {
    setSelectedSub(sub);
    setReviewingAction(action);
    setFeedbackInput(
      action === 'approve'
        ? 'Great deliverable! Approved for commission disbursement.'
        : 'Please ensure your post includes tag @SnackQuestKE and video is at least 30 seconds.'
    );
    setReviewModalOpen(true);
  };

  const handleProcessReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSub) return;

    setReviewSubmitting(true);
    try {
      const res = await fetch(`/api/v1/admin/campaign-submissions/${selectedSub.id}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: reviewingAction,
          admin_feedback: feedbackInput,
          staff_user_id: currentUser?.id
        })
      });

      const data = await res.json();
      if (res.ok) {
        addToast({
          type: 'success',
          title: reviewingAction === 'approve' ? 'Submission Approved & Paid!' : 'Feedback Sent',
          message: data.message
        });
        setReviewModalOpen(false);
        fetchSubmissions();
      } else {
        addToast({ type: 'error', title: 'Error', message: data.error || 'Failed to process submission.' });
      }
    } catch (e) {
      addToast({ type: 'error', title: 'Network Error', message: 'Failed to communicate with server.' });
    } finally {
      setReviewSubmitting(false);
    }
  };

  const openCreateModal = () => {
    setEditingCampaign(null);
    setFormData({
      title: '',
      status: 'active',
      commission_rate_kes: 500,
      rules: 'Share unboxing or review video on TikTok/Instagram Reels with your referral link.',
      assets_url: 'https://snackquests.shop/assets/campaigns/default.zip',
      deadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      cta_text: 'Order Swahili Snack Box',
      brand_guidelines: 'Mention authentic gourmet Kenyan ingredients. Tag @SnackQuestKE.',
      target_niche: 'Food & Lifestyle'
    });
    setModalOpen(true);
  };

  const openEditModal = (cmp: CampaignItem) => {
    setEditingCampaign(cmp);
    setFormData({
      title: cmp.title,
      status: cmp.status,
      commission_rate_kes: cmp.commission_rate_kes,
      rules: cmp.rules,
      assets_url: cmp.assets_url,
      deadline: cmp.deadline,
      cta_text: cmp.cta_text,
      brand_guidelines: cmp.brand_guidelines,
      target_niche: cmp.target_niche
    });
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title.trim()) {
      addToast({ type: 'error', title: 'Validation Error', message: 'Campaign title is required.' });
      return;
    }

    setSubmitting(true);
    try {
      const url = editingCampaign
        ? `/api/v1/admin/creator-campaigns/${editingCampaign.id}`
        : '/api/v1/admin/creator-campaigns';
      const method = editingCampaign ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          staff_user_id: currentUser?.id
        })
      });

      const data = await res.json();
      if (res.ok) {
        addToast({
          type: 'success',
          title: editingCampaign ? 'Campaign Updated' : 'Campaign Created',
          message: data.message || 'Campaign saved successfully!'
        });
        setModalOpen(false);
        fetchCampaigns();
      } else {
        addToast({ type: 'error', title: 'Error', message: data.error || 'Failed to save campaign.' });
      }
    } catch (e) {
      addToast({ type: 'error', title: 'Network Error', message: 'Failed to communicate with server.' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (cmp: CampaignItem) => {
    if (!confirm(`Are you sure you want to delete campaign "${cmp.title}"? This cannot be undone.`)) {
      return;
    }

    try {
      const res = await fetch(`/api/v1/admin/creator-campaigns/${cmp.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ staff_user_id: currentUser?.id })
      });
      const data = await res.json();
      if (res.ok) {
        addToast({ type: 'success', title: 'Campaign Deleted', message: data.message });
        fetchCampaigns();
      } else {
        addToast({ type: 'error', title: 'Delete Failed', message: data.error || 'Could not delete campaign.' });
      }
    } catch (e) {
      addToast({ type: 'error', title: 'Network Error', message: 'Failed to delete campaign.' });
    }
  };

  const filteredCampaigns = campaigns.filter((c) => {
    const matchesSearch =
      c.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.target_niche.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.rules.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || c.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const filteredSubmissions = submissions.filter((s) => {
    if (subFilter === 'all') return true;
    return s.status === subFilter;
  });

  const pendingSubmissionsCount = submissions.filter((s) => s.status === 'pending').length;

  return (
    <div className="space-y-6">
      {/* Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-[#27272A] pb-3">
        <button
          onClick={() => setActiveTab('campaigns')}
          className={`px-4 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 transition-all cursor-pointer ${
            activeTab === 'campaigns'
              ? 'bg-amber-500 text-black shadow-lg shadow-amber-500/20'
              : 'bg-[#18181B] text-zinc-400 hover:text-white border border-[#27272A]'
          }`}
        >
          <Megaphone className="h-4 w-4" />
          <span>Campaign Management ({campaigns.length})</span>
        </button>

        <button
          onClick={() => {
            setActiveTab('submissions');
            fetchSubmissions();
          }}
          className={`px-4 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 transition-all cursor-pointer relative ${
            activeTab === 'submissions'
              ? 'bg-amber-500 text-black shadow-lg shadow-amber-500/20'
              : 'bg-[#18181B] text-zinc-400 hover:text-white border border-[#27272A]'
          }`}
        >
          <UploadCloud className="h-4 w-4" />
          <span>Creator Deliverables & Approvals</span>
          {pendingSubmissionsCount > 0 && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-500 text-white animate-pulse">
              {pendingSubmissionsCount} Pending
            </span>
          )}
        </button>
      </div>

      {activeTab === 'campaigns' ? (
        <>
          {/* Header Banner */}
          <div className="bg-[#18181B] border border-[#27272A] rounded-2xl p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <Megaphone className="h-5 w-5 text-amber-400" />
                <h2 className="text-lg font-bold text-white">Admin Creator Campaign Center</h2>
              </div>
              <p className="text-xs text-zinc-400 mt-1">
                Create, manage, and schedule promotional campaigns for affiliate creators & influencers.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={fetchCampaigns}
                className="p-2.5 text-zinc-400 hover:text-white bg-[#09090B] border border-[#27272A] rounded-xl cursor-pointer"
                title="Refresh Campaigns"
              >
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              </button>
              <button
                onClick={openCreateModal}
                className="px-4 py-2.5 bg-amber-500 hover:bg-amber-400 text-black font-extrabold text-xs rounded-xl flex items-center gap-2 cursor-pointer shadow-lg shadow-amber-500/10"
              >
                <Plus className="h-4 w-4" />
                <span>Create New Campaign</span>
              </button>
            </div>
          </div>

          {/* Stats Quick Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-4 bg-[#18181B] border border-[#27272A] rounded-xl space-y-1">
              <span className="text-[10px] text-zinc-400 font-medium block">Total Campaigns</span>
              <span className="text-xl font-bold text-white">{campaigns.length}</span>
            </div>
            <div className="p-4 bg-[#18181B] border border-[#27272A] rounded-xl space-y-1">
              <span className="text-[10px] text-zinc-400 font-medium block">Active Campaigns</span>
              <span className="text-xl font-bold text-emerald-400">
                {campaigns.filter((c) => c.status === 'active').length}
              </span>
            </div>
            <div className="p-4 bg-[#18181B] border border-[#27272A] rounded-xl space-y-1">
              <span className="text-[10px] text-zinc-400 font-medium block">Scheduled / Draft</span>
              <span className="text-xl font-bold text-amber-400">
                {campaigns.filter((c) => c.status === 'scheduled' || c.status === 'draft').length}
              </span>
            </div>
            <div className="p-4 bg-[#18181B] border border-[#27272A] rounded-xl space-y-1">
              <span className="text-[10px] text-zinc-400 font-medium block">Completed</span>
              <span className="text-xl font-bold text-zinc-400">
                {campaigns.filter((c) => c.status === 'completed').length}
              </span>
            </div>
          </div>

          {/* Filter & Search Bar */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-[#18181B] p-4 rounded-xl border border-[#27272A]">
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-zinc-500" />
              <input
                type="text"
                placeholder="Search campaign title, niche..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-[#09090B] border border-[#27272A] rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500"
              />
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto text-xs">
              {['all', 'active', 'scheduled', 'completed', 'draft'].map((st) => (
                <button
                  key={st}
                  onClick={() => setStatusFilter(st)}
                  className={`px-3 py-1.5 rounded-lg capitalize transition-colors cursor-pointer ${
                    statusFilter === st
                      ? 'bg-amber-500 text-black font-bold'
                      : 'bg-[#09090B] text-zinc-400 hover:text-white border border-[#27272A]'
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>
          </div>

          {/* Campaign Cards List */}
          {loading ? (
            <div className="p-12 text-center text-xs text-zinc-500 flex items-center justify-center gap-2">
              <RefreshCw className="h-4 w-4 animate-spin text-amber-500" />
              <span>Loading campaigns from database...</span>
            </div>
          ) : filteredCampaigns.length === 0 ? (
            <div className="p-12 bg-[#18181B] border border-[#27272A] rounded-2xl text-center space-y-3">
              <Megaphone className="h-10 w-10 text-zinc-600 mx-auto" />
              <h3 className="text-sm font-bold text-white">No campaigns found</h3>
              <p className="text-xs text-zinc-400 max-w-sm mx-auto">
                {searchQuery || statusFilter !== 'all'
                  ? 'No campaigns match your filter criteria.'
                  : 'Create your first creator campaign to start attracting affiliate influencers.'}
              </p>
              <button
                onClick={openCreateModal}
                className="px-4 py-2 bg-amber-500 text-black font-bold text-xs rounded-xl cursor-pointer"
              >
                + Create Campaign
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredCampaigns.map((cmp) => (
                <div
                  key={cmp.id}
                  className="bg-[#18181B] border border-[#27272A] rounded-2xl p-5 space-y-4 hover:border-zinc-700 transition-colors"
                >
                  {/* Card Header */}
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`px-2.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                            cmp.status === 'active'
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                              : cmp.status === 'scheduled'
                              ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                              : cmp.status === 'completed'
                              ? 'bg-zinc-800 text-zinc-400 border border-zinc-700'
                              : 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                          }`}
                        >
                          {cmp.status}
                        </span>
                        <span className="text-[10px] text-zinc-500 font-mono">#{cmp.id}</span>
                      </div>
                      <h3 className="text-sm font-bold text-white mt-1.5">{cmp.title}</h3>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => openEditModal(cmp)}
                        className="p-1.5 text-zinc-400 hover:text-amber-400 bg-[#09090B] border border-[#27272A] rounded-lg cursor-pointer"
                        title="Edit Campaign"
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(cmp)}
                        className="p-1.5 text-zinc-400 hover:text-rose-400 bg-[#09090B] border border-[#27272A] rounded-lg cursor-pointer"
                        title="Delete Campaign"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Commission & Details */}
                  <div className="grid grid-cols-2 gap-2 text-xs bg-[#09090B] p-3 rounded-xl border border-[#27272A]">
                    <div>
                      <span className="text-[10px] text-zinc-500 block">Commission Rate</span>
                      <span className="font-extrabold text-emerald-400 text-sm">
                        KSh {cmp.commission_rate_kes.toLocaleString()} / sale
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-zinc-500 block">Deadline</span>
                      <span className="font-semibold text-white flex items-center gap-1">
                        <Calendar className="h-3 w-3 text-amber-400" />
                        <span>{cmp.deadline}</span>
                      </span>
                    </div>
                  </div>

                  <div className="space-y-1.5 text-xs text-zinc-300">
                    <p>
                      <strong className="text-zinc-400">Rules:</strong> {cmp.rules}
                    </p>
                    <p>
                      <strong className="text-zinc-400">Guidelines:</strong> {cmp.brand_guidelines}
                    </p>
                  </div>

                  {/* Card Footer */}
                  <div className="flex items-center justify-between text-xs pt-3 border-t border-[#27272A] text-zinc-400">
                    <span className="px-2 py-0.5 bg-zinc-800 text-zinc-300 rounded text-[10px]">
                      Niche: {cmp.target_niche}
                    </span>

                    {cmp.assets_url && (
                      <a
                        href={cmp.assets_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-amber-400 hover:underline flex items-center gap-1 font-semibold text-[11px]"
                      >
                        <ExternalLink className="h-3 w-3" />
                        <span>Assets Link</span>
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        /* CREATOR DELIVERABLES & SUBMISSIONS TAB */
        <div className="space-y-6">
          <div className="bg-[#18181B] border border-[#27272A] rounded-2xl p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <UploadCloud className="h-5 w-5 text-amber-400" />
                <h2 className="text-lg font-bold text-white">Creator Deliverables Review & Approvals</h2>
              </div>
              <p className="text-xs text-zinc-400 mt-1">
                Inspect creator documents, photos, videos, and proof links before approving wallet payment disbursement.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={fetchSubmissions}
                className="p-2.5 text-zinc-400 hover:text-white bg-[#09090B] border border-[#27272A] rounded-xl cursor-pointer flex items-center gap-2 text-xs"
              >
                <RefreshCw className={`h-4 w-4 ${submissionsLoading ? 'animate-spin' : ''}`} />
                <span>Refresh List</span>
              </button>
            </div>
          </div>

          {/* Submissions Filter */}
          <div className="flex items-center gap-2 bg-[#18181B] p-4 rounded-xl border border-[#27272A] text-xs">
            <span className="text-zinc-400 font-semibold">Filter Status:</span>
            {(['all', 'pending', 'approved', 'rejected'] as const).map((st) => (
              <button
                key={st}
                onClick={() => setSubFilter(st)}
                className={`px-3 py-1.5 rounded-lg capitalize font-bold transition-all cursor-pointer ${
                  subFilter === st
                    ? 'bg-amber-500 text-black'
                    : 'bg-[#09090B] text-zinc-400 hover:text-white border border-[#27272A]'
                }`}
              >
                {st} ({st === 'all' ? submissions.length : submissions.filter((s) => s.status === st).length})
              </button>
            ))}
          </div>

          {/* Submissions List */}
          {submissionsLoading ? (
            <div className="p-12 text-center text-xs text-zinc-500 flex items-center justify-center gap-2">
              <RefreshCw className="h-4 w-4 animate-spin text-amber-500" />
              <span>Loading creator deliverables...</span>
            </div>
          ) : filteredSubmissions.length === 0 ? (
            <div className="p-12 bg-[#18181B] border border-[#27272A] rounded-2xl text-center space-y-3">
              <UploadCloud className="h-10 w-10 text-zinc-600 mx-auto" />
              <h3 className="text-sm font-bold text-white">No creator submissions found</h3>
              <p className="text-xs text-zinc-400 max-w-sm mx-auto">
                No campaign deliverables match the selected filter status.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredSubmissions.map((sub) => (
                <div
                  key={sub.id}
                  className="bg-[#18181B] border border-[#27272A] rounded-2xl p-5 space-y-4 hover:border-zinc-700 transition-colors"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`px-2.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                            sub.status === 'pending'
                              ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                              : sub.status === 'approved'
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                              : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                          }`}
                        >
                          {sub.status}
                        </span>
                        <span className="text-[10px] text-zinc-500 font-mono">#{sub.id}</span>
                      </div>
                      <h4 className="text-sm font-bold text-white mt-1">{sub.campaign_title}</h4>
                    </div>

                    <span className="text-xs font-black text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-lg border border-emerald-500/20">
                      KSh {sub.commission_amount_kes.toLocaleString()}
                    </span>
                  </div>

                  {/* Creator Info */}
                  <div className="bg-[#09090B] p-3 rounded-xl border border-[#27272A] space-y-1 text-xs">
                    <div className="flex justify-between text-zinc-300 font-semibold">
                      <span>Creator: {sub.creator_name}</span>
                      <span className="font-mono text-zinc-400">{sub.creator_phone}</span>
                    </div>
                    <div className="text-zinc-400 text-[11px] flex items-center justify-between">
                      <span>Submitted: {new Date(sub.created_at).toLocaleString()}</span>
                      <span className="uppercase font-mono font-bold text-amber-400">Type: {sub.submission_type}</span>
                    </div>
                  </div>

                  {/* Media Content / Attachment Preview */}
                  <div className="space-y-2 text-xs">
                    <span className="text-[10px] text-zinc-400 font-bold block uppercase tracking-wider">Submitted Deliverable Proof</span>

                    {sub.file_url ? (
                      <div className="bg-[#09090B] p-3 rounded-xl border border-[#27272A]">
                        {sub.submission_type === 'image' || sub.file_url.match(/\.(jpg|jpeg|png|webp)/i) ? (
                          <div className="space-y-2">
                            <img
                              src={sub.file_url}
                              alt="Deliverable"
                              className="w-full h-40 object-cover rounded-lg border border-zinc-800"
                            />
                            <a
                              href={sub.file_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-amber-400 hover:underline text-[11px] font-semibold flex items-center gap-1"
                            >
                              <Eye className="h-3.5 w-3.5" />
                              <span>View Full Size Image</span>
                            </a>
                          </div>
                        ) : sub.submission_type === 'video' || sub.file_url.match(/\.(mp4|webm|mov)/i) ? (
                          <div className="space-y-2">
                            <video
                              src={sub.file_url}
                              controls
                              className="w-full max-h-48 rounded-lg border border-zinc-800 bg-black"
                            />
                            <a
                              href={sub.file_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-amber-400 hover:underline text-[11px] font-semibold flex items-center gap-1"
                            >
                              <Video className="h-3.5 w-3.5" />
                              <span>Open Video Player Link</span>
                            </a>
                          </div>
                        ) : (
                          <a
                            href={sub.file_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-amber-400 hover:underline flex items-center gap-2 p-2 bg-zinc-900 rounded-lg font-mono text-[11px]"
                          >
                            <FileText className="h-4 w-4 text-amber-400 shrink-0" />
                            <span className="truncate">{sub.file_name || 'Download Document Attachment'}</span>
                          </a>
                        )}
                      </div>
                    ) : null}

                    {sub.social_link && (
                      <div className="flex items-center justify-between p-2.5 bg-[#09090B] border border-[#27272A] rounded-xl text-xs">
                        <span className="text-zinc-400 font-semibold flex items-center gap-1.5">
                          <ExternalLink className="h-3.5 w-3.5 text-amber-400" />
                          <span>Social Post URL:</span>
                        </span>
                        <a
                          href={sub.social_link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-amber-400 hover:underline font-mono text-[11px] truncate max-w-[200px]"
                        >
                          {sub.social_link}
                        </a>
                      </div>
                    )}

                    {sub.notes && (
                      <p className="text-zinc-300 text-xs bg-[#09090B] p-2.5 rounded-xl border border-[#27272A]">
                        <strong className="text-amber-400">Creator Note:</strong> {sub.notes}
                      </p>
                    )}
                  </div>

                  {/* Feedback / Review Footer */}
                  {sub.admin_feedback && (
                    <div className="p-3 bg-[#09090B] border border-amber-500/20 rounded-xl text-xs space-y-1">
                      <span className="text-amber-400 font-bold block">Admin Feedback:</span>
                      <p className="text-zinc-300">{sub.admin_feedback}</p>
                    </div>
                  )}

                  <div className="pt-3 border-t border-[#27272A] flex items-center justify-between gap-2">
                    <span className="text-[11px] text-zinc-500 font-mono">
                      {sub.reviewed_at ? `Reviewed: ${new Date(sub.reviewed_at).toLocaleDateString()}` : 'Awaiting Review'}
                    </span>

                    {sub.status === 'pending' ? (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => openReviewModal(sub, 'reject')}
                          className="px-3 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 font-bold text-xs rounded-xl cursor-pointer flex items-center gap-1"
                        >
                          <XCircle className="h-3.5 w-3.5" />
                          <span>Reject & Feedback</span>
                        </button>
                        <button
                          onClick={() => openReviewModal(sub, 'approve')}
                          className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-black font-extrabold text-xs rounded-xl cursor-pointer flex items-center gap-1 shadow-lg shadow-emerald-500/20"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          <span>Approve & Disburse</span>
                        </button>
                      </div>
                    ) : (
                      <span className="text-xs font-bold text-zinc-400 capitalize">Status: {sub.status}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ADMIN REVIEW SUBMISSION MODAL */}
      {reviewModalOpen && selectedSub && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#18181B] border border-[#27272A] rounded-2xl max-w-md w-full p-6 space-y-4 text-xs shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#27272A] pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                {reviewingAction === 'approve' ? (
                  <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                ) : (
                  <XCircle className="h-5 w-5 text-rose-400" />
                )}
                <span>
                  {reviewingAction === 'approve' ? 'Approve Campaign & Pay Commission' : 'Reject & Provide Feedback'}
                </span>
              </h3>
              <button
                onClick={() => setReviewModalOpen(false)}
                className="p-1 text-zinc-400 hover:text-white cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="bg-[#09090B] p-3 rounded-xl border border-[#27272A] space-y-1">
              <p className="text-white font-bold">{selectedSub.campaign_title}</p>
              <p className="text-zinc-400">Creator: {selectedSub.creator_name} ({selectedSub.creator_phone})</p>
              <p className="text-emerald-400 font-extrabold">
                Commission Payout: KSh {selectedSub.commission_amount_kes.toLocaleString()}
              </p>
            </div>

            <form onSubmit={handleProcessReview} className="space-y-4">
              <div>
                <label className="text-zinc-300 font-semibold block mb-1">
                  {reviewingAction === 'approve' ? 'Approval Message & Note:' : 'Rejection Reason & Required Revision:'}
                </label>
                <textarea
                  rows={3}
                  required
                  value={feedbackInput}
                  onChange={(e) => setFeedbackInput(e.target.value)}
                  placeholder="Enter feedback for creator..."
                  className="w-full bg-[#09090B] border border-[#27272A] text-white rounded-xl p-3 focus:outline-none text-xs"
                />
              </div>

              {reviewingAction === 'approve' && (
                <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-300 text-[11px] flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-emerald-400 shrink-0" />
                  <span>Approving will instantly credit KSh {selectedSub.commission_amount_kes} into creator's Quest Wallet.</span>
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setReviewModalOpen(false)}
                  className="w-1/2 py-2.5 bg-[#27272A] text-zinc-300 font-bold rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={reviewSubmitting}
                  className={`w-1/2 py-2.5 font-extrabold text-black rounded-xl cursor-pointer flex items-center justify-center gap-2 shadow-lg ${
                    reviewingAction === 'approve'
                      ? 'bg-emerald-500 hover:bg-emerald-400 shadow-emerald-500/20'
                      : 'bg-rose-500 hover:bg-rose-400 shadow-rose-500/20'
                  }`}
                >
                  {reviewSubmitting ? (
                    <RefreshCw className="h-4 w-4 animate-spin" />
                  ) : (
                    <span>{reviewingAction === 'approve' ? 'Approve & Credit' : 'Send Rejection'}</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
