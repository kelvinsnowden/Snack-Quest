import { describe, expect, it } from 'vitest';
import { POST as heartbeatRoute } from '@/app/api/v1/machines/[machineCode]/heartbeat/route';

/**
 * The 256 KB body cap must hold even when the sender omits
 * Content-Length (a chunked body): the body is read incrementally and
 * refused as soon as it passes the limit, never buffered whole first.
 */
describe('request body limit', () => {
  it('a chunked body with no Content-Length is refused with 413 once it passes 256 KB, before it is fully read', async () => {
    const chunk = new Uint8Array(64 * 1024).fill(0x61);
    let chunksPulled = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        chunksPulled += 1;
        if (chunksPulled > 1000) controller.close(); // ~64 MB if read to the end
        else controller.enqueue(chunk);
      },
    });
    const request = new Request('http://localhost/api/v1/machines/SQ-MCH-000001/heartbeat', { method: 'POST', body: stream, duplex: 'half' } as RequestInit & { duplex: 'half' });
    expect(request.headers.get('content-length')).toBeNull();
    const response = await heartbeatRoute(request, { params: Promise.resolve({ machineCode: 'SQ-MCH-000001' }) });
    expect(response.status).toBe(413);
    expect((await response.json()).error.code).toBe('payload_too_large');
    expect(chunksPulled).toBeLessThan(10); // stopped at the limit, not after 64 MB
  });
});
