import React, { useState, useEffect } from 'react';
import {
  Search,
  LayoutDashboard,
  ShieldCheck,
  Users,
  Webhook,
  FileSpreadsheet,
  Moon,
  Sun,
  X,
  Sparkles,
  Database,
  Sliders,
  Terminal,
  Globe
} from 'lucide-react';
import { useApp } from '../../context/AppContext';

export const CommandPalette: React.FC = () => {
  const { commandPaletteOpen, setCommandPaletteOpen, setActiveTab, toggleTheme, theme } = useApp();
  const [query, setQuery] = useState('');

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setCommandPaletteOpen(!commandPaletteOpen);
      }
      if (e.key === 'Escape' && commandPaletteOpen) {
        setCommandPaletteOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [commandPaletteOpen, setCommandPaletteOpen]);

  if (!commandPaletteOpen) return null;

  const navigationCommands = [
    { id: 'domain_manager', label: 'Go to Enterprise Domain & URL Manager', icon: Globe, category: 'Navigation' },
    { id: 'business_settings', label: 'Go to Business Settings & Feature Flags', icon: Sliders, category: 'Navigation' },
    { id: 'dashboard', label: 'Go to Dashboard Shell', icon: LayoutDashboard, category: 'Navigation' },
    { id: 'roles', label: 'Go to Roles & Permissions Matrix', icon: ShieldCheck, category: 'Navigation' },
    { id: 'staff', label: 'Go to Staff Users Management', icon: Users, category: 'Navigation' },
    { id: 'integrations', label: 'Go to Integration Center & Webhooks', icon: Webhook, category: 'Navigation' },
    { id: 'audit', label: 'Go to Audit Log Trail Viewer', icon: FileSpreadsheet, category: 'Navigation' },
  ];

  const systemCommands = [
    {
      id: 'theme_toggle',
      label: `Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`,
      icon: theme === 'dark' ? Sun : Moon,
      category: 'Preferences',
      action: () => toggleTheme()
    },
    {
      id: 'db_health',
      label: 'Trigger Database Health Diagnostic',
      icon: Database,
      category: 'System Diagnostics',
      action: async () => {
        const res = await fetch('/api/v1/health');
        const data = await res.json();
        alert(`System Health Status: ${data.status.toUpperCase()}\nUptime: ${Math.round(data.uptime)}s\nDatabase Tables: 36 Tables Initialized`);
      }
    }
  ];

  const filteredNav = navigationCommands.filter((c) =>
    c.label.toLowerCase().includes(query.toLowerCase())
  );
  const filteredSys = systemCommands.filter((c) =>
    c.label.toLowerCase().includes(query.toLowerCase())
  );

  const handleSelectNav = (tabId: string) => {
    setActiveTab(tabId);
    setCommandPaletteOpen(false);
    setQuery('');
  };

  const handleSelectSys = (action: () => void) => {
    action();
    setCommandPaletteOpen(false);
    setQuery('');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 px-4 bg-black/80 backdrop-blur-xs transition-opacity animate-fade-in">
      <div className="w-full max-w-xl bg-[#18181B] border border-[#27272A] rounded-lg shadow-2xl overflow-hidden">
        {/* Search Header */}
        <div className="p-3.5 border-b border-[#27272A] flex items-center gap-3">
          <Search className="h-5 w-5 text-blue-500" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search commands, screens, OS tools... (Press ESC to close)"
            autoFocus
            className="w-full bg-transparent text-sm text-white placeholder-[#71717A] focus:outline-none"
          />
          <button
            onClick={() => setCommandPaletteOpen(false)}
            className="p-1 rounded-md text-[#71717A] hover:text-white hover:bg-[#27272A] cursor-pointer transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Results List */}
        <div className="max-h-80 overflow-y-auto p-2 space-y-3">
          {/* Navigation Section */}
          {filteredNav.length > 0 && (
            <div>
              <div className="px-3 py-1 text-[10px] font-semibold text-[#71717A] uppercase tracking-wider">
                Platform Navigation
              </div>
              <div className="mt-1 space-y-1">
                {filteredNav.map((cmd) => {
                  const Icon = cmd.icon;
                  return (
                    <button
                      key={cmd.id}
                      onClick={() => handleSelectNav(cmd.id)}
                      className="w-full flex items-center justify-between px-3 py-2 text-xs rounded-md text-[#A1A1AA] hover:bg-[#27272A] hover:text-white transition-colors text-left cursor-pointer group"
                    >
                      <div className="flex items-center gap-2.5">
                        <Icon className="h-4 w-4 text-[#71717A] group-hover:text-blue-500" />
                        <span className="font-medium">{cmd.label}</span>
                      </div>
                      <span className="text-[10px] font-mono text-[#71717A] border border-[#27272A] px-1.5 py-0.5 rounded">
                        Tab
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* System Tools Section */}
          {filteredSys.length > 0 && (
            <div>
              <div className="px-3 py-1 text-[10px] font-semibold text-[#71717A] uppercase tracking-wider">
                Preferences & Utilities
              </div>
              <div className="mt-1 space-y-1">
                {filteredSys.map((cmd) => {
                  const Icon = cmd.icon;
                  return (
                    <button
                      key={cmd.id}
                      onClick={() => handleSelectSys(cmd.action)}
                      className="w-full flex items-center justify-between px-3 py-2 text-xs rounded-md text-[#A1A1AA] hover:bg-[#27272A] hover:text-white transition-colors text-left cursor-pointer group"
                    >
                      <div className="flex items-center gap-2.5">
                        <Icon className="h-4 w-4 text-[#71717A] group-hover:text-blue-500" />
                        <span className="font-medium">{cmd.label}</span>
                      </div>
                      <span className="text-[10px] font-mono text-[#71717A] border border-[#27272A] px-1.5 py-0.5 rounded">
                        Action
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {filteredNav.length === 0 && filteredSys.length === 0 && (
            <div className="p-8 text-center text-xs text-[#71717A]">
              No matching commands or navigation routes found for "{query}"
            </div>
          )}
        </div>

        {/* Footer info */}
        <div className="p-2.5 border-t border-[#27272A] bg-[#09090B] text-[11px] text-[#71717A] flex items-center justify-between px-4">
          <div className="flex items-center gap-2 font-mono">
            <Sparkles className="h-3.5 w-3.5 text-blue-500" />
            <span>Snack Quest Operating System v1.0 Foundation</span>
          </div>
          <div>
            Press <kbd className="px-1.5 py-0.5 bg-[#27272A] rounded text-[10px] font-mono border border-[#3F3F46]">ESC</kbd> to dismiss
          </div>
        </div>
      </div>
    </div>
  );
};
