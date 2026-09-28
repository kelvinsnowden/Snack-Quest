import 'server-only';

import { adminFirestore } from '@/lib/firebase/admin';
import { findAdapterRegistration } from '@/lib/vending/adapterRegistry';
import { manufacturerRepository, ManufacturerNotFoundError } from '@/repositories/manufacturerRepository';
import { machineModelRepository } from '@/repositories/machineModelRepository';
import { machineIntegrationRepository } from '@/repositories/machineIntegrationRepository';
import { integrationCredentialRepository } from '@/repositories/integrationCredentialRepository';
import { manufacturerApiCredentialRepository } from '@/repositories/manufacturerApiCredentialRepository';
import { MANUFACTURER_ONBOARDING_STAGES } from '@/types';

export interface OnboardingStep {
  key: string;
  label: string;
  /** Who moves it: `system` steps complete themselves from recorded facts; `staff` and `manufacturer` steps are someone's job. */
  owner: 'staff' | 'manufacturer' | 'system';
  done: boolean;
  /** What was observed, or what is missing. */
  detail: string;
  /** Not every step applies to every integration (e.g. an API key only when Snack Quest calls them). */
  applicable: boolean;
}

export interface CertificationRunSummary {
  runId: string;
  machineCode: string;
  modelId: string;
  verdict: string;
  failures: string[];
  subject: string | null;
  at: string | null;
}

/**
 * The manufacturer onboarding flow, executable: every step's state is
 * derived from what has actually been recorded — nothing is ticked by
 * hand here — and each says whose job it is, so the manual steps are
 * explicit rather than implied.
 */
class ManufacturerOnboardingService {
  async checklist(businessId: string, manufacturerId: string): Promise<OnboardingStep[]> {
    const manufacturer = await manufacturerRepository.findById(businessId, manufacturerId);
    if (!manufacturer) throw new ManufacturerNotFoundError(manufacturerId);
    const [models, integrations, keys, apiCredentials] = await Promise.all([
      machineModelRepository.listByManufacturer(businessId, manufacturerId),
      machineIntegrationRepository.listByBusiness(businessId).then((all) => all.filter((i) => i.manufacturerId === manufacturerId)),
      integrationCredentialRepository.listByManufacturer(businessId, manufacturerId),
      manufacturerApiCredentialRepository.listForManufacturer(businessId, manufacturerId),
    ]);
    const stageIndex = MANUFACTURER_ONBOARDING_STAGES.indexOf(manufacturer.onboardingStage);
    const reached = (stage: (typeof MANUFACTURER_ONBOARDING_STAGES)[number]) => stageIndex >= MANUFACTURER_ONBOARDING_STAGES.indexOf(stage);
    const outbound = findAdapterRegistration(manufacturer.defaultAdapterKey)?.requiresOutboundCredential === true;
    const live = (environment: 'sandbox' | 'production') => keys.filter((k) => k.environment === environment && !k.revokedAt);
    const sandboxMachines = integrations.filter((i) => i.environment === 'sandbox');
    const productionMachines = integrations.filter((i) => i.environment === 'production');
    const tested = sandboxMachines.filter((i) => i.lastConnectionTest?.ok);
    const heard = sandboxMachines.filter((i) => Object.values(i.signals ?? {}).some(Boolean));
    const harnessPassed = models.filter(({ data }) => data.certificationChecklist?.contract_suite?.outcome === 'passed');
    const certified = models.filter(({ data }) => data.certificationStatus === 'certified');
    const apiKey = (environment: 'sandbox' | 'production') => apiCredentials.find((c) => c.environment === environment && c.status === 'active' && c.current);

    return [
      { key: 'application', label: 'Application recorded', owner: 'staff', applicable: true, done: true, detail: `${manufacturer.name}, ${manufacturer.integrationType.replace(/_/g, ' ')}` },
      { key: 'technical_review', label: 'Technical review: integration model and adapter agreed', owner: 'staff', applicable: true, done: reached('technical_review'), detail: `adapter ${manufacturer.defaultAdapterKey}; stage ${manufacturer.onboardingStage}` },
      { key: 'model', label: 'Machine model(s) registered with declared capabilities', owner: 'staff', applicable: true, done: models.length > 0, detail: models.length ? models.map(({ data }) => data.name).join(', ') : 'no model yet' },
      { key: 'sandbox_keys', label: 'Sandbox signing key issued and sent to the manufacturer', owner: 'staff', applicable: true, done: live('sandbox').length > 0, detail: live('sandbox').length ? `${live('sandbox').length} active key(s)` : 'issue one under Credentials (shown once)' },
      { key: 'sandbox_api_key', label: 'Their sandbox API key entered (Snack Quest calls them)', owner: 'staff', applicable: outbound, done: Boolean(apiKey('sandbox')), detail: apiKey('sandbox') ? `v${apiKey('sandbox')!.current!.version}, ${apiKey('sandbox')!.baseUrl}` : 'needed before any call can be made' },
      { key: 'sandbox_machine', label: 'Sandbox machine configured and slot-mapped', owner: 'staff', applicable: true, done: sandboxMachines.length > 0, detail: sandboxMachines.length ? sandboxMachines.map((i) => i.machineCode).join(', ') : 'configure one from a machine page' },
      { key: 'first_contact', label: 'Machine has talked to Snack Quest (signed request, heartbeat or webhook)', owner: 'manufacturer', applicable: true, done: heard.length > 0, detail: heard.length ? `${heard.length} machine(s) heard` : 'waiting for their first signed request' },
      { key: 'connection_test', label: 'Connection test passed', owner: 'system', applicable: true, done: tested.length > 0, detail: tested.length ? tested.map((i) => i.machineCode).join(', ') : 'run it from the machine page' },
      { key: 'harness', label: 'Automated contract suite passed (certification harness)', owner: 'system', applicable: true, done: harnessPassed.length > 0, detail: harnessPassed.length ? harnessPassed.map(({ data }) => data.name).join(', ') : 'run the harness against their sandbox machine (npm run test:manufacturer-contract)' },
      { key: 'checklist', label: 'Certification checklist complete and model certified', owner: 'staff', applicable: true, done: certified.length > 0, detail: certified.length ? certified.map(({ data }) => data.name).join(', ') : 'record the manual checks with evidence, then certify' },
      { key: 'production_stage', label: 'Moved to the production stage', owner: 'staff', applicable: true, done: reached('production'), detail: `stage ${manufacturer.onboardingStage}` },
      { key: 'production_keys', label: 'Production signing key issued', owner: 'staff', applicable: true, done: live('production').length > 0, detail: live('production').length ? `${live('production').length} active key(s)` : 'only after certification' },
      { key: 'production_api_key', label: 'Their production API key entered', owner: 'staff', applicable: outbound, done: Boolean(apiKey('production')), detail: apiKey('production') ? `v${apiKey('production')!.current!.version}` : 'not set' },
      { key: 'production_activation', label: 'First production machine activated', owner: 'staff', applicable: true, done: productionMachines.some((i) => i.state === 'active'), detail: productionMachines.length ? productionMachines.map((i) => `${i.machineCode} (${i.state})`).join(', ') : 'none yet' },
    ];
  }

  /** Harness runs for this manufacturer's machines, newest first — including failed ones, which are the useful ones. */
  async certificationRuns(businessId: string, manufacturerId: string, limit = 20): Promise<CertificationRunSummary[]> {
    const models = new Set((await machineModelRepository.listByManufacturer(businessId, manufacturerId)).map(({ id }) => id));
    if (models.size === 0) return [];
    const snapshot = await adminFirestore.collection('integrationCertificationRuns').where('businessId', '==', businessId).where('modelId', 'in', [...models].slice(0, 30)).get();
    return snapshot.docs
      .map((doc) => doc.data() as { runId: string; machineCode: string; modelId: string; verdict: string; failures?: string[]; subjectKind?: string; createdAt?: { toDate(): Date } })
      .map((run) => ({ runId: run.runId, machineCode: run.machineCode, modelId: run.modelId, verdict: run.verdict, failures: run.failures ?? [], subject: run.subjectKind ?? null, at: run.createdAt ? run.createdAt.toDate().toISOString() : null }))
      .sort((a, b) => (b.at ?? '').localeCompare(a.at ?? ''))
      .slice(0, limit);
  }
}

export const manufacturerOnboardingService = new ManufacturerOnboardingService();
