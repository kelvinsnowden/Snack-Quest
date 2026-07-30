import React, { useState } from 'react';
import {
  User,
  Users,
  Clock,
  Heart,
  Settings,
  Bell,
  Sparkles,
  ChevronRight,
  ShieldCheck,
  MapPin
} from 'lucide-react';

import CustomerProfileView from './CustomerProfileView';
import ReferralProgramView from './ReferralProgramView';
import MySubmissions from './MySubmissions';

interface ProfileViewProps {
  customer: any;
  overviewData: any;
  onProfileUpdated: () => void;
  onResubmit?: () => void;
  initialSubTab?: 'profile' | 'referrals' | 'submissions';
}

export default function ProfileView({
  customer,
  overviewData,
  onProfileUpdated,
  onResubmit,
  initialSubTab = 'profile'
}: ProfileViewProps) {
  const [subTab, setSubTab] = useState<'profile' | 'referrals' | 'submissions'>(initialSubTab);

  return (
    <div className="space-y-6">
      {/* Profile Header Header Card */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 shadow-xl relative overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative z-10">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-amber-500 via-orange-500 to-yellow-400 p-0.5 shadow-lg shadow-amber-500/20 shrink-0">
              <div className="w-full h-full bg-slate-950 rounded-[14px] flex items-center justify-center font-black text-amber-400 text-xl">
                {customer?.full_name?.charAt(0) || 'U'}
              </div>
            </div>

            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-extrabold text-white">{customer?.full_name || 'Snack Explorer'}</h2>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 uppercase">
                  {overviewData?.gamification?.level || 'Explorer'}
                </span>
              </div>
              <p className="text-xs text-zinc-400 mt-0.5 flex items-center gap-1">
                <span>{customer?.email || 'customer@snackquests.shop'}</span>
                <span>•</span>
                <span className="flex items-center gap-0.5">
                  <MapPin className="w-3 h-3 text-amber-400" />
                  {customer?.county || 'Nairobi'}, Kenya
                </span>
              </p>
            </div>
          </div>

          {/* Sub Navigation Pills */}
          <div className="bg-slate-950/80 p-1.5 rounded-2xl border border-slate-800 flex items-center gap-1 shrink-0 self-start sm:self-center">
            <button
              onClick={() => setSubTab('profile')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                subTab === 'profile'
                  ? 'bg-amber-500 text-slate-950 shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <User className="w-3.5 h-3.5" />
              <span>Taste Profile</span>
            </button>

            <button
              onClick={() => setSubTab('referrals')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                subTab === 'referrals'
                  ? 'bg-amber-500 text-slate-950 shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>Referrals</span>
            </button>

            <button
              onClick={() => setSubTab('submissions')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                subTab === 'submissions'
                  ? 'bg-amber-500 text-slate-950 shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>Submissions</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main View Switcher */}
      <div className="animate-in fade-in duration-200">
        {subTab === 'profile' && (
          <CustomerProfileView customer={customer} onProfileUpdated={onProfileUpdated} />
        )}

        {subTab === 'referrals' && (
          <ReferralProgramView customerId={customer?.id} referralData={overviewData?.referral} />
        )}

        {subTab === 'submissions' && (
          <MySubmissions
            customerId={customer?.id}
            onResubmit={() => {
              if (onResubmit) onResubmit();
            }}
          />
        )}
      </div>
    </div>
  );
}
