import { describe, expect, it } from 'vitest';
import { alertFixLink } from '@/lib/vending/alertFixLink';
import { ALERT_SEVERITY_BY_TYPE, type AlertType } from '@/types';

describe('alertFixLink', () => {
  it('sends each alert to the screen that fixes it', () => {
    expect(alertFixLink('stockout', 'm-1', 'stockout:m-1:A01')).toEqual({ href: '/admin/vending/restock', label: 'Plan a restock' });
    expect(alertFixLink('inventory_discrepancy', 'm-1', 'inventory_discrepancy:movement:x')?.href).toBe('/admin/vending/m-1/slots');
    expect(alertFixLink('machine_offline', 'm-1', 'machine_offline:m-1')?.href).toBe('/admin/vending/m-1');
    expect(alertFixLink('subscription_issue', 'm-1', 'subscription_issue:m-1')?.href).toBe('/admin/vending/m-1/setup');
    expect(alertFixLink('payment_reconciliation_issue', 'm-1', 'payment_reconciliation_issue:txn:t-9')?.href).toBe('/admin/vending/sales/t-9');
    expect(alertFixLink('payment_reconciliation_issue', null, 'payment_reconciliation_issue:event:e-1')?.href).toBe('/admin/vending/reconciliation');
    expect(alertFixLink('manufacturer_outage', null, 'manufacturer_outage:mf-1')?.href).toBe('/admin/vending/integrations/mf-1');
    expect(alertFixLink('credential_revoked', null, 'credential_revoked:mf-1__production')?.href).toBe('/admin/vending/integrations/mf-1');
    expect(alertFixLink('job_failure', null, 'job_failure:retry-notifications')?.href).toBe('/admin/operations');
    expect(alertFixLink('inventory_discrepancy', 'm-1', 'ledger:duplicate_stock_movement:t-4')?.href).toBe('/admin/vending/sales/t-4');
    expect(alertFixLink('payment_reconciliation_issue', 'm-1', 'ledger:refund_owed_too_long:t-5')?.href).toBe('/admin/vending/sales/t-5');
  });

  it('never builds a link from a key of the wrong shape, and escapes ids', () => {
    expect(alertFixLink('webhook_failures', null, 'something-else')?.href).toBe('/admin/vending/integrations');
    expect(alertFixLink('machine_fault', null, 'machine_fault:event:1')).toBeNull();
    expect(alertFixLink('payment_reconciliation_issue', null, 'payment_reconciliation_issue:txn:a/../b')?.href).toBe('/admin/vending/sales/a%2F..%2Fb');
  });

  it('handles every alert type', () => {
    for (const type of Object.keys(ALERT_SEVERITY_BY_TYPE) as AlertType[]) {
      expect(() => alertFixLink(type, 'm-1', `${type}:x`)).not.toThrow();
    }
  });
});
