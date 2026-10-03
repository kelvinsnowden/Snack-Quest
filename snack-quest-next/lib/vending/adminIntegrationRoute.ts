import 'server-only';

import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { UnsupportedManufacturerError } from '@/lib/vending/adapterRegistry';
import { ManufacturerNotFoundError } from '@/repositories/manufacturerRepository';
import { MachineModelNotFoundError } from '@/repositories/machineModelRepository';
import { MachineIntegrationNotFoundError, ManufacturerMachineIdInUseError } from '@/repositories/machineIntegrationRepository';
import { MachineNotFoundError } from '@/repositories/machineRepository';
import {
  CertificationIncompleteError,
  IllegalOnboardingTransitionError,
  RegistryValidationError,
} from '@/services/manufacturerRegistryService';
import {
  IllegalIntegrationStateTransitionError,
  IntegrationActivationError,
  IntegrationConfigurationError,
} from '@/services/machineIntegrationService';
import { CredentialIssuanceError, CredentialRotationConflictError, IntegrationCredentialNotFoundError } from '@/services/integrationCredentialService';
import { SlotMappingError } from '@/services/machineSlotService';
import { ManufacturerApiCredentialError } from '@/services/manufacturerApiCredentialService';
import { ManufacturerApiCredentialNotFoundError } from '@/repositories/manufacturerApiCredentialRepository';
import { UnsafeManufacturerUrlError } from '@/lib/vending/outboundUrl';
import type { StaffSession } from '@/services/staffAuthService';
import { hasPermission, forbiddenForPermission, type PermissionKey } from '@/lib/auth/permissions';

/**
 * Shared shape of the staff-facing integration console routes
 * (`/api/vending/integrations/**`, `/api/vending/machines/[id]/integration*`):
 * staff session → permission check → JSON body → service call, with every
 * domain error mapped to one status in one place so the routes stay a
 * few lines each and can never disagree about what a 409 means.
 */
export async function withPermission(
  request: Request,
  permission: PermissionKey,
  handler: (session: StaffSession) => Promise<Response>,
): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!hasPermission(session, permission)) {
    return forbiddenForPermission(permission);
  }
  try {
    return await handler(session);
  } catch (error) {
    const mapped = mapIntegrationError(error);
    if (mapped) {
      return mapped;
    }
    throw error;
  }
}

export async function readJsonObject(request: Request): Promise<Record<string, unknown> | Response> {
  try {
    const body = await request.json();
    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
      return Response.json({ error: 'body must be a JSON object' }, { status: 400 });
    }
    return body as Record<string, unknown>;
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }
}

export function optionalString(body: Record<string, unknown>, key: string): string | null | undefined {
  const value = body[key];
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  if (typeof value !== 'string') {
    throw new RegistryValidationError(`${key} must be a string`);
  }
  return value;
}

export function requiredString(body: Record<string, unknown>, key: string): string {
  const value = body[key];
  if (typeof value !== 'string' || !value.trim()) {
    throw new RegistryValidationError(`${key} is required`);
  }
  return value;
}

function mapIntegrationError(error: unknown): Response | null {
  const respond = (status: number) => Response.json({ error: (error as Error).message }, { status });
  if (
    error instanceof RegistryValidationError ||
    error instanceof IntegrationConfigurationError ||
    error instanceof SlotMappingError ||
    error instanceof CredentialIssuanceError ||
    error instanceof UnsupportedManufacturerError ||
    error instanceof ManufacturerApiCredentialError ||
    error instanceof UnsafeManufacturerUrlError
  ) {
    return respond(400);
  }
  if (
    error instanceof ManufacturerNotFoundError ||
    error instanceof MachineModelNotFoundError ||
    error instanceof MachineIntegrationNotFoundError ||
    error instanceof MachineNotFoundError ||
    error instanceof IntegrationCredentialNotFoundError ||
    error instanceof ManufacturerApiCredentialNotFoundError
  ) {
    return respond(404);
  }
  if (error instanceof CertificationIncompleteError) {
    return Response.json({ error: error.message, outstanding: error.outstanding }, { status: 409 });
  }
  if (error instanceof IntegrationActivationError) {
    return Response.json({ error: error.message, blockers: error.reasons }, { status: 409 });
  }
  if (
    error instanceof IllegalOnboardingTransitionError ||
    error instanceof IllegalIntegrationStateTransitionError ||
    error instanceof ManufacturerMachineIdInUseError ||
    error instanceof CredentialRotationConflictError
  ) {
    return respond(409);
  }
  return null;
}
