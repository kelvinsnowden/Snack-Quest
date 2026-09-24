import 'server-only';

import { locationRepository, LocationNotFoundError, type LocationInput } from '@/repositories/locationRepository';
import { machineRepository } from '@/repositories/machineRepository';
import type { Location, Machine } from '@/types';

export { LocationNotFoundError };

export interface CreateLocationInput {
  businessId: string;
  name: string;
  locationType: Location['locationType'];
  city: string;
  area?: string | null;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  estimatedFootTraffic?: number | null;
  operatingHours?: string | null;
  customerType?: Location['customerType'];
  indoorOutdoor?: Location['indoorOutdoor'];
  nearbyBusinesses?: string[];
  competingFoodBeverageOutlets?: string[];
  launchDate?: Date | null;
  notes?: string | null;
  actor: string;
}

/**
 * The location profile domain (§ LOCATION PROFILE). `machineCount` is
 * deliberately never a stored field on `Location` — it is always
 * `machineRepository.listByLocation(...).length` computed at read
 * time, so it can never drift from the actual machine records the way
 * a denormalized counter could after a relocation
 * (`machineService.relocate`) moves a machine in or out.
 */
class LocationService {
  async create(input: CreateLocationInput): Promise<string> {
    const record: LocationInput = {
      businessId: input.businessId,
      name: input.name,
      locationType: input.locationType,
      city: input.city,
      area: input.area ?? null,
      address: input.address ?? null,
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
      estimatedFootTraffic: input.estimatedFootTraffic ?? null,
      operatingHours: input.operatingHours ?? null,
      customerType: input.customerType ?? null,
      indoorOutdoor: input.indoorOutdoor ?? null,
      nearbyBusinesses: input.nearbyBusinesses ?? [],
      competingFoodBeverageOutlets: input.competingFoodBeverageOutlets ?? [],
      launchDate: (input.launchDate as unknown as Location['launchDate']) ?? null,
      notes: input.notes ?? null,
      createdBy: input.actor,
    };
    return locationRepository.create(record);
  }

  async findById(businessId: string, locationId: string): Promise<Location | null> {
    return locationRepository.findById(businessId, locationId);
  }

  async listByBusiness(businessId: string): Promise<{ id: string; data: Location }[]> {
    return locationRepository.listByBusiness(businessId);
  }

  async listByType(businessId: string, locationType: Location['locationType']): Promise<{ id: string; data: Location }[]> {
    return locationRepository.listByType(businessId, locationType);
  }

  /** Every machine currently at this location, and how many — never assumed to be exactly one. */
  async machinesAtLocation(businessId: string, locationId: string): Promise<{ id: string; data: Machine }[]> {
    return machineRepository.listByLocation(businessId, locationId);
  }

  async update(
    businessId: string,
    locationId: string,
    fields: Partial<Omit<Location, 'businessId' | 'createdAt' | 'createdBy' | 'deletedAt'>>,
    actor: string,
  ): Promise<void> {
    await locationRepository.update(businessId, locationId, fields, actor);
  }
}

export const locationService = new LocationService();
export { LocationService };
