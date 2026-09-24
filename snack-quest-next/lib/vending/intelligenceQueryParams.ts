/** Shared `?windowDays=` parsing for the intelligence routes — one bounds check, not six copies of it. */
export function parseWindowDays(request: Request, fallback = 30): number | Response {
  const url = new URL(request.url);
  const raw = url.searchParams.get('windowDays');
  if (!raw) {
    return fallback;
  }
  const windowDays = Number(raw);
  if (!Number.isInteger(windowDays) || windowDays < 1 || windowDays > 365) {
    return Response.json({ error: 'windowDays must be an integer between 1 and 365' }, { status: 400 });
  }
  return windowDays;
}
