import 'server-only';

import { unstable_cache } from 'next/cache';

/**
 * A figure kept for `seconds` and shared across requests and servers (Next's
 * data cache), for numbers that are expensive to work out and fine a minute
 * or two old — label them "as of" where people read them. Outside a Next
 * server (jobs, scripts, tests) there is no such cache, so it just reads.
 * The result must survive JSON (numbers, strings, plain objects).
 */
export function sharedFor<A extends string[], R>(keyParts: string[], seconds: number, read: (...args: A) => Promise<R>): (...args: A) => Promise<R> {
  const cached = unstable_cache(read, keyParts, { revalidate: seconds });
  return async (...args: A) => {
    try {
      return await cached(...args);
    } catch (error) {
      if (error instanceof Error && error.message.includes('incrementalCache missing')) return read(...args);
      throw error;
    }
  };
}
