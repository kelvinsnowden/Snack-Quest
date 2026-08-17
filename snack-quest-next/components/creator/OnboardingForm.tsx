'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, ArrowRight, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { PaymentPreference } from '@/types';
import { FOLLOWER_RANGES } from '@/lib/creators/followerRanges';

const SOCIAL_PLATFORMS = [
  { key: 'instagram', label: 'Instagram handle' },
  { key: 'tiktok', label: 'TikTok handle' },
  { key: 'whatsapp', label: 'WhatsApp channel / number' },
] as const;

/**
 * The one-time onboarding form every creator fills in before reaching
 * the dashboard (§ Creator Portal auth) — the real, full profile
 * `CreatorProfile` needs (bio, niche, follower range, payout
 * preference, socials), not a placeholder. Submits to
 * `POST /api/creator/onboarding`, which sets `onboardingCompleted`.
 */
export function OnboardingForm() {
  const router = useRouter();
  const [bio, setBio] = useState('');
  const [niche, setNiche] = useState('');
  const [followersRange, setFollowersRange] = useState<string>(FOLLOWER_RANGES[0]);
  const [paymentPreference, setPaymentPreference] = useState<PaymentPreference>('mpesa');
  const [socialHandles, setSocialHandles] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!Object.values(socialHandles).some((handle) => handle.trim())) {
      setError('Add at least one social media handle so brands and followers can find you.');
      return;
    }

    setSubmitting(true);

    try {
      const response = await fetch('/api/creator/onboarding', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ bio, niche, followersRange, paymentPreference, socialHandles }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? 'Could not save your profile. Please try again.');
        setSubmitting(false);
        return;
      }

      router.replace('/creator');
      router.refresh();
    } catch {
      setError('Could not save your profile. Please check your connection and try again.');
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Label htmlFor="bio">Bio</Label>
        <Textarea
          id="bio"
          required
          value={bio}
          onChange={(event) => setBio(event.target.value)}
          placeholder="Tell brands and followers what you're about."
          disabled={submitting}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="niche">Niche</Label>
        <Input
          id="niche"
          required
          value={niche}
          onChange={(event) => setNiche(event.target.value)}
          placeholder="e.g. Food & lifestyle"
          disabled={submitting}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="followersRange">Follower range</Label>
        <select
          id="followersRange"
          value={followersRange}
          onChange={(event) => setFollowersRange(event.target.value)}
          disabled={submitting}
          className="flex h-10 w-full rounded-md border border-border bg-surface px-3 text-sm text-foreground shadow-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50"
        >
          {FOLLOWER_RANGES.map((range) => (
            <option key={range} value={range}>
              {range}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="paymentPreference">Payout method</Label>
        <select
          id="paymentPreference"
          value={paymentPreference}
          onChange={(event) => setPaymentPreference(event.target.value as PaymentPreference)}
          disabled={submitting}
          className="flex h-10 w-full rounded-md border border-border bg-surface px-3 text-sm text-foreground shadow-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50"
        >
          <option value="mpesa">M-Pesa</option>
          <option value="bank">Bank transfer</option>
        </select>
      </div>

      <fieldset className="flex flex-col gap-3">
        <legend className="text-sm font-medium text-foreground">Socials</legend>
        <p className="-mt-1 text-caption text-muted-foreground">Add at least one so brands and followers can find you.</p>
        {SOCIAL_PLATFORMS.map(({ key, label }) => (
          <div key={key} className="flex flex-col gap-2">
            <Label htmlFor={key}>{label}</Label>
            <Input
              id={key}
              value={socialHandles[key] ?? ''}
              onChange={(event) =>
                setSocialHandles((current) => ({ ...current, [key]: event.target.value }))
              }
              placeholder="@username"
              disabled={submitting}
            />
          </div>
        ))}
      </fieldset>

      {error ? (
        <p role="alert" className="flex items-start gap-2 rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {error}
        </p>
      ) : null}

      <Button type="submit" size="lg" loading={submitting} className="mt-1">
        {!submitting ? <ArrowRight aria-hidden="true" /> : null}
        {submitting ? 'Saving…' : 'Finish setup'}
      </Button>
    </form>
  );
}

export function OnboardingFormFallback() {
  return (
    <div className="flex flex-col gap-5" aria-hidden="true">
      {[0, 1, 2, 3].map((index) => (
        <div key={index} className="flex flex-col gap-2">
          <div className="h-4 w-24 rounded bg-border/60" />
          <div className="h-10 rounded-md bg-border/40" />
        </div>
      ))}
      <div className="mt-1 flex h-12 items-center justify-center rounded-md bg-border/40">
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
      </div>
    </div>
  );
}
