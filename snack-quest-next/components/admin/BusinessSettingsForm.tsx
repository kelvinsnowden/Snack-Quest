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

export interface OrderAlertRecipientFormValue {
  phone: string;
  label: string;
}

export interface BusinessSettingsFormValues {
  name: string;
  currency: string;
  whatsappPhoneNumberId: string;
  countyCoverage: string[];
  adminWhatsappPhone: string | null;
  orderAlertRecipients: OrderAlertRecipientFormValue[];
  whatsappCustomerNumber: string | null;
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
    /*
     * Blank rows are dropped rather than rejected: pressing "Add
     * number" and then changing your mind should not be an error you
     * have to clear before you can save anything else on the page.
     */
    const orderAlertRecipients = values.orderAlertRecipients
      .map((recipient) => ({ phone: recipient.phone.trim(), label: recipient.label.trim() }))
      .filter((recipient) => recipient.phone.length > 0 || recipient.label.length > 0);
    for (const recipient of orderAlertRecipients) {
      if (!/^254\d{9}$/.test(recipient.phone)) {
        setError(
          `"${recipient.phone}" is not a valid number — use E.164 without "+", e.g. 254712345678.`,
        );
        return;
      }
      if (!recipient.label) {
        setError(`Give ${recipient.phone} a label, so you can tell the list apart later.`);
        return;
      }
    }
    const duplicate = orderAlertRecipients.find(
      (recipient, index) =>
        orderAlertRecipients.findIndex((other) => other.phone === recipient.phone) !== index,
    );
    if (duplicate) {
      setError(`${duplicate.phone} is listed twice — one number, one alert.`);
      return;
    }

    const trimmedCustomerNumber = values.whatsappCustomerNumber?.trim() ?? '';
    if (trimmedCustomerNumber && !/^254\d{9}$/.test(trimmedCustomerNumber)) {
      setError('WhatsApp customer number must be E.164 without "+", e.g. 254712345678.');
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
          orderAlertRecipients,
          /*
           * Cleared as the list takes over. Leaving the legacy single
           * number set would keep texting somebody an admin has just
           * removed from the list, because the send path falls back to
           * it whenever the list is empty.
           */
          adminOrderSmsPhone: null,
          whatsappCustomerNumber: trimmedCustomerNumber || null,
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

      setValues((v) => ({ ...v, countyCoverage, orderAlertRecipients }));
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

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="whatsappCustomerNumber">Customer-facing WhatsApp number</Label>
              <Input
                id="whatsappCustomerNumber"
                value={values.whatsappCustomerNumber ?? ''}
                onChange={(event) =>
                  setValues((v) => ({
                    ...v,
                    whatsappCustomerNumber: event.target.value,
                  }))
                }
                placeholder="254712345678"
              />
              {/*
                Not the same thing as the phone_number_id below, and the
                distinction matters: that one is the Cloud API's internal
                identifier, this is the number a wa.me link can actually
                open. Creator referral links and every "Order on WhatsApp"
                button on the site read this, and fail closed without it.
              */}
              <p className="text-caption text-muted-foreground">
                The number behind every &ldquo;Order on WhatsApp&rdquo; button and creator referral
                link. Those fail closed while this is blank.
              </p>
            </div>
          </div>

          {/*
            Who gets told when an order comes in (§ order alert recipients).

            A list rather than one number, because the owner wants the
            sale and whoever is packing wants the box, and those are
            rarely the same phone. Each row carries a label: a column of
            bare digits is unreadable a month later, and removing the
            wrong row here is a silent failure — nobody finds out until
            an order goes unpacked.
          */}
          <div className="border-border flex flex-col gap-3 rounded-lg border p-4">
            <div className="flex flex-col gap-1">
              <Label>Order alert numbers</Label>
              <p className="text-caption text-muted-foreground">
                Everyone here is texted the moment an order comes in — including pay-on-delivery
                orders and ones staff record by hand. Empty means nobody is texted.
              </p>
            </div>

            {values.orderAlertRecipients.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                No numbers yet. Nobody is told when an order arrives.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {values.orderAlertRecipients.map((recipient, index) => (
                  <li key={index} className="flex flex-col gap-2 sm:flex-row sm:items-start">
                    <div className="flex flex-1 flex-col gap-1.5">
                      <Label htmlFor={`alert-label-${index}`} className="sr-only">
                        Name for this number
                      </Label>
                      <Input
                        id={`alert-label-${index}`}
                        value={recipient.label}
                        onChange={(event) =>
                          setValues((v) => ({
                            ...v,
                            orderAlertRecipients: v.orderAlertRecipients.map((entry, i) =>
                              i === index ? { ...entry, label: event.target.value } : entry,
                            ),
                          }))
                        }
                        placeholder="Who is this? e.g. Kelvin"
                      />
                    </div>
                    <div className="flex flex-1 flex-col gap-1.5">
                      <Label htmlFor={`alert-phone-${index}`} className="sr-only">
                        Phone number
                      </Label>
                      <Input
                        id={`alert-phone-${index}`}
                        value={recipient.phone}
                        inputMode="numeric"
                        onChange={(event) =>
                          setValues((v) => ({
                            ...v,
                            orderAlertRecipients: v.orderAlertRecipients.map((entry, i) =>
                              i === index ? { ...entry, phone: event.target.value } : entry,
                            ),
                          }))
                        }
                        placeholder="254712345678"
                      />
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="sm:mt-0"
                      onClick={() =>
                        setValues((v) => ({
                          ...v,
                          orderAlertRecipients: v.orderAlertRecipients.filter(
                            (_, i) => i !== index,
                          ),
                        }))
                      }
                    >
                      Remove
                    </Button>
                  </li>
                ))}
              </ul>
            )}

            <div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setValues((v) => ({
                    ...v,
                    orderAlertRecipients: [...v.orderAlertRecipients, { phone: '', label: '' }],
                  }))
                }
              >
                Add a number
              </Button>
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
