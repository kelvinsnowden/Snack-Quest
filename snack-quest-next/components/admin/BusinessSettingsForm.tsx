'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent } from '@/components/ui/card';

export interface BusinessSettingsFormValues {
  name: string;
  currency: string;
  whatsappPhoneNumberId: string;
  countyCoverage: string[];
  adminWhatsappPhone: string | null;
  whatsappCustomerNumber: string | null;
  status: 'active' | 'suspended';
}

export function BusinessSettingsForm({ initialValues }: { initialValues: BusinessSettingsFormValues }) {
  const router = useRouter();
  const [values, setValues] = useState(initialValues);
  const [countyCoverageText, setCountyCoverageText] = useState(initialValues.countyCoverage.join(', '));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSaved(false);

    if (!values.name.trim()) {
      setError('Business name is required.');
      return;
    }
    if (!/^[A-Za-z]{3}$/.test(values.currency)) {
      setError('Currency must be a 3-letter code, e.g. KES.');
      return;
    }
    if (!values.whatsappPhoneNumberId.trim()) {
      setError('WhatsApp phone number ID is required.');
      return;
    }

    const countyCoverage = countyCoverageText
      .split(',')
      .map((county) => county.trim())
      .filter((county) => county.length > 0);
    if (countyCoverage.length === 0) {
      setError('At least one county is required.');
      return;
    }

    const trimmedPhone = values.adminWhatsappPhone?.trim() ?? '';
    if (trimmedPhone && !/^254\d{9}$/.test(trimmedPhone)) {
      setError('Admin WhatsApp phone must be E.164 without "+", e.g. 254712345678.');
      return;
    }
    const trimmedCustomerNumber = values.whatsappCustomerNumber?.trim() ?? '';
    if (trimmedCustomerNumber && !/^254\d{9}$/.test(trimmedCustomerNumber)) {
      setError('Customer WhatsApp number must be E.164 without "+", e.g. 254712345678.');
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch('/api/admin/settings', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: values.name.trim(),
          currency: values.currency.toUpperCase(),
          whatsappPhoneNumberId: values.whatsappPhoneNumberId.trim(),
          countyCoverage,
          adminWhatsappPhone: trimmedPhone || null,
          whatsappCustomerNumber: trimmedCustomerNumber || null,
          status: values.status,
        }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? 'Could not save settings.');
      }

      setValues((v) => ({ ...v, countyCoverage }));
      setSaved(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save settings.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6">
      <Card>
        <CardContent className="flex flex-col gap-5 pt-6">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name">Business name</Label>
            <Input
              id="name"
              value={values.name}
              onChange={(event) => setValues((v) => ({ ...v, name: event.target.value }))}
              required
            />
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="currency">Currency</Label>
              <Input
                id="currency"
                value={values.currency}
                maxLength={3}
                onChange={(event) => setValues((v) => ({ ...v, currency: event.target.value.toUpperCase() }))}
                placeholder="KES"
                required
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="adminWhatsappPhone">Admin alert WhatsApp number</Label>
              <Input
                id="adminWhatsappPhone"
                value={values.adminWhatsappPhone ?? ''}
                onChange={(event) => setValues((v) => ({ ...v, adminWhatsappPhone: event.target.value }))}
                placeholder="254712345678"
              />
              <p className="text-caption text-muted-foreground">Gets a message for every new order. Leave blank to disable.</p>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="whatsappCustomerNumber">Customer-facing WhatsApp number</Label>
            <Input
              id="whatsappCustomerNumber"
              value={values.whatsappCustomerNumber ?? ''}
              onChange={(event) => setValues((v) => ({ ...v, whatsappCustomerNumber: event.target.value }))}
              placeholder="254712345678"
            />
            <p className="text-caption text-muted-foreground">
              The real number behind the phone_number_id below — used to build creator referral-link
              click-throughs and the marketing site&apos;s &quot;Order on WhatsApp&quot; buttons. Leave blank until
              those are ready to use it.
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="whatsappPhoneNumberId">WhatsApp phone_number_id</Label>
            <Input
              id="whatsappPhoneNumberId"
              value={values.whatsappPhoneNumberId}
              onChange={(event) => setValues((v) => ({ ...v, whatsappPhoneNumberId: event.target.value }))}
              required
            />
            <p className="text-caption text-danger">
              This is how inbound WhatsApp traffic is routed to this business. Changing it takes effect immediately —
              only edit it as part of a real number migration.
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="countyCoverage">County coverage</Label>
            <Input
              id="countyCoverage"
              value={countyCoverageText}
              onChange={(event) => setCountyCoverageText(event.target.value)}
              placeholder="Nairobi, Mombasa, Kisumu"
              required
            />
            <p className="text-caption text-muted-foreground">Comma-separated list of counties this business delivers to.</p>
          </div>

          <div className="flex items-center justify-between rounded-md border border-border p-3">
            <div>
              <p className="text-sm font-medium text-foreground">Active</p>
              <p className="text-caption text-muted-foreground">A suspended business stops accepting new orders.</p>
            </div>
            <Switch
              checked={values.status === 'active'}
              onCheckedChange={(checked) => setValues((v) => ({ ...v, status: checked ? 'active' : 'suspended' }))}
            />
          </div>
        </CardContent>
      </Card>

      {error ? <p className="text-sm text-danger">{error}</p> : null}
      {saved && !error ? <p className="text-sm text-success">Settings saved.</p> : null}

      <div className="flex items-center gap-3">
        <Button type="submit" loading={submitting}>
          Save changes
        </Button>
      </div>
    </form>
  );
}
