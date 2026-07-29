/**
 * Safe JSON parser for Fetch API responses.
 * Prevents "Unexpected token '<', '<!DOCTYPE ...' is not valid JSON" errors
 * when endpoints return HTML error pages or 404/500 responses.
 */

export async function safeResponseJson<T = any>(res: Response): Promise<T | null> {
  if (!res) return null;
  const contentType = res.headers ? res.headers.get('content-type') : null;
  if (res.ok && contentType && contentType.includes('application/json')) {
    try {
      return await res.json();
    } catch {
      return null;
    }
  }
  return null;
}

export async function safeFetchJson<T = any>(url: string, options?: RequestInit): Promise<T | null> {
  try {
    const res = await fetch(url, options);
    return await safeResponseJson<T>(res);
  } catch (e) {
    console.error(`Fetch error for ${url}:`, e);
    return null;
  }
}
