import React, { useState } from 'react';
import { Sparkles, ArrowRight, ArrowLeft, Mail, ShieldCheck, TrendingUp, Wallet, Users, Eye, EyeOff } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { FormField } from '../common/FormField';
import {
  CreatorAccount,
  registerCreator,
  verifyCreatorOtp,
  loginCreator,
  requestMagicLink,
  consumeMagicLink,
  updateCreatorOnboarding,
  storeCreator
} from './creatorApi';

interface CreatorAuthGateProps {
  onAuthenticated: (creator: CreatorAccount) => void;
}

type Stage = 'landing' | 'register' | 'otp' | 'onboarding' | 'login' | 'magic-request' | 'magic-sent';

const PITCH_POINTS = [
  { icon: TrendingUp, label: 'Track every campaign and referral in one place' },
  { icon: Wallet, label: 'See earnings and payouts update in real time' },
  { icon: Users, label: 'Grow with a referral link built for sharing' }
];

const NICHE_OPTIONS = ['Food & Lifestyle', 'Comedy & Entertainment', 'Beauty & Fashion', 'Tech & Gadgets', 'General Content'];
const FOLLOWER_OPTIONS = ['1,000 - 10,000', '10,000 - 50,000', '50,000 - 100,000', '100,000+'];

export const CreatorAuthGate: React.FC<CreatorAuthGateProps> = ({ onAuthenticated }) => {
  const { addToast } = useApp();
  const [stage, setStage] = useState<Stage>('landing');
  const [submitting, setSubmitting] = useState(false);

  // Register
  const [regForm, setRegForm] = useState({ first_name: '', last_name: '', whatsapp_number: '', email: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);

  // OTP
  const [pendingCreatorId, setPendingCreatorId] = useState('');
  const [otpDemoCode, setOtpDemoCode] = useState('');
  const [otpInput, setOtpInput] = useState('');

  // Onboarding (post-verification, single combined step)
  const [onboardForm, setOnboardForm] = useState({ niche: NICHE_OPTIONS[0], followers_range: FOLLOWER_OPTIONS[0], bio: '' });
  const [onboardCreatorId, setOnboardCreatorId] = useState('');

  // Login
  const [loginIdentifier, setLoginIdentifier] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // Magic link
  const [magicPhone, setMagicPhone] = useState('');
  const [magicLink, setMagicLink] = useState('');

  const finishAuth = (creator: CreatorAccount) => {
    storeCreator(creator);
    onAuthenticated(creator);
  };

  const handleRegister = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      const result = await registerCreator({ ...regForm, terms_accepted: true, marketing_consent: true });
      setPendingCreatorId(result.creator_id);
      setOtpDemoCode(result.otp_code_demo);
      addToast({ type: 'success', title: 'Account created', message: result.message });
      setStage('otp');
    } catch (err: any) {
      addToast({ type: 'error', title: 'Registration failed', message: err.message || 'Please try again.' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleVerifyOtp = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      const result = await verifyCreatorOtp(pendingCreatorId, otpInput.trim());
      addToast({ type: 'success', title: 'WhatsApp verified', message: result.message });
      setOnboardCreatorId(result.creator.id);
      setStage('onboarding');
    } catch (err: any) {
      addToast({ type: 'error', title: 'Verification failed', message: err.message || 'Check the code and try again.' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleCompleteOnboarding = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      const result = await updateCreatorOnboarding({ creator_id: onboardCreatorId, ...onboardForm, current_step: 6 });
      addToast({ type: 'success', title: 'Welcome to the program!', message: 'Your creator profile is ready.' });
      finishAuth(result.creator);
    } catch (err: any) {
      addToast({ type: 'error', title: "Couldn't save profile", message: err.message || 'Please try again.' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      const result = await loginCreator(loginIdentifier.trim(), loginPassword);
      finishAuth(result.creator);
    } catch (err: any) {
      addToast({ type: 'error', title: 'Sign in failed', message: err.message || 'Check your details and try again.' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleRequestMagicLink = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      const result = await requestMagicLink(magicPhone.trim());
      setMagicLink(result.magic_link);
      addToast({ type: 'success', title: 'Magic link sent', message: result.message });
      setStage('magic-sent');
    } catch (err: any) {
      addToast({ type: 'error', title: "Couldn't send link", message: err.message || 'No creator account found for that number.' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleConsumeMagicLink = async () => {
    setSubmitting(true);
    try {
      const token = new URL(magicLink).searchParams.get('token') || '';
      const result = await consumeMagicLink(token);
      finishAuth(result.creator);
    } catch (err: any) {
      addToast({ type: 'error', title: 'Link expired', message: err.message || 'Request a new magic link.' });
      setStage('magic-request');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-creator-canvas text-creator-ink flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center text-center mb-8">
          <div className="w-11 h-11 rounded-creator-control bg-creator-brand/10 border border-creator-brand/30 flex items-center justify-center mb-4">
            <Sparkles className="h-5 w-5 text-creator-brand" aria-hidden="true" />
          </div>
          <h1 className="text-creator-subtitle font-bold">Snack Quest Creator Portal</h1>
          <p className="text-creator-caption text-creator-ink-muted mt-1.5 max-w-xs">
            Run campaigns, track referrals, and get paid — all from one dashboard.
          </p>
        </div>

        <div className="bg-creator-surface border border-creator-border rounded-creator-card-lg p-6 sm:p-8 shadow-creator-soft">
          {stage === 'landing' && (
            <div className="space-y-3">
              <button
                type="button"
                onClick={() => setStage('register')}
                className="w-full py-3 rounded-creator-control bg-creator-brand hover:bg-creator-brand-strong text-creator-brand-ink font-bold text-creator-body transition-colors"
              >
                I'm new — become a creator
              </button>
              <button
                type="button"
                onClick={() => setStage('login')}
                className="w-full py-3 rounded-creator-control border border-creator-border text-creator-ink hover:bg-creator-surface-hover font-semibold text-creator-body transition-colors"
              >
                I have an account — sign in
              </button>
            </div>
          )}

          {stage === 'register' && (
            <form onSubmit={handleRegister} className="space-y-4">
              <BackButton onClick={() => setStage('landing')} />
              <div className="grid grid-cols-2 gap-3">
                <FormField
                  label="First name"
                  required
                  value={regForm.first_name}
                  onChange={(e) => setRegForm((f) => ({ ...f, first_name: (e.target as HTMLInputElement).value }))}
                />
                <FormField
                  label="Last name"
                  required
                  value={regForm.last_name}
                  onChange={(e) => setRegForm((f) => ({ ...f, last_name: (e.target as HTMLInputElement).value }))}
                />
              </div>
              <FormField
                label="WhatsApp number"
                type="tel"
                required
                placeholder="0722000111"
                value={regForm.whatsapp_number}
                onChange={(e) => setRegForm((f) => ({ ...f, whatsapp_number: (e.target as HTMLInputElement).value }))}
              />
              <FormField
                label="Email"
                type="email"
                required
                value={regForm.email}
                onChange={(e) => setRegForm((f) => ({ ...f, email: (e.target as HTMLInputElement).value }))}
              />
              <div className="relative">
                <FormField
                  label="Password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  minLength={6}
                  value={regForm.password}
                  onChange={(e) => setRegForm((f) => ({ ...f, password: (e.target as HTMLInputElement).value }))}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-3 top-8 text-creator-ink-faint hover:text-creator-ink"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <SubmitButton submitting={submitting} label="Create account" />
            </form>
          )}

          {stage === 'otp' && (
            <form onSubmit={handleVerifyOtp} className="space-y-4 text-center">
              <BackButton onClick={() => setStage('register')} />
              <h2 className="text-creator-body font-bold">Verify your WhatsApp number</h2>
              <p className="text-creator-caption text-creator-ink-muted">
                Enter the 6-digit code sent to {regForm.whatsapp_number}.
                {otpDemoCode && <span className="block mt-1 text-creator-brand font-semibold">Demo code: {otpDemoCode}</span>}
              </p>
              <input
                type="text"
                required
                maxLength={6}
                value={otpInput}
                onChange={(e) => setOtpInput(e.target.value)}
                className="w-full text-center text-2xl tracking-[0.5em] font-bold bg-creator-canvas border border-creator-border rounded-creator-control py-3 text-creator-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-creator-brand/40 focus:border-creator-brand"
                placeholder="------"
              />
              <SubmitButton submitting={submitting} label="Verify & continue" />
            </form>
          )}

          {stage === 'onboarding' && (
            <form onSubmit={handleCompleteOnboarding} className="space-y-4">
              <h2 className="text-creator-body font-bold text-center mb-1">Tell us about your content</h2>
              <FormField
                as="select"
                label="Niche"
                value={onboardForm.niche}
                onChange={(e) => setOnboardForm((f) => ({ ...f, niche: (e.target as HTMLSelectElement).value }))}
              >
                {NICHE_OPTIONS.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </FormField>
              <FormField
                as="select"
                label="Follower range"
                value={onboardForm.followers_range}
                onChange={(e) => setOnboardForm((f) => ({ ...f, followers_range: (e.target as HTMLSelectElement).value }))}
              >
                {FOLLOWER_OPTIONS.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </FormField>
              <FormField
                as="textarea"
                label="Short bio"
                placeholder="Tell brands what you create..."
                value={onboardForm.bio}
                onChange={(e) => setOnboardForm((f) => ({ ...f, bio: (e.target as HTMLTextAreaElement).value }))}
              />
              <SubmitButton submitting={submitting} label="Finish setup" />
            </form>
          )}

          {stage === 'login' && (
            <form onSubmit={handleLogin} className="space-y-4">
              <BackButton onClick={() => setStage('landing')} />
              <FormField
                label="Email or WhatsApp number"
                required
                autoFocus
                value={loginIdentifier}
                onChange={(e) => setLoginIdentifier((e.target as HTMLInputElement).value)}
              />
              <FormField
                label="Password"
                type="password"
                required
                value={loginPassword}
                onChange={(e) => setLoginPassword((e.target as HTMLInputElement).value)}
              />
              <SubmitButton submitting={submitting} label="Sign in" />
              <button
                type="button"
                onClick={() => setStage('magic-request')}
                className="w-full text-center text-creator-caption text-creator-ink-faint hover:text-creator-ink-muted underline underline-offset-2"
              >
                Use a magic link instead
              </button>
            </form>
          )}

          {stage === 'magic-request' && (
            <form onSubmit={handleRequestMagicLink} className="space-y-4">
              <BackButton onClick={() => setStage('login')} />
              <FormField
                label="WhatsApp number"
                type="tel"
                required
                autoFocus
                placeholder="0722000111"
                value={magicPhone}
                onChange={(e) => setMagicPhone((e.target as HTMLInputElement).value)}
                helpText="We'll send a one-time sign-in link to this number."
              />
              <SubmitButton submitting={submitting} label="Send magic link" />
            </form>
          )}

          {stage === 'magic-sent' && (
            <div className="text-center space-y-5">
              <div className="w-12 h-12 mx-auto rounded-full bg-creator-success/10 border border-creator-success/30 flex items-center justify-center">
                <Mail className="h-5 w-5 text-creator-success" aria-hidden="true" />
              </div>
              <div>
                <h2 className="text-creator-body font-bold">Check WhatsApp</h2>
                <p className="text-creator-caption text-creator-ink-muted mt-1.5">
                  Tap the link we sent to {magicPhone}. Links expire after 15 minutes.
                </p>
              </div>
              <button
                type="button"
                onClick={handleConsumeMagicLink}
                disabled={submitting}
                className="w-full inline-flex items-center justify-center gap-2 py-3 rounded-creator-control bg-creator-surface-hover hover:bg-creator-border text-creator-ink font-semibold text-creator-body transition-colors disabled:opacity-50"
              >
                <span>{submitting ? 'Verifying…' : 'I clicked the link — continue'}</span>
                {!submitting && <ArrowRight className="h-4 w-4" aria-hidden="true" />}
              </button>
            </div>
          )}
        </div>

        {stage === 'landing' && (
          <>
            <ul className="mt-8 space-y-3">
              {PITCH_POINTS.map(({ icon: Icon, label }) => (
                <li key={label} className="flex items-center gap-3 text-creator-caption text-creator-ink-muted">
                  <Icon className="h-4 w-4 text-creator-ink-faint shrink-0" aria-hidden="true" />
                  <span>{label}</span>
                </li>
              ))}
            </ul>
            <p className="flex items-center justify-center gap-1.5 text-[11px] text-creator-ink-faint mt-6">
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
              Your data is never sold or shared with third parties.
            </p>
          </>
        )}
      </div>
    </div>
  );
};

const BackButton: React.FC<{ onClick: () => void }> = ({ onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className="inline-flex items-center gap-1.5 text-creator-caption text-creator-ink-faint hover:text-creator-ink-muted mb-1"
  >
    <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
    Back
  </button>
);

const SubmitButton: React.FC<{ submitting: boolean; label: string }> = ({ submitting, label }) => (
  <button
    type="submit"
    disabled={submitting}
    className="w-full inline-flex items-center justify-center gap-2 py-3 rounded-creator-control bg-creator-brand hover:bg-creator-brand-strong text-creator-brand-ink font-bold text-creator-body transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-creator-brand/50"
  >
    <span>{submitting ? 'Please wait…' : label}</span>
    {!submitting && <ArrowRight className="h-4 w-4" aria-hidden="true" />}
  </button>
);
