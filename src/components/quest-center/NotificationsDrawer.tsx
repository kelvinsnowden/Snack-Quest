import React, { useState, useEffect } from 'react';
import { Bell, X, Check, Clock, ShieldCheck, Mail, Sparkles } from 'lucide-react';

interface NotificationsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  customerId: string;
  onRead: () => void;
}

export default function NotificationsDrawer({ isOpen, onClose, customerId, onRead }: NotificationsDrawerProps) {
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  const fetchNotifications = () => {
    if (!isOpen) return;
    setLoading(true);
    fetch(`/api/v1/customer/portal/notifications?customer_id=${customerId}`)
      .then((res) => (res.ok && res.headers.get('content-type')?.includes('application/json') ? res.json() : null))
      .then((data) => {
        if (data && data.data && Array.isArray(data.data)) {
          setNotifications(data.data);
        }
        setLoading(false);
      })
      .catch((err) => {
        console.error('Failed to fetch notifications', err);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchNotifications();
  }, [isOpen, customerId]);

  const markAsRead = (id: string) => {
    fetch(`/api/v1/customer/portal/notifications/${id}/read`, { method: 'POST' })
      .then(() => {
        fetchNotifications();
        onRead();
      })
      .catch((err) => console.error('Failed mark read', err));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-slate-900 border-l border-slate-800 h-full flex flex-col shadow-2xl">
        {/* Drawer Header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bell className="w-5 h-5 text-amber-400" />
            <h3 className="font-bold text-white text-base">Notifications Center</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Drawer Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {loading ? (
            <div className="py-12 text-center text-xs text-slate-400">Loading notifications...</div>
          ) : notifications.length === 0 ? (
            <div className="py-10 text-center text-xs text-slate-300 bg-slate-950 rounded-2xl p-6 border border-slate-800 space-y-2">
              <p className="font-bold text-white text-sm">No notifications yet</p>
              <p className="text-slate-400 text-xs leading-relaxed">
                We'll notify you when your order ships, your quest is reviewed, your payout is approved, or your referral converts.
              </p>
            </div>
          ) : (
            notifications.map((n) => {
              const isUnread = n.status !== 'delivered';
              const payload = n.payload || {};

              return (
                <div
                  key={n.id}
                  onClick={() => markAsRead(n.id)}
                  className={`p-4 rounded-2xl border transition-all cursor-pointer ${
                    isUnread
                      ? 'bg-amber-500/10 border-amber-500/40 text-white'
                      : 'bg-slate-950 border-slate-800/80 text-slate-300 opacity-80'
                  }`}
                >
                  <div className="flex justify-between items-start mb-1">
                    <span className="font-bold text-xs text-amber-300 uppercase tracking-wider">
                      {n.template_code.replace(/_/g, ' ')}
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">
                      {new Date(n.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>

                  <p className="text-xs text-slate-200 leading-relaxed mb-2">
                    {payload.quest_title
                      ? `Quest submission for "${payload.quest_title}" is ${payload.status}.`
                      : payload.credits_used_kes
                      ? `Redeemed ${payload.credits_used_kes} KES Quest Credits on order #${payload.order_id}.`
                      : 'Notification update regarding your Quest account.'}
                  </p>

                  <div className="flex justify-between items-center text-[10px] text-slate-400 font-semibold pt-1 border-t border-slate-800/50">
                    <span>Channel: {n.channel?.toUpperCase() || 'EMAIL'}</span>
                    {isUnread ? (
                      <span className="text-amber-400 font-bold">NEW</span>
                    ) : (
                      <span className="text-slate-500">Read</span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
