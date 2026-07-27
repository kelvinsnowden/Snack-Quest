import React, { useState, useEffect } from 'react';
import {
  Users,
  Trophy,
  AlertTriangle,
  Gift,
  Search,
  ShieldAlert,
  CheckCircle2,
  DollarSign
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { AdminWithdrawalsQueue } from './AdminWithdrawalsQueue';

export const ReferralManager: React.FC = () => {
  const { checkPermission, currentUser } = useApp();
  const canView = checkPermission('referrals', 'view');
  const canApprove = checkPermission('referrals', 'approve');

  const [activeTab, setActiveTab] = useState<'withdrawals' | 'queue' | 'leaderboard'>('withdrawals');
  const [referrals, setReferrals] = useState<any[]>([]);
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  const fetchReferrals = async () => {
    try {
      const res = await fetch('/api/v1/referrals');
      const data = await res.json();
      setReferrals(data.data || []);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchLeaderboard = async () => {
    try {
      const res = await fetch('/api/v1/referrals/leaderboard');
      const data = await res.json();
      setLeaderboard(data.data || []);
    } catch (e) {
      console.error(e);
    }
  };

  const loadData = async () => {
    setLoading(true);
    await Promise.all([fetchReferrals(), fetchLeaderboard()]);
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleRewardBonus = async (id: string) => {
    if (!canApprove) return alert('Permission denied');
    try {
      const res = await fetch(`/api/v1/referrals/${id}/reward`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ staff_user_id: currentUser?.id })
      });
      if (res.ok) {
        await loadData();
      } else {
        const err = await res.json();
        alert(err.error || 'Failed to reward referral bonus');
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleFlagFraud = async (id: string) => {
    if (!confirm('Are you sure you want to flag this referral as fraudulent?')) return;
    try {
      const res = await fetch(`/api/v1/referrals/${id}/flag-fraud`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ staff_user_id: currentUser?.id })
      });
      if (res.ok) {
        await loadData();
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
        <p className="text-sm mt-1">You do not have permissions to view Referral Engine.</p>
      </div>
    );
  }

  const filteredReferrals = referrals.filter((r) => {
    return (
      r.referrer_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.referred_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.referral_code_used?.toLowerCase().includes(searchQuery.toLowerCase())
    );
  });

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            <Users className="h-6 w-6 text-purple-500" /> Referral Engine & Advocate Leaderboard
          </h1>
          <p className="text-xs text-[#A1A1AA]">
            Track peer referral codes, qualify first orders, reward advocates with KES credits, and flag fraud.
          </p>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex border-b border-[#27272A] gap-6">
        <button
          onClick={() => setActiveTab('withdrawals')}
          className={`pb-3 text-sm font-medium transition-colors border-b-2 cursor-pointer flex items-center gap-1.5 ${
            activeTab === 'withdrawals'
              ? 'border-emerald-500 text-emerald-400 font-bold'
              : 'border-transparent text-[#A1A1AA] hover:text-white'
          }`}
        >
          <DollarSign className="w-4 h-4 text-emerald-400" />
          <span>Affiliate Cash Withdrawals</span>
        </button>
        <button
          onClick={() => setActiveTab('queue')}
          className={`pb-3 text-sm font-medium transition-colors border-b-2 cursor-pointer ${
            activeTab === 'queue'
              ? 'border-purple-500 text-white font-semibold'
              : 'border-transparent text-[#A1A1AA] hover:text-white'
          }`}
        >
          Referrals Activity Queue ({referrals.length})
        </button>
        <button
          onClick={() => setActiveTab('leaderboard')}
          className={`pb-3 text-sm font-medium transition-colors border-b-2 cursor-pointer ${
            activeTab === 'leaderboard'
              ? 'border-purple-500 text-white font-semibold'
              : 'border-transparent text-[#A1A1AA] hover:text-white'
          }`}
        >
          Advocate Leaderboard Top Rankings
        </button>
      </div>

      {activeTab === 'withdrawals' && <AdminWithdrawalsQueue />}

      {activeTab === 'queue' && (
        <div className="space-y-4">
          {/* Search Bar */}
          <div className="bg-[#18181B] p-4 rounded-lg border border-[#27272A]">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-[#71717A]" />
              <input
                type="text"
                placeholder="Search by advocate name, referred customer, or code..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-[#09090B] border border-[#27272A] rounded-md pl-9 pr-3 py-2 text-xs text-white placeholder-[#71717A] focus:outline-none focus:border-purple-500"
              />
            </div>
          </div>

          {/* Queue Table */}
          <div className="bg-[#18181B] border border-[#27272A] rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-[#FAFAFA]">
                <thead className="bg-[#09090B] text-[#71717A] font-semibold border-b border-[#27272A] uppercase tracking-wider">
                  <tr>
                    <th className="p-4">Advocate (Referrer)</th>
                    <th className="p-4">Referral Code</th>
                    <th className="p-4">Referred Customer</th>
                    <th className="p-4">Qualifying Order</th>
                    <th className="p-4">Status</th>
                    <th className="p-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#27272A]">
                  {loading ? (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-[#71717A]">
                        Loading referrals...
                      </td>
                    </tr>
                  ) : filteredReferrals.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-[#71717A]">
                        No referrals found.
                      </td>
                    </tr>
                  ) : (
                    filteredReferrals.map((ref) => (
                      <tr key={ref.id} className="hover:bg-[#27272A]/40 transition-colors">
                        <td className="p-4 font-semibold text-white">{ref.referrer_name}</td>
                        <td className="p-4 font-mono">
                          <span className="px-2 py-1 bg-purple-950 text-purple-300 rounded font-bold border border-purple-800/40">
                            {ref.referral_code_used}
                          </span>
                        </td>
                        <td className="p-4 text-white font-medium">{ref.referred_name}</td>
                        <td className="p-4 font-mono text-[#A1A1AA]">
                          {ref.qualifying_order_id ? `#${ref.qualifying_order_id}` : 'No order yet'}
                        </td>
                        <td className="p-4">
                          {ref.status === 'rewarded' && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-950 text-emerald-400 border border-emerald-800/50">
                              <CheckCircle2 className="h-3 w-3" /> Rewarded (500 KES)
                            </span>
                          )}
                          {ref.status === 'pending' && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-950 text-amber-400 border border-amber-800/50">
                              Pending First Order
                            </span>
                          )}
                          {ref.status === 'fraud_flagged' && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-red-950 text-red-400 border border-red-800/50">
                              <AlertTriangle className="h-3 w-3" /> Fraud Flagged
                            </span>
                          )}
                        </td>
                        <td className="p-4 text-right">
                          {ref.status !== 'rewarded' && ref.status !== 'fraud_flagged' && (
                            <div className="flex items-center justify-end gap-2">
                              {canApprove && (
                                <button
                                  onClick={() => handleRewardBonus(ref.id)}
                                  className="px-2.5 py-1 bg-purple-600 hover:bg-purple-500 text-white rounded text-[11px] font-medium cursor-pointer transition-colors flex items-center gap-1"
                                >
                                  <Gift className="h-3 w-3" /> Grant 500 KES
                                </button>
                              )}
                              <button
                                onClick={() => handleFlagFraud(ref.id)}
                                className="px-2.5 py-1 bg-red-950 hover:bg-red-900 text-red-400 border border-red-800/50 rounded text-[11px] font-medium cursor-pointer transition-colors"
                              >
                                Flag Fraud
                              </button>
                            </div>
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

      {activeTab === 'leaderboard' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {leaderboard.slice(0, 3).map((cust, idx) => (
              <div
                key={cust.customer_id}
                className={`bg-[#18181B] border rounded-xl p-5 relative overflow-hidden flex flex-col justify-between ${
                  idx === 0
                    ? 'border-amber-500/60 shadow-lg shadow-amber-950/20'
                    : idx === 1
                    ? 'border-gray-400/60'
                    : 'border-amber-700/60'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={`inline-flex items-center justify-center w-8 h-8 rounded-full font-extrabold text-xs ${
                      idx === 0
                        ? 'bg-amber-500 text-black'
                        : idx === 1
                        ? 'bg-gray-300 text-black'
                        : 'bg-amber-700 text-white'
                    }`}
                  >
                    #{idx + 1}
                  </span>
                  <Trophy className={`h-6 w-6 ${idx === 0 ? 'text-amber-400' : 'text-[#71717A]'}`} />
                </div>
                <div className="mt-4">
                  <h3 className="text-lg font-bold text-white">{cust.full_name}</h3>
                  <div className="text-xs font-mono text-[#A1A1AA]">{cust.phone}</div>
                </div>
                <div className="mt-4 pt-3 border-t border-[#27272A] flex items-center justify-between text-xs">
                  <div>
                    <div className="text-[#71717A]">Total Referrals</div>
                    <div className="text-base font-extrabold text-purple-400 font-mono">{cust.total_referrals}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[#71717A]">Credits Earned</div>
                    <div className="text-base font-extrabold text-emerald-400 font-mono">
                      +{(cust.lifetime_credits_earned / 100).toLocaleString()} KES
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Full Leaderboard Table */}
          <div className="bg-[#18181B] border border-[#27272A] rounded-lg overflow-hidden">
            <div className="p-4 border-b border-[#27272A] bg-[#09090B]">
              <h2 className="text-sm font-bold text-white uppercase tracking-wider">
                Complete Advocate Leaderboard
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-[#FAFAFA]">
                <thead className="bg-[#09090B] text-[#71717A] font-semibold border-b border-[#27272A] uppercase">
                  <tr>
                    <th className="p-4">Rank</th>
                    <th className="p-4">Customer Advocate</th>
                    <th className="p-4">Referral Code</th>
                    <th className="p-4">Successful Referrals</th>
                    <th className="p-4 text-right">Lifetime Quest Credits Earned</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#27272A]">
                  {leaderboard.map((cust, idx) => (
                    <tr key={cust.customer_id} className="hover:bg-[#27272A]/40 transition-colors">
                      <td className="p-4 font-bold font-mono text-[#A1A1AA]">#{idx + 1}</td>
                      <td className="p-4 font-semibold text-white">
                        {cust.full_name} <span className="text-[10px] text-[#71717A] font-normal font-mono">({cust.phone})</span>
                      </td>
                      <td className="p-4 font-mono text-purple-300 font-bold">{cust.referral_code}</td>
                      <td className="p-4 font-mono font-bold text-white">{cust.total_referrals} referrals</td>
                      <td className="p-4 text-right font-mono font-bold text-emerald-400">
                        +{(cust.lifetime_credits_earned / 100).toLocaleString()} KES
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
