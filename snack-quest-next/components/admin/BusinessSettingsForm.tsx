'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent } from '@/components/ui/card';

export interface LoyaltyConfigFormValues {
  enabled: boolean;
  firstOrderBonusKes: number;
  repeatOrderIntervalCount: number;
  repeatOrderBonusKes: number;
}

export interface BusinessSettingsFormValues {
  name: string;
  currency: string;
  whatsappPhoneNumberId: string;
  countyCoverage: string[];
  adminWhatsappPhone: string | null;
  status: 'active' | 'suspended';
  loyaltyConfig: LoyaltyConfigFormValues;
}

export const DEFAULT_LOYALTY_CONFIG: LoyaltyConfigFormValues = {
  enabled: false,
  firstOrderBonusKes: 0,
  repeatOrderIntervalCount: 5,
  repeatOrderBonusKes: 0,
};

export function BusinessSettingsForm({
  initialValues,
}: {
  initialValues: BusinessSettingsFormValues;
}) {
  const router = useRouter();
  const [values, setValues] = useState(initialValues);
  const [countyCoverageText, setCountyCoverageText] = useState(
    initialValues.countyCoverage.join(', '),
  );
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
      setError(
        'Admin WhatsApp phone must be E.164 without "+", e.g. 254712345678.',
      );
      return;
    }
    if (
      values.loyaltyConfig.firstOrderBonusKes < 0 ||
      values.loyaltyConfig.repeatOrderBonusKes < 0 ||
      values.loyaltyConfig.repeatOrderIntervalCount < 0
    ) {
      setError('Loyalty amounts and interval cannot be negative.');
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
          status: values.status,
          loyaltyConfig: values.loyaltyConfig,
        }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
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
              onChange={(event) =>
                setValues((v) => ({ ...v, name: event.target.value }))
              }
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
                onChange={(event) =>
                  setValues((v) => ({
                    ...v,
                    currency: event.target.value.toUpperCase(),
                  }))
                }
                placeholder="KES"
                required
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="adminWhatsappPhone">
                Admin alert WhatsApp number
              </Label>
              <Input
                id="adminWhatsappPhone"
                value={values.adminWhatsappPhone ?? ''}
                onChange={(event) =>
                  setValues((v) => ({
                    ...v,
                    adminWhatsappPhone: event.target.value,
                  }))
                }
                placeholder="254712345678"
              />
              <p className="text-caption text-muted-foreground">
                Gets a message for every new order. Leave blank to disable.
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="whatsappPhoneNumberId">
              WhatsApp phone_number_id
            </Label>
            <Input
              id="whatsappPhoneNumberId"
              value={values.whatsappPhoneNumberId}
              onChange={(event) =>
                setValues((v) => ({
                  ...v,
                  whatsappPhoneNumberId: event.target.value,
                }))
              }
              required
            />
            <p className="text-caption text-danger">
              This is how inbound WhatsApp traffic is routed to this business.
              Changing it takes effect immediately — only edit it as part of a
              real number migration.
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
            <p className="text-caption text-muted-foreground">
              Comma-separated list of counties this business delivers to.
            </p>
          </div>

          <div className="border-border flex items-center justify-between rounded-md border p-3">
            <div>
              <p className="text-foreground text-sm font-medium">Active</p>
              <p className="text-caption text-muted-foreground">
                A suspended business stops accepting new orders.
              </p>
            </div>
            <Switch
              checked={values.status === 'active'}
              onCheckedChange={(checked) =>
                setValues((v) => ({
                  ...v,
                  status: checked ? 'active' : 'suspended',
                }))
              }
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-5 pt-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-foreground text-sm font-semibold">
                Customer loyalty / Quest wallet
              </p>
              <p className="text-caption text-muted-foreground">
                Automatic wallet credit for repeat customers, applied at their
                next WhatsApp checkout. No amount is credited unless you set one
                below.
              </p>
            </div>
            <Switch
              checked={values.loyaltyConfig.enabled}
              onCheckedChange={(checked) =>
                setValues((v) => ({
                  ...v,
                  loyaltyConfig: { ...v.loyaltyConfig, enabled: checked },
                }))
              }
            />
          </div>

          <div className="grid gap-5 sm:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="firstOrderBonusKes">Welcome bonus (KES)</Label>
              <Input
                id="firstOrderBonusKes"
                type="number"
                min={0}
                value={values.loyaltyConfig.firstOrderBonusKes}
                onChange={(event) =>
                  setValues((v) => ({
                    ...v,
                    loyaltyConfig: {
                      ...v.loyaltyConfig,
                      firstOrderBonusKes: Number(event.target.value),
                    },
                  }))
                }
              />
              <p className="text-caption text-muted-foreground">
                Credited after a customer&apos;s first paid order.
              </p>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="repeatOrderIntervalCount">
                Repeat order interval
              </Label>
              <Input
                id="repeatOrderIntervalCount"
                type="number"
                min={0}
                value={values.loyaltyConfig.repeatOrderIntervalCount}
                onChange={(event) =>
                  setValues((v) => ({
                    ...v,
                    loyaltyConfig: {
                      ...v.loyaltyConfig,
                      repeatOrderIntervalCount: Number(event.target.value),
                    },
                  }))
                }
              />
              <p className="text-caption text-muted-foreground">
                e.g. 5 credits the 5th, 10th, 15th order.
              </p>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="repeatOrderBonusKes">
                Repeat order bonus (KES)
              </Label>
              <Input
                id="repeatOrderBonusKes"
                type="number"
                min={0}
                value={values.loyaltyConfig.repeatOrderBonusKes}
                onChange={(event) =>
                  setValues((v) => ({
                    ...v,
                    loyaltyConfig: {
                      ...v.loyaltyConfig,
                      repeatOrderBonusKes: Number(event.target.value),
                    },
                  }))
                }
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {error ? <p className="text-danger text-sm">{error}</p> : null}
      {saved && !error ? (
        <p className="text-success text-sm">Settings saved.</p>
      ) : null}

      <div className="flex items-center gap-3">
        <Button type="submit" loading={submitting}>
          Save changes
        </Button>
      </div>
    </form>
  );
}
