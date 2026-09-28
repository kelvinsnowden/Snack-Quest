import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { manufacturerOnboardingService } from '@/services/manufacturerOnboardingService';
import { manufacturerRegistryService } from '@/services/manufacturerRegistryService';
import { resetRateLimiterForTesting } from '@/lib/rateLimit/rateLimiter';
import { clearIntegrationCollections } from '../helpers/integrationFixtures';
import { activeMachine, apiKey, onboardManufacturer, v1 } from '../helpers/v1TestHarness';

/** The onboarding checklist reflects recorded facts only, and says whose move each step is. */

const BUSINESS_ID = 'biz-manufacturer-onboarding';
const ORIGINAL = { business: process.env.SNACK_QUEST_BUSINESS_ID, key: process.env.SECRET_ENCRYPTION_KEY };
beforeAll(() => {
  process.env.SNACK_QUEST_BUSINESS_ID = BUSINESS_ID;
  process.env.SECRET_ENCRYPTION_KEY = '4'.repeat(64);
});
afterAll(() => {
  process.env.SNACK_QUEST_BUSINESS_ID = ORIGINAL.business;
  process.env.SECRET_ENCRYPTION_KEY = ORIGINAL.key;
});
beforeEach(async () => {
  resetRateLimiterForTesting();
  await clearIntegrationCollections(BUSINESS_ID);
});

const state = async (manufacturerId: string) => Object.fromEntries((await manufacturerOnboardingService.checklist(BUSINESS_ID, manufacturerId)).filter((s) => s.applicable).map((s) => [s.key, s.done]));

describe('onboarding checklist', () => {
  it('a new applicant has only the application done; an outbound-only step does not apply to an inbound manufacturer', async () => {
    const id = await manufacturerRegistryService.createManufacturer(BUSINESS_ID, { name: 'Fresh', slug: 'fresh', integrationType: 'snack_quest_api', defaultAdapterKey: 'snack_quest_gateway' }, 'staff-1');
    const steps = await manufacturerOnboardingService.checklist(BUSINESS_ID, id);
    expect(steps.filter((s) => s.done).map((s) => s.key)).toEqual(['application']);
    expect(steps.find((s) => s.key === 'sandbox_api_key')?.applicable).toBe(false);
    expect(steps.find((s) => s.key === 'first_contact')?.owner).toBe('manufacturer');
  });

  it('advances as keys are issued, a machine is configured and it talks to us — the harness step stays open until a harness run passes', async () => {
    const ids = await onboardManufacturer(BUSINESS_ID, 'progress', { adapterKey: 'snack_quest_gateway' });
    const machine = await activeMachine(BUSINESS_ID, ids, { adapterKey: 'snack_quest_gateway' });
    const key = await apiKey(BUSINESS_ID, ids.manufacturerId);
    await v1(key, machine.machineCode).heartbeat({ eventId: `hb-${Date.now()}` });
    expect(await state(ids.manufacturerId)).toMatchObject({ technical_review: true, model: true, sandbox_keys: true, sandbox_machine: true, first_contact: true, harness: false, checklist: false, production_keys: false });
  });

  it('lists no harness runs honestly when there are none', async () => {
    const ids = await onboardManufacturer(BUSINESS_ID, 'noruns', { adapterKey: 'snack_quest_gateway' });
    expect(await manufacturerOnboardingService.certificationRuns(BUSINESS_ID, ids.manufacturerId)).toEqual([]);
  });
});
