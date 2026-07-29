import React, { useState } from 'react';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { CommandPalette } from '../common/CommandPalette';
import { ToastContainer } from '../common/Toast';
import { useApp } from '../../context/AppContext';
import { LoginForm } from '../auth/LoginForm';

export const AppLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, activeTab } = useApp();
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  if (!isAuthenticated) {
    return <LoginForm />;
  }

  const isQuestCenter = activeTab === 'quest_center';

  return (
    <div className="min-h-screen bg-[#09090B] text-[#FAFAFA] flex flex-col lg:flex-row transition-colors font-sans antialiased overflow-x-hidden">
      {/* Sidebar (Inline on desktop lg:flex, Off-canvas drawer on mobile) */}
      <Sidebar
        mobileOpen={mobileSidebarOpen}
        onCloseMobile={() => setMobileSidebarOpen(false)}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 bg-[#09090B] w-full">
        <TopBar
          onOpenMobileSidebar={() => setMobileSidebarOpen(true)}
          hideOnMobile={isQuestCenter}
        />
        <main className={`flex-1 w-full mx-auto ${
          isQuestCenter ? 'p-0 max-w-full' : 'p-3 sm:p-6 lg:p-8 max-w-7xl space-y-6'
        }`}>
          {children}
        </main>
      </div>

      {/* Global Command Palette (Cmd+K) */}
      <CommandPalette />

      {/* Global Toast Notifications */}
      <ToastContainer />
    </div>
  );
};
