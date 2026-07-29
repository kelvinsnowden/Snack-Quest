import React, { useState, useEffect } from 'react';
import {
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  ExternalLink,
  RefreshCw,
  Search,
  RotateCcw
} from 'lucide-react';

interface MySubmissionsProps {
  customerId: string;
  onResubmit: () => void;
}

export default function MySubmissions({ customerId, onResubmit }: MySubmissionsProps) {
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [statusFilter, setStatusFilter] = useState<string>('All');

  const fetchSubmissions = () => {
    setLoading(true);
    fetch(`/api/v1/customer/portal/submissions?customer_id=${customerId}`)
      .then((res) => (res.ok && res.headers.get('content-type')?.includes('application/json') ? res.json() : null))
      .then((data) => {
        if (data && data.data && Array.isArray(data.data)) {
          setSubmissions(data.data);
        }
        setLoading(false);
      })
      .catch((err) => {
        console.error('Failed to fetch customer submissions', err);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchSubmissions();
  }, [customerId]);

  const filtered = submissions.filter((s) => {
    if (statusFilter === 'All') return true;
    return s.status === statusFilter.toLowerCase();
  });

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-lg">
        <div>
          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-amber-400" />
            <h2 className="text-xl font-bold text-white">My Quest Proof Submissions</h2>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Track real-time verification progress for your uploaded quest proof screenshots and reviews.
          </p>
        </div>

        {/* Filter Buttons */}
        <div className="flex items-center gap-2">
          {['All', 'Pending', 'Approved', 'Rejected'].map((status) => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                statusFilter === status
                  ? 'bg-amber-500 text-slate-950 font-bold'
                  : 'bg-slate-800 text-slate-400 hover:text-white border border-slate-700'
              }`}
            >
              {status}
            </button>
          ))}
        </div>
      </div>

      {/* Submissions List */}
      {loading ? (
        <div className="py-16 text-center text-slate-400">Loading submissions history...</div>
      ) : filtered.length === 0 ? (
        <div className="py-12 text-center bg-slate-900/50 border border-slate-800 rounded-2xl p-8">
          <p className="text-slate-400 text-sm mb-4">No quest submissions found for this filter.</p>
          <button
            onClick={onResubmit}
            className="px-4 py-2 bg-amber-500 text-slate-950 font-bold text-xs rounded-xl hover:bg-amber-400 transition-all"
          >
            Browse & Complete Quests
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map((s) => {
            const isApproved = s.status === 'approved';
            const isPending = s.status === 'pending';
            const isRejected = s.status === 'rejected';

            return (
              <div
                key={s.id}
                className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-lg flex flex-col md:flex-row md:items-center justify-between gap-4 transition-all hover:border-slate-700"
              >
                <div className="flex items-start gap-4">
                  {/* Proof Thumbnail */}
                  <div className="w-16 h-16 rounded-xl bg-slate-800 overflow-hidden border border-slate-700 shrink-0">
                    <img
                      src={s.proof_url}
                      alt="Proof"
                      className="w-full h-full object-cover"
                      onError={(e: any) => {
                        e.target.src =
                          'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=600&q=80';
                      }}
                    />
                  </div>

                  {/* Submission Info */}
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="font-bold text-white text-base">{s.quest_title}</h4>
                      <span className="font-bold text-amber-400 text-xs">
                        +{s.credit_value_kes.toLocaleString()} KES
                      </span>
                    </div>

                    <p className="text-xs text-slate-400">
                      Submitted on: {new Date(s.submitted_at || s.created_at).toLocaleString()}
                    </p>

                    {s.rejection_reason && (
                      <p className="text-xs text-red-400 mt-1 font-medium bg-red-500/10 border border-red-500/20 px-2.5 py-1 rounded-lg inline-block">
                        Rejection Reason: {s.rejection_reason}
                      </p>
                    )}
                  </div>
                </div>

                {/* Status Badge & Actions */}
                <div className="flex items-center gap-3 self-end md:self-center">
                  <span
                    className={`px-3 py-1 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 ${
                      isApproved
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                        : isPending
                        ? 'bg-sky-500/20 text-sky-400 border border-sky-500/30'
                        : 'bg-red-500/20 text-red-400 border border-red-500/30'
                    }`}
                  >
                    {isApproved && <CheckCircle2 className="w-3.5 h-3.5" />}
                    {isPending && <Clock className="w-3.5 h-3.5 animate-spin" />}
                    {isRejected && <XCircle className="w-3.5 h-3.5" />}
                    <span>{s.status}</span>
                  </span>

                  {/* Proof Link */}
                  <a
                    href={s.proof_url}
                    target="_blank"
                    rel="noreferrer"
                    className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl transition-all"
                    title="View Proof Image"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>

                  {/* Resubmit button if rejected */}
                  {isRejected && (
                    <button
                      onClick={onResubmit}
                      className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl flex items-center gap-1 transition-all"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Resubmit</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
