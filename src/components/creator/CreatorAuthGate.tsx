import React, { useState } from 'react';
import { Sparkles, ArrowRight, Mail, ShieldCheck, TrendingUp, Wallet, Users } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { FormField } from '../common/FormField';
import { requestCreatorMagicLogin, storeCreatorId } from './creatorApi';

interface CreatorAuthGateProps {
  onAuthenticated: (creatorId: string) => void;
}

const PITCH_POINTS = [
  { icon: TrendingUp, label: 'Track every campaign and referral in one place' },
  { icon: Wallet, label: 'See earnings and payouts update in real time' },
  { icon: Users, label: 'Grow with a referral link built for sharing' }
];

export const CreatorAuthGate: React.FC<CreatorAuthGateProps> = ({ onAuthenticated }) => {
  const { addToast } = useApp();
  const [identifier, setIdentifier] = useState('');
  const [stage, setStage] = useState<'request' | 'sent'>('request');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!identifier.trim()) return;
    setSubmitting(true);
    try {
      const result = await requestCreatorMagicLogin(identifier.trim());
      addToast({ type: 'success', title: 'Magic link sent', message: result.message });
      setStage('sent');
    } catch (err: any) {
      addToast({ type: 'error', title: "Couldn't send link", message: err.message || 'Please try again.' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleContinue = () => {
    storeCreatorId(identifier.trim());
    onAuthenticated(identifier.trim());
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
            Sign in with a one-time link — no password to remember.
          </p>
        </div>

        <div className="bg-creator-surface border border-creator-border rounded-creator-card-lg p-6 sm:p-8 shadow-creator-soft">
          {stage === 'request' ? (
            <form onSubmit={handleSubmit} className="space-y-5">
              <FormField
                label="Email or WhatsApp number"
                type="text"
                required
                autoFocus
                autoComplete="email"
                placeholder="you@example.com or 0722000111"
                value={identifier}
                onChange={(e) => setIdentifier((e.target as HTMLInputElement).value)}
                helpText="We'll send a secure sign-in link — it won't be shared or shown publicly."
              />
              <button
                type="submit"
                disabled={submitting || !identifier.trim()}
                className="w-full inline-flex items-center justify-center gap-2 py-3 rounded-creator-control bg-creator-brand hover:bg-creator-brand-strong text-creator-brand-ink font-bold text-creator-body transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-creator-brand/50"
              >
                <span>{submitting ? 'Sending link…' : 'Send magic link'}</span>
                {!submitting && <ArrowRight className="h-4 w-4" aria-hidden="true" />}
              </button>
            </form>
          ) : (
            <div className="text-center space-y-5">
              <div className="w-12 h-12 mx-auto rounded-full bg-creator-success/10 border border-creator-success/30 flex items-center justify-center">
                <Mail className="h-5 w-5 text-creator-success" aria-hidden="true" />
              </div>
              <div>
                <h2 className="text-creator-body font-bold">Check {identifier}</h2>
                <p className="text-creator-caption text-creator-ink-muted mt-1.5">
                  Tap the link we sent to finish signing in. Links expire after 15 minutes.
                </p>
              </div>
              <button
                type="button"
                onClick={handleContinue}
                className="w-full inline-flex items-center justify-center gap-2 py-3 rounded-creator-control bg-creator-surface-hover hover:bg-creator-border text-creator-ink font-semibold text-creator-body transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-creator-brand/50"
              >
                <span>I clicked the link — continue</span>
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => setStage('request')}
                className="text-creator-caption text-creator-ink-faint hover:text-creator-ink-muted underline underline-offset-2"
              >
                Use a different email or number
              </button>
            </div>
          )}
        </div>

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
      </div>
    </div>
  );
};
