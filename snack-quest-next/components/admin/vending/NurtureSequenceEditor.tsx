'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ImagePlus, Plus, Send, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { MarketingEmailPreview } from '@/components/admin/MarketingEmailPreview';
import { cn } from '@/lib/utils';
import { NURTURE_LIMITS, type NurtureEmail } from '@/lib/leads/nurtureSequence';

const PREVIEW_NAME = 'Amina';

function preview(text: string): string {
  return text.replace(/\{firstName\}/g, PREVIEW_NAME);
}

/**
 * Edits the automatic lead emails (§ lead nurture): one email at a time
 * beside a live preview rendered by the same helper the real send uses.
 * Pictures upload straight to storage when chosen; nothing reaches
 * leads until "Save".
 */
export function NurtureSequenceEditor({ initialEmails, canManage }: { initialEmails: NurtureEmail[]; canManage: boolean }) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [emails, setEmails] = useState<NurtureEmail[]>(initialEmails);
  const [selected, setSelected] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<'save' | 'test' | 'upload' | null>(null);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  const email = emails[selected];

  function update(patch: Partial<NurtureEmail>) {
    setEmails((all) => all.map((entry, index) => (index === selected ? { ...entry, ...patch } : entry)));
    setDirty(true);
    setMessage(null);
  }

  function addEmail() {
    const last = emails[emails.length - 1];
    const next: NurtureEmail = {
      day: (last?.day ?? 0) + 3,
      subject: '',
      heading: 'Hi {firstName}',
      body: '',
      ctaLabel: 'Book a WhatsApp call',
      imageUrl: null,
    };
    setEmails((all) => [...all, next]);
    setSelected(emails.length);
    setDirty(true);
  }

  function removeEmail() {
    if (emails.length <= 1) return;
    if (!window.confirm(`Delete email ${selected + 1}?`)) return;
    setEmails((all) => all.filter((_, index) => index !== selected));
    setSelected((index) => Math.max(0, index - 1));
    setDirty(true);
  }

  async function uploadPicture(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setBusy('upload');
    setMessage(null);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('directory', 'marketing');
      const response = await fetch('/api/storage/upload', { method: 'POST', body: form });
      const data = (await response.json().catch(() => null)) as { url?: string; error?: string } | null;
      if (!response.ok || !data?.url) throw new Error(data?.error ?? 'The picture didn’t upload. Try a JPG or PNG.');
      update({ imageUrl: data.url });
    } catch (error) {
      setMessage({ tone: 'error', text: error instanceof Error ? error.message : 'The picture didn’t upload.' });
    } finally {
      setBusy(null);
    }
  }

  async function save() {
    setBusy('save');
    setMessage(null);
    try {
      const response = await fetch('/api/admin/vending/leads/emails', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emails }),
      });
      const data = (await response.json().catch(() => null)) as { emails?: NurtureEmail[]; error?: string } | null;
      if (!response.ok || !data?.emails) throw new Error(data?.error ?? 'That didn’t save. Please try again.');
      setEmails(data.emails);
      setDirty(false);
      setMessage({ tone: 'ok', text: 'Saved. Leads get the new version from their next email.' });
      router.refresh();
    } catch (error) {
      setMessage({ tone: 'error', text: error instanceof Error ? error.message : 'That didn’t save.' });
    } finally {
      setBusy(null);
    }
  }

  async function sendTest() {
    setBusy('test');
    setMessage(null);
    try {
      const response = await fetch('/api/admin/vending/leads/emails/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = (await response.json().catch(() => null)) as { sentTo?: string; error?: string } | null;
      if (!response.ok) throw new Error(data?.error ?? 'The test didn’t send.');
      setMessage({ tone: 'ok', text: `Test sent to ${data?.sentTo}.` });
    } catch (error) {
      setMessage({ tone: 'error', text: error instanceof Error ? error.message : 'The test didn’t send.' });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Emails">
        {emails.map((entry, index) => (
          <button
            key={index}
            type="button"
            role="tab"
            aria-selected={index === selected}
            onClick={() => setSelected(index)}
            className={cn(
              'inline-flex min-h-10 items-center rounded-full px-3.5 text-sm font-medium transition-colors',
              index === selected ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-border/40',
            )}
          >
            Email {index + 1} · Day {entry.day}
          </button>
        ))}
        {canManage && emails.length < NURTURE_LIMITS.maxEmails ? (
          <Button type="button" size="sm" variant="ghost" onClick={addEmail}>
            <Plus className="size-4" aria-hidden="true" />
            Add email
          </Button>
        ) : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="flex flex-col gap-4 p-4 sm:p-6">
          <fieldset disabled={!canManage} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="day">Days after the lead comes in</Label>
              <Input
                id="day"
                type="number"
                min={0}
                max={NURTURE_LIMITS.maxDay}
                value={email.day}
                onChange={(event) => update({ day: Number(event.target.value) })}
                className="max-w-28"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="subject">Subject</Label>
              <Input
                id="subject"
                value={email.subject}
                maxLength={NURTURE_LIMITS.subject}
                onChange={(event) => update({ subject: event.target.value })}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="heading">Heading</Label>
              <Input
                id="heading"
                value={email.heading}
                maxLength={NURTURE_LIMITS.heading}
                onChange={(event) => update({ heading: event.target.value })}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="body">Text</Label>
              <Textarea
                id="body"
                rows={9}
                value={email.body}
                maxLength={NURTURE_LIMITS.body}
                onChange={(event) => update({ body: event.target.value })}
              />
              <p className="text-muted-foreground text-xs">
                Leave a blank line between paragraphs. <code>{'{firstName}'}</code> becomes the lead&rsquo;s first name.
              </p>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cta">Button text</Label>
              <Input
                id="cta"
                value={email.ctaLabel}
                maxLength={NURTURE_LIMITS.ctaLabel}
                onChange={(event) => update({ ctaLabel: event.target.value })}
              />
              <p className="text-muted-foreground text-xs">The button always opens the lead&rsquo;s booking page.</p>
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-foreground text-sm font-medium">Picture</span>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  loading={busy === 'upload'}
                  onClick={() => fileInput.current?.click()}
                >
                  <ImagePlus className="size-4" aria-hidden="true" />
                  {email.imageUrl ? 'Replace picture' : 'Add picture'}
                </Button>
                {email.imageUrl ? (
                  <Button type="button" size="sm" variant="ghost" onClick={() => update({ imageUrl: null })}>
                    Remove picture
                  </Button>
                ) : null}
              </div>
              <input
                ref={fileInput}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="sr-only"
                aria-label="Choose a picture"
                onChange={uploadPicture}
              />
            </div>
          </fieldset>

          {message ? (
            <p role={message.tone === 'error' ? 'alert' : 'status'} className={cn('text-sm', message.tone === 'error' ? 'text-danger' : 'text-success')}>
              {message.text}
            </p>
          ) : null}

          {canManage ? (
            <div className="border-border flex flex-wrap items-center gap-2 border-t pt-4">
              <Button type="button" onClick={save} loading={busy === 'save'} disabled={!dirty || busy !== null}>
                {dirty ? 'Save changes' : 'Saved'}
              </Button>
              <Button type="button" variant="outline" onClick={sendTest} loading={busy === 'test'} disabled={busy !== null}>
                <Send className="size-4" aria-hidden="true" />
                Send me a test
              </Button>
              {emails.length > 1 ? (
                <Button type="button" variant="ghost" onClick={removeEmail} disabled={busy !== null} className="ml-auto">
                  <Trash2 className="size-4" aria-hidden="true" />
                  Delete email
                </Button>
              ) : null}
            </div>
          ) : null}
        </Card>

        <div className="flex flex-col gap-2">
          <p className="text-muted-foreground text-sm">
            <span className="text-foreground font-medium">Subject:</span> {preview(email.subject) || '—'}
          </p>
          <MarketingEmailPreview
            heading={preview(email.heading)}
            bodyText={preview(email.body)}
            imageUrl={email.imageUrl}
            ctaLabel={email.ctaLabel || null}
            ctaUrl="#"
          />
        </div>
      </div>
    </div>
  );
}
