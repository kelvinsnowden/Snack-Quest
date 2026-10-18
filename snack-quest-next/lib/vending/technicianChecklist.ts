import type { MaintenanceRequestCategory } from '@/types/maintenance';

/** Always checked on a visit, whatever it is for. */
const EVERY_VISIT = ['Photo of the machine before', 'Photo of the machine after'];

const FOR_CATEGORY: Record<MaintenanceRequestCategory, string[]> = {
  not_dispensing: ['Clear any jam in the reported slot', 'Test vend the slot from the admin', 'Check the delivery port sensor'],
  payment: ['Check the screen shows the payment step', 'Make a test payment', 'Check the network signal'],
  screen: ['Restart the screen', 'Check it shows the machine’s products', 'Clean the glass'],
  cooling: ['Read the cabinet temperature', 'Check the door seal closes fully', 'Clear the vents and condenser of dust', 'Move any warm stock out'],
  power: ['Check the plug and socket', 'Check the machine restarts and reconnects'],
  damage: ['Photograph the damage', 'Make the machine safe'],
  cleaning: ['Clean the glass and front', 'Clean the delivery port', 'Wipe the inside shelves'],
  other: ['Fix what was reported'],
};

/** Loading itself is counted slot by slot on the job, so the checklist is everything around it. */
const RESTOCK = ['Move older stock to the front (check expiry dates)', 'Clean the delivery port', 'Read the cabinet temperature', 'Photo of the loaded machine'];

/** The on-site checklist a job starts with. */
export function defaultChecklist(kind: 'maintenance' | 'restock', category?: MaintenanceRequestCategory | null): string[] {
  if (kind === 'restock') return RESTOCK;
  return [...FOR_CATEGORY[category ?? 'other'], ...EVERY_VISIT];
}
