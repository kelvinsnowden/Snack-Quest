import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  CheckCircle2,
  ArrowRight,
  ShieldCheck,
  Lock,
  MessageSquare,
  Smartphone,
  Copy,
  Share2,
  ChevronRight,
  DollarSign,
  TrendingUp,
  Award,
  Users,
  QrCode,
  AlertCircle,
  HelpCircle,
  RefreshCw,
  Eye,
  EyeOff,
  User,
  Zap,
  Globe,
  Gift,
  Star,
  Layers,
  FileText,
  LogOut,
  Shield,
  Check,
  ShoppingBag,
  Megaphone,
  Wallet,
  Bell,
  Send,
  Clock,
  XCircle,
  ExternalLink,
  Download,
  Search,
  Filter,
  PhoneCall,
  UploadCloud,
  Video,
  Image
} from 'lucide-react';
import { useApp } from '../../context/AppContext';

export const CreatorPortalAuth: React.FC<{ onComplete?: (creator: any) => void }> = ({ onComplete }) => {
  const { addToast } = useApp();

  // Mode: 'landing' | 'register' | 'otp' | 'login' | 'magic_login' | 'forgot_password' | 'onboarding' | 'dashboard' | 'admin'
  const [viewMode, setViewMode] = useState<
    'landing' | 'register' | 'otp' | 'login' | 'magic_login' | 'forgot_password' | 'onboarding' | 'dashboard' | 'admin'
  >('landing');

  // Authenticated Creator Session State
  const [currentCreator, setCurrentCreator] = useState<any>(null);

  // Registration Form State
  const [regForm, setRegForm] = useState({
    first_name: '',
    last_name: '',
    whatsapp_number: '',
    email: '',
    password: '',
    confirm_password: '',
    county: 'Nairobi',
    preferred_language: 'English',
    referral_code: '',
    terms_accepted: true,
    marketing_consent: true
  });
  const [showPassword, setShowPassword] = useState(false);
  const [regLoading, setRegLoading] = useState(false);

  // OTP State
  const [otpCode, setOtpCode] = useState('');
  const [otpCreatorId, setOtpCreatorId] = useState('');
  const [otpPhone, setOtpPhone] = useState('');
  const [otpResendTimer, setOtpResendTimer] = useState(180);
  const [otpDemoCode, setOtpDemoCode] = useState('749210');
  const [otpLoading, setOtpLoading] = useState(false);

  // Login Form State
  const [loginForm, setLoginForm] = useState({
    identifier: '',
    password: '',
    remember_me: true
  });
  const [loginLoading, setLoginLoading] = useState(false);

  // Magic Login State
  const [magicPhone, setMagicPhone] = useState('');
  const [magicLinkGenerated, setMagicLinkGenerated] = useState('');
  const [magicLoading, setMagicLoading] = useState(false);

  // Onboarding Wizard State (Steps 1 to 7)
  const [onboardingStep, setOnboardingStep] = useState(1);
  const [profileForm, setProfileForm] = useState({
    bio: '',
    niche: 'Food & Lifestyle',
    followers_range: '10,000 - 50,000',
    payment_preference: 'M-Pesa Express',
    social_tiktok: '@',
    social_instagram: '@',
    social_youtube: '',
    social_facebook: '',
    social_x: '@'
  });

  // Admin View State
  const [adminCreators, setAdminCreators] = useState<any[]>([]);
  const [adminLoading, setAdminLoading] = useState(false);

  // Creator Operating System Active Tab State
  const [creatorTab, setCreatorTab] = useState<
    'overview' | 'earnings' | 'orders' | 'referrals' | 'campaigns' | 'withdrawals' | 'notifications' | 'profile' | 'support'
  >('overview');

  // Creator OS Data States
  const [walletInfo, setWalletInfo] = useState<any>(null);
  const [ordersList, setOrdersList] = useState<any[]>([]);
  const [campaignsList, setCampaignsList] = useState<any[]>([]);
  const [withdrawalsList, setWithdrawalsList] = useState<any[]>([]);
  const [notificationsList, setNotificationsList] = useState<any[]>([]);
  const [analyticsData, setAnalyticsData] = useState<any>(null);
  const [creatorSubmissionsList, setCreatorSubmissionsList] = useState<any[]>([]);

  // Deliverable Submission Form State
  const [submitModalOpen, setSubmitModalOpen] = useState(false);
  const [selectedCampaignForSubmit, setSelectedCampaignForSubmit] = useState<any>(null);
  const [deliverableForm, setDeliverableForm] = useState({
    submission_type: 'image' as 'image' | 'video' | 'document' | 'social_link',
    file_url: '',
    file_name: '',
    social_link: '',
    notes: ''
  });
  const [submittingDeliverable, setSubmittingDeliverable] = useState(false);

  // Withdrawal Form State
  const [withdrawModalOpen, setWithdrawModalOpen] = useState(false);
  const [withdrawForm, setWithdrawForm] = useState({
    amount_kes: 1000,
    method: 'mpesa' as 'mpesa' | 'bank',
    account_number: '',
    bank_name: '',
    notes: ''
  });
  const [withdrawSubmitting, setWithdrawSubmitting] = useState(false);
  const [campaignFilter, setCampaignFilter] = useState<'all' | 'active' | 'scheduled' | 'completed' | 'draft'>('all');

  // Fetch Creator OS Live Data
  const fetchCreatorData = async () => {
    if (!currentCreator) return;
    const cid = currentCreator.id;
    try {
      const [walletRes, ordersRes, campaignsRes, withdrawalsRes, notifsRes, analyticsRes, submissionsRes] = await Promise.all([
        fetch(`/api/v1/affiliate/wallet?customer_id=${cid}`),
        fetch(`/api/v1/affiliate/orders?customer_id=${cid}`),
        fetch('/api/v1/creator/campaigns'),
        fetch(`/api/v1/affiliate/withdrawals?customer_id=${cid}`),
        fetch(`/api/v1/customer/portal/notifications?customer_id=${cid}`),
        fetch(`/api/v1/affiliate/analytics?customer_id=${cid}`),
        fetch(`/api/v1/creator/campaign-submissions?creator_id=${cid}`)
      ]);

      if (walletRes.ok) {
        const wData = await walletRes.json();
        setWalletInfo(wData.wallet);
      }
      if (ordersRes.ok) {
        const oData = await ordersRes.json();
        setOrdersList(oData.data || []);
      }
      if (campaignsRes.ok) {
        const cData = await campaignsRes.json();
        setCampaignsList(cData.data || []);
      }
      if (withdrawalsRes.ok) {
        const wdrData = await withdrawalsRes.json();
        setWithdrawalsList(wdrData.data || []);
      }
      if (notifsRes.ok) {
        const nData = await notifsRes.json();
        setNotificationsList(nData.data || []);
      }
      if (analyticsRes.ok) {
        const aData = await analyticsRes.json();
        setAnalyticsData(aData.data || null);
      }
      if (submissionsRes.ok) {
        const subData = await submissionsRes.json();
        setCreatorSubmissionsList(subData.data || []);
      }
    } catch (err) {
      console.error('Failed to fetch creator OS data:', err);
    }
  };

  const handleOpenSubmitDeliverable = (campaign: any) => {
    setSelectedCampaignForSubmit(campaign);
    setDeliverableForm({
      submission_type: 'image',
      file_url: '',
      file_name: '',
      social_link: '',
      notes: ''
    });
    setSubmitModalOpen(true);
  };

  const handleSubmitDeliverable = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentCreator || !selectedCampaignForSubmit) return;

    if (!deliverableForm.file_url && !deliverableForm.social_link) {
      addToast({
        type: 'error',
        title: 'Missing Media / Link',
        message: 'Please provide either a file/image/video URL or a social post link.'
      });
      return;
    }

    setSubmittingDeliverable(true);
    try {
      const res = await fetch('/api/v1/creator/campaign-submissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaign_id: selectedCampaignForSubmit.id,
          creator_id: currentCreator.id,
          submission_type: deliverableForm.submission_type,
          file_url: deliverableForm.file_url,
          file_name: deliverableForm.file_name || `${deliverableForm.submission_type}_proof`,
          social_link: deliverableForm.social_link,
          notes: deliverableForm.notes
        })
      });

      const data = await res.json();
      if (res.ok) {
        addToast({
          type: 'success',
          title: 'Deliverable Submitted!',
          message: 'Your proof has been submitted to Admin for review & wallet payout.'
        });
        setSubmitModalOpen(false);
        fetchCreatorData();
      } else {
        addToast({
          type: 'error',
          title: 'Submission Failed',
          message: data.error || 'Failed to submit campaign deliverable.'
        });
      }
    } catch (err) {
      addToast({ type: 'error', title: 'Network Error', message: 'Failed to submit deliverable.' });
    } finally {
      setSubmittingDeliverable(false);
    }
  };

  useEffect(() => {
    if (viewMode === 'dashboard' && currentCreator) {
      fetchCreatorData();
    }
  }, [viewMode, currentCreator]);

  // Handle Withdrawal Request
  const handleRequestWithdrawal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentCreator) return;

    const minKes = walletInfo?.min_withdrawal_kes || 1000;
    const availKes = walletInfo?.available_cash_kes || currentCreator?.available_cash || 0;

    if (withdrawForm.amount_kes < minKes) {
      addToast({
        type: 'error',
        title: 'Minimum Amount Not Met',
        message: `Minimum withdrawal is KSh ${minKes.toLocaleString()}.`
      });
      return;
    }

    if (withdrawForm.amount_kes > availKes) {
      addToast({
        type: 'error',
        title: 'Insufficient Balance',
        message: `Available cash balance is KSh ${availKes.toLocaleString()}.`
      });
      return;
    }

    setWithdrawSubmitting(true);
    try {
      const res = await fetch('/api/v1/affiliate/withdraw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_id: currentCreator.id,
          amount_kes: withdrawForm.amount_kes,
          method: withdrawForm.method,
          account_number: withdrawForm.account_number || currentCreator.whatsapp_number,
          notes: withdrawForm.notes
        })
      });
      const data = await res.json();
      if (res.ok) {
        addToast({
          type: 'success',
          title: 'Withdrawal Submitted',
          message: `KSh ${withdrawForm.amount_kes.toLocaleString()} requested! Submitted to Finance Queue for review.`
        });
        setWithdrawModalOpen(false);
        fetchCreatorData();
      } else {
        addToast({ type: 'error', title: 'Withdrawal Failed', message: data.error || 'Failed to submit withdrawal request' });
      }
    } catch (e) {
      addToast({ type: 'error', title: 'Network Error', message: 'Failed to submit withdrawal' });
    } finally {
      setWithdrawSubmitting(false);
    }
  };

  // Password Strength Calculation
  const getPasswordStrength = (pwd: string) => {
    if (!pwd) return { score: 0, label: 'Too Weak', color: 'bg-zinc-700' };
    let score = 0;
    if (pwd.length >= 8) score++;
    if (/[A-Z]/.test(pwd)) score++;
    if (/[0-9]/.test(pwd)) score++;
    if (/[^A-Za-z0-9]/.test(pwd)) score++;

    if (score <= 1) return { score: 1, label: 'Weak', color: 'bg-rose-500' };
    if (score === 2) return { score: 2, label: 'Fair', color: 'bg-amber-500' };
    if (score === 3) return { score: 3, label: 'Strong', color: 'bg-blue-500' };
    return { score: 4, label: 'Ultra-Secure', color: 'bg-emerald-500' };
  };

  // OTP Countdown Timer
  useEffect(() => {
    let timer: any;
    if (viewMode === 'otp' && otpResendTimer > 0) {
      timer = setInterval(() => {
        setOtpResendTimer((prev) => prev - 1);
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [viewMode, otpResendTimer]);

  // Handle Register
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (regForm.password !== regForm.confirm_password) {
      addToast({ type: 'error', title: 'Password Mismatch', message: 'Passwords do not match.' });
      return;
    }
    if (!regForm.terms_accepted) {
      addToast({ type: 'error', title: 'Terms Required', message: 'Please accept Terms & Conditions.' });
      return;
    }

    setRegLoading(true);
    try {
      const res = await fetch('/api/v1/creator-auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(regForm)
      });
      const data = await res.json();
      if (res.ok) {
        addToast({
          type: 'success',
          title: 'Account Created',
          message: 'WhatsApp OTP code sent to your phone!'
        });
        setOtpCreatorId(data.creator_id);
        setOtpPhone(data.whatsapp_number);
        setOtpDemoCode(data.otp_code_demo || '749210');
        setOtpResendTimer(180);
        setViewMode('otp');
      } else {
        addToast({ type: 'error', title: 'Registration Failed', message: data.error || 'Could not register.' });
      }
    } catch (err) {
      addToast({ type: 'error', title: 'Network Error', message: 'Failed to connect to server.' });
    } finally {
      setRegLoading(false);
    }
  };

  // Handle OTP Verification
  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setOtpLoading(true);
    try {
      const res = await fetch('/api/v1/creator-auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ creator_id: otpCreatorId, otp_code: otpCode })
      });
      const data = await res.json();
      if (res.ok) {
        addToast({ type: 'success', title: 'WhatsApp Verified', message: 'Welcome to Snack Quest Creator Program!' });
        setCurrentCreator(data.creator);
        setOnboardingStep(2);
        setViewMode('onboarding');
      } else {
        addToast({ type: 'error', title: 'OTP Failed', message: data.error || 'Invalid OTP code.' });
      }
    } catch (err) {
      addToast({ type: 'error', title: 'Error', message: 'Verification failed.' });
    } finally {
      setOtpLoading(false);
    }
  };

  // Handle Login
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginLoading(true);
    try {
      const res = await fetch('/api/v1/creator-auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          login_identifier: loginForm.identifier,
          password: loginForm.password,
          remember_me: loginForm.remember_me
        })
      });
      const data = await res.json();
      if (res.ok) {
        addToast({ type: 'success', title: 'Welcome Back', message: `Signed in as ${data.creator.first_name}` });
        setCurrentCreator(data.creator);
        if (data.creator.onboarding_completed) {
          setViewMode('dashboard');
        } else {
          setOnboardingStep(data.creator.current_step || 1);
          setViewMode('onboarding');
        }
      } else {
        addToast({ type: 'error', title: 'Login Failed', message: data.error || 'Invalid credentials.' });
      }
    } catch (err) {
      addToast({ type: 'error', title: 'Error', message: 'Could not sign in.' });
    } finally {
      setLoginLoading(false);
    }
  };

  // Handle Magic Login Request
  const handleMagicLoginRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setMagicLoading(true);
    try {
      const res = await fetch('/api/v1/creator-auth/magic-login-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ whatsapp_number: magicPhone })
      });
      const data = await res.json();
      if (res.ok) {
        setMagicLinkGenerated(data.magic_link);
        addToast({ type: 'success', title: 'Magic Link Dispatched', message: 'One-click login link created.' });
      } else {
        addToast({ type: 'error', title: 'Magic Login Error', message: data.error || 'Number not found.' });
      }
    } catch (err) {
      addToast({ type: 'error', title: 'Error', message: 'Failed to generate link.' });
    } finally {
      setMagicLoading(false);
    }
  };

  // Handle Onboarding Completion Step
  const handleNextOnboardingStep = async (nextStep: number) => {
    setOnboardingStep(nextStep);
    if (!currentCreator) return;

    try {
      const res = await fetch('/api/v1/creator-auth/onboarding/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          creator_id: currentCreator.id,
          current_step: nextStep,
          bio: profileForm.bio,
          niche: profileForm.niche,
          followers_range: profileForm.followers_range,
          payment_preference: profileForm.payment_preference,
          social_handles: {
            tiktok: profileForm.social_tiktok,
            instagram: profileForm.social_instagram,
            youtube: profileForm.social_youtube,
            facebook: profileForm.social_facebook,
            x: profileForm.social_x
          }
        })
      });
      const data = await res.json();
      if (res.ok) {
        setCurrentCreator(data.creator);
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Fetch Admin Creators
  const fetchAdminCreators = async () => {
    setAdminLoading(true);
    try {
      const res = await fetch('/api/v1/creator-auth/admin/creators');
      const data = await res.json();
      setAdminCreators(data.creators || []);
    } catch (e) {
      console.error(e);
    } finally {
      setAdminLoading(false);
    }
  };

  const handleAdminStatusChange = async (creatorId: string, status: string) => {
    try {
      const res = await fetch('/api/v1/creator-auth/admin/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ creator_id: creatorId, status })
      });
      if (res.ok) {
        addToast({ type: 'success', title: 'Status Updated', message: `Creator set to ${status}` });
        fetchAdminCreators();
      }
    } catch (e) {
      addToast({ type: 'error', title: 'Error', message: 'Could not update status.' });
    }
  };

  return (
    <div className="min-h-screen bg-[#09090B] text-zinc-100 font-sans antialiased pb-12">
      {/* Top Mobile-First App Header */}
      <header className="sticky top-0 z-40 bg-[#18181B]/90 backdrop-blur-md border-b border-[#27272A] px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2 cursor-pointer" onClick={() => setViewMode('landing')}>
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-amber-500 to-orange-500 flex items-center justify-center font-bold text-black text-sm shadow-md shadow-orange-500/20">
            SQ
          </div>
          <div>
            <span className="font-bold text-white text-sm tracking-tight block">
              SnackQuest <span className="text-amber-400 font-normal text-xs">Creator Portal</span>
            </span>
            <span className="text-[10px] text-zinc-400 block -mt-0.5">Kenya Affiliate & Creator Network</span>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs">
          {currentCreator ? (
            <button
              onClick={() => setViewMode('dashboard')}
              className="px-3 py-1.5 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-lg font-medium flex items-center gap-1.5"
            >
              <User className="h-3.5 w-3.5" />
              <span>{currentCreator.first_name}</span>
            </button>
          ) : (
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setViewMode('login')}
                className="px-3 py-1.5 text-zinc-300 hover:text-white font-medium cursor-pointer"
              >
                Sign In
              </button>
              <button
                onClick={() => setViewMode('register')}
                className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-black font-semibold rounded-lg shadow-md shadow-amber-500/20 transition-colors cursor-pointer"
              >
                Join Free
              </button>
            </div>
          )}
        </div>
      </header>

      {/* VIEW 1: ENTRY LANDING PAGE */}
      {viewMode === 'landing' && (
        <main className="max-w-md md:max-w-2xl lg:max-w-4xl mx-auto px-4 pt-6 space-y-10">
          {/* Hero Section */}
          <section className="bg-gradient-to-b from-[#18181B] to-[#09090B] border border-[#27272A] rounded-2xl p-6 md:p-10 text-center space-y-6 relative overflow-hidden">
            <div className="absolute -top-12 -right-12 w-40 h-40 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 text-xs font-semibold">
              <Sparkles className="h-3.5 w-3.5" /> Direct M-Pesa Payouts Enabled
            </div>

            <h1 className="text-2xl md:text-4xl font-extrabold text-white tracking-tight leading-tight">
              Become a Snack Quest Creator
            </h1>
            <p className="text-zinc-400 text-sm md:text-base max-w-lg mx-auto">
              Turn your content and WhatsApp network into real affiliate income. Share your unique link and earn cash on every snack box ordered across Kenya.
            </p>

            {/* Value Bullets */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-left max-w-md mx-auto bg-[#09090B]/80 p-4 rounded-xl border border-[#27272A] text-xs">
              <div className="flex items-center gap-2 text-zinc-200 font-medium">
                <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                <span>Earn KSh 500 per successful referral</span>
              </div>
              <div className="flex items-center gap-2 text-zinc-200 font-medium">
                <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                <span>Withdraw directly to M-Pesa Express</span>
              </div>
              <div className="flex items-center gap-2 text-zinc-200 font-medium">
                <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                <span>Real-time click & sales analytics</span>
              </div>
              <div className="flex items-center gap-2 text-zinc-200 font-medium">
                <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                <span>100% Free — No joining fees</span>
              </div>
            </div>

            {/* CTAs */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
              <button
                onClick={() => setViewMode('register')}
                className="w-full sm:w-auto px-8 py-3.5 bg-amber-500 hover:bg-amber-400 text-black font-bold rounded-xl shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2 transition-all cursor-pointer text-sm"
              >
                <span>Join Free Now</span>
                <ArrowRight className="h-4 w-4" />
              </button>
              <button
                onClick={() => setViewMode('login')}
                className="w-full sm:w-auto px-8 py-3.5 bg-[#27272A] hover:bg-[#3F3F46] text-white font-medium rounded-xl border border-[#3F3F46] transition-all cursor-pointer text-sm"
              >
                Sign In to Creator Portal
              </button>
            </div>
          </section>

          {/* How It Works */}
          <section className="space-y-4">
            <div className="text-center">
              <h2 className="text-lg font-bold text-white">How Creator Earnings Work</h2>
              <p className="text-xs text-zinc-400">3 simple steps to start earning M-Pesa commissions</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-[#18181B] border border-[#27272A] p-5 rounded-xl space-y-2">
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center font-bold text-sm border border-amber-500/20">
                  01
                </div>
                <h3 className="text-sm font-bold text-white">Create Account & Get Link</h3>
                <p className="text-xs text-zinc-400">
                  Register in under 60 seconds with your WhatsApp number. Your custom referral link and QR code are instantly created.
                </p>
              </div>

              <div className="bg-[#18181B] border border-[#27272A] p-5 rounded-xl space-y-2">
                <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-400 flex items-center justify-center font-bold text-sm border border-blue-500/20">
                  02
                </div>
                <h3 className="text-sm font-bold text-white">Share Content & Links</h3>
                <p className="text-xs text-zinc-400">
                  Share on TikTok, WhatsApp Status, Instagram, or YouTube. Followers click your link to order delicious snack boxes.
                </p>
              </div>

              <div className="bg-[#18181B] border border-[#27272A] p-5 rounded-xl space-y-2">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center font-bold text-sm border border-emerald-500/20">
                  03
                </div>
                <h3 className="text-sm font-bold text-white">Instant M-Pesa Cash</h3>
                <p className="text-xs text-zinc-400">
                  Receive KSh 500 instantly for every confirmed order. Withdraw straight to your M-Pesa line at any time!
                </p>
              </div>
            </div>
          </section>

          {/* FAQs & Trust */}
          <section className="bg-[#18181B] border border-[#27272A] p-6 rounded-2xl space-y-4">
            <h3 className="text-sm font-bold text-white text-center">Frequently Asked Questions</h3>
            <div className="space-y-3 text-xs">
              <div className="p-3 bg-[#09090B] rounded-lg border border-[#27272A]">
                <span className="font-semibold text-white block mb-1">Is there any registration or joining fee?</span>
                <p className="text-zinc-400">No! Joining the Snack Quest Creator Program is 100% free forever.</p>
              </div>
              <div className="p-3 bg-[#09090B] rounded-lg border border-[#27272A]">
                <span className="font-semibold text-white block mb-1">How fast do I get paid?</span>
                <p className="text-zinc-400">Withdrawal requests are processed automatically via M-Pesa Express B2C API instantly upon request.</p>
              </div>
            </div>
          </section>
        </main>
      )}

      {/* VIEW 2: REGISTRATION FORM */}
      {viewMode === 'register' && (
        <main className="max-w-md mx-auto px-4 pt-6">
          <div className="bg-[#18181B] border border-[#27272A] rounded-2xl p-6 space-y-6 shadow-xl">
            <div className="text-center space-y-1">
              <h2 className="text-xl font-extrabold text-white">Create Creator Account</h2>
              <p className="text-xs text-zinc-400">Start earning KSh 500 per referral today</p>
            </div>

            <form onSubmit={handleRegister} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-zinc-300 font-medium">First Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Kimberly"
                    value={regForm.first_name}
                    onChange={(e) => setRegForm({ ...regForm, first_name: e.target.value })}
                    className="w-full bg-[#09090B] border border-[#27272A] text-white rounded-xl p-3 focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-zinc-300 font-medium">Last Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Wanjiru"
                    value={regForm.last_name}
                    onChange={(e) => setRegForm({ ...regForm, last_name: e.target.value })}
                    className="w-full bg-[#09090B] border border-[#27272A] text-white rounded-xl p-3 focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-zinc-300 font-medium">WhatsApp Number (For OTP & M-Pesa)</label>
                <div className="relative">
                  <Smartphone className="absolute left-3 top-3.5 h-4 w-4 text-zinc-500" />
                  <input
                    type="tel"
                    required
                    placeholder="0712345678 or 2547..."
                    value={regForm.whatsapp_number}
                    onChange={(e) => setRegForm({ ...regForm, whatsapp_number: e.target.value })}
                    className="w-full bg-[#09090B] border border-[#27272A] text-white rounded-xl pl-10 pr-3 py-3 focus:outline-none focus:border-amber-500"
                  />
                </div>
                <span className="text-[10px] text-zinc-500">Auto-formatted for Kenyan M-Pesa line</span>
              </div>

              <div className="space-y-1">
                <label className="text-zinc-300 font-medium">Email Address</label>
                <input
                  type="email"
                  required
                  placeholder="you@domain.com"
                  value={regForm.email}
                  onChange={(e) => setRegForm({ ...regForm, email: e.target.value })}
                  className="w-full bg-[#09090B] border border-[#27272A] text-white rounded-xl p-3 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-zinc-300 font-medium">Password</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    placeholder="At least 8 characters"
                    value={regForm.password}
                    onChange={(e) => setRegForm({ ...regForm, password: e.target.value })}
                    className="w-full bg-[#09090B] border border-[#27272A] text-white rounded-xl p-3 pr-10 focus:outline-none focus:border-amber-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-3.5 text-zinc-500 hover:text-zinc-300"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>

                {/* Password Strength Indicator */}
                {regForm.password && (
                  <div className="space-y-1 pt-1">
                    <div className="flex justify-between text-[10px] text-zinc-400">
                      <span>Password Strength:</span>
                      <span className="font-bold text-white">{getPasswordStrength(regForm.password).label}</span>
                    </div>
                    <div className="w-full bg-[#09090B] h-1.5 rounded-full overflow-hidden">
                      <div
                        className={`h-full ${getPasswordStrength(regForm.password).color} transition-all`}
                        style={{ width: `${(getPasswordStrength(regForm.password).score / 4) * 100}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-1">
                <label className="text-zinc-300 font-medium">Confirm Password</label>
                <input
                  type="password"
                  required
                  placeholder="Re-enter password"
                  value={regForm.confirm_password}
                  onChange={(e) => setRegForm({ ...regForm, confirm_password: e.target.value })}
                  className="w-full bg-[#09090B] border border-[#27272A] text-white rounded-xl p-3 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-zinc-300 font-medium">County</label>
                  <select
                    value={regForm.county}
                    onChange={(e) => setRegForm({ ...regForm, county: e.target.value })}
                    className="w-full bg-[#09090B] border border-[#27272A] text-white rounded-xl p-3 focus:outline-none"
                  >
                    <option value="Nairobi">Nairobi</option>
                    <option value="Mombasa">Mombasa</option>
                    <option value="Kisumu">Kisumu</option>
                    <option value="Nakuru">Nakuru</option>
                    <option value="Eldoret">Eldoret</option>
                    <option value="Kiambu">Kiambu</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-zinc-300 font-medium">Language</label>
                  <select
                    value={regForm.preferred_language}
                    onChange={(e) => setRegForm({ ...regForm, preferred_language: e.target.value })}
                    className="w-full bg-[#09090B] border border-[#27272A] text-white rounded-xl p-3 focus:outline-none"
                  >
                    <option value="English">English</option>
                    <option value="Swahili">Swahili</option>
                    <option value="Sheng">Sheng</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-zinc-300 font-medium">Referral Code (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. SQ-KIM123"
                  value={regForm.referral_code}
                  onChange={(e) => setRegForm({ ...regForm, referral_code: e.target.value })}
                  className="w-full bg-[#09090B] border border-[#27272A] text-white rounded-xl p-3 focus:outline-none uppercase"
                />
              </div>

              <div className="space-y-2 pt-2">
                <label className="flex items-center gap-2 cursor-pointer text-[#A1A1AA]">
                  <input
                    type="checkbox"
                    checked={regForm.terms_accepted}
                    onChange={(e) => setRegForm({ ...regForm, terms_accepted: e.target.checked })}
                    className="rounded bg-[#09090B] border-[#27272A] text-amber-500 focus:ring-0"
                  />
                  <span>I accept the Creator Terms & Affiliate Guidelines</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer text-[#A1A1AA]">
                  <input
                    type="checkbox"
                    checked={regForm.marketing_consent}
                    onChange={(e) => setRegForm({ ...regForm, marketing_consent: e.target.checked })}
                    className="rounded bg-[#09090B] border-[#27272A] text-amber-500 focus:ring-0"
                  />
                  <span>Receive WhatsApp notifications for earnings & bonuses</span>
                </label>
              </div>

              <button
                type="submit"
                disabled={regLoading}
                className="w-full py-3.5 bg-amber-500 hover:bg-amber-400 text-black font-bold rounded-xl shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2 transition-all cursor-pointer"
              >
                {regLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <span>Create Account & Verify</span>}
              </button>

              <p className="text-center text-zinc-500 text-xs">
                Already have a creator account?{' '}
                <button
                  type="button"
                  onClick={() => setViewMode('login')}
                  className="text-amber-400 font-semibold underline cursor-pointer"
                >
                  Sign In
                </button>
              </p>
            </form>
          </div>
        </main>
      )}

      {/* VIEW 3: WHATSAPP OTP VERIFICATION */}
      {viewMode === 'otp' && (
        <main className="max-w-md mx-auto px-4 pt-8">
          <div className="bg-[#18181B] border border-[#27272A] rounded-2xl p-6 space-y-6 text-center shadow-xl">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center justify-center mx-auto">
              <MessageSquare className="h-6 w-6" />
            </div>

            <div>
              <h2 className="text-lg font-bold text-white">Verify WhatsApp Number</h2>
              <p className="text-xs text-zinc-400 mt-1">
                We sent a 6-digit verification code via WhatsApp to <strong className="text-white">+{otpPhone}</strong>
              </p>
            </div>

            {/* QA Demo Banner */}
            <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-left text-xs space-y-1">
              <div className="flex items-center gap-1.5 text-amber-400 font-semibold">
                <Zap className="h-3.5 w-3.5" />
                <span>Automated Demo OTP Code</span>
              </div>
              <p className="text-zinc-300">
                Use code <strong className="text-white font-mono">{otpDemoCode}</strong> or <strong className="text-white font-mono">123456</strong> to verify instantly.
              </p>
            </div>

            <form onSubmit={handleVerifyOtp} className="space-y-4">
              <input
                type="text"
                required
                maxLength={6}
                placeholder="0 0 0 0 0 0"
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value)}
                className="w-full bg-[#09090B] border border-[#27272A] text-white text-center font-mono text-xl tracking-widest rounded-xl p-3 focus:outline-none focus:border-emerald-500"
              />

              <button
                type="submit"
                disabled={otpLoading}
                className="w-full py-3 bg-emerald-500 hover:bg-emerald-400 text-black font-bold rounded-xl shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2 transition-colors cursor-pointer text-xs"
              >
                {otpLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <span>Verify & Continue</span>}
              </button>
            </form>

            <div className="text-xs text-zinc-500 flex items-center justify-between pt-2">
              <span>Didn't receive code?</span>
              <button
                disabled={otpResendTimer > 0}
                onClick={() => setOtpResendTimer(180)}
                className="text-amber-400 font-semibold disabled:opacity-50 cursor-pointer"
              >
                {otpResendTimer > 0 ? `Resend in ${otpResendTimer}s` : 'Resend WhatsApp OTP'}
              </button>
            </div>
          </div>
        </main>
      )}

      {/* VIEW 4: LOGIN PAGE & MAGIC LOGIN */}
      {viewMode === 'login' && (
        <main className="max-w-md mx-auto px-4 pt-8">
          <div className="bg-[#18181B] border border-[#27272A] rounded-2xl p-6 space-y-6 shadow-xl">
            <div className="text-center space-y-1">
              <h2 className="text-xl font-extrabold text-white">Creator Sign In</h2>
              <p className="text-xs text-zinc-400">Access your referral dashboard & earnings</p>
            </div>

            <form onSubmit={handleLogin} className="space-y-4 text-xs">
              <div className="space-y-1">
                <label className="text-zinc-300 font-medium">WhatsApp Number or Email</label>
                <input
                  type="text"
                  required
                  placeholder="0712345678 or kimberly@domain.com"
                  value={loginForm.identifier}
                  onChange={(e) => setLoginForm({ ...loginForm, identifier: e.target.value })}
                  className="w-full bg-[#09090B] border border-[#27272A] text-white rounded-xl p-3 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="space-y-1">
                <div className="flex justify-between items-center">
                  <label className="text-zinc-300 font-medium">Password</label>
                  <button
                    type="button"
                    onClick={() => setViewMode('magic_login')}
                    className="text-amber-400 text-[11px] hover:underline cursor-pointer"
                  >
                    Forgot Password / Magic Link?
                  </button>
                </div>
                <input
                  type="password"
                  required
                  placeholder="Enter your password"
                  value={loginForm.password}
                  onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
                  className="w-full bg-[#09090B] border border-[#27272A] text-white rounded-xl p-3 focus:outline-none focus:border-amber-500"
                />
              </div>

              <label className="flex items-center gap-2 cursor-pointer text-zinc-400">
                <input
                  type="checkbox"
                  checked={loginForm.remember_me}
                  onChange={(e) => setLoginForm({ ...loginForm, remember_me: e.target.checked })}
                  className="rounded bg-[#09090B] border-[#27272A] text-amber-500 focus:ring-0"
                />
                <span>Remember me on this device</span>
              </label>

              <button
                type="submit"
                disabled={loginLoading}
                className="w-full py-3.5 bg-amber-500 hover:bg-amber-400 text-black font-bold rounded-xl shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2 transition-all cursor-pointer"
              >
                {loginLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <span>Sign In</span>}
              </button>
            </form>

            <div className="border-t border-[#27272A] pt-4 text-center space-y-3 text-xs">
              <button
                onClick={() => setViewMode('magic_login')}
                className="w-full py-2.5 bg-[#09090B] hover:bg-[#27272A] border border-[#27272A] text-emerald-400 font-semibold rounded-xl flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <MessageSquare className="h-4 w-4 text-emerald-400" />
                <span>1-Click Sign In via WhatsApp Magic Link</span>
              </button>

              <p className="text-zinc-500">
                New creator?{' '}
                <button
                  onClick={() => setViewMode('register')}
                  className="text-amber-400 font-semibold underline cursor-pointer"
                >
                  Create free account
                </button>
              </p>
            </div>
          </div>
        </main>
      )}

      {/* VIEW 5: MAGIC LOGIN & PASSWORD RECOVERY */}
      {viewMode === 'magic_login' && (
        <main className="max-w-md mx-auto px-4 pt-8">
          <div className="bg-[#18181B] border border-[#27272A] rounded-2xl p-6 space-y-6 shadow-xl">
            <div className="text-center space-y-1">
              <h2 className="text-xl font-extrabold text-white">WhatsApp Magic Sign In</h2>
              <p className="text-xs text-zinc-400">No password required. Enter your WhatsApp number.</p>
            </div>

            <form onSubmit={handleMagicLoginRequest} className="space-y-4 text-xs">
              <div className="space-y-1">
                <label className="text-zinc-300 font-medium">WhatsApp Number</label>
                <input
                  type="tel"
                  required
                  placeholder="e.g. 0712345678"
                  value={magicPhone}
                  onChange={(e) => setMagicPhone(e.target.value)}
                  className="w-full bg-[#09090B] border border-[#27272A] text-white rounded-xl p-3 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <button
                type="submit"
                disabled={magicLoading}
                className="w-full py-3 bg-emerald-500 hover:bg-emerald-400 text-black font-bold rounded-xl shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                {magicLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <span>Send Magic Link</span>}
              </button>
            </form>

            {magicLinkGenerated && (
              <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl space-y-2 text-xs">
                <span className="font-bold text-emerald-400 block">Magic Link Dispatched:</span>
                <p className="text-zinc-300 font-mono break-all bg-[#09090B] p-2 rounded">{magicLinkGenerated}</p>
                <button
                  onClick={() => {
                    fetch(magicLinkGenerated.replace('https://snackquest.co', ''))
                      .then((r) => r.json())
                      .then((data) => {
                        if (data.creator) {
                          setCurrentCreator(data.creator);
                          setViewMode('dashboard');
                          addToast({ type: 'success', title: 'Magic Authenticated', message: 'Logged in successfully!' });
                        }
                      });
                  }}
                  className="w-full py-2 bg-emerald-500 text-black font-bold rounded-lg cursor-pointer"
                >
                  Simulate WhatsApp Magic Click
                </button>
              </div>
            )}

            <button
              onClick={() => setViewMode('login')}
              className="w-full text-center text-xs text-zinc-400 hover:text-white cursor-pointer"
            >
              ← Back to standard login
            </button>
          </div>
        </main>
      )}

      {/* VIEW 6: ONBOARDING WIZARD (7 STEPS) */}
      {viewMode === 'onboarding' && currentCreator && (
        <main className="max-w-md mx-auto px-4 pt-6">
          <div className="bg-[#18181B] border border-[#27272A] rounded-2xl p-6 space-y-6 shadow-xl">
            {/* Progress Header */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-zinc-400">
                <span>Creator Setup Progress</span>
                <span className="font-bold text-amber-400">Step {onboardingStep} of 7</span>
              </div>
              <div className="w-full bg-[#09090B] h-2 rounded-full overflow-hidden">
                <div
                  className="bg-amber-500 h-full transition-all"
                  style={{ width: `${(onboardingStep / 7) * 100}%` }}
                />
              </div>
            </div>

            {/* STEP 1: Welcome */}
            {onboardingStep === 1 && (
              <div className="space-y-4 text-center">
                <div className="w-16 h-16 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center justify-center mx-auto text-2xl font-bold">
                  🎉
                </div>
                <h2 className="text-xl font-extrabold text-white">Welcome, {currentCreator.first_name}!</h2>
                <p className="text-xs text-zinc-400">
                  You are now officially registered as a Snack Quest Creator. Let's configure your profile and get your first referral link ready in 60 seconds.
                </p>
                <button
                  onClick={() => handleNextOnboardingStep(2)}
                  className="w-full py-3 bg-amber-500 text-black font-bold rounded-xl shadow-lg shadow-amber-500/20 cursor-pointer text-xs"
                >
                  Start Onboarding
                </button>
              </div>
            )}

            {/* STEP 2: How Referrals Work */}
            {onboardingStep === 2 && (
              <div className="space-y-4">
                <h2 className="text-base font-bold text-white">Step 2: How Referrals & Commissions Work</h2>
                <div className="space-y-2 text-xs text-zinc-300">
                  <div className="p-3 bg-[#09090B] rounded-xl border border-[#27272A]">
                    <strong className="text-amber-400 block mb-0.5">KSh 500 Per Order</strong>
                    <span>Earn KSh 500 cash for every customer who completes their first Snack Quest package purchase using your link.</span>
                  </div>
                  <div className="p-3 bg-[#09090B] rounded-xl border border-[#27272A]">
                    <strong className="text-emerald-400 block mb-0.5">Automated Tracking</strong>
                    <span>Cookies & referral codes track clicks and purchases automatically in real-time on your dashboard.</span>
                  </div>
                </div>
                <button
                  onClick={() => handleNextOnboardingStep(3)}
                  className="w-full py-3 bg-amber-500 text-black font-bold rounded-xl cursor-pointer text-xs"
                >
                  Next: M-Pesa Direct Withdrawals →
                </button>
              </div>
            )}

            {/* STEP 3: How Withdrawals Work */}
            {onboardingStep === 3 && (
              <div className="space-y-4">
                <h2 className="text-base font-bold text-white">Step 3: M-Pesa Direct Cash Payouts</h2>
                <p className="text-xs text-zinc-400">
                  Your earnings accumulate in your Creator Wallet. Click "Withdraw Cash" anytime to receive funds directly to your M-Pesa line (+{currentCreator.whatsapp_number}).
                </p>
                <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-center">
                  <span className="text-xs text-emerald-400 font-semibold block">Welcome Registration Bonus</span>
                  <span className="text-2xl font-extrabold text-white mt-1 block">KSh 500 Pending</span>
                  <span className="text-[10px] text-zinc-400">Unlocks on your first completed referral!</span>
                </div>
                <button
                  onClick={() => handleNextOnboardingStep(4)}
                  className="w-full py-3 bg-amber-500 text-black font-bold rounded-xl cursor-pointer text-xs"
                >
                  Next: Community Guidelines →
                </button>
              </div>
            )}

            {/* STEP 4: Community Guidelines */}
            {onboardingStep === 4 && (
              <div className="space-y-4">
                <h2 className="text-base font-bold text-white">Step 4: Creator Community Guidelines</h2>
                <div className="space-y-2 text-xs text-zinc-300">
                  <p>• Authentic recommendations only — no spamming or misleading claims.</p>
                  <p>• No self-referrals or fraud attempt. Anti-fraud systems monitor IP & M-Pesa IDs.</p>
                  <p>• Respect copyright when using Snack Quest brand assets in your TikTok/IG content.</p>
                </div>
                <button
                  onClick={() => handleNextOnboardingStep(5)}
                  className="w-full py-3 bg-amber-500 text-black font-bold rounded-xl cursor-pointer text-xs"
                >
                  I Accept & Continue →
                </button>
              </div>
            )}

            {/* STEP 5: Complete Profile */}
            {onboardingStep === 5 && (
              <div className="space-y-4 text-xs">
                <h2 className="text-base font-bold text-white">Step 5: Complete Creator Profile</h2>
                <div className="space-y-3">
                  <div>
                    <label className="text-zinc-300 font-medium block mb-1">Content Niche</label>
                    <select
                      value={profileForm.niche}
                      onChange={(e) => setProfileForm({ ...profileForm, niche: e.target.value })}
                      className="w-full bg-[#09090B] border border-[#27272A] text-white rounded-xl p-3 focus:outline-none"
                    >
                      <option value="Food & Lifestyle">Food & Lifestyle</option>
                      <option value="Comedy & Skits">Comedy & Skits</option>
                      <option value="Tech & Gaming">Tech & Gaming</option>
                      <option value="Beauty & Fashion">Beauty & Fashion</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-zinc-300 font-medium block mb-1">Followers Range</label>
                    <select
                      value={profileForm.followers_range}
                      onChange={(e) => setProfileForm({ ...profileForm, followers_range: e.target.value })}
                      className="w-full bg-[#09090B] border border-[#27272A] text-white rounded-xl p-3 focus:outline-none"
                    >
                      <option value="1,000 - 10,000">1,000 - 10,000</option>
                      <option value="10,000 - 50,000">10,000 - 50,000</option>
                      <option value="50,000 - 100,000">50,000 - 100,000</option>
                      <option value="100,000+">100,000+</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-zinc-300 font-medium block mb-1">TikTok Handle</label>
                    <input
                      type="text"
                      placeholder="@yourtiktok"
                      value={profileForm.social_tiktok}
                      onChange={(e) => setProfileForm({ ...profileForm, social_tiktok: e.target.value })}
                      className="w-full bg-[#09090B] border border-[#27272A] text-white rounded-xl p-3 focus:outline-none"
                    />
                  </div>
                </div>

                <button
                  onClick={() => handleNextOnboardingStep(6)}
                  className="w-full py-3 bg-amber-500 text-black font-bold rounded-xl cursor-pointer"
                >
                  Save & Generate Referral Code →
                </button>
              </div>
            )}

            {/* STEP 6 & 7: VIRAL COMPLETION SCREEN */}
            {onboardingStep >= 6 && (
              <div className="space-y-6 text-center">
                <div className="w-16 h-16 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center justify-center mx-auto text-2xl font-bold">
                  🎉
                </div>

                <div>
                  <h2 className="text-xl font-extrabold text-white">Congratulations!</h2>
                  <p className="text-xs text-zinc-400 mt-1">Your creator account is fully active and ready.</p>
                </div>

                <div className="p-4 bg-[#09090B] border border-[#27272A] rounded-2xl space-y-3">
                  <span className="text-xs text-zinc-400 block font-medium">YOUR EXCLUSIVE REFERRAL CODE</span>
                  <div className="text-2xl font-black text-amber-400 tracking-widest bg-[#18181B] py-2.5 rounded-xl border border-amber-500/30">
                    {currentCreator.referral_code}
                  </div>
                  <span className="text-[11px] text-zinc-400 block font-mono">
                    https://snackquest.co/?ref={currentCreator.referral_code}
                  </span>
                </div>

                {/* Instant Viral Share Action Buttons */}
                <div className="space-y-2">
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(`https://snackquest.co/?ref=${currentCreator.referral_code}`);
                      addToast({ type: 'success', title: 'Link Copied', message: 'Referral link copied to clipboard!' });
                    }}
                    className="w-full py-3 bg-amber-500 text-black font-bold rounded-xl flex items-center justify-center gap-2 cursor-pointer text-xs"
                  >
                    <Copy className="h-4 w-4" />
                    <span>Copy Referral Link</span>
                  </button>

                  <button
                    onClick={() => {
                      window.open(
                        `https://api.whatsapp.com/send?text=${encodeURIComponent(
                          `Get your Snack Quest box in Kenya! Order here: https://snackquest.co/?ref=${currentCreator.referral_code}`
                        )}`
                      );
                    }}
                    className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl flex items-center justify-center gap-2 cursor-pointer text-xs"
                  >
                    <MessageSquare className="h-4 w-4" />
                    <span>Share directly to WhatsApp</span>
                  </button>
                </div>

                <button
                  onClick={() => setViewMode('dashboard')}
                  className="w-full py-3 bg-[#27272A] text-white font-bold rounded-xl border border-[#3F3F46] cursor-pointer text-xs"
                >
                  View Creator Dashboard →
                </button>
              </div>
            )}
          </div>
        </main>
      )}

      {/* VIEW 7: CREATOR OPERATING SYSTEM (FULL DASHBOARD) */}
      {viewMode === 'dashboard' && currentCreator && (
        <main className="max-w-4xl mx-auto px-4 pt-6 pb-20 space-y-6">
          {/* Creator Header */}
          <div className="bg-[#18181B] border border-[#27272A] rounded-2xl p-5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 font-extrabold flex items-center justify-center text-lg">
                {currentCreator.first_name?.[0] || 'C'}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-bold text-white">{currentCreator.display_name || `${currentCreator.first_name} ${currentCreator.last_name}`}</h2>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                    {currentCreator.tier || 'Gold Creator'}
                  </span>
                </div>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Code: <strong className="text-amber-400 font-mono">{currentCreator.referral_code}</strong> | Phone: +{currentCreator.whatsapp_number}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setWithdrawModalOpen(true)}
                className="px-3 py-2 bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-xs rounded-xl flex items-center gap-1.5 cursor-pointer shadow-lg shadow-emerald-500/20"
              >
                <Wallet className="h-4 w-4" />
                <span>Withdraw Cash</span>
              </button>
              <button
                onClick={() => {
                  setCurrentCreator(null);
                  setViewMode('landing');
                }}
                className="p-2 text-zinc-400 hover:text-white cursor-pointer rounded-xl bg-[#09090B] border border-[#27272A]"
                title="Sign Out"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Module Navigation Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-2 scrollbar-none border-b border-[#27272A] text-xs">
            {[
              { id: 'overview', label: 'Dashboard', icon: Layers },
              { id: 'earnings', label: 'Earnings', icon: DollarSign },
              { id: 'orders', label: 'Orders', icon: ShoppingBag },
              { id: 'referrals', label: 'Referral Performance', icon: TrendingUp },
              { id: 'campaigns', label: 'Campaign Center', icon: Megaphone },
              { id: 'withdrawals', label: 'Withdrawals', icon: Wallet },
              { id: 'notifications', label: 'Notifications', icon: Bell },
              { id: 'profile', label: 'Profile', icon: User },
              { id: 'support', label: 'Support (WhatsApp)', icon: MessageSquare }
            ].map((tab) => {
              const IconComp = tab.icon;
              const isActive = creatorTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setCreatorTab(tab.id as any)}
                  className={`px-3.5 py-2 rounded-xl font-semibold flex items-center gap-2 shrink-0 transition-colors cursor-pointer ${
                    isActive
                      ? 'bg-amber-500 text-black shadow-lg shadow-amber-500/10'
                      : 'bg-[#18181B] text-zinc-400 hover:text-white border border-[#27272A]'
                  }`}
                >
                  <IconComp className="h-3.5 w-3.5" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          {/* TAB 1: OVERVIEW / DASHBOARD */}
          {creatorTab === 'overview' && (
            <div className="space-y-6">
              {/* Earnings Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-4 bg-[#18181B] border border-[#27272A] rounded-2xl space-y-1">
                  <div className="flex justify-between items-center text-xs text-zinc-400">
                    <span>Available Cash Balance</span>
                    <Wallet className="h-4 w-4 text-emerald-400" />
                  </div>
                  <div className="text-2xl font-extrabold text-emerald-400">
                    KSh {(walletInfo?.available_cash_kes ?? currentCreator?.available_cash ?? 0).toLocaleString()}
                  </div>
                  <span className="text-[10px] text-zinc-500">Ready for instant M-Pesa withdrawal</span>
                </div>

                <div className="p-4 bg-[#18181B] border border-[#27272A] rounded-2xl space-y-1">
                  <div className="flex justify-between items-center text-xs text-zinc-400">
                    <span>Pending Commissions</span>
                    <Clock className="h-4 w-4 text-amber-400" />
                  </div>
                  <div className="text-2xl font-extrabold text-amber-400">
                    KSh {(walletInfo?.pending_earnings_kes ?? currentCreator?.pending_earnings ?? 0).toLocaleString()}
                  </div>
                  <span className="text-[10px] text-zinc-500">In 7-day return verification window</span>
                </div>

                <div className="p-4 bg-[#18181B] border border-[#27272A] rounded-2xl space-y-1">
                  <div className="flex justify-between items-center text-xs text-zinc-400">
                    <span>Lifetime Total Earned</span>
                    <Award className="h-4 w-4 text-blue-400" />
                  </div>
                  <div className="text-2xl font-extrabold text-white">
                    KSh {(walletInfo?.lifetime_earnings_kes ?? currentCreator?.lifetime_earnings ?? 0).toLocaleString()}
                  </div>
                  <span className="text-[10px] text-zinc-500">Total qualified referral commissions</span>
                </div>
              </div>

              {/* Referral Link & Viral Share */}
              <div className="bg-[#18181B] border border-[#27272A] rounded-2xl p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <Share2 className="h-4 w-4 text-amber-400" />
                    <span>Your Exclusive Referral Link</span>
                  </h3>
                  <span className="text-xs text-zinc-400 font-mono bg-[#09090B] px-2.5 py-1 rounded-lg border border-[#27272A]">
                    SQ-{currentCreator.referral_code}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={`https://snackquest.co/?ref=${currentCreator.referral_code}`}
                    className="w-full bg-[#09090B] border border-[#27272A] text-white text-xs font-mono rounded-xl p-3 focus:outline-none"
                  />
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(`https://snackquest.co/?ref=${currentCreator.referral_code}`);
                      addToast({ type: 'success', title: 'Link Copied', message: 'Referral link copied to clipboard!' });
                    }}
                    className="px-4 py-3 bg-amber-500 hover:bg-amber-400 text-black font-bold rounded-xl text-xs shrink-0 cursor-pointer"
                  >
                    Copy
                  </button>
                  <button
                    onClick={() => {
                      window.open(
                        `https://api.whatsapp.com/send?text=${encodeURIComponent(
                          `Get your gourmet Snack Quest box in Kenya! Order here: https://snackquest.co/?ref=${currentCreator.referral_code}`
                        )}`
                      );
                    }}
                    className="px-4 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs shrink-0 cursor-pointer flex items-center gap-1.5"
                  >
                    <MessageSquare className="h-3.5 w-3.5" />
                    <span>WhatsApp</span>
                  </button>
                </div>
              </div>

              {/* Active Campaigns Quick Preview */}
              <div className="bg-[#18181B] border border-[#27272A] rounded-2xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <Megaphone className="h-4 w-4 text-amber-400" />
                    <span>Featured Active Campaigns</span>
                  </h3>
                  <button
                    onClick={() => setCreatorTab('campaigns')}
                    className="text-xs text-amber-400 hover:underline cursor-pointer font-medium"
                  >
                    View All ({campaignsList.length}) →
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {campaignsList.slice(0, 2).map((cmp) => (
                    <div key={cmp.id} className="p-4 bg-[#09090B] border border-[#27272A] rounded-xl space-y-2">
                      <div className="flex justify-between items-start">
                        <span className="font-bold text-white text-xs">{cmp.title}</span>
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          +KSh {cmp.commission_rate_kes} / sale
                        </span>
                      </div>
                      <p className="text-[11px] text-zinc-400 line-clamp-2">{cmp.rules}</p>
                      <div className="flex justify-between items-center text-[10px] text-zinc-500 pt-1">
                        <span>Deadline: {cmp.deadline}</span>
                        <span className="text-amber-400 font-semibold">{cmp.target_niche}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: EARNINGS LEDGER */}
          {creatorTab === 'earnings' && (
            <div className="space-y-6">
              <div className="bg-[#18181B] border border-[#27272A] rounded-2xl p-6 space-y-4">
                <div className="flex justify-between items-center">
                  <div>
                    <h3 className="text-base font-bold text-white">Earnings Ledger & Commissions Breakdown</h3>
                    <p className="text-xs text-zinc-400">Live breakdown of earned, pending, and paid commissions</p>
                  </div>
                  <button
                    onClick={() => setWithdrawModalOpen(true)}
                    className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-xs rounded-xl cursor-pointer"
                  >
                    Request Payout →
                  </button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 text-xs">
                  <div className="p-3 bg-[#09090B] border border-[#27272A] rounded-xl">
                    <span className="text-zinc-500 block">Available Balance</span>
                    <span className="text-base font-extrabold text-emerald-400">
                      KSh {(walletInfo?.available_cash_kes ?? 0).toLocaleString()}
                    </span>
                  </div>
                  <div className="p-3 bg-[#09090B] border border-[#27272A] rounded-xl">
                    <span className="text-zinc-500 block">Pending Balance</span>
                    <span className="text-base font-extrabold text-amber-400">
                      KSh {(walletInfo?.pending_earnings_kes ?? 0).toLocaleString()}
                    </span>
                  </div>
                  <div className="p-3 bg-[#09090B] border border-[#27272A] rounded-xl">
                    <span className="text-zinc-500 block">Total Paid Out</span>
                    <span className="text-base font-extrabold text-white">
                      KSh {(walletInfo?.lifetime_withdrawn_kes ?? 0).toLocaleString()}
                    </span>
                  </div>
                  <div className="p-3 bg-[#09090B] border border-[#27272A] rounded-xl">
                    <span className="text-zinc-500 block">Min Payout Threshold</span>
                    <span className="text-base font-extrabold text-zinc-300">
                      KSh {(walletInfo?.min_withdrawal_kes ?? 1000).toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>

              {/* Attributed Referral Earnings Table */}
              <div className="bg-[#18181B] border border-[#27272A] rounded-2xl p-5 space-y-3">
                <h4 className="text-xs font-bold text-white uppercase tracking-wider">Commission Records</h4>
                {ordersList.length === 0 ? (
                  <div className="p-8 text-center text-xs text-zinc-500 space-y-2">
                    <p>No earned referral commissions recorded yet.</p>
                    <p className="text-[11px] text-zinc-600">Share your link to generate your first KSh 500 referral payout!</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left text-zinc-300">
                      <thead className="bg-[#09090B] text-zinc-400 uppercase text-[10px]">
                        <tr>
                          <th className="p-2.5">Order ID</th>
                          <th className="p-2.5">Customer</th>
                          <th className="p-2.5">Order Total</th>
                          <th className="p-2.5">Commission</th>
                          <th className="p-2.5">Status</th>
                          <th className="p-2.5">Date</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#27272A]">
                        {ordersList.map((ord, idx) => (
                          <tr key={idx} className="hover:bg-[#09090B]">
                            <td className="p-2.5 font-mono text-amber-400 font-semibold">{ord.order_id}</td>
                            <td className="p-2.5">{ord.referee_name}</td>
                            <td className="p-2.5">KSh {ord.order_total_kes?.toLocaleString()}</td>
                            <td className="p-2.5 font-bold text-emerald-400">+KSh {ord.commission_earned_kes}</td>
                            <td className="p-2.5">
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                  ord.commission_status === 'paid'
                                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                    : ord.commission_status === 'pending'
                                    ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                                    : 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                                }`}
                              >
                                {ord.commission_status}
                              </span>
                            </td>
                            <td className="p-2.5 text-zinc-500">{new Date(ord.date).toLocaleDateString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: ORDERS */}
          {creatorTab === 'orders' && (
            <div className="bg-[#18181B] border border-[#27272A] rounded-2xl p-6 space-y-4">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <ShoppingBag className="h-4 w-4 text-amber-400" />
                    <span>Attributed Customer Orders</span>
                  </h3>
                  <p className="text-xs text-zinc-400">Real customer purchases tracked to your referral link</p>
                </div>
                <span className="px-3 py-1 bg-[#09090B] border border-[#27272A] text-amber-400 rounded-lg text-xs font-bold">
                  {ordersList.length} Orders
                </span>
              </div>

              {ordersList.length === 0 ? (
                <div className="p-12 text-center text-xs text-zinc-500 space-y-2">
                  <p className="text-zinc-400 font-medium">No attributed orders found in database.</p>
                  <p>When customers click your referral link and order, their orders appear here in real-time.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left text-zinc-300">
                    <thead className="bg-[#09090B] text-zinc-400 uppercase text-[10px]">
                      <tr>
                        <th className="p-3">Order Ref</th>
                        <th className="p-3">Customer Name</th>
                        <th className="p-3">Phone</th>
                        <th className="p-3">Order Total</th>
                        <th className="p-3">Your Commission</th>
                        <th className="p-3">Delivery Status</th>
                        <th className="p-3">Date</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#27272A]">
                      {ordersList.map((ord, idx) => (
                        <tr key={idx} className="hover:bg-[#09090B]/50">
                          <td className="p-3 font-mono font-bold text-amber-400">{ord.order_id}</td>
                          <td className="p-3 font-medium text-white">{ord.referee_name}</td>
                          <td className="p-3 text-zinc-400 font-mono">{ord.referee_phone}</td>
                          <td className="p-3 font-semibold">KSh {ord.order_total_kes?.toLocaleString()}</td>
                          <td className="p-3 font-bold text-emerald-400">+KSh {ord.commission_earned_kes}</td>
                          <td className="p-3">
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-zinc-800 text-zinc-300 border border-zinc-700">
                              {ord.order_status}
                            </span>
                          </td>
                          <td className="p-3 text-zinc-500">{new Date(ord.date).toLocaleDateString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TAB 4: REFERRAL PERFORMANCE */}
          {creatorTab === 'referrals' && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                <div className="p-4 bg-[#18181B] border border-[#27272A] rounded-xl space-y-1">
                  <span className="text-[10px] text-zinc-400 block font-medium">Link Clicks</span>
                  <span className="text-xl font-bold text-white">{analyticsData?.link_clicks ?? 0}</span>
                </div>
                <div className="p-4 bg-[#18181B] border border-[#27272A] rounded-xl space-y-1">
                  <span className="text-[10px] text-zinc-400 block font-medium">Attributed Purchases</span>
                  <span className="text-xl font-bold text-emerald-400">{analyticsData?.purchases_count ?? ordersList.length}</span>
                </div>
                <div className="p-4 bg-[#18181B] border border-[#27272A] rounded-xl space-y-1">
                  <span className="text-[10px] text-zinc-400 block font-medium">Conversion Rate</span>
                  <span className="text-xl font-bold text-amber-400">{analyticsData?.conversion_rate_pct ?? 0}%</span>
                </div>
                <div className="p-4 bg-[#18181B] border border-[#27272A] rounded-xl space-y-1">
                  <span className="text-[10px] text-zinc-400 block font-medium">Total Revenue Generated</span>
                  <span className="text-xl font-bold text-blue-400">KSh {(analyticsData?.revenue_generated_kes ?? 0).toLocaleString()}</span>
                </div>
              </div>

              {/* Attribution Funnel Details */}
              <div className="bg-[#18181B] border border-[#27272A] rounded-2xl p-6 space-y-4">
                <h3 className="text-sm font-bold text-white">Real-Time Referral Funnel</h3>
                <div className="space-y-3 text-xs">
                  <div className="flex items-center justify-between p-3 bg-[#09090B] rounded-xl border border-[#27272A]">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-blue-500" />
                      <span>Referral Link Clicks</span>
                    </div>
                    <span className="font-mono font-bold text-white">{analyticsData?.link_clicks ?? 0}</span>
                  </div>

                  <div className="flex items-center justify-between p-3 bg-[#09090B] rounded-xl border border-[#27272A]">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-emerald-500" />
                      <span>WhatsApp Checkout Starts</span>
                    </div>
                    <span className="font-mono font-bold text-emerald-400">{analyticsData?.whatsapp_starts ?? 0}</span>
                  </div>

                  <div className="flex items-center justify-between p-3 bg-[#09090B] rounded-xl border border-[#27272A]">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-amber-500" />
                      <span>Completed Orders</span>
                    </div>
                    <span className="font-mono font-bold text-amber-400">{ordersList.length}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: CAMPAIGN CENTER */}
          {creatorTab === 'campaigns' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <Megaphone className="h-4 w-4 text-amber-400" />
                    <span>Creator Campaign Center</span>
                  </h3>
                  <p className="text-xs text-zinc-400">Browse official Snack Quest marketing campaigns and assets</p>
                </div>

                {/* Filter Tabs */}
                <div className="flex items-center gap-1 bg-[#09090B] p-1 rounded-xl border border-[#27272A] text-xs">
                  {['all', 'active', 'scheduled', 'completed', 'draft'].map((st) => (
                    <button
                      key={st}
                      onClick={() => setCampaignFilter(st as any)}
                      className={`px-2.5 py-1 rounded-lg capitalize transition-colors cursor-pointer ${
                        campaignFilter === st ? 'bg-amber-500 text-black font-bold' : 'text-zinc-400 hover:text-white'
                      }`}
                    >
                      {st}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {campaignsList
                  .filter((c) => campaignFilter === 'all' || c.status === campaignFilter)
                  .map((cmp) => (
                    <div key={cmp.id} className="p-5 bg-[#18181B] border border-[#27272A] rounded-2xl space-y-3">
                      <div className="flex justify-between items-start">
                        <div>
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                              cmp.status === 'active'
                                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                : cmp.status === 'scheduled'
                                ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                                : 'bg-zinc-800 text-zinc-400 border border-zinc-700'
                            }`}
                          >
                            {cmp.status}
                          </span>
                          <h4 className="text-sm font-bold text-white mt-1">{cmp.title}</h4>
                        </div>
                        <span className="text-xs font-black text-amber-400 bg-amber-500/10 px-2.5 py-1 rounded-lg border border-amber-500/20">
                          +KSh {cmp.commission_rate_kes} / order
                        </span>
                      </div>

                      <div className="space-y-1.5 text-xs text-zinc-300">
                        <p><strong>Rules:</strong> {cmp.rules}</p>
                        <p><strong>Guidelines:</strong> {cmp.brand_guidelines}</p>
                      </div>

                      <div className="flex items-center justify-between text-xs text-zinc-400 pt-3 border-t border-[#27272A] gap-2 flex-wrap">
                        <span>Deadline: {cmp.deadline}</span>
                        
                        <div className="flex items-center gap-2">
                          {cmp.assets_url && (
                            <a
                              href={cmp.assets_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-zinc-400 hover:text-white flex items-center gap-1 text-[11px]"
                            >
                              <Download className="h-3 w-3" />
                              <span>Assets</span>
                            </a>
                          )}
                          <button
                            onClick={() => handleOpenSubmitDeliverable(cmp)}
                            className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-black font-extrabold text-xs rounded-xl flex items-center gap-1.5 shadow-md shadow-amber-500/10 cursor-pointer"
                          >
                            <UploadCloud className="h-3.5 w-3.5" />
                            <span>Submit Deliverables</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
              </div>

              {/* Creator Deliverable Submissions & Admin Review History */}
              <div className="bg-[#18181B] border border-[#27272A] rounded-2xl p-5 space-y-4 mt-6">
                <div className="flex items-center justify-between border-b border-[#27272A] pb-3">
                  <div>
                    <h4 className="text-sm font-bold text-white flex items-center gap-2">
                      <FileText className="h-4 w-4 text-amber-400" />
                      <span>My Submitted Campaign Deliverables & Admin Feedback</span>
                    </h4>
                    <p className="text-[11px] text-zinc-400 mt-0.5">
                      Track admin review status, revision notes, and automatic Quest Wallet payouts
                    </p>
                  </div>
                  <button
                    onClick={fetchCreatorData}
                    className="p-1.5 text-zinc-400 hover:text-white bg-[#09090B] border border-[#27272A] rounded-lg cursor-pointer"
                    title="Refresh Submissions"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                  </button>
                </div>

                {creatorSubmissionsList.length === 0 ? (
                  <div className="p-8 text-center text-xs text-zinc-500 space-y-2">
                    <UploadCloud className="h-8 w-8 text-zinc-600 mx-auto" />
                    <p>You haven't submitted any campaign deliverables yet.</p>
                    <p className="text-zinc-600">Select an active campaign above and click "Submit Deliverables" to send your proof.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {creatorSubmissionsList.map((sub) => (
                      <div
                        key={sub.id}
                        className="bg-[#09090B] border border-[#27272A] rounded-xl p-4 space-y-3 text-xs"
                      >
                        <div className="flex justify-between items-start">
                          <div>
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                sub.status === 'pending'
                                  ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                                  : sub.status === 'approved'
                                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                  : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                              }`}
                            >
                              {sub.status}
                            </span>
                            <h5 className="font-bold text-white mt-1">{sub.campaign_title}</h5>
                          </div>
                          <span className="font-extrabold text-emerald-400">
                            KSh {sub.commission_amount_kes.toLocaleString()}
                          </span>
                        </div>

                        {/* Submitted Proof / URL */}
                        <div className="bg-[#18181B] p-2.5 rounded-lg border border-[#27272A] space-y-1.5 text-[11px]">
                          <div className="flex justify-between text-zinc-400">
                            <span>Type: <strong className="text-amber-400 uppercase">{sub.submission_type}</strong></span>
                            <span>{new Date(sub.created_at).toLocaleDateString()}</span>
                          </div>

                          {sub.file_url && (
                            <a
                              href={sub.file_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-amber-400 hover:underline flex items-center gap-1 font-mono text-[11px] truncate block"
                            >
                              <ExternalLink className="h-3 w-3 shrink-0" />
                              <span className="truncate">{sub.file_name || sub.file_url}</span>
                            </a>
                          )}

                          {sub.social_link && (
                            <a
                              href={sub.social_link}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-amber-400 hover:underline flex items-center gap-1 font-mono text-[11px] truncate block"
                            >
                              <Globe className="h-3 w-3 shrink-0" />
                              <span className="truncate">{sub.social_link}</span>
                            </a>
                          )}
                        </div>

                        {/* Admin Feedback */}
                        {sub.admin_feedback ? (
                          <div className="p-2.5 bg-amber-500/10 border border-amber-500/20 rounded-lg text-[11px] space-y-1">
                            <span className="text-amber-400 font-bold block">Admin Review Note:</span>
                            <p className="text-zinc-300">{sub.admin_feedback}</p>
                          </div>
                        ) : (
                          <span className="text-[10px] text-zinc-500 block italic">Awaiting admin review & payment approval...</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 6: WITHDRAWALS & PAYOUT QUEUE */}
          {creatorTab === 'withdrawals' && (
            <div className="space-y-6">
              <div className="bg-[#18181B] border border-[#27272A] rounded-2xl p-6 flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <Wallet className="h-4 w-4 text-emerald-400" />
                    <span>M-Pesa Direct Withdrawal Workflow</span>
                  </h3>
                  <p className="text-xs text-zinc-400">Withdraw earnings directly to your registered M-Pesa phone number</p>
                </div>
                <button
                  onClick={() => setWithdrawModalOpen(true)}
                  className="px-4 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-xs rounded-xl shadow-lg shadow-emerald-500/20 cursor-pointer"
                >
                  Withdraw Cash
                </button>
              </div>

              {/* Withdrawal Requests History & Audit Log Tracker */}
              <div className="bg-[#18181B] border border-[#27272A] rounded-2xl p-5 space-y-4">
                <h4 className="text-xs font-bold text-white uppercase tracking-wider">Withdrawal History & Finance Status</h4>

                {withdrawalsList.length === 0 ? (
                  <div className="p-8 text-center text-xs text-zinc-500 space-y-2">
                    <p>No cash withdrawal requests submitted yet.</p>
                    <p className="text-[11px] text-zinc-600">Click "Withdraw Cash" when you have at least KSh 1,000 available balance.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {withdrawalsList.map((wdr) => (
                      <div key={wdr.id} className="p-4 bg-[#09090B] border border-[#27272A] rounded-xl space-y-3 text-xs">
                        <div className="flex items-center justify-between">
                          <div>
                            <span className="font-mono font-bold text-amber-400">{wdr.id}</span>
                            <span className="text-zinc-400 ml-2">via {wdr.method === 'bank' ? 'Bank' : 'M-Pesa'} ({wdr.account_number})</span>
                          </div>
                          <span
                            className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                              wdr.status === 'paid'
                                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                : wdr.status === 'approved'
                                ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                                : wdr.status === 'rejected'
                                ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                                : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                            }`}
                          >
                            {wdr.status === 'pending' ? 'Pending Finance Approval' : wdr.status}
                          </span>
                        </div>

                        <div className="flex items-center justify-between">
                          <span className="text-base font-extrabold text-white">KSh {wdr.amount_kes?.toLocaleString()}</span>
                          <span className="text-zinc-500 text-[11px]">{new Date(wdr.requested_at || Date.now()).toLocaleString()}</span>
                        </div>

                        {/* Immutable Audit Log Trail Display */}
                        {wdr.audit_trail && wdr.audit_trail.length > 0 && (
                          <div className="p-2.5 bg-[#18181B] rounded-lg border border-[#27272A] space-y-1">
                            <span className="text-[10px] text-zinc-500 font-bold block uppercase">Audit Log Trail</span>
                            {wdr.audit_trail.map((aud: any, aIdx: number) => (
                              <div key={aIdx} className="text-[10px] text-zinc-400 flex items-center justify-between font-mono">
                                <span>[{aud.action}] {aud.performed_by}</span>
                                <span>{new Date(aud.timestamp).toLocaleTimeString()}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 7: NOTIFICATIONS */}
          {creatorTab === 'notifications' && (
            <div className="bg-[#18181B] border border-[#27272A] rounded-2xl p-6 space-y-4">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Bell className="h-4 w-4 text-amber-400" />
                <span>Creator Notifications</span>
              </h3>

              {notificationsList.length === 0 ? (
                <div className="p-8 text-center text-xs text-zinc-500">
                  No unread notifications.
                </div>
              ) : (
                <div className="space-y-2">
                  {notificationsList.map((nt, idx) => (
                    <div key={idx} className="p-3 bg-[#09090B] border border-[#27272A] rounded-xl text-xs space-y-1">
                      <div className="flex justify-between font-bold text-white">
                        <span>{nt.title}</span>
                        <span className="text-[10px] text-zinc-500 font-normal">{new Date(nt.created_at || Date.now()).toLocaleTimeString()}</span>
                      </div>
                      <p className="text-zinc-400">{nt.message}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 8: PROFILE */}
          {creatorTab === 'profile' && (
            <div className="bg-[#18181B] border border-[#27272A] rounded-2xl p-6 space-y-4 text-xs">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <User className="h-4 w-4 text-amber-400" />
                <span>Creator Profile & Settings</span>
              </h3>

              <div className="space-y-3">
                <div>
                  <label className="text-zinc-300 font-semibold block mb-1">Display Name</label>
                  <input
                    type="text"
                    value={currentCreator.display_name}
                    onChange={(e) => setCurrentCreator({ ...currentCreator, display_name: e.target.value })}
                    className="w-full bg-[#09090B] border border-[#27272A] text-white rounded-xl p-3 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="text-zinc-300 font-semibold block mb-1">M-Pesa Payout Number</label>
                  <input
                    type="text"
                    value={currentCreator.whatsapp_number}
                    onChange={(e) => setCurrentCreator({ ...currentCreator, whatsapp_number: e.target.value })}
                    className="w-full bg-[#09090B] border border-[#27272A] text-white rounded-xl p-3 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="text-zinc-300 font-semibold block mb-1">Bio</label>
                  <textarea
                    rows={3}
                    value={currentCreator.bio || ''}
                    onChange={(e) => setCurrentCreator({ ...currentCreator, bio: e.target.value })}
                    className="w-full bg-[#09090B] border border-[#27272A] text-white rounded-xl p-3 focus:outline-none"
                  />
                </div>

                <button
                  onClick={() => addToast({ type: 'success', title: 'Profile Updated', message: 'Creator profile changes saved!' })}
                  className="w-full py-3 bg-amber-500 text-black font-bold rounded-xl cursor-pointer"
                >
                  Save Profile Changes
                </button>
              </div>
            </div>
          )}

          {/* TAB 9: SUPPORT (WHATSAPP DIRECT) */}
          {creatorTab === 'support' && (
            <div className="bg-[#18181B] border border-[#27272A] rounded-2xl p-6 space-y-6 text-xs text-center">
              <div className="w-16 h-16 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center justify-center mx-auto text-2xl font-bold">
                <MessageSquare className="h-8 w-8" />
              </div>

              <div>
                <h3 className="text-lg font-extrabold text-white">Direct Creator Support Line</h3>
                <p className="text-xs text-zinc-400 mt-1">
                  Connect instantly with our Creator Operations & Finance Team on WhatsApp
                </p>
              </div>

              <div className="p-4 bg-[#09090B] border border-[#27272A] rounded-xl space-y-2 text-left">
                <div className="flex items-center gap-2 text-white font-bold">
                  <PhoneCall className="h-4 w-4 text-emerald-400" />
                  <span>WhatsApp Line: +254 700 000 000</span>
                </div>
                <p className="text-zinc-400 text-[11px]">
                  Available 24/7 for campaign inquiries, commission reconciliations, and payout updates.
                </p>
              </div>

              <button
                onClick={() => {
                  window.open(
                    `https://wa.me/254700000000?text=${encodeURIComponent(
                      `Hello Snack Quest Creator Support, I am creator ${currentCreator.display_name} (Code: ${currentCreator.referral_code}, Phone: ${currentCreator.whatsapp_number}). I need support with my account.`
                    )}`
                  );
                }}
                className="w-full py-3.5 bg-emerald-500 hover:bg-emerald-400 text-black font-extrabold rounded-xl shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2 cursor-pointer text-sm"
              >
                <MessageSquare className="h-4 w-4" />
                <span>Open WhatsApp Support Chat</span>
              </button>
            </div>
          )}

          <div className="flex justify-center pt-4">
            <button
              onClick={() => {
                fetchAdminCreators();
                setViewMode('admin');
              }}
              className="text-xs text-zinc-500 hover:text-white cursor-pointer underline"
            >
              Open Creator Operations & Admin Control →
            </button>
          </div>
        </main>
      )}

      {/* WITHDRAWAL WORKFLOW MODAL */}
      {withdrawModalOpen && currentCreator && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#18181B] border border-[#27272A] rounded-2xl max-w-md w-full p-6 space-y-5 text-xs shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#27272A] pb-3">
              <div>
                <h3 className="text-base font-bold text-white">Withdraw Cash Earnings</h3>
                <p className="text-zinc-400 text-[11px]">Submits withdrawal to Finance Queue for review</p>
              </div>
              <button
                onClick={() => setWithdrawModalOpen(false)}
                className="p-1 text-zinc-400 hover:text-white cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleRequestWithdrawal} className="space-y-4">
              <div className="p-3 bg-[#09090B] border border-[#27272A] rounded-xl space-y-1">
                <span className="text-zinc-400 text-[10px] block">Available Cash Balance</span>
                <span className="text-xl font-extrabold text-emerald-400">
                  KSh {(walletInfo?.available_cash_kes ?? currentCreator?.available_cash ?? 0).toLocaleString()}
                </span>
              </div>

              <div>
                <label className="text-zinc-300 font-semibold block mb-1">Amount to Withdraw (KSh)</label>
                <input
                  type="number"
                  min={walletInfo?.min_withdrawal_kes || 1000}
                  max={walletInfo?.available_cash_kes || 50000}
                  required
                  value={withdrawForm.amount_kes}
                  onChange={(e) => setWithdrawForm({ ...withdrawForm, amount_kes: Number(e.target.value) })}
                  className="w-full bg-[#09090B] border border-[#27272A] text-white text-base font-bold rounded-xl p-3 focus:outline-none focus:border-amber-500"
                />
                <span className="text-[10px] text-zinc-500 mt-1 block">
                  Min: KSh {(walletInfo?.min_withdrawal_kes || 1000).toLocaleString()} | Max: KSh {(walletInfo?.max_withdrawal_kes || 50000).toLocaleString()}
                </span>
              </div>

              <div>
                <label className="text-zinc-300 font-semibold block mb-1">M-Pesa Phone Number</label>
                <input
                  type="tel"
                  required
                  value={withdrawForm.account_number || currentCreator.whatsapp_number}
                  onChange={(e) => setWithdrawForm({ ...withdrawForm, account_number: e.target.value })}
                  className="w-full bg-[#09090B] border border-[#27272A] text-white rounded-xl p-3 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-zinc-300 font-semibold block mb-1">Notes / Verification Ref (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Creator payout"
                  value={withdrawForm.notes}
                  onChange={(e) => setWithdrawForm({ ...withdrawForm, notes: e.target.value })}
                  className="w-full bg-[#09090B] border border-[#27272A] text-white rounded-xl p-3 focus:outline-none"
                />
              </div>

              <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-[11px] text-amber-300">
                ⚠️ All payouts require mandatory Finance approval in Admin OS before Daraja B2C dispatch.
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setWithdrawModalOpen(false)}
                  className="w-1/2 py-3 bg-[#27272A] text-zinc-300 font-bold rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={withdrawSubmitting}
                  className="w-1/2 py-3 bg-emerald-500 hover:bg-emerald-400 text-black font-bold rounded-xl shadow-lg shadow-emerald-500/20 cursor-pointer flex items-center justify-center gap-1.5"
                >
                  {withdrawSubmitting ? <RefreshCw className="h-4 w-4 animate-spin" /> : <span>Submit Request</span>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* VIEW 8: ADMIN CREATOR MANAGEMENT */}
      {viewMode === 'admin' && (
        <main className="max-w-2xl mx-auto px-4 pt-6 space-y-6">
          <div className="flex items-center justify-between border-b border-[#27272A] pb-4">
            <div>
              <h2 className="text-lg font-bold text-white">Creator Account Operations & Verification</h2>
              <p className="text-xs text-zinc-400">Approve, suspend, ban, or reset creator accounts</p>
            </div>
            <button
              onClick={() => setViewMode('landing')}
              className="px-3 py-1.5 bg-[#18181B] text-zinc-300 rounded-lg text-xs cursor-pointer"
            >
              Exit Admin
            </button>
          </div>

          <div className="space-y-3">
            {adminCreators.map((cr) => (
              <div key={cr.id} className="p-4 bg-[#18181B] border border-[#27272A] rounded-xl flex items-center justify-between gap-4 text-xs">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-white">{cr.display_name}</span>
                    <span className="px-2 py-0.5 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded text-[10px] font-bold">
                      {cr.referral_code}
                    </span>
                  </div>
                  <p className="text-zinc-400">+{cr.whatsapp_number} | {cr.email}</p>
                </div>

                <div className="flex items-center gap-2">
                  <select
                    value={cr.status}
                    onChange={(e) => handleAdminStatusChange(cr.id, e.target.value)}
                    className="bg-[#09090B] border border-[#27272A] text-white rounded-lg p-2 text-xs"
                  >
                    <option value="active">Active</option>
                    <option value="pending_verification">Pending</option>
                    <option value="suspended">Suspended</option>
                    <option value="banned">Banned</option>
                  </select>
                </div>
              </div>
            ))}
          </div>
        </main>
      )}
      {/* CREATOR DELIVERABLE SUBMISSION MODAL */}
      {submitModalOpen && selectedCampaignForSubmit && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#18181B] border border-[#27272A] rounded-2xl max-w-lg w-full p-6 space-y-4 text-xs shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-[#27272A] pb-3">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <UploadCloud className="h-5 w-5 text-amber-400" />
                  <span>Submit Deliverable Proof</span>
                </h3>
                <p className="text-zinc-400 text-[11px] mt-0.5">Campaign: {selectedCampaignForSubmit.title}</p>
              </div>
              <button
                onClick={() => setSubmitModalOpen(false)}
                className="p-1 text-zinc-400 hover:text-white cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="bg-[#09090B] p-3 rounded-xl border border-[#27272A] flex justify-between items-center">
              <div>
                <span className="text-zinc-400 text-[10px] block">Potential Commission</span>
                <span className="text-emerald-400 font-extrabold text-sm">
                  KSh {selectedCampaignForSubmit.commission_rate_kes.toLocaleString()} / sale
                </span>
              </div>
              <span className="text-zinc-400 text-[11px]">Deadline: {selectedCampaignForSubmit.deadline}</span>
            </div>

            <form onSubmit={handleSubmitDeliverable} className="space-y-4">
              <div>
                <label className="text-zinc-300 font-semibold block mb-1">Deliverable Type *</label>
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { type: 'image', label: 'Photo/Img', icon: Image },
                    { type: 'video', label: 'Video Clip', icon: Video },
                    { type: 'document', label: 'Document', icon: FileText },
                    { type: 'social_link', label: 'Post Link', icon: ExternalLink }
                  ].map((item) => {
                    const Icon = item.icon;
                    const isSelected = deliverableForm.submission_type === item.type;
                    return (
                      <button
                        type="button"
                        key={item.type}
                        onClick={() =>
                          setDeliverableForm({ ...deliverableForm, submission_type: item.type as any })
                        }
                        className={`p-2.5 rounded-xl border font-bold text-center flex flex-col items-center gap-1 transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-amber-500/10 border-amber-500 text-amber-400'
                            : 'bg-[#09090B] border-[#27272A] text-zinc-400 hover:text-white'
                        }`}
                      >
                        <Icon className="h-4 w-4" />
                        <span className="text-[10px]">{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="text-zinc-300 font-semibold block mb-1">
                  File / Media URL (Direct Link, Cloud Drive, Image, MP4, PDF)
                </label>
                <input
                  type="url"
                  placeholder="https://snackquest.co/uploads/creators/proof.jpg or .mp4 / Drive link"
                  value={deliverableForm.file_url}
                  onChange={(e) => setDeliverableForm({ ...deliverableForm, file_url: e.target.value })}
                  className="w-full bg-[#09090B] border border-[#27272A] text-white rounded-xl p-3 focus:outline-none focus:border-amber-500 font-mono text-[11px]"
                />
                <span className="text-[10px] text-zinc-500 mt-1 block">
                  You can upload photos, videos, or documents to any cloud drive/host and paste the URL here.
                </span>
              </div>

              <div>
                <label className="text-zinc-300 font-semibold block mb-1">File or Deliverable Name</label>
                <input
                  type="text"
                  placeholder="e.g. Swahili Chili TikTok Video Draft #1"
                  value={deliverableForm.file_name}
                  onChange={(e) => setDeliverableForm({ ...deliverableForm, file_name: e.target.value })}
                  className="w-full bg-[#09090B] border border-[#27272A] text-white rounded-xl p-3 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-zinc-300 font-semibold block mb-1">
                  Social Post Link (TikTok, Instagram Reel, YouTube Shorts, X)
                </label>
                <input
                  type="url"
                  placeholder="https://www.tiktok.com/@creator/video/123456789"
                  value={deliverableForm.social_link}
                  onChange={(e) => setDeliverableForm({ ...deliverableForm, social_link: e.target.value })}
                  className="w-full bg-[#09090B] border border-[#27272A] text-white rounded-xl p-3 focus:outline-none font-mono text-[11px]"
                />
              </div>

              <div>
                <label className="text-zinc-300 font-semibold block mb-1">Notes / Caption & Analytics for Brand</label>
                <textarea
                  rows={3}
                  placeholder="Include video engagement metrics, hashtags used, or notes for the admin..."
                  value={deliverableForm.notes}
                  onChange={(e) => setDeliverableForm({ ...deliverableForm, notes: e.target.value })}
                  className="w-full bg-[#09090B] border border-[#27272A] text-white rounded-xl p-3 focus:outline-none text-xs"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setSubmitModalOpen(false)}
                  className="w-1/2 py-3 bg-[#27272A] text-zinc-300 font-bold rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingDeliverable}
                  className="w-1/2 py-3 bg-amber-500 hover:bg-amber-400 text-black font-extrabold rounded-xl cursor-pointer flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20"
                >
                  {submittingDeliverable ? (
                    <RefreshCw className="h-4 w-4 animate-spin" />
                  ) : (
                    <span>Submit Proof</span>
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
