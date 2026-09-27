import { describe, expect, it } from 'vitest';
import { Timestamp } from 'firebase-admin/firestore';
import { deriveIntegrationHealth } from '@/lib/vending/integrationHealth';
import type { MachineIntegration } from '@/types';

const NOW = new Date('2026-09-27T12:00:00Z');

function minutesAgo(minutes: number) {
  return Timestamp.fromDate(new Date(NOW.getTime() - minutes * 60000)) as unknown as MachineIntegration['signals']['heartbeat'];
}

function integration(overrides: Partial<Pick<MachineIntegration, 'signals' | 'lastError'>> = {}): Pick<MachineIntegration, 'signals' | 'lastError'> {
  return {
    signals: { heartbeat: null, api_request: null, dispense_success: null, inventory_sync: null, webhook: null, ...overrides.signals },
    lastError: overrides.lastError ?? null,
  };
}

describe('deriveIntegrationHealth', () => {
  it('is disconnected when nothing has ever been heard', () => {
    expect(deriveIntegrationHealth(integration(), NOW).state).toBe('disconnected');
  });

  it('is connected with a fresh heartbeat and no errors', () => {
    const health = deriveIntegrationHealth(integration({ signals: { heartbeat: minutesAgo(1) } as MachineIntegration['signals'] }), NOW);
    expect(health.state).toBe('connected');
  });

  it('counts a webhook or API request as contact, not only heartbeats', () => {
    expect(deriveIntegrationHealth(integration({ signals: { webhook: minutesAgo(2) } as MachineIntegration['signals'] }), NOW).state).toBe('connected');
    expect(deriveIntegrationHealth(integration({ signals: { api_request: minutesAgo(2) } as MachineIntegration['signals'] }), NOW).state).toBe('connected');
  });

  it('is degraded when contact is stale but not yet lost', () => {
    expect(deriveIntegrationHealth(integration({ signals: { heartbeat: minutesAgo(8) } as MachineIntegration['signals'] }), NOW).state).toBe('degraded');
  });

  it('is disconnected once contact is older than the disconnect threshold', () => {
    expect(deriveIntegrationHealth(integration({ signals: { heartbeat: minutesAgo(30) } as MachineIntegration['signals'] }), NOW).state).toBe('disconnected');
  });

  it('is error when the latest thing that happened is a failure', () => {
    const health = deriveIntegrationHealth(
      integration({
        signals: { heartbeat: minutesAgo(10) } as MachineIntegration['signals'],
        lastError: { kind: 'authentication', message: 'bad signature', at: minutesAgo(2) } as MachineIntegration['lastError'],
      }),
      NOW,
    );
    expect(health.state).toBe('error');
    expect(health.reason).toContain('Credentials rejected');
  });

  it('is degraded, not error, when contact has resumed since a recent failure', () => {
    const health = deriveIntegrationHealth(
      integration({
        signals: { heartbeat: minutesAgo(1) } as MachineIntegration['signals'],
        lastError: { kind: 'timeout', message: 'slow', at: minutesAgo(20) } as MachineIntegration['lastError'],
      }),
      NOW,
    );
    expect(health.state).toBe('degraded');
  });

  it('is connected once an old error has aged out', () => {
    const health = deriveIntegrationHealth(
      integration({
        signals: { heartbeat: minutesAgo(1) } as MachineIntegration['signals'],
        lastError: { kind: 'timeout', message: 'slow', at: minutesAgo(180) } as MachineIntegration['lastError'],
      }),
      NOW,
    );
    expect(health.state).toBe('connected');
  });
});
