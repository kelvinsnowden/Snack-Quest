import { Badge } from '@/components/ui/badge';

/**
 * A machine's connectivity as a status pill (§ Owner Portal dark
 * redesign, "Your Machines" list) — `stale`/`unknown` both read as
 * "needs attention" rather than inventing a fourth colour for a
 * distinction the owner doesn't need to act on differently.
 */
export function StatusPill({ connectivity }: { connectivity: 'online' | 'stale' | 'offline' | 'unknown' }) {
  if (connectivity === 'online') return <Badge variant="success">Online</Badge>;
  if (connectivity === 'offline') return <Badge variant="danger">Offline</Badge>;
  return <Badge variant="warning">Needs attention</Badge>;
}
