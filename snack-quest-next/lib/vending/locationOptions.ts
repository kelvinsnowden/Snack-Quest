import type { Location } from '@/types';

/** The choices a location form offers, with the words people see — shared by the API's validation and the admin screens. */
export const LOCATION_TYPE_OPTIONS: readonly { value: Location['locationType']; label: string }[] = [
  { value: 'university', label: 'University' },
  { value: 'hotel', label: 'Hotel' },
  { value: 'office', label: 'Office' },
  { value: 'hospital', label: 'Hospital' },
  { value: 'mall', label: 'Mall' },
  { value: 'airport', label: 'Airport' },
  { value: 'transport_hub', label: 'Transport hub' },
  { value: 'bnb', label: 'BnB' },
  { value: 'corporate', label: 'Corporate campus' },
  { value: 'other', label: 'Other' },
];

export const CUSTOMER_TYPE_OPTIONS: readonly { value: NonNullable<Location['customerType']>; label: string }[] = [
  { value: 'students', label: 'Students' },
  { value: 'employees', label: 'Employees' },
  { value: 'travelers', label: 'Travellers' },
  { value: 'patients_and_visitors', label: 'Patients and visitors' },
  { value: 'general_public', label: 'General public' },
  { value: 'mixed', label: 'Mixed' },
  { value: 'other', label: 'Other' },
];

export const INDOOR_OUTDOOR_OPTIONS: readonly { value: NonNullable<Location['indoorOutdoor']>; label: string }[] = [
  { value: 'indoor', label: 'Indoor' },
  { value: 'outdoor', label: 'Outdoor' },
  { value: 'mixed', label: 'Both' },
];

export const VALID_LOCATION_TYPES = LOCATION_TYPE_OPTIONS.map((option) => option.value);
export const VALID_CUSTOMER_TYPES = CUSTOMER_TYPE_OPTIONS.map((option) => option.value);
export const VALID_INDOOR_OUTDOOR = INDOOR_OUTDOOR_OPTIONS.map((option) => option.value);

export function locationTypeLabel(value: Location['locationType']): string {
  return LOCATION_TYPE_OPTIONS.find((option) => option.value === value)?.label ?? value;
}
