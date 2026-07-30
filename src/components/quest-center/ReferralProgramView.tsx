import React, { useState, useEffect } from 'react';
import {
  Users,
  Copy,
  Share2,
  CheckCircle2,
  Sparkles,
  Trophy,
  MessageCircle,
  Twitter,
  Facebook,
  QrCode,
  Award,
  Zap,
  ArrowRight
} from 'lucide-react';

interface ReferralProgramViewProps {
  customerId: string;
  referralData: any;
}

export default function ReferralProgramView({ customerId, referralData }: ReferralProgramViewProps) {
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [friendsList, setFriendsList] = useState<any[]>([]);
  const [loadingFriends, setLoadingFriends] = useState(true);

  const referralCode = referralData?.referral_code || 'WANJ123';
  const referralLink = referralData?.referral_link || `https://snackquests.shop/join?ref=${referralCode}`;

  const copyCode = () => {
    navigator.clipboard.writeText(referralCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const copyLink = () => {
    navigator.clipboard.writeText(referralLink);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  // Load customer's invited friends list
  useEffect(() => {
    setLoadingFriends(true);
    fetch(`/api/v1/referrals?referrer_customer_id=${customerId}`)
      .then((res) => (res.ok && res.headers.get('content-type')?.includes('application/json') ? res.json() : null))
      .then((data) => {
        if (data && data.data && Array.isArray(data.data)) {
          setFriendsList(data.data);
        }
        setLoadingFriends(false);
      })
      .catch((err) => {
        console.error('Failed to load referrals', err);
        setLoadingFriends(false);
      });
  }, [customerId]);

  const shareText = encodeURIComponent(
    `Hey! I love Snack Quest mystery boxes. Use my link to get 250 KES off your first order: ${referralLink}`
  );

  return (
    <div className="space-y-6">
      {/* Hero Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-purple-900/40 via-slate-900 to-amber-950/40 border border-purple-500/30 p-6 md:p-8 shadow-2xl">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-purple-500 text-white uppercase tracking-wider">
                Snack Quest Advocate Engine
              </span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
              Invite Friends & Get Free Snack Boxes 🎁
            </h2>
            <p className="text-sm text-slate-300 mt-1 max-w-xl">
              Give your friend <strong className="text-amber-400">250 KES off</strong> their first mystery box. You earn <strong className="text-amber-400">500 KES Quest Credits</strong> as soon as their first order is confirmed!
            </p>
          </div>

          <div className="p-4 bg-slate-950/80 border border-slate-800 rounded-2xl md:w-64 text-center">
            <span className="text-xs text-slate-400 uppercase font-semibold">Referral Credits Earned</span>
            <div className="text-3xl font-black text-purple-400 mt-1">
              {(referralData?.credits_earned_kes || 0).toLocaleString()} <span className="text-sm font-bold">KES</span>
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              {referralData?.qualified_referrals || 0} friends qualified
            </p>
          </div>
        </div>
      </div>

      {/* Referral Link & Code Controls */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Box 1: Referral Code & Link */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
          <h3 className="font-bold text-white text-base flex items-center gap-2">
            <Zap className="w-4 h-4 text-amber-400" />
            <span>Your Personal Invite Details</span>
          </h3>

          <div>
            <label className="text-xs font-semibold text-slate-400 block mb-1">Referral Code</label>
            <div className="flex items-center justify-between bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5">
              <span className="font-mono text-lg font-bold text-amber-300 tracking-wider">{referralCode}</span>
              <button
                onClick={copyCode}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-lg flex items-center gap-1.5 transition-all"
              >
                {copiedCode ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedCode ? 'Copied!' : 'Copy Code'}</span>
              </button>
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-400 block mb-1">Direct Share URL</label>
            <div className="flex items-center justify-between bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs">
              <span className="text-slate-300 font-mono truncate mr-2 text-[11px]">{referralLink}</span>
              <button
                onClick={copyLink}
                className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold rounded-lg flex items-center gap-1.5 transition-all shrink-0"
              >
                {copiedLink ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedLink ? 'Copied!' : 'Copy Link'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Box 2: Instant Social Share Buttons */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col justify-between">
          <div>
            <h3 className="font-bold text-white text-base flex items-center gap-2 mb-3">
              <Share2 className="w-4 h-4 text-purple-400" />
              <span>Share Directly to Social Apps</span>
            </h3>
            <p className="text-xs text-slate-300 mb-4">
              Click below to send your pre-formatted invite link directly to your WhatsApp groups, Facebook, or SMS!
            </p>

            <div className="grid grid-cols-2 gap-3">
              {/* WhatsApp */}
              <a
                href={`https://wa.me/?text=${shareText}`}
                target="_blank"
                rel="noreferrer"
                className="py-2.5 px-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-600/20"
              >
                <MessageCircle className="w-4 h-4" />
                <span>WhatsApp</span>
              </a>

              {/* Twitter / X */}
              <a
                href={`https://twitter.com/intent/tweet?text=${shareText}`}
                target="_blank"
                rel="noreferrer"
                className="py-2.5 px-3 bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-sky-600/20"
              >
                <Twitter className="w-4 h-4" />
                <span>Twitter / X</span>
              </a>

              {/* Facebook */}
              <a
                href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(referralLink)}`}
                target="_blank"
                rel="noreferrer"
                className="py-2.5 px-3 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-blue-600/20"
              >
                <Facebook className="w-4 h-4" />
                <span>Facebook</span>
              </a>

              {/* SMS / Direct Message */}
              <a
                href={`sms:?body=${shareText}`}
                className="py-2.5 px-3 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs rounded-xl border border-slate-700 flex items-center justify-center gap-2 transition-all"
              >
                <Zap className="w-4 h-4 text-amber-400" />
                <span>SMS Invite</span>
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* Friends Activity & Qualified Referrals Cards */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
        <h3 className="font-bold text-white text-lg">My Invited Friends & Status</h3>

        {loadingFriends ? (
          <div className="py-8 text-center text-xs text-slate-400">Loading referral records...</div>
        ) : friendsList.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-400 bg-slate-950 rounded-2xl p-6 border border-slate-800">
            You haven't invited any friends yet. Share your link on WhatsApp to start earning!
          </div>
        ) : (
          <div className="space-y-3">
            {friendsList.map((ref) => {
              const isRewarded = ref.status === 'rewarded' || ref.status === 'qualified';

              return (
                <div
                  key={ref.id}
                  className="bg-slate-950 border border-slate-800 rounded-2xl p-4 flex items-center justify-between gap-3 transition-all"
                >
                  <div className="space-y-1">
                    <h4 className="font-bold text-white text-sm">{ref.referred_customer_name || 'Friend Customer'}</h4>
                    <p className="text-[10px] text-slate-400 font-mono">
                      Joined: {new Date(ref.created_at).toLocaleDateString()}
                    </p>
                  </div>

                  <div className="text-right space-y-1">
                    <span
                      className={`px-2.5 py-0.5 rounded-lg text-[10px] font-bold uppercase inline-block ${
                        isRewarded
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                          : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                      }`}
                    >
                      {ref.status?.toUpperCase() || 'PENDING'}
                    </span>
                    <p className="text-xs font-black text-amber-400">
                      {isRewarded ? '+500 KES' : '0 KES (Pending)'}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
