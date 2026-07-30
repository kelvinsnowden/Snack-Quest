import React, { useState } from 'react';
import QuestCenterContainer from '../quest-center/QuestCenterContainer';
import { Sparkles, ShoppingBag, ShieldCheck, User, LogOut, Phone, Smartphone, Lock, ArrowRight, MessageSquare } from 'lucide-react';
import { setDevPortalOverride } from '../../lib/domainResolver';

export const CustomerQuestPortal: React.FC = () => {
  // Customer Session State
  const [customer, setCustomer] = useState<any>(() => {
    const saved = localStorage.getItem('sq_customer_session');
    return saved ? JSON.parse(saved) : {
      id: 'cust-1',
      name: 'Wanjiru Kamau',
      phone: '0722000111',
      wallet_balance: 4500,
      quest_credits: 320,
      referral_code: 'WANJ123'
    };
  });

  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [loginPhone, setLoginPhone] = useState('0722000111');
  const [otpCode, setOtpCode] = useState('');
  const [step, setStep] = useState<'phone' | 'otp'>('phone');

  const handleCustomerLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (step === 'phone') {
      setStep('otp');
    } else {
      const newCustomer = {
        id: `cust-${Math.floor(Math.random() * 900 + 100)}`,
        name: 'Kenyan Snack Questor',
        phone: loginPhone,
        wallet_balance: 3000,
        quest_credits: 150,
        referral_code: `SQ-${Math.random().toString(36).substring(2, 7).toUpperCase()}`
      };
      setCustomer(newCustomer);
      localStorage.setItem('sq_customer_session', JSON.stringify(newCustomer));
      setIsLoginOpen(false);
      setStep('phone');
    }
  };

  const handleLogout = () => {
    setCustomer(null);
    localStorage.removeItem('sq_customer_session');
  };

  return (
    <div className="min-h-screen bg-[#09090B] text-zinc-100 font-sans antialiased flex flex-col">
      {/* Top Customer Brand Header */}
      <header className="sticky top-0 z-40 bg-[#18181B]/95 backdrop-blur-md border-b border-[#27272A] px-4 py-3 flex items-center justify-between shadow-md">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-purple-600 to-indigo-500 flex items-center justify-center font-black text-white text-sm shadow-md shadow-purple-600/20">
            SQ
          </div>
          <div>
            <span className="font-extrabold text-white text-sm tracking-tight block">
              quest.snackquests.shop
            </span>
            <span className="text-[10px] text-purple-400 font-medium block -mt-0.5">
              Customer Quest Center & Loyalty Wallet
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs">
          {customer ? (
            <div className="flex items-center gap-2">
              <div className="bg-[#09090B] border border-[#27272A] px-3 py-1.5 rounded-xl text-right hidden sm:block">
                <span className="font-bold text-white block text-xs">{customer.name}</span>
                <span className="text-[10px] text-emerald-400 font-mono">
                  Wallet: KSh {customer.wallet_balance?.toLocaleString()}
                </span>
              </div>
              <button
                onClick={handleLogout}
                className="p-2 text-zinc-400 hover:text-rose-400 cursor-pointer transition-colors"
                title="Sign Out"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setIsLoginOpen(true)}
              className="px-3.5 py-1.5 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-xl text-xs shadow-md shadow-purple-600/20 cursor-pointer"
            >
              Customer Sign In
            </button>
          )}
        </div>
      </header>

      {/* Main Quest Center Consumer UI */}
      <main className="flex-1 max-w-5xl w-full mx-auto p-4">
        <QuestCenterContainer />
      </main>

      {/* Customer Quick Login Modal */}
      {isLoginOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#18181B] border border-[#27272A] w-full max-w-sm rounded-2xl p-6 space-y-6 shadow-2xl relative">
            <div className="text-center space-y-1">
              <div className="w-10 h-10 rounded-2xl bg-purple-600/10 text-purple-400 border border-purple-500/20 flex items-center justify-center mx-auto">
                <Sparkles className="h-5 w-5" />
              </div>
              <h3 className="text-lg font-bold text-white">Customer Sign In</h3>
              <p className="text-xs text-zinc-400">Access your active orders & Quest credits</p>
            </div>

            <form onSubmit={handleCustomerLogin} className="space-y-4 text-xs">
              {step === 'phone' ? (
                <div>
                  <label className="text-zinc-300 font-medium block mb-1">M-Pesa / WhatsApp Number</label>
                  <div className="relative">
                    <Smartphone className="absolute left-3 top-3 h-4 w-4 text-zinc-500" />
                    <input
                      type="tel"
                      required
                      placeholder="0722000111"
                      value={loginPhone}
                      onChange={(e) => setLoginPhone(e.target.value)}
                      className="w-full bg-[#09090B] border border-[#27272A] text-white rounded-xl pl-10 pr-3 py-2.5 focus:outline-none focus:border-purple-500"
                    />
                  </div>
                </div>
              ) : (
                <div>
                  <label className="text-zinc-300 font-medium block mb-1">Enter 6-Digit SMS / WhatsApp Code</label>
                  <input
                    type="text"
                    required
                    maxLength={6}
                    placeholder="1 2 3 4 5 6"
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value)}
                    className="w-full bg-[#09090B] border border-[#27272A] text-white text-center font-mono text-lg rounded-xl p-3 focus:outline-none focus:border-purple-500"
                  />
                  <span className="text-[10px] text-zinc-500 mt-1 block text-center">Use demo code 123456</span>
                </div>
              )}

              <button
                type="submit"
                className="w-full py-3 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-xl shadow-lg shadow-purple-600/20 flex items-center justify-center gap-2 cursor-pointer"
              >
                <span>{step === 'phone' ? 'Send Login OTP' : 'Verify & Sign In'}</span>
                <ArrowRight className="h-4 w-4" />
              </button>

              <button
                type="button"
                onClick={() => setIsLoginOpen(false)}
                className="w-full text-center text-zinc-400 hover:text-white cursor-pointer"
              >
                Cancel
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
