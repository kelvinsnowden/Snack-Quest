import { Badge } from '@/components/ui/badge';
import type { IntegrationHealthState, MachineIntegrationState, ModelCertificationStatus, ManufacturerOnboardingStage } from '@/types';

const HEALTH: Record<IntegrationHealthState, { label: string; variant: 'success' | 'warning' | 'danger' | 'outline' }> = {
  connected: { label: 'Connected', variant: 'success' },
  degraded: { label: 'Degraded', variant: 'warning' },
  disconnected: { label: 'Disconnected', variant: 'outline' },
  error: { label: 'Error', variant: 'danger' },
};

const STATE: Record<MachineIntegrationState, { label: string; variant: 'success' | 'warning' | 'secondary' | 'outline' }> = {
  configured: { label: 'Configured', variant: 'outline' },
  tested: { label: 'Tested', variant: 'secondary' },
  active: { label: 'Active', variant: 'success' },
  suspended: { label: 'Suspended', variant: 'warning' },
};

const CERTIFICATION: Record<ModelCertificationStatus, { label: string; variant: 'success' | 'warning' | 'danger' | 'outline' }> = {
  not_started: { label: 'Not started', variant: 'outline' },
  in_progress: { label: 'In certification', variant: 'warning' },
  certified: { label: 'Certified', variant: 'success' },
  revoked: { label: 'Revoked', variant: 'danger' },
};

export const STAGE_LABELS: Record<ManufacturerOnboardingStage, string> = {
  application: 'Application',
  technical_review: 'Technical review',
  credentials: 'Credentials',
  sandbox: 'Test environment',
  certification: 'Certification',
  production: 'Production',
};

export function IntegrationHealthBadge({ state }: { state: IntegrationHealthState }) {
  return <Badge variant={HEALTH[state].variant}>{HEALTH[state].label}</Badge>;
}

export function IntegrationStateBadge({ state }: { state: MachineIntegrationState }) {
  return <Badge variant={STATE[state].variant}>{STATE[state].label}</Badge>;
}

export function CertificationBadge({ status }: { status: ModelCertificationStatus }) {
  return <Badge variant={CERTIFICATION[status].variant}>{CERTIFICATION[status].label}</Badge>;
}

export function StageBadge({ stage }: { stage: ManufacturerOnboardingStage }) {
  return <Badge variant={stage === 'production' ? 'success' : 'secondary'}>{STAGE_LABELS[stage]}</Badge>;
}
