'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { ImagePlus, Send, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { MarketingEmailPreview } from '@/components/admin/MarketingEmailPreview';
import type { MarketingEmailSegment } from '@/types';

export interface MarketingEmailFormValues {
  subject: string;
  preheader: string;
  heading: string;
  bodyText: string;
  imageUrl: string | null;
  ctaLabel: string;
  ctaUrl: string;
  segment: MarketingEmailSegment;
  customRecipientsText: string;
}

interface MarketingEmailFormProps {
  mode: 'create' | 'edit';
  campaignId?: string;
  initialValues?: MarketingEmailFormValues;
}

const DEFAULTS: MarketingEmailFormValues = {
  subject: '',
  preheader: '',
  heading: '',
  bodyText: '',
  imageUrl: null,
  ctaLabel: '',
  ctaUrl: '',
  segment: 'active_creators',
  customRecipientsText: '',
};

const SEGMENT_OPTIONS: { value: MarketingEmailSegment; label: string; helpText: string }[] = [
  { value: 'active_creators', label: 'Active creators', helpText: 'Approved creators who can already earn commission.' },
  { value: 'pending_creators', label: 'Pending creators', helpText: 'Applied but not yet approved.' },
  { value: 'suspended_creators', label: 'Suspended creators', helpText: 'Currently suspended from the program.' },
  { value: 'all_creators', label: 'All creators', helpText: 'Every creator regardless of status.' },
  { value: 'custom', label: 'Custom list', helpText: 'Paste specific email addresses, one per line or comma-separated.' },
];

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function parseCustomRecipients(text: string): string[] {
  const seen = new Set<string>();
  for (const raw of text.split(/[\n,]/)) {
    const email = raw.trim().toLowerCase();
    if (email && EMAIL_PATTERN.test(email)) {
      seen.add(email);
    }
  }
  return Array.from(seen);
}

function toDraftPayload(values: MarketingEmailFormValues) {
  return {
    subject: values.subject.trim(),
    preheader: values.preheader.trim() || null,
    heading: values.heading.trim(),
    bodyText: values.bodyText.trim(),
    imageUrl: values.imageUrl,
    ctaLabel: values.ctaLabel.trim() || null,
    ctaUrl: values.ctaUrl.trim() || null,
    segment: values.segment,
    customRecipients: values.segment === 'custom' ? parseCustomRecipients(values.customRecipientsText) : null,
  };
}

export function MarketingEmailForm({ mode, campaignId, initialValues }: MarketingEmailFormProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [values, setValues] = useState<MarketingEmailFormValues>(initialValues ?? DEFAULTS);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [recipientCount, setRecipientCount] = useState<number | null>(null);
  const [countLoading, setCountLoading] = useState(false);

  const [sendOpen, setSendOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sendResult, setSendResult] = useState<{ recipientCount: number; sentCount: number; failedCount: number } | null>(null);

  const customRecipientCount = parseCustomRecipients(values.customRecipientsText).length;
  const displayedRecipientCount = values.segment === 'custom' ? customRecipientCount : recipientCount;
  const displayedCountLoading = values.segment === 'custom' ? false : countLoading;

  // Live recipient count for non-custom segments — refetched from the
  // real resolver whenever the segment changes, so the number shown
  // is never an estimate. The custom segment counts client-side
  // instantly instead (derived above at render time, no fetch needed)
  // — nothing to look up server-side until send time.
  useEffect(() => {
    if (values.segment === 'custom') {
      return;
    }
    let cancelled = false;
    const timeout = setTimeout(async () => {
      setCountLoading(true);
      try {
        const response = await fetch('/api/admin/marketing-emails/recipients', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ segment: values.segment }),
        });
        if (!response.ok || cancelled) return;
        const body = (await response.json()) as { count: number };
        if (!cancelled) setRecipientCount(body.count);
      } finally {
        if (!cancelled) setCountLoading(false);
      }
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [values.segment, values.customRecipientsText]);

  function onFileSelected(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setPendingFile(file);
    setValues((v) => ({ ...v, imageUrl: URL.createObjectURL(file) }));
  }

  async function uploadPendingImage(): Promise<string | null> {
    if (!pendingFile) {
      return values.imageUrl;
    }
    setUploadingImage(true);
    try {
      const form = new FormData();
      form.append('file', pendingFile);
      form.append('directory', 'marketing');
      const response = await fetch('/api/storage/upload', { method: 'POST', body: form });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? 'Image upload failed.');
      }
      const body = (await response.json()) as { url: string };
      return body.url;
    } finally {
      setUploadingImage(false);
    }
  }

  function validate(): string | null {
    if (!values.subject.trim()) return 'Subject is required.';
    if (!values.heading.trim()) return 'Heading is required.';
    if (!values.bodyText.trim()) return 'Message body is required.';
    if (values.segment === 'custom' && parseCustomRecipients(values.customRecipientsText).length === 0) {
      return 'Add at least one valid recipient email for a custom list.';
    }
    if (Boolean(values.ctaLabel.trim()) !== Boolean(values.ctaUrl.trim())) {
      return 'A button needs both a label and a URL, or neither.';
    }
    return null;
  }

  /** Saves the draft (create or update) and returns its id — the one write path both "Save draft" and "Send" go through, so Send always sends exactly what's on screen. */
  async function saveDraft(): Promise<string> {
    const imageUrl = await uploadPendingImage();
    const payload = { ...toDraftPayload(values), imageUrl };

    const response = await fetch(
      mode === 'create' ? '/api/admin/marketing-emails' : `/api/admin/marketing-emails/${campaignId}`,
      {
        method: mode === 'create' ? 'POST' : 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      },
    );
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      throw new Error(body?.error ?? 'Could not save this campaign.');
    }
    setValues((v) => ({ ...v, imageUrl }));
    setPendingFile(null);
    if (mode === 'create') {
      const body = (await response.json()) as { campaignId: string };
      return body.campaignId;
    }
    return campaignId as string;
  }

  async function onSaveDraft() {
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const id = await saveDraft();
      router.push(mode === 'create' ? `/admin/marketing-emails/${id}` : `/admin/marketing-emails/${id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save this campaign.');
    } finally {
      setSubmitting(false);
    }
  }

  async function onOpenSendConfirm() {
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }
    setError(null);
    setSendError(null);
    setSendResult(null);
    setSendOpen(true);
  }

  async function onConfirmSend() {
    setSending(true);
    setSendError(null);
    try {
      const id = await saveDraft();
      const response = await fetch(`/api/admin/marketing-emails/${id}/send`, { method: 'POST' });
      const body = (await response.json().catch(() => null)) as
        | { recipientCount: number; sentCount: number; failedCount: number; error?: string }
        | null;
      if (!response.ok) {
        throw new Error(body?.error ?? 'Could not send this campaign.');
      }
      setSendResult(body);
      router.refresh();
    } catch (err) {
      setSendError(err instanceof Error ? err.message : 'Could not send this campaign.');
    } finally {
      setSending(false);
    }
  }

  const busy = submitting || uploadingImage;

  return (
    <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSaveDraft();
        }}
        className="flex flex-col gap-6"
      >
        <Card>
          <CardContent className="flex flex-col gap-5 pt-6">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="me-image">Hero image (optional)</Label>
              <div className="flex items-center gap-4">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="relative flex size-24 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-dashed border-border bg-border/10 text-muted-foreground transition-colors hover:bg-border/20"
                >
                  {values.imageUrl ? (
                    <Image src={values.imageUrl} alt="" fill sizes="96px" className="object-cover" unoptimized />
                  ) : (
                    <ImagePlus className="size-6" aria-hidden="true" />
                  )}
                </button>
                <div className="text-sm text-muted-foreground">
                  <p>JPEG, PNG, WebP, or GIF. Shown below the header bar.</p>
                  <div className="mt-2 flex gap-2">
                    <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                      {values.imageUrl ? 'Change image' : 'Upload image'}
                    </Button>
                    {values.imageUrl ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setPendingFile(null);
                          setValues((v) => ({ ...v, imageUrl: null }));
                        }}
                      >
                        Remove
                      </Button>
                    ) : null}
                  </div>
                </div>
                <input
                  ref={fileInputRef}
                  id="me-image"
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  className="sr-only"
                  onChange={onFileSelected}
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="me-subject">Subject line</Label>
              <Input
                id="me-subject"
                value={values.subject}
                onChange={(event) => setValues((v) => ({ ...v, subject: event.target.value }))}
                placeholder="New snack boxes just dropped 🎉"
                required
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="me-preheader">Preview text (optional)</Label>
              <Input
                id="me-preheader"
                value={values.preheader}
                onChange={(event) => setValues((v) => ({ ...v, preheader: event.target.value }))}
                placeholder="Shows next to the subject in most inboxes"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="me-heading">Heading</Label>
              <Input
                id="me-heading"
                value={values.heading}
                onChange={(event) => setValues((v) => ({ ...v, heading: event.target.value }))}
                placeholder="This week only: double commission"
                required
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="me-body">Message</Label>
              <Textarea
                id="me-body"
                value={values.bodyText}
                onChange={(event) => setValues((v) => ({ ...v, bodyText: event.target.value }))}
                placeholder={'Write your message here.\n\nLeave a blank line between paragraphs.'}
                rows={8}
                required
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="me-cta-label">Button label (optional)</Label>
                <Input
                  id="me-cta-label"
                  value={values.ctaLabel}
                  onChange={(event) => setValues((v) => ({ ...v, ctaLabel: event.target.value }))}
                  placeholder="Shop now"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="me-cta-url">Button link (optional)</Label>
                <Input
                  id="me-cta-url"
                  type="url"
                  value={values.ctaUrl}
                  onChange={(event) => setValues((v) => ({ ...v, ctaUrl: event.target.value }))}
                  placeholder="https://www.snackquests.shop"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex flex-col gap-4 pt-6">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="me-segment">Send to</Label>
              <select
                id="me-segment"
                value={values.segment}
                onChange={(event) => setValues((v) => ({ ...v, segment: event.target.value as MarketingEmailSegment }))}
                className="flex h-10 rounded-md border border-border bg-surface px-3 text-sm text-foreground shadow-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                {SEGMENT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">
                {SEGMENT_OPTIONS.find((o) => o.value === values.segment)?.helpText}
              </p>
              <p className="mt-1 flex items-center gap-1.5 text-sm font-medium text-foreground">
                <Users className="size-4 text-muted-foreground" aria-hidden="true" />
                {displayedCountLoading
                  ? 'Counting…'
                  : `${displayedRecipientCount ?? 0} recipient${displayedRecipientCount === 1 ? '' : 's'}`}
              </p>
            </div>

            {values.segment === 'custom' ? (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="me-custom-recipients">Recipient emails</Label>
                <Textarea
                  id="me-custom-recipients"
                  value={values.customRecipientsText}
                  onChange={(event) => setValues((v) => ({ ...v, customRecipientsText: event.target.value }))}
                  placeholder={'amina@example.com\njoseph@example.com'}
                  rows={5}
                />
              </div>
            ) : null}
          </CardContent>
        </Card>

        {error ? <p className="text-sm text-danger">{error}</p> : null}

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" variant="outline" loading={submitting && !sendOpen}>
            Save draft
          </Button>
          <Button type="button" onClick={onOpenSendConfirm} disabled={busy}>
            <Send className="size-4" aria-hidden="true" />
            Review &amp; send
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => router.push('/admin/marketing-emails')}
            disabled={busy}
          >
            Cancel
          </Button>
        </div>
      </form>

      <div className="flex flex-col gap-2 lg:sticky lg:top-6">
        <Label>Live preview</Label>
        <MarketingEmailPreview
          heading={values.heading}
          bodyText={values.bodyText}
          imageUrl={values.imageUrl}
          ctaLabel={values.ctaLabel || null}
          ctaUrl={values.ctaUrl || null}
        />
      </div>

      <Dialog
        open={sendOpen}
        onOpenChange={(open) => {
          setSendOpen(open);
          if (!open) {
            setSendError(null);
            setSendResult(null);
          }
        }}
      >
        <DialogContent>
          {sendResult ? (
            <>
              <DialogHeader>
                <DialogTitle>Campaign sent</DialogTitle>
                <DialogDescription>
                  {sendResult.sentCount} of {sendResult.recipientCount} emails sent successfully
                  {sendResult.failedCount > 0 ? `, ${sendResult.failedCount} failed` : ''}.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button
                  onClick={() => {
                    setSendOpen(false);
                    router.push('/admin/marketing-emails');
                  }}
                >
                  Done
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>
                  Send to {displayedRecipientCount ?? 0} recipient{displayedRecipientCount === 1 ? '' : 's'}?
                </DialogTitle>
                <DialogDescription>
                  This immediately sends a real email to every resolved recipient. This can&apos;t be undone or recalled.
                </DialogDescription>
              </DialogHeader>
              {sendError ? <p className="mt-4 text-sm text-danger">{sendError}</p> : null}
              <DialogFooter>
                <Button variant="ghost" onClick={() => setSendOpen(false)} disabled={sending}>
                  Cancel
                </Button>
                <Button onClick={onConfirmSend} loading={sending} disabled={!displayedRecipientCount}>
                  Send now
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
