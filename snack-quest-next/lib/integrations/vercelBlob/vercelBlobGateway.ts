import 'server-only';

import { put, del, head, BlobNotFoundError } from '@vercel/blob';
import { withCircuitBreaker } from '../shared/withCircuitBreaker';
import type { StorageGateway, StorageObjectMetadata } from '../types';

const GATEWAY_NAME = 'vercelBlob';

/**
 * Real Vercel Blob client (§ Vercel Blob migration, replacing Firebase
 * Storage). `access: 'public'` always — Vercel Blob's 'private' access
 * mode needs OIDC/store-id wiring this codebase doesn't have, and
 * every use case here (product images, creator uploads, marketing
 * assets) is meant to be publicly viewable by URL anyway; nothing
 * sensitive (receipts, private documents) should be routed through
 * this Gateway without adding that wiring first.
 *
 * `addRandomSuffix: false` — the pathname itself is the identity
 * `services/storageService.ts` builds (already unique per upload via
 * a generated id), so a Blob-assigned suffix would just be a second,
 * redundant uniqueness mechanism and would break `replaceFile()`,
 * which depends on the pathname staying exactly what the caller gave it.
 *
 * No `withRetry` here, unlike the other Gateways — the `@vercel/blob`
 * SDK already retries transient failures internally (it depends on
 * `async-retry`). Stacking a second retry layer on top would only
 * multiply worst-case latency on a real outage, not add safety.
 * `withCircuitBreaker` still applies: it protects against hammering a
 * genuinely-down Vercel Blob with a burst of slow, already-retried
 * calls, which the SDK's own retry doesn't address.
 */
class VercelBlobGateway implements StorageGateway {
  private requireToken(): string {
    const token = process.env.BLOB_READ_WRITE_TOKEN;
    if (!token) {
      throw new Error(
        'Missing BLOB_READ_WRITE_TOKEN — required to talk to Vercel Blob. ' +
          'Get it from the Vercel dashboard (Storage → your Blob store → .env.local tab). ' +
          'See .env.local.example.',
      );
    }
    return token;
  }

  async uploadFile(input: {
    pathname: string;
    data: Buffer;
    contentType: string;
    allowOverwrite?: boolean;
  }): Promise<StorageObjectMetadata> {
    const token = this.requireToken();
    return withCircuitBreaker(GATEWAY_NAME, async () => {
      const result = await put(input.pathname, input.data, {
        access: 'public',
        contentType: input.contentType,
        addRandomSuffix: false,
        allowOverwrite: input.allowOverwrite ?? false,
        token,
      });
      return {
        url: result.url,
        pathname: result.pathname,
        contentType: result.contentType,
        size: input.data.byteLength,
      };
    });
  }

  async deleteFile(url: string): Promise<void> {
    const token = this.requireToken();
    await withCircuitBreaker(GATEWAY_NAME, async () => {
      try {
        await del(url, { token });
      } catch (error) {
        if (error instanceof BlobNotFoundError) {
          // Already gone — deleting a nonexistent object is a no-op, not a failure.
          return;
        }
        throw error;
      }
    });
  }

  async getMetadata(url: string): Promise<StorageObjectMetadata> {
    const token = this.requireToken();
    return withCircuitBreaker(GATEWAY_NAME, async () => {
      const result = await head(url, { token });
      return {
        url: result.url,
        pathname: result.pathname,
        contentType: result.contentType,
        size: result.size,
      };
    });
  }
}

export const vercelBlobGateway: StorageGateway = new VercelBlobGateway();
export { VercelBlobGateway };
