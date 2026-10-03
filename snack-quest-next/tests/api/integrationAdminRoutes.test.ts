import { beforeEach, describe, expect, it, vi } from 'vitest';

const { verifyStaffSessionFromRequestMock } = vi.hoisted(() => ({ verifyStaffSessionFromRequestMock: vi.fn() }));
vi.mock('@/lib/auth/session', () => ({ verifyStaffSessionFromRequest: verifyStaffSessionFromRequestMock }));

import { POST as issueCredential } from '@/app/api/vending/integrations/manufacturers/[id]/credentials/route';
import { POST as activate } from '@/app/api/vending/machines/[id]/integration/activate/route';
import { PUT as configure } from '@/app/api/vending/machines/[id]/integration/route';
import { POST as createManufacturer } from '@/app/api/vending/integrations/manufacturers/route';
import { clearIntegrationCollections, createManufacturerWithModel, provisionMachine } from '../helpers/integrationFixtures';

const BUSINESS_ID = 'biz-integration-admin-routes';
const ADMIN = { uid: 'admin-1', email: 'a@example.com', displayName: 'A', roles: ['admin'], businessId: BUSINESS_ID };
const WAREHOUSE = { ...ADMIN, uid: 'wh-1', roles: ['warehouse'] };

function json(url: string, method: string, body: unknown): Request {
  return new Request(`http://localhost${url}`, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
}

beforeEach(async () => {
  vi.clearAllMocks();
  await clearIntegrationCollections(BUSINESS_ID);
});

describe('integration admin routes', () => {
  it('401 without a staff session', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(null);
    const response = await createManufacturer(json('/api/vending/integrations/manufacturers', 'POST', {}));
    expect(response.status).toBe(401);
  });

  it('only an admin can issue a credential', async () => {
    const { manufacturerId } = await createManufacturerWithModel(BUSINESS_ID);
    verifyStaffSessionFromRequestMock.mockResolvedValue(WAREHOUSE);
    const response = await issueCredential(json(`/api/vending/integrations/manufacturers/${manufacturerId}/credentials`, 'POST', { kind: 'api', environment: 'sandbox' }), { params: Promise.resolve({ id: manufacturerId }) });
    expect(response.status).toBe(403);
  });

  it('maps a validation problem to 400', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(ADMIN);
    const response = await createManufacturer(json('/api/vending/integrations/manufacturers', 'POST', { name: 'X', slug: 'Bad Slug', integrationType: 'manufacturer_api', defaultAdapterKey: 'mock' }));
    expect(response.status).toBe(400);
  });

  it('activation of an untested integration is a 409, not a silent go-live', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(ADMIN);
    const ids = await createManufacturerWithModel(BUSINESS_ID);
    const { machineId } = await provisionMachine(BUSINESS_ID);
    const configured = await configure(json(`/api/vending/machines/${machineId}/integration`, 'PUT', { ...ids, manufacturerMachineId: 'M-1', environment: 'sandbox' }), { params: Promise.resolve({ id: machineId }) });
    expect(configured.status).toBe(200);
    expect((await configured.json()).integration.state).toBe('configured');
    const response = await activate(json(`/api/vending/machines/${machineId}/integration/activate`, 'POST', {}), { params: Promise.resolve({ id: machineId }) });
    expect(response.status).toBe(409);
  });
});
