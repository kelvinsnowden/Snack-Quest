import React, { useState } from 'react';
import { LogOut, Pencil, X } from 'lucide-react';
import { StatusBadge } from '../../common/StatusBadge';
import { FormField } from '../../common/FormField';
import { useApp } from '../../../context/AppContext';
import { CreatorAccount, updateCreatorOnboarding } from '../creatorApi';

interface ProfileViewProps {
  creator: CreatorAccount;
  onSignOut: () => void;
  onCreatorUpdated: (creator: CreatorAccount) => void;
}

const NICHE_OPTIONS = ['Food & Lifestyle', 'Comedy & Entertainment', 'Beauty & Fashion', 'Tech & Gadgets', 'General Content'];
const FOLLOWER_OPTIONS = ['1,000 - 10,000', '10,000 - 50,000', '50,000 - 100,000', '100,000+'];
const PAYMENT_OPTIONS = ['M-Pesa Express', 'Bank Transfer'];

export const ProfileView: React.FC<ProfileViewProps> = ({ creator, onSignOut, onCreatorUpdated }) => {
  const { addToast } = useApp();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    bio: creator.bio,
    niche: creator.niche,
    followers_range: creator.followers_range,
    payment_preference: creator.payment_preference,
    tiktok: creator.social_handles?.tiktok || '',
    instagram: creator.social_handles?.instagram || ''
  });

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const result = await updateCreatorOnboarding({
        creator_id: creator.id,
        bio: form.bio,
        niche: form.niche,
        followers_range: form.followers_range,
        payment_preference: form.payment_preference,
        social_handles: { tiktok: form.tiktok, instagram: form.instagram },
        current_step: creator.current_step
      });
      onCreatorUpdated(result.creator);
      addToast({ type: 'success', title: 'Profile updated', message: 'Your changes have been saved.' });
      setEditing(false);
    } catch (err: any) {
      addToast({ type: 'error', title: "Couldn't save profile", message: err.message || 'Please try again.' });
    } finally {
      setSaving(false);
    }
  };

  if (editing) {
    return (
      <div className="space-y-6 max-w-xl">
        <div className="flex items-center justify-between">
          <h1 className="text-creator-section-title font-bold text-creator-ink">Edit profile</h1>
          <button
            type="button"
            onClick={() => setEditing(false)}
            aria-label="Cancel editing"
            className="p-2 rounded-creator-control text-creator-ink-faint hover:text-creator-ink hover:bg-creator-surface-hover"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <form onSubmit={handleSave} className="space-y-4 bg-creator-surface border border-creator-border rounded-creator-card-lg p-6">
          <FormField
            as="textarea"
            label="Bio"
            value={form.bio}
            onChange={(e) => setForm((f) => ({ ...f, bio: (e.target as HTMLTextAreaElement).value }))}
          />
          <FormField
            as="select"
            label="Niche"
            value={form.niche}
            onChange={(e) => setForm((f) => ({ ...f, niche: (e.target as HTMLSelectElement).value }))}
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
            value={form.followers_range}
            onChange={(e) => setForm((f) => ({ ...f, followers_range: (e.target as HTMLSelectElement).value }))}
          >
            {FOLLOWER_OPTIONS.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </FormField>
          <FormField
            as="select"
            label="Payout method"
            value={form.payment_preference}
            onChange={(e) => setForm((f) => ({ ...f, payment_preference: (e.target as HTMLSelectElement).value }))}
          >
            {PAYMENT_OPTIONS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField
              label="TikTok handle"
              value={form.tiktok}
              onChange={(e) => setForm((f) => ({ ...f, tiktok: (e.target as HTMLInputElement).value }))}
            />
            <FormField
              label="Instagram handle"
              value={form.instagram}
              onChange={(e) => setForm((f) => ({ ...f, instagram: (e.target as HTMLInputElement).value }))}
            />
          </div>
          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="flex-1 py-2.5 rounded-creator-control border border-creator-border text-creator-ink-muted hover:text-creator-ink hover:bg-creator-surface-hover text-creator-body font-semibold transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 py-2.5 rounded-creator-control bg-creator-brand hover:bg-creator-brand-strong text-creator-brand-ink font-bold text-creator-body transition-colors disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </form>
      </div>
    );
  }

  const FIELD_ROWS: { label: string; value: string }[] = [
    { label: 'Full name', value: creator.display_name },
    { label: 'Referral code', value: creator.referral_code },
    { label: 'Niche', value: creator.niche },
    { label: 'Follower range', value: creator.followers_range },
    { label: 'Payout method', value: creator.payment_preference }
  ];

  return (
    <div className="space-y-8 max-w-xl">
      <div className="flex items-center justify-between">
        <h1 className="text-creator-section-title font-bold text-creator-ink">Profile</h1>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-creator-control border border-creator-border text-creator-ink hover:bg-creator-surface-hover text-creator-caption font-semibold transition-colors"
        >
          <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
          Edit
        </button>
      </div>

      <section className="bg-creator-surface border border-creator-border rounded-creator-card-lg divide-y divide-creator-border">
        {FIELD_ROWS.map(({ label, value }) => (
          <div key={label} className="p-5 flex items-center justify-between gap-4">
            <span className="text-creator-caption text-creator-ink-faint">{label}</span>
            <span className="text-creator-body font-semibold text-creator-ink truncate">{value || '—'}</span>
          </div>
        ))}
        <div className="p-5 flex items-center justify-between gap-4">
          <span className="text-creator-caption text-creator-ink-faint">Status</span>
          <StatusBadge status={creator.status} size="sm" />
        </div>
        <div className="p-5 flex items-center justify-between gap-4">
          <span className="text-creator-caption text-creator-ink-faint">Tier</span>
          <span className="text-creator-body font-semibold text-creator-ink">{creator.tier}</span>
        </div>
      </section>

      {creator.bio && (
        <section className="bg-creator-surface border border-creator-border rounded-creator-card-lg p-5">
          <p className="text-creator-caption text-creator-ink-faint mb-1.5">Bio</p>
          <p className="text-creator-body text-creator-ink">{creator.bio}</p>
        </section>
      )}

      <button
        type="button"
        onClick={onSignOut}
        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-creator-control border border-creator-border text-creator-danger hover:bg-creator-danger/10 text-creator-caption font-semibold transition-colors"
      >
        <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
        Sign out
      </button>
    </div>
  );
};
