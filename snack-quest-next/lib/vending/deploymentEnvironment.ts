/**
 * Whether this deployment serves real customers. Sandbox integrations
 * and sandbox-only adapters (the mock machine, the simulator) are
 * refused here — the single switch behind "the simulator should be
 * usable in development/staging only". Vercel sets `VERCEL_ENV` to
 * `production` only on the production deployment; previews and local
 * development are never production.
 */
export function isProductionDeployment(): boolean {
  return process.env.VERCEL_ENV === 'production';
}
