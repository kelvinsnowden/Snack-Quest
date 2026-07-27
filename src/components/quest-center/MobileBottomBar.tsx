import React from 'react';
import {
  Sparkles,
  Share2,
  Wallet,
  Trophy,
  User
} from 'lucide-react';
import { QuestTab } from './QuestCenterContainer';

interface MobileBottomBarProps {
  activeTab: QuestTab;
  setActiveTab: (tab: QuestTab) => void;
  onOpenQuickAction: () => void;
}

export default function MobileBottomBar({
  activeTab,
  setActiveTab
}: MobileBottomBarProps) {
  const bottomTabs = [
    { id: 'overview' as QuestTab, label: 'Home', icon: Sparkles },
    { id: 'referrals' as QuestTab, label: 'Earn', icon: Share2 },
    { id: 'affiliate_wallet' as QuestTab, label: 'Wallet', icon: Wallet, highlight: true },
    { id: 'quests' as QuestTab, label: 'Quests', icon: Trophy, badge: 'Daily' },
    { id: 'profile' as QuestTab, label: 'Profile', icon: User }
  ];

  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-slate-950/95 backdrop-blur-xl border-t border-slate-800/80 px-1 py-1.5 shadow-2xl">
      <div className="flex items-center justify-around relative max-w-md mx-auto">
        {bottomTabs.map((tab) => {
          const Icon = tab.icon;
          const isActive =
            activeTab === tab.id ||
            (tab.id === 'affiliate_wallet' && activeTab === 'wallet') ||
            (tab.id === 'referrals' && activeTab === 'submissions') ||
            (tab.id === 'profile' && activeTab === 'history');

          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex flex-col items-center justify-center min-w-[60px] min-h-[48px] py-1 px-1 rounded-2xl transition-all duration-200 relative active:scale-95 ${
                isActive
                  ? 'text-amber-400 font-extrabold bg-amber-500/10 border border-amber-500/30 shadow-lg'
                  : tab.highlight
                  ? 'text-emerald-400 font-bold hover:text-emerald-300'
                  : 'text-slate-400 hover:text-slate-200 font-medium'
              }`}
            >
              <Icon className={`w-5 h-5 ${isActive ? 'text-amber-400' : tab.highlight ? 'text-emerald-400' : ''}`} />
              <span className="text-[10px] leading-tight mt-0.5 font-sans">{tab.label}</span>

              {tab.badge && !isActive && (
                <span className="absolute top-1 right-2 w-2 h-2 bg-red-500 rounded-full animate-pulse" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

