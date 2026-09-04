import type { StaffRole } from '@/types/staffProfile';

/**
 * The staff workspaces a signed-in person can move between
 * (§ workspace switcher).
 *
 * There are four of them and no way to get from one to another. An
 * admin has always been allowed into Warehouse — the layout admits
 * `warehouse`, `admin` and `super_admin` — but nothing on any screen
 * said so or linked there, so the only way in was to know the URL and
 * type it. That is a permission nobody could use.
 *
 * The rule below is not new policy. It is the gate each workspace
 * layout already applies, written down once so the menu can only ever
 * offer a door that actually opens. Anything else produces the worst
 * outcome available: a visible link that bounces you to a login or a
 * redirect.
 *
 * Admin is in the list on the same terms as the rest even though its
 * layout takes any staff session, because that layout immediately
 * redirects an agent-, warehouse- or finance-only account back to its
 * own workspace. Offering it to them would be offering a round trip.
 */
export interface StaffWorkspace {
  href: string;
  label: string;
  /** What someone does there, for the menu's second line. */
  description: string;
  /** The role that grants it, besides admin/super_admin. */
  role: StaffRole;
}

const WORKSPACES: StaffWorkspace[] = [
  { href: '/admin', label: 'Admin', description: 'Orders, catalogue, creators, money', role: 'admin' },
  { href: '/warehouse', label: 'Warehouse', description: 'Packing lists, recipes, shopping runs', role: 'warehouse' },
  { href: '/finance', label: 'Finance', description: 'Revenue, margin, reconciliation', role: 'finance' },
  { href: '/agent', label: 'Support', description: 'Live conversations and orders', role: 'agent' },
];

function isAdmin(roles: readonly string[]): boolean {
  return roles.some((role) => role === 'admin' || role === 'super_admin');
}

/** Every workspace these roles can actually open, in a stable order. */
export function workspacesFor(roles: readonly string[]): StaffWorkspace[] {
  return WORKSPACES.filter((workspace) => roles.includes(workspace.role) || isAdmin(roles));
}

/**
 * Which workspace a path is inside.
 *
 * Longest match wins so a nested route resolves to its workspace
 * rather than to whichever entry happens to be first, and the
 * comparison is on a path boundary — a bare prefix test would put
 * `/administration` inside `/admin`.
 */
export function activeWorkspace(pathname: string): StaffWorkspace | null {
  return (
    WORKSPACES.filter(
      (workspace) => pathname === workspace.href || pathname.startsWith(`${workspace.href}/`),
    ).sort((a, b) => b.href.length - a.href.length)[0] ?? null
  );
}
