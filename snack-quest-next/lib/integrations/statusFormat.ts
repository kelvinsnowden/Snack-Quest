import type { BadgeProps } from '@/components/ui/badge';
import type { IntegrationStatus } from '@/services/integrationSettingsService';

export const INTEGRATION_STATUS_LABELS: Record<IntegrationStatus, string> = {
  connected: 'Connected',
  missing: 'Missing credentials',
  invalid: 'Invalid credentials',
  connection_failed: 'Connection failed',
  disabled: 'Disabled',
};

export const INTEGRATION_STATUS_BADGE_VARIANT: Record<IntegrationStatus, BadgeProps['variant']> = {
  connected: 'success',
  missing: 'outline',
  invalid: 'danger',
  connection_failed: 'danger',
  disabled: 'secondary',
};

export const INTEGRATION_PROVIDER_LABELS: Record<string, string> = {
  daraja: 'Daraja (M-Pesa)',
  whatchimp: 'Whatchimp (WhatsApp)',
  jumia: 'Jumia (Delivery)',
  meta: 'Meta (Pixel + Conversions API)',
  tiktok: 'TikTok (Pixel + Events API)',
  authEmail: 'Email (SMTP)',
};
