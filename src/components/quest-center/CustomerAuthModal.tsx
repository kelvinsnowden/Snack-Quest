import React, { useState } from 'react';
import {
  X,
  User,
  Phone,
  Mail,
  Lock,
  ArrowRight,
  ShieldCheck,
  Smartphone,
  LogOut,
  AlertCircle,
  CheckCircle2
} from 'lucide-react';

interface CustomerAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoginSuccess: (customer: any) => void;
}

export default function CustomerAuthModal({
  isOpen,
  onClose,
  onLoginSuccess
}: CustomerAuthModalProps) {
  const [mode, setMode] = useState<'login' | 'signup' | 'forgot'>('login');
  const [fullName, setFullName] = useState('');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [county, setCounty] = useState('Nairobi');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);
    setSubmitting(true);

    try {
      if (mode === 'signup') {
        if (!fullName || !identifier) {
          setErrorMsg('Full name and WhatsApp phone number are required.');
          setSubmitting(false);
          return;
        }

        const res = await fetch('/api/v1/customer/auth/signup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            full_name: fullName,
            phone: identifier,
            password: password || 'default123',
            county
          })
        });

        const data = await res.json();
        if (!res.ok) {
          setErrorMsg(data.error || 'Failed to create account');
          setSubmitting(false);
          return;
        }

        setSuccessMsg('Account created successfully!');
        setSubmitting(false);
        setTimeout(() => {
          onLoginSuccess(data.customer);
          onClose();
        }, 1000);
      } else if (mode === 'login') {
        if (!identifier) {
          setErrorMsg('Please enter your phone number or email.');
          setSubmitting(false);
          return;
        }

        const res = await fetch('/api/v1/customer/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            identifier,
            password
          })
        });

        const data = await res.json();
        if (!res.ok) {
          setErrorMsg(data.error || 'Invalid credentials');
          setSubmitting(false);
          return;
        }

        setSuccessMsg(`Welcome back, ${data.customer.full_name}!`);
        setSubmitting(false);
        setTimeout(() => {
          onLoginSuccess(data.customer);
          onClose();
        }, 1000);
      } else {
        // Forgot password
        const res = await fetch('/api/v1/customer/auth/forgot-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ identifier })
        });
        const data = await res.json();
        setSuccessMsg(data.message || 'Verification code sent via WhatsApp');
        setSubmitting(false);
      }
    } catch (err) {
      setErrorMsg('Network error. Please try again.');
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-6 text-slate-100 shadow-2xl relative my-8">
        <button
          onClick={onClose}
          className="absolute top-5 right-5 w-9 h-9 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-all"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Header */}
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center justify-center font-black">
            <User className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-xl font-black text-white tracking-tight">
              {mode === 'signup' ? 'Join Creator Portal' : mode === 'login' ? 'Creator Portal Login' : 'Reset Password'}
            </h3>
            <p className="text-xs text-slate-400">
              {mode === 'signup' ? 'Monetize your audience & earn KSh 500 per sale' : 'Access your affiliate wallet & commissions'}
            </p>
          </div>
        </div>

        {errorMsg && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {successMsg && (
          <div className="mb-4 p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-300 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'signup' && (
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">Full Name</label>
              <input
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-4 py-3 text-white text-sm focus:outline-none focus:border-amber-500"
                placeholder="Wanjiku Mwangi"
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1">
              WhatsApp Phone Number or Email
            </label>
            <input
              type="text"
              required
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-4 py-3 text-white text-sm focus:outline-none focus:border-amber-500"
              placeholder="0712345678 or email@domain.com"
            />
          </div>

          {mode !== 'forgot' && (
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-4 py-3 text-white text-sm focus:outline-none focus:border-amber-500"
                placeholder="••••••••"
              />
            </div>
          )}

          {mode === 'signup' && (
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">County / Region</label>
              <select
                value={county}
                onChange={(e) => setCounty(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-4 py-3 text-white text-sm focus:outline-none focus:border-amber-500"
              >
                <option value="Nairobi">Nairobi County</option>
                <option value="Mombasa">Mombasa County</option>
                <option value="Nakuru">Nakuru County</option>
                <option value="Kiambu">Kiambu County</option>
                <option value="Kisumu">Kisumu County</option>
                <option value="Uasin Gishu">Uasin Gishu (Eldoret)</option>
              </select>
            </div>
          )}

          {/* Submit button */}
          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-black text-sm rounded-2xl shadow-xl transition-all flex items-center justify-center gap-2 min-h-[48px] active:scale-95 disabled:opacity-50"
          >
            {submitting ? (
              <span>Please wait...</span>
            ) : (
              <>
                <span>
                  {mode === 'signup' ? 'Create Creator Account' : mode === 'login' ? 'Sign In to Portal' : 'Send Reset Link'}
                </span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        {/* Mode Switchers */}
        <div className="mt-5 pt-4 border-t border-slate-800/80 text-center text-xs text-slate-400 space-y-2">
          {mode === 'login' ? (
            <>
              <p>
                Don't have a creator account?{' '}
                <button
                  onClick={() => { setMode('signup'); setErrorMsg(null); }}
                  className="font-bold text-amber-400 hover:underline"
                >
                  Sign Up Here
                </button>
              </p>
              <button
                onClick={() => { setMode('forgot'); setErrorMsg(null); }}
                className="text-slate-500 hover:text-slate-300 font-medium"
              >
                Forgot your password?
              </button>
            </>
          ) : (
            <p>
              Already registered?{' '}
              <button
                onClick={() => { setMode('login'); setErrorMsg(null); }}
                className="font-bold text-amber-400 hover:underline"
              >
                Sign In
              </button>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
