'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, Save } from 'lucide-react';
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

export interface ProfileFormValues {
  bio: string;
  niche: string;
  followersRange: string;
  paymentPreference: PaymentPreference;
  payoutPhoneNumber: string | null;
  socialHandles: Record<string, string>;
}

/** Editing a creator's own profile after onboarding (§ Creator Portal profile management) — same fields the one-time onboarding form collects, plus the payout phone number that only makes sense to add once withdrawals exist. */
export function ProfileForm({ initialValues }: { initialValues: ProfileFormValues }) {
  const router = useRouter();
  const [bio, setBio] = useState(initialValues.bio);
  const [niche, setNiche] = useState(initialValues.niche);
  const [followersRange, setFollowersRange] = useState(initialValues.followersRange || FOLLOWER_RANGES[0]);
  const [paymentPreference, setPaymentPreference] = useState<PaymentPreference>(initialValues.paymentPreference);
  const [payoutPhoneNumber, setPayoutPhoneNumber] = useState(initialValues.payoutPhoneNumber ?? '');
  const [socialHandles, setSocialHandles] = useState<Record<string, string>>(initialValues.socialHandles);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSaved(false);
    setSubmitting(true);

    try {
      const response = await fetch('/api/creator/profile', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          bio,
          niche,
          followersRange,
          paymentPreference,
          payoutPhoneNumber: payoutPhoneNumber.trim() || null,
          socialHandles,
        }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? 'Could not save your profile. Please try again.');
        setSubmitting(false);
        return;
      }

      setSaved(true);
      router.refresh();
    } catch {
      setError('Could not save your profile. Please check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Label htmlFor="bio">Bio</Label>
        <Textarea id="bio" required value={bio} onChange={(event) => setBio(event.target.value)} disabled={submitting} />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="niche">Niche</Label>
        <Input id="niche" required value={niche} onChange={(event) => setNiche(event.target.value)} disabled={submitting} />
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

      <div className="flex flex-col gap-2">
        <Label htmlFor="payoutPhoneNumber">Default M-Pesa number for withdrawals</Label>
        <Input
          id="payoutPhoneNumber"
          value={payoutPhoneNumber}
          onChange={(event) => setPayoutPhoneNumber(event.target.value)}
          placeholder="254712345678"
          disabled={submitting}
        />
        <p className="text-caption text-muted-foreground">
          Pre-fills your withdrawal requests. Only M-Pesa payouts are supported today, even if your payout method
          above is set to bank transfer.
        </p>
      </div>

      <fieldset className="flex flex-col gap-3">
        <legend className="text-sm font-medium text-foreground">
          Socials <span className="font-normal text-muted-foreground">(optional)</span>
        </legend>
        {SOCIAL_PLATFORMS.map(({ key, label }) => (
          <div key={key} className="flex flex-col gap-2">
            <Label htmlFor={key}>{label}</Label>
            <Input
              id={key}
              value={socialHandles[key] ?? ''}
              onChange={(event) => setSocialHandles((current) => ({ ...current, [key]: event.target.value }))}
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
      {saved && !error ? <p className="text-sm text-success">Profile saved.</p> : null}

      <div className="flex items-center gap-3">
        <Button type="submit" loading={submitting}>
          <Save aria-hidden="true" />
          Save changes
        </Button>
      </div>
    </form>
  );
}
