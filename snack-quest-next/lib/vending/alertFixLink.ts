import type { AlertType } from '@/types';

export interface AlertFixLink {
  href: string;
  label: string;
}

/** The part of a dedupe key after `prefix`, or null when the key isn't that shape. */
function after(key: string, prefix: string): string | null {
  return key.startsWith(prefix) && key.length > prefix.length ? key.slice(prefix.length) : null;
}

const enc = encodeURIComponent;

/**
 * Where to go to fix an alert: the screen that holds the lever for its
 * type — restock planning for an empty slot, the sale for a payment
 * mismatch, the manufacturer for an integration failure. Built only from
 * the alert's own type, machine and dedupe key (their formats are set in
 * `alertService`); null when there's nowhere more specific than the
 * alert itself.
 */
export function alertFixLink(type: AlertType, machineId: string | null, dedupeKey: string): AlertFixLink | null {
  const machine = machineId ? `/admin/vending/${enc(machineId)}` : null;
  // Findings of the nightly ledger check (`deepReconciliationService`): `ledger:<kind>:<transactionId>`.
  const ledger = dedupeKey.startsWith('ledger:') ? dedupeKey.split(':') : null;
  if (ledger && ledger.length === 3 && ledger[2]) return { href: `/admin/vending/sales/${enc(ledger[2])}`, label: 'Open the sale' };
  switch (type) {
    case 'stockout':
    case 'stockout_risk':
      return { href: '/admin/vending/restock', label: 'Plan a restock' };
    case 'expiry_risk':
    case 'inventory_discrepancy':
      return machine ? { href: `${machine}/slots`, label: 'Check the slots' } : null;
    case 'machine_offline':
    case 'heartbeat_missing':
    case 'machine_fault':
    case 'dispense_failures':
    case 'integration_issue':
      return machine ? { href: machine, label: 'Open the machine' } : null;
    case 'payment_reconciliation_issue': {
      const transactionId = after(dedupeKey, 'payment_reconciliation_issue:txn:');
      return transactionId ? { href: `/admin/vending/sales/${enc(transactionId)}`, label: 'Open the sale' } : { href: '/admin/vending/reconciliation', label: 'Open reconciliation' };
    }
    case 'dispense_conflict':
      return { href: '/admin/vending/sales/review', label: 'Review the sale' };
    case 'subscription_issue':
      return machine ? { href: `${machine}/setup`, label: 'Open the subscription' } : null;
    case 'settlement_failure':
      return { href: '/admin/vending/settlements', label: 'Open settlements' };
    case 'dispense_timeout_rate':
    case 'manufacturer_api_unavailable':
    case 'integration_auth_failures':
    case 'webhook_failures':
    case 'manufacturer_outage': {
      const manufacturerId = after(dedupeKey, `${type}:`);
      return manufacturerId ? { href: `/admin/vending/integrations/${enc(manufacturerId)}`, label: 'Open the manufacturer' } : { href: '/admin/vending/integrations', label: 'Open manufacturers' };
    }
    case 'credential_revoked': {
      const manufacturerId = after(dedupeKey, 'credential_revoked:')?.split('__')[0];
      return manufacturerId ? { href: `/admin/vending/integrations/${enc(manufacturerId)}`, label: 'Set a new key' } : { href: '/admin/vending/integrations', label: 'Open manufacturers' };
    }
    case 'credential_expiring':
      return { href: '/admin/vending/integrations', label: 'Open manufacturers' };
    case 'job_failure':
      return { href: '/admin/operations', label: 'Open scheduled jobs' };
    default: {
      const unhandled: never = type;
      return unhandled;
    }
  }
}
