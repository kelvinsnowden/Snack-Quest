import { describe, expect, it } from 'vitest';
import { NullCloudTransport, MockCloudTransport, defaultCloudTransport } from '@/lib/vending/protocol/cloudTransport';

describe('CloudTransport', () => {
  it('NullCloudTransport resolves without doing anything — polling alone still delivers commands', async () => {
    const transport = new NullCloudTransport();
    await expect(transport.notifyMachine('m-1', 'cmd-1')).resolves.toBeUndefined();
  });

  it('defaultCloudTransport is the null transport — no real broker is wired yet', () => {
    expect(defaultCloudTransport.name).toBe('none');
  });

  it('MockCloudTransport records every notification for a test to assert on', async () => {
    const transport = new MockCloudTransport();
    await transport.notifyMachine('m-1', 'cmd-1');
    await transport.notifyMachine('m-2', 'cmd-2');
    expect(transport.notified).toEqual([
      { machineId: 'm-1', commandId: 'cmd-1' },
      { machineId: 'm-2', commandId: 'cmd-2' },
    ]);
  });
});
