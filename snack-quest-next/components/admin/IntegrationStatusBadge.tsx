import { Badge } from '@/components/ui/badge';
import { INTEGRATION_STATUS_BADGE_VARIANT, INTEGRATION_STATUS_LABELS } from '@/lib/integrations/statusFormat';
import type { IntegrationStatus } from '@/services/integrationSettingsService';

export function IntegrationStatusBadge({ status }: { status: IntegrationStatus }) {
  return <Badge variant={INTEGRATION_STATUS_BADGE_VARIANT[status]}>{INTEGRATION_STATUS_LABELS[status]}</Badge>;
}
