import React, { useState } from 'react';
import { Bell, CheckCircle2, AlertTriangle, Activity, X } from 'lucide-react';
import { useApp } from '../../context/AppContext';

export const NotificationBell: React.FC = () => {
  const { integrationStats } = useApp();
  const [isOpen, setIsOpen] = useState(false);

  const notifications = [
    {
      id: '1',
      title: 'Database Schema Active',
      message: 'All 36 enterprise tables initialized with RLS & indexes',
      time: 'Just now',
      type: 'info'
    },
    {
      id: '2',
      title: 'Make Webhook Endpoints Ready',
      message: '/api/v1/webhooks/make listening with idempotency protection',
      time: '2 mins ago',
      type: 'success'
    },
    {
      id: '3',
      title: 'Audit Trail Online',
      message: 'Staff actions logging actively to PostgreSQL audit table',
      time: '5 mins ago',
      type: 'info'
    }
  ];

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 hover:bg-[#27272A] rounded-full transition-colors text-[#A1A1AA] hover:text-white cursor-pointer"
        title="Notifications & System Alerts"
      >
        <Bell className="h-5 w-5" />
        <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 bg-[#18181B] border border-[#27272A] rounded-md shadow-2xl z-50 overflow-hidden animate-scale-up">
          <div className="p-3.5 border-b border-[#27272A] flex items-center justify-between bg-[#09090B]">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-blue-500" />
              <h4 className="text-xs font-semibold uppercase tracking-wider text-[#71717A]">System Notifications</h4>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="p-1 text-[#71717A] hover:text-white rounded-md cursor-pointer transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="divide-y divide-[#27272A] max-h-72 overflow-y-auto">
            {notifications.map((n) => (
              <div key={n.id} className="p-3.5 hover:bg-[#27272A]/50 transition-colors">
                <div className="flex items-start gap-2.5">
                  <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-xs font-medium text-white">{n.title}</p>
                    <p className="text-[11px] text-[#A1A1AA] mt-0.5">{n.message}</p>
                    <span className="text-[10px] text-[#71717A] mt-1 block">{n.time}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="p-2.5 border-t border-[#27272A] bg-[#09090B] text-center text-[11px] text-[#71717A] font-mono">
            System status: Operational (100% Uptime)
          </div>
        </div>
      )}
    </div>
  );
};
