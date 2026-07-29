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
    { id: 'quests' as QuestTab, label: 'Quests', icon: Trophy, badge: 'Active' },
    { id: 'profile' as QuestTab, label: 'Profile', icon: User }
  ];

  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-zinc-950/85 backdrop-blur-xl border-t border-zinc-800/80 px-2 py-1 shadow-2xl select-none">
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
              className={`flex flex-col items-center justify-center min-w-[56px] min-h-[48px] py-1 px-1 rounded-xl transition-all duration-150 relative active:scale-95 cursor-pointer ${
                isActive
                  ? 'text-amber-400 font-bold bg-amber-500/10'
                  : tab.highlight
                  ? 'text-emerald-400 font-medium hover:text-emerald-300'
                  : 'text-zinc-400 hover:text-zinc-200 font-medium'
              }`}
            >
              <Icon className={`w-4 h-4 transition-transform ${isActive ? 'scale-110 text-amber-400' : tab.highlight ? 'text-emerald-400' : 'text-zinc-400'}`} />
              <span className={`text-[10px] leading-tight mt-1 tracking-tight ${isActive ? 'font-bold text-amber-400' : 'text-zinc-400'}`}>
                {tab.label}
              </span>

              {tab.badge && !isActive && (
                <span className="absolute top-1.5 right-3 w-1.5 h-1.5 bg-amber-400 rounded-full" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
