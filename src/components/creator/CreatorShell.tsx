import React, { useState } from 'react';
import { Sparkles, Menu, LogOut } from 'lucide-react';
import { PillTabs } from '../common/PillTabs';
import { Drawer } from '../common/Modal';
import { CREATOR_NAV_ITEMS, MOBILE_PRIMARY_SECTIONS, CreatorSection } from './nav';
import { CreatorDashboardPayload } from './creatorApi';
import { DashboardView } from './views/DashboardView';
import { CampaignsView } from './views/CampaignsView';
import { AnalyticsView } from './views/AnalyticsView';
import { ReferralsView } from './views/ReferralsView';
import { EarningsView } from './views/EarningsView';
import { PaymentsView } from './views/PaymentsView';
import { AchievementsView } from './views/AchievementsView';
import { ProfileView } from './views/ProfileView';
import { SupportView } from './views/SupportView';
import { ComingSoonView } from './views/ComingSoonView';

interface CreatorShellProps {
  payload: CreatorDashboardPayload | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onSignOut: () => void;
  onOpenWithdraw: () => void;
}

const COMING_SOON_COPY: Partial<Record<CreatorSection, { title: string; description: string }>> = {
  content: {
    title: 'Content library is coming soon',
    description: 'A hub for approved content, brand assets, and captions is on the roadmap.'
  },
  resources: {
    title: 'Resources are coming soon',
    description: 'Guides, brand kits, and creator best-practices will live here.'
  },
  notifications: {
    title: 'Notifications are coming soon',
    description: "We're building a creator-specific notification feed — for now, updates arrive by WhatsApp and email."
  },
  settings: {
    title: 'Settings are coming soon',
    description: 'Notification preferences and payout defaults will be configurable here.'
  }
};

export const CreatorShell: React.FC<CreatorShellProps> = ({ payload, loading, error, onRetry, onSignOut, onOpenWithdraw }) => {
  const [activeSection, setActiveSection] = useState<CreatorSection>('dashboard');
  const [menuOpen, setMenuOpen] = useState(false);

  const handleNavigate = (section: CreatorSection) => {
    setActiveSection(section);
    setMenuOpen(false);
  };

  const mobileItems = CREATOR_NAV_ITEMS.filter((item) => MOBILE_PRIMARY_SECTIONS.includes(item.id));
  const overflowItems = CREATOR_NAV_ITEMS.filter((item) => !MOBILE_PRIMARY_SECTIONS.includes(item.id));

  const commonProps = { payload, loading, error, onRetry };

  const renderSection = () => {
    switch (activeSection) {
      case 'dashboard':
        return <DashboardView {...commonProps} onNavigate={handleNavigate} onOpenWithdraw={onOpenWithdraw} />;
      case 'campaigns':
        return <CampaignsView {...commonProps} />;
      case 'analytics':
        return <AnalyticsView {...commonProps} />;
      case 'referrals':
        return <ReferralsView {...commonProps} />;
      case 'earnings':
        return <EarningsView {...commonProps} onOpenWithdraw={onOpenWithdraw} />;
      case 'payments':
        return <PaymentsView {...commonProps} onOpenWithdraw={onOpenWithdraw} />;
      case 'achievements':
        return <AchievementsView {...commonProps} />;
      case 'profile':
        return <ProfileView {...commonProps} onSignOut={onSignOut} />;
      case 'support':
        return <SupportView />;
      default: {
        const copy = COMING_SOON_COPY[activeSection] || { title: 'Coming soon', description: 'This section is on the roadmap.' };
        return <ComingSoonView title={copy.title} description={copy.description} />;
      }
    }
  };

  return (
    <div className="min-h-screen bg-creator-canvas text-creator-ink flex flex-col pb-20 md:pb-0">
      <header className="sticky top-0 z-30 bg-creator-canvas/95 backdrop-blur border-b border-creator-border">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3.5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-8 h-8 rounded-creator-control bg-creator-brand/10 border border-creator-brand/30 flex items-center justify-center shrink-0">
              <Sparkles className="h-4 w-4 text-creator-brand" aria-hidden="true" />
            </span>
            <span className="font-bold text-creator-ink truncate">Creator Portal</span>
          </div>

          <div className="hidden md:flex items-center gap-3">
            {payload && (
              <span className="text-creator-caption font-semibold text-creator-ink-muted truncate max-w-[12rem]">
                {payload.creator.full_name}
              </span>
            )}
            <button
              type="button"
              onClick={onSignOut}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-creator-control text-creator-caption font-semibold text-creator-ink-faint hover:text-creator-ink hover:bg-creator-surface-hover transition-colors"
            >
              <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
              Sign out
            </button>
          </div>

          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            className="md:hidden p-2 rounded-creator-control text-creator-ink-muted hover:text-creator-ink hover:bg-creator-surface-hover"
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div className="hidden md:block max-w-6xl mx-auto px-4 sm:px-6 pb-3">
          <PillTabs
            ariaLabel="Creator Portal sections"
            items={CREATOR_NAV_ITEMS.map((item) => ({
              id: item.id,
              label: item.label,
              icon: item.icon,
              badge: item.status === 'soon' ? 'Soon' : undefined
            }))}
            activeId={activeSection}
            onChange={(id) => handleNavigate(id as CreatorSection)}
          />
        </div>
      </header>

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-6 sm:py-8">{renderSection()}</main>

      <nav
        aria-label="Primary"
        className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-creator-surface border-t border-creator-border flex items-stretch"
      >
        {mobileItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeSection === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => handleNavigate(item.id)}
              aria-current={isActive ? 'page' : undefined}
              className="flex-1 min-h-[56px] flex flex-col items-center justify-center gap-1 focus:outline-none"
            >
              <Icon className={`h-5 w-5 ${isActive ? 'text-creator-brand' : 'text-creator-ink-faint'}`} aria-hidden="true" />
              <span className={`text-[10px] font-semibold ${isActive ? 'text-creator-brand' : 'text-creator-ink-faint'}`}>
                {item.label}
              </span>
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => setMenuOpen(true)}
          className="flex-1 min-h-[56px] flex flex-col items-center justify-center gap-1 text-creator-ink-faint"
        >
          <Menu className="h-5 w-5" aria-hidden="true" />
          <span className="text-[10px] font-semibold">More</span>
        </button>
      </nav>

      <Drawer isOpen={menuOpen} onClose={() => setMenuOpen(false)} title="More">
        <div className="space-y-1">
          {overflowItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeSection === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleNavigate(item.id)}
                className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-creator-control text-creator-body font-medium transition-colors ${
                  isActive ? 'bg-creator-brand/10 text-creator-brand' : 'text-creator-ink hover:bg-creator-surface-hover'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="flex-1 text-left">{item.label}</span>
                {item.status === 'soon' && (
                  <span className="text-[10px] font-bold uppercase tracking-wide text-creator-ink-faint bg-creator-surface-hover px-1.5 py-0.5 rounded-full">
                    Soon
                  </span>
                )}
              </button>
            );
          })}
          <div className="pt-3 mt-3 border-t border-creator-border">
            <button
              type="button"
              onClick={onSignOut}
              className="w-full flex items-center gap-3 px-3.5 py-3 rounded-creator-control text-creator-danger hover:bg-creator-danger/10 font-medium transition-colors"
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
              Sign out
            </button>
          </div>
        </div>
      </Drawer>
    </div>
  );
};
