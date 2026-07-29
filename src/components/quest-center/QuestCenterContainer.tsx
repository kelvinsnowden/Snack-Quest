import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import {
  Trophy,
  Wallet,
  Sparkles,
  Gift,
  Users,
  History,
  User,
  Bell,
  Clock,
  RefreshCw,
  Plus,
  QrCode,
  DollarSign
} from 'lucide-react';

import QuestOverview from './QuestOverview';
import CreatorDashboardHome from './CreatorDashboardHome';
import CreatorAffiliateWallet from './CreatorAffiliateWallet';
import CashWithdrawalModal from './CashWithdrawalModal';
import CustomerAuthModal from './CustomerAuthModal';
import AvailableQuests from './AvailableQuests';
import RewardsView from './RewardsView';
import ProfileView from './ProfileView';
import NotificationsDrawer from './NotificationsDrawer';
import { CreatorPortalAuth } from '../auth/CreatorPortalAuth';

// PWA Mobile Components
import MobileHeader from './MobileHeader';
import MobileBottomBar from './MobileBottomBar';
import MobileDrawerMenu from './MobileDrawerMenu';
import QRCodeModal from './QRCodeModal';
import { CardSkeleton } from './SkeletonLoaders';

export type QuestTab =
  | 'overview'
  | 'home'
  | 'quests'
  | 'rewards'
  | 'profile'
  | 'submissions'
  | 'wallet'
  | 'affiliate_wallet'
  | 'redeem'
  | 'referrals'
  | 'creator_auth'
  | 'history';

export default function QuestCenterContainer() {
  const { selectedCustomerId, setSelectedCustomerId, theme, toggleTheme, addToast } = useApp();
  const [activeTab, setActiveTab] = useState<QuestTab>('overview');
  const [customersList, setCustomersList] = useState<any[]>([]);
  const [overviewData, setOverviewData] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);

  // Mobile Drawers & Modals
  const [notificationsOpen, setNotificationsOpen] = useState<boolean>(false);
  const [menuOpen, setMenuOpen] = useState<boolean>(false);
  const [qrCodeOpen, setQrCodeOpen] = useState<boolean>(false);
  const [withdrawModalOpen, setWithdrawModalOpen] = useState<boolean>(false);
  const [authModalOpen, setAuthModalOpen] = useState<boolean>(false);

  // Offline & PWA States
  const [isOffline, setIsOffline] = useState<boolean>(!navigator.onLine);
  const [installPrompt, setInstallPrompt] = useState<any>(null);
  const [pushEnabled, setPushEnabled] = useState<boolean>(() => {
    return localStorage.getItem('snackquest_push_enabled') === 'true';
  });

  // Track PWA Installation Event
  useEffect(() => {
    const handleBeforeInstallPrompt = (e: any) => {
      e.preventDefault();
      setInstallPrompt(e);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    const handleOnline = () => {
      setIsOffline(false);
      addToast({ type: 'success', title: 'Back Online', message: 'Reconnected to My Snack Quest servers.' });
      fetchOverview();
    };

    const handleOffline = () => {
      setIsOffline(true);
      addToast({ type: 'error', title: 'Offline Mode', message: 'Showing cached wallet & profile data.' });
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Load available customer personas for switching
  useEffect(() => {
    fetch('/api/v1/customers')
      .then((res) => (res.ok && res.headers.get('content-type')?.includes('application/json') ? res.json() : null))
      .then((data) => {
        if (data && data.data && Array.isArray(data.data)) {
          setCustomersList(data.data);
        }
      })
      .catch((err) => console.error('Failed to load customers list', err));
  }, []);

  // Fetch Overview Data with Offline LocalStorage Fallback
  const fetchOverview = () => {
    setLoading(true);
    fetch(`/api/v1/customer/portal/overview?customer_id=${selectedCustomerId}`)
      .then((res) => (res.ok && res.headers.get('content-type')?.includes('application/json') ? res.json() : null))
      .then((data) => {
        if (data) {
          setOverviewData(data);
          try {
            localStorage.setItem(`quest_overview_${selectedCustomerId}`, JSON.stringify(data));
          } catch (e) {
            console.error('Failed to cache overview', e);
          }
        }
        setLoading(false);
      })
      .catch((err) => {
        console.error('Failed to load customer portal overview, loading cache', err);
        // Load from cache if offline
        const cached = localStorage.getItem(`quest_overview_${selectedCustomerId}`);
        if (cached) {
          try {
            setOverviewData(JSON.parse(cached));
          } catch (e) {
            console.error('Failed to parse cached overview', e);
          }
        }
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchOverview();
  }, [selectedCustomerId]);

  // Handle PWA App Install Action
  const handleInstallApp = async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === 'accepted') {
      addToast({ type: 'success', title: 'App Installed!', message: 'My Snack Quest is now on your home screen.' });
      setInstallPrompt(null);
    }
  };

  // Toggle Push Notifications Hook
  const handleTogglePush = async () => {
    if (!pushEnabled) {
      if ('Notification' in window) {
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
          setPushEnabled(true);
          localStorage.setItem('snackquest_push_enabled', 'true');
          addToast({ type: 'success', title: 'Notifications Enabled', message: 'You will receive quest credit updates.' });
        } else {
          addToast({ type: 'error', title: 'Permission Denied', message: 'Notifications were disabled in browser settings.' });
        }
      } else {
        addToast({ type: 'error', title: 'Not Supported', message: 'Push notifications are not supported on this browser.' });
      }
    } else {
      setPushEnabled(false);
      localStorage.setItem('snackquest_push_enabled', 'false');
      addToast({ type: 'info', title: 'Notifications Muted', message: 'Push notifications disabled.' });
    }
  };

  // Primary Desktop Navigation Items
  const desktopNavItems = [
    { id: 'overview' as QuestTab, label: 'Creator Dashboard', icon: Sparkles },
    { id: 'creator_auth' as QuestTab, label: 'Creator Portal & Onboarding', icon: Sparkles, badge: 'New' },
    { id: 'affiliate_wallet' as QuestTab, label: 'Affiliate Cash Wallet', icon: DollarSign, highlight: true },
    { id: 'quests' as QuestTab, label: 'Quests', icon: Trophy, badge: 'Active' },
    { id: 'rewards' as QuestTab, label: 'Quest Discounts', icon: Wallet },
    { id: 'profile' as QuestTab, label: 'My Profile', icon: User }
  ];

  const currentCustomer = overviewData?.customer;
  const wallet = overviewData?.wallet;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans pb-24 md:pb-8 selection:bg-amber-500 selection:text-slate-950">
      {/* Mobile Sticky Header */}
      <MobileHeader
        selectedCustomerId={selectedCustomerId}
        setSelectedCustomerId={setSelectedCustomerId}
        customersList={customersList}
        overviewData={overviewData}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onOpenNotifications={() => setNotificationsOpen(true)}
        onOpenMenu={() => setMenuOpen(true)}
        isOffline={isOffline}
        theme={theme}
        toggleTheme={toggleTheme}
        installPrompt={installPrompt}
        onInstallApp={handleInstallApp}
      />

      {/* Desktop Navigation Tabs (Hidden on Mobile) */}
      <div className="hidden md:block bg-slate-900/60 border-b border-slate-800/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <nav className="flex items-center space-x-2 py-2.5">
            {desktopNavItems.map((item) => {
              const Icon = item.icon;
              const isActive =
                activeTab === item.id ||
                (item.id === 'rewards' && (activeTab === 'wallet' || activeTab === 'redeem')) ||
                (item.id === 'profile' && (activeTab === 'referrals' || activeTab === 'submissions' || activeTab === 'history'));

              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap min-h-[40px] ${
                    isActive
                      ? 'bg-amber-500 text-slate-950 font-extrabold shadow-md shadow-amber-500/20'
                      : item.highlight
                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/20'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                  }`}
                >
                  <Icon className={`w-4 h-4 ${isActive ? 'text-slate-950' : item.highlight ? 'text-emerald-400' : 'text-slate-400'}`} />
                  <span>{item.label}</span>
                  {item.badge && (
                    <span className="px-1.5 py-0.2 text-[9px] font-extrabold uppercase rounded bg-red-500 text-white">
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}

            <div className="ml-auto flex items-center gap-2">
              <button
                onClick={() => setAuthModalOpen(true)}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs rounded-xl border border-slate-700"
              >
                Creator Login
              </button>
            </div>
          </nav>
        </div>
      </div>

      {/* Main Responsive View Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6">
        {loading ? (
          <div className="space-y-4 max-w-4xl mx-auto">
            <CardSkeleton />
            <CardSkeleton />
            <CardSkeleton />
          </div>
        ) : (
          <div className="animate-in fade-in duration-200">
            {(activeTab === 'overview' || activeTab === 'home') && (
              <CreatorDashboardHome
                overviewData={overviewData}
                onNavigate={(tab) => setActiveTab(tab)}
                onRefresh={fetchOverview}
                onOpenWithdrawModal={() => setWithdrawModalOpen(true)}
                onOpenQRModal={() => setQrCodeOpen(true)}
              />
            )}

            {activeTab === 'creator_auth' && (
              <CreatorPortalAuth
                onComplete={() => {
                  fetchOverview();
                  setActiveTab('overview');
                }}
              />
            )}

            {activeTab === 'affiliate_wallet' && (
              <CreatorAffiliateWallet
                customerId={selectedCustomerId}
                onOpenWithdrawModal={() => setWithdrawModalOpen(true)}
              />
            )}

            {activeTab === 'quests' && (
              <AvailableQuests
                customerId={selectedCustomerId}
                onSubmissionCreated={() => {
                  fetchOverview();
                  addToast({ type: 'success', title: 'Quest Submitted!', message: 'Your proof has been submitted for verification.' });
                }}
              />
            )}

            {(activeTab === 'rewards' || activeTab === 'wallet' || activeTab === 'redeem') && (
              <RewardsView
                customerId={selectedCustomerId}
                wallet={wallet}
                initialSubTab={activeTab === 'wallet' ? 'wallet' : 'redeem'}
                onRedeemed={() => {
                  fetchOverview();
                }}
              />
            )}

            {(activeTab === 'profile' || activeTab === 'referrals' || activeTab === 'submissions' || activeTab === 'history') && (
              <ProfileView
                customer={currentCustomer}
                overviewData={overviewData}
                onProfileUpdated={fetchOverview}
                onResubmit={() => setActiveTab('quests')}
                initialSubTab={
                  activeTab === 'referrals'
                    ? 'referrals'
                    : activeTab === 'submissions'
                    ? 'submissions'
                    : 'profile'
                }
              />
            )}
          </div>
        )}
      </main>

      {/* Floating Action Button (FAB) for Quick Action on Mobile */}
      <div className="md:hidden fixed bottom-16 right-4 z-40">
        <button
          onClick={() => setActiveTab('quests')}
          className="w-13 h-13 rounded-full bg-gradient-to-r from-amber-500 to-orange-500 text-slate-950 font-bold p-3 shadow-2xl shadow-amber-500/40 border border-amber-300 flex items-center justify-center active:scale-95 transition-all"
          title="Browse Daily Quests"
        >
          <Trophy className="w-6 h-6" />
        </button>
      </div>

      {/* Mobile Bottom Navigation Bar */}
      <MobileBottomBar
        activeTab={
          activeTab === 'wallet' || activeTab === 'redeem'
            ? 'rewards'
            : activeTab === 'referrals' || activeTab === 'submissions' || activeTab === 'history'
            ? 'profile'
            : activeTab
        }
        setActiveTab={setActiveTab}
        onOpenQuickAction={() => setActiveTab('quests')}
      />

      {/* Slide-out Mobile Menu Drawer */}
      <MobileDrawerMenu
        isOpen={menuOpen}
        onClose={() => setMenuOpen(false)}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        overviewData={overviewData}
        theme={theme}
        toggleTheme={toggleTheme}
        installPrompt={installPrompt}
        onInstallApp={handleInstallApp}
        onOpenQRCode={() => setQrCodeOpen(true)}
        pushEnabled={pushEnabled}
        onTogglePush={handleTogglePush}
        isOffline={isOffline}
        selectedCustomerId={selectedCustomerId}
        setSelectedCustomerId={setSelectedCustomerId}
        customersList={customersList}
      />

      {/* QR Code Scanner & Share Modal */}
      <QRCodeModal
        isOpen={qrCodeOpen}
        onClose={() => setQrCodeOpen(false)}
        referralCode={overviewData?.referral?.referral_code || 'WANJ123'}
        referralLink={overviewData?.referral?.referral_link || `https://snackquest.co.ke/join?ref=${selectedCustomerId}`}
      />

      {/* Cash Withdrawal Modal */}
      <CashWithdrawalModal
        isOpen={withdrawModalOpen}
        onClose={() => setWithdrawModalOpen(false)}
        customerId={selectedCustomerId}
        customerName={currentCustomer?.full_name || 'Creator'}
        customerPhone={currentCustomer?.phone || ''}
        availableCashKes={overviewData?.wallet?.available_cash_kes ?? 2000}
        onSuccess={() => {
          fetchOverview();
          addToast({ type: 'success', title: 'Withdrawal Requested', message: 'Cash transfer queued to your M-Pesa / Bank account.' });
        }}
      />

      {/* Customer Auth Modal */}
      <CustomerAuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        onLoginSuccess={(customer) => {
          if (customer?.id) {
            setSelectedCustomerId(customer.id);
            addToast({ type: 'success', title: 'Logged In', message: `Welcome ${customer.full_name}` });
          }
        }}
      />

      {/* Notification Drawer Component */}
      <NotificationsDrawer
        isOpen={notificationsOpen}
        onClose={() => setNotificationsOpen(false)}
        customerId={selectedCustomerId}
        onRead={fetchOverview}
      />
    </div>
  );
}
