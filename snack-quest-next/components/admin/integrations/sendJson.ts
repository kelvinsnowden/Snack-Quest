/** POST/PUT a JSON body to an admin integration route; resolves with the parsed body or throws the server's own error message. */
export async function sendJson<T = unknown>(url: string, method: 'POST' | 'PUT' | 'PATCH', body: unknown = {}): Promise<T> {
  const response = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = (await response.json().catch(() => null)) as (T & { error?: string; blockers?: string[]; outstanding?: string[] }) | null;
  if (!response.ok) {
    const detail = data?.blockers?.length ? ` — ${data.blockers.join('; ')}` : data?.outstanding?.length ? ` — outstanding: ${data.outstanding.join(', ')}` : '';
    throw new Error(`${data?.error ?? `Request failed (HTTP ${response.status})`}${detail}`);
  }
  return data as T;
}
