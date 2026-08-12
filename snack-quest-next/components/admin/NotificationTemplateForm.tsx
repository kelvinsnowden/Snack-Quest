'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { brandedEmailHtml, paragraphsToHtml } from '@/lib/notifications/brandedEmailHtml';
import type { NotificationChannel } from '@/types';

export interface NotificationTemplateFormValues {
  subject: string;
  heading: string;
  bodyTemplate: string;
  ctaLabel: string;
  ctaUrl: string;
  isActive: boolean;
}

interface NotificationTemplateFormProps {
  templateCode: string;
  channel: NotificationChannel;
  requiredParams: string[];
  initialValues: NotificationTemplateFormValues;
}

export function NotificationTemplateForm({ templateCode, channel, requiredParams, initialValues }: NotificationTemplateFormProps) {
  const router = useRouter();
  const [values, setValues] = useState<NotificationTemplateFormValues>(initialValues);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const isEmail = channel === 'email';

  const previewHtml = useMemo(() => {
    if (!isEmail) return '';
    return brandedEmailHtml({
      heading: values.heading.trim() || 'Your heading goes here',
      bodyHtml: paragraphsToHtml(values.bodyTemplate.trim() || 'Your message goes here.'),
      ctaLabel: values.ctaLabel || null,
      ctaUrl: values.ctaUrl || null,
    });
  }, [isEmail, values.heading, values.bodyTemplate, values.ctaLabel, values.ctaUrl]);

  function validate(): string | null {
    if (!values.bodyTemplate.trim()) return 'Message body is required.';
    if (isEmail && !values.subject.trim()) return 'Subject is required for an email template.';
    if (isEmail && !values.heading.trim()) return 'Heading is required for an email template.';
    if (Boolean(values.ctaLabel.trim()) !== Boolean(values.ctaUrl.trim())) {
      return 'A button needs both a label and a URL, or neither.';
    }
    return null;
  }

  async function onSave() {
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }
    setError(null);
    setSaved(false);
    setSubmitting(true);
    try {
      const response = await fetch(`/api/admin/notification-templates/${templateCode}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          subject: isEmail ? values.subject.trim() : null,
          heading: isEmail ? values.heading.trim() : null,
          bodyTemplate: values.bodyTemplate.trim(),
          ctaLabel: values.ctaLabel.trim() || null,
          ctaUrl: values.ctaUrl.trim() || null,
          isActive: values.isActive,
        }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? 'Could not save this template.');
      }
      setSaved(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save this template.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={isEmail ? 'grid gap-6 lg:grid-cols-2 lg:items-start' : 'flex max-w-2xl flex-col gap-6'}>
      <div className="flex flex-col gap-6">
        <Card>
          <CardContent className="flex flex-col gap-5 pt-6">
            <div className="flex items-start justify-between gap-4 rounded-lg border border-border bg-border/10 p-4">
              <div className="flex flex-col gap-0.5">
                <Label htmlFor="nt-active" className="cursor-pointer">
                  {values.isActive ? 'Active — this email sends normally' : 'Disabled — this event is silently skipped'}
                </Label>
                <p className="text-xs text-muted-foreground">
                  The business flow it&apos;s attached to keeps working either way; only the message is affected.
                </p>
              </div>
              <Switch
                id="nt-active"
                checked={values.isActive}
                onCheckedChange={(checked) => setValues((v) => ({ ...v, isActive: checked }))}
              />
            </div>

            {requiredParams.length > 0 ? (
              <p className="text-xs text-muted-foreground">
                Available tokens:{' '}
                {requiredParams.map((param, index) => (
                  <span key={param}>
                    <code className="rounded bg-border/30 px-1 py-0.5 text-foreground">{`{{${param}}}`}</code>
                    {index < requiredParams.length - 1 ? ', ' : ''}
                  </span>
                ))}
              </p>
            ) : null}

            {isEmail ? (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="nt-subject">Subject line</Label>
                <Input
                  id="nt-subject"
                  value={values.subject}
                  onChange={(event) => setValues((v) => ({ ...v, subject: event.target.value }))}
                  required
                />
              </div>
            ) : null}

            {isEmail ? (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="nt-heading">Heading</Label>
                <Input
                  id="nt-heading"
                  value={values.heading}
                  onChange={(event) => setValues((v) => ({ ...v, heading: event.target.value }))}
                  required
                />
              </div>
            ) : null}

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="nt-body">Message</Label>
              <Textarea
                id="nt-body"
                value={values.bodyTemplate}
                onChange={(event) => setValues((v) => ({ ...v, bodyTemplate: event.target.value }))}
                rows={isEmail ? 8 : 5}
                required
              />
              {isEmail ? <p className="text-xs text-muted-foreground">Leave a blank line between paragraphs.</p> : null}
            </div>

            {isEmail ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="nt-cta-label">Button label (optional)</Label>
                  <Input
                    id="nt-cta-label"
                    value={values.ctaLabel}
                    onChange={(event) => setValues((v) => ({ ...v, ctaLabel: event.target.value }))}
                    placeholder="Open Creator Portal"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="nt-cta-url">Button link (optional)</Label>
                  <Input
                    id="nt-cta-url"
                    value={values.ctaUrl}
                    onChange={(event) => setValues((v) => ({ ...v, ctaUrl: event.target.value }))}
                    placeholder="{{portalUrl}}"
                  />
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>

        {error ? <p className="text-sm text-danger">{error}</p> : null}
        {saved ? <p className="text-sm text-success">Saved.</p> : null}

        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" onClick={onSave} loading={submitting}>
            <Save className="size-4" aria-hidden="true" />
            Save changes
          </Button>
          <Button type="button" variant="ghost" onClick={() => router.push('/admin/notification-templates')} disabled={submitting}>
            Back
          </Button>
        </div>
      </div>

      {isEmail ? (
        <div className="flex flex-col gap-2 lg:sticky lg:top-6">
          <Label>Live preview</Label>
          <p className="text-xs text-muted-foreground">
            Tokens like <code className="rounded bg-border/30 px-1 py-0.5">{'{{displayName}}'}</code> show literally here — they&apos;re
            filled in with the real value only when the email actually sends.
          </p>
          <iframe title="Email preview" srcDoc={previewHtml} sandbox="" className="h-[640px] w-full rounded-lg border border-border bg-white" />
        </div>
      ) : null}
    </div>
  );
}
