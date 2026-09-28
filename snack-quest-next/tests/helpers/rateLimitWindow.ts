/**
 * Rate limits use fixed one-minute windows. A test that makes N requests
 * and expects the (N+1)th to be refused must not straddle a window
 * boundary, or the counter resets mid-test. Waits until at least
 * `neededSeconds` remain in the current window.
 */
export async function withinOneWindow(neededSeconds = 20, windowSeconds = 60): Promise<void> {
  const intoWindow = (Date.now() / 1000) % windowSeconds;
  if (windowSeconds - intoWindow < neededSeconds) {
    await new Promise((resolve) => setTimeout(resolve, (windowSeconds - intoWindow + 0.5) * 1000));
  }
}
