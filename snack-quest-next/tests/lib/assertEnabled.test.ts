import { describe, expect, it } from 'vitest';
import { assertIntegrationEnabled, IntegrationDisabledError } from '@/lib/integrations/shared/assertEnabled';

describe('assertIntegrationEnabled', () => {
  it('does not throw when enabled is absent (pre-existing integrations)', () => {
    expect(() => assertIntegrationEnabled('biz-1', 'daraja', {})).not.toThrow();
  });

  it('does not throw when enabled is explicitly true', () => {
    expect(() => assertIntegrationEnabled('biz-1', 'daraja', { enabled: true })).not.toThrow();
  });

  it('throws IntegrationDisabledError when enabled is false', () => {
    expect(() => assertIntegrationEnabled('biz-1', 'whatchimp', { enabled: false })).toThrow(IntegrationDisabledError);
  });
});
