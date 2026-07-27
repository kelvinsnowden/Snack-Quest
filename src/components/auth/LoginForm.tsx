import React, { useState } from 'react';
import { ShieldCheck, Mail, Lock, ArrowRight, Sparkles } from 'lucide-react';
import { useApp } from '../../context/AppContext';

export const LoginForm: React.FC = () => {
  const { login } = useApp();
  const [email, setEmail] = useState('admin@snackquest.com');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    await login(email);
    setIsLoading(false);
  };

  return (
    <div className="min-h-screen bg-[#09090B] flex flex-col justify-center py-12 sm:px-6 lg:px-8 text-white font-sans">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        {/* Brand Icon */}
        <div className="mx-auto h-12 w-12 rounded-lg bg-blue-600 flex items-center justify-center text-white font-bold text-xl shadow-lg shadow-blue-600/20">
          SQ
        </div>
        <h2 className="mt-4 text-center text-2xl font-bold tracking-tight text-white">
          SNACK QUEST OPERATING SYSTEM
        </h2>
        <p className="mt-1.5 text-center text-xs text-[#71717A]">
          Enterprise Staff Portal — Invite-Only Access Control
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-[#18181B] border border-[#27272A] py-8 px-6 shadow-2xl rounded-lg sm:px-10">
          <form className="space-y-5" onSubmit={handleSubmit}>
            <div>
              <label className="block text-xs font-medium text-[#A1A1AA]">
                Staff Email Address
              </label>
              <div className="mt-1.5 relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#71717A]" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@snackquest.com"
                  className="w-full pl-9 pr-3 py-2 text-xs rounded-md border border-[#27272A] bg-[#09090B] text-white placeholder-[#71717A] focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-[#A1A1AA]">
                Password or Magic Key
              </label>
              <div className="mt-1.5 relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#71717A]" />
                <input
                  type="password"
                  defaultValue="••••••••••••"
                  className="w-full pl-9 pr-3 py-2 text-xs rounded-md border border-[#27272A] bg-[#09090B] text-white focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 text-xs font-medium rounded-md bg-blue-600 hover:bg-blue-500 text-white transition-colors cursor-pointer disabled:opacity-50"
            >
              {isLoading ? (
                <span>Authenticating...</span>
              ) : (
                <>
                  <span>Sign In to Operating System</span>
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </form>

          {/* Quick Preset Buttons for Testing */}
          <div className="mt-6 pt-5 border-t border-[#27272A]">
            <p className="text-[11px] font-medium text-[#71717A] mb-2">
              Fast Preview Accounts (Pre-Seeded Roles):
            </p>
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <button
                type="button"
                onClick={() => setEmail('admin@snackquest.com')}
                className="p-2 rounded-md border border-[#27272A] bg-[#09090B] hover:bg-[#27272A] text-left text-[#A1A1AA] hover:text-white cursor-pointer transition-colors"
              >
                <div className="font-bold text-white">Administrator</div>
                <div className="text-[10px] text-[#71717A]">admin@snackquest.com</div>
              </button>
              <button
                type="button"
                onClick={() => setEmail('david.ops@snackquest.com')}
                className="p-2 rounded-md border border-[#27272A] bg-[#09090B] hover:bg-[#27272A] text-left text-[#A1A1AA] hover:text-white cursor-pointer transition-colors"
              >
                <div className="font-bold text-white">Operations</div>
                <div className="text-[10px] text-[#71717A]">david.ops@snackquest.com</div>
              </button>
            </div>
          </div>
        </div>

        {/* Security badge */}
        <div className="mt-6 text-center text-[11px] text-[#71717A] flex items-center justify-center gap-1.5">
          <ShieldCheck className="h-4 w-4 text-green-500" />
          <span>Secured by PostgreSQL RLS & Service Token Auth</span>
        </div>
      </div>
    </div>
  );
};
