import type { AdminSection } from './adminSections';

/**
 * What a staff member may do, one action at a time.
 *
 * Every staff API route checks exactly one of these (`hasPermission`),
 * never a role. A person's permissions come from a **role template**
 * (a named bundle such as "Warehouse manager"), plus anything granted
 * to them individually, minus anything taken away from them individually.
 * A super admin holds every permission and cannot be narrowed below that.
 *
 * Roles still exist, but they only decide which workspace a person lands
 * in (`/admin`, `/warehouse`, `/finance`, `/agent`). They no longer
 * decide what a person may do.
 *
 * Plain data and pure functions, with no `server-only`: the Users page and
 * the admin navigation (client components) read the same catalogue the
 * routes enforce.
 */

export interface PermissionMeta {
  key: string;
  label: string;
  /** The heading it appears under on the Users page. */
  group: PermissionGroup;
}

export type PermissionGroup =
  | 'Orders & delivery'
  | 'Catalogue & stock'
  | 'Money'
  | 'Customers & marketing'
  | 'Conversations'
  | 'Machines'
  | 'Machine stock & catalogue'
  | 'Machine sales & owners'
  | 'Manufacturers & integrations'
  | 'System'
  | 'Staff';

export const PERMISSION_GROUPS: PermissionGroup[] = [
  'Orders & delivery',
  'Catalogue & stock',
  'Money',
  'Customers & marketing',
  'Conversations',
  'Machines',
  'Machine stock & catalogue',
  'Machine sales & owners',
  'Manufacturers & integrations',
  'System',
  'Staff',
];

export const PERMISSIONS = [
  // Orders & delivery
  { key: 'orders.view', label: 'See orders', group: 'Orders & delivery' },
  { key: 'orders.create', label: 'Create orders for customers', group: 'Orders & delivery' },
  { key: 'orders.status.update', label: 'Move orders through fulfilment', group: 'Orders & delivery' },
  { key: 'orders.collect_payment', label: 'Record payment collected on delivery', group: 'Orders & delivery' },
  { key: 'orders.notify', label: 'Resend order confirmations', group: 'Orders & delivery' },
  { key: 'orders.contents.edit', label: 'Change what is in an order’s box', group: 'Orders & delivery' },
  { key: 'orders.costs.record', label: 'Record an order’s fulfilment costs', group: 'Orders & delivery' },
  { key: 'orders.costs.bulk', label: 'Import fulfilment costs in bulk', group: 'Orders & delivery' },
  { key: 'orders.refund', label: 'Refund box orders', group: 'Orders & delivery' },
  { key: 'logistics.view', label: 'See delivery zones', group: 'Orders & delivery' },
  { key: 'logistics.manage', label: 'Manage delivery zones, batches and shipments', group: 'Orders & delivery' },
  { key: 'logistics.courier.book', label: 'Book couriers', group: 'Orders & delivery' },
  { key: 'warehouse_fulfilment.manage', label: 'Pack orders and run shopping trips', group: 'Orders & delivery' },

  // Catalogue & stock
  { key: 'products.view', label: 'See products and snacks', group: 'Catalogue & stock' },
  { key: 'products.manage', label: 'Create and edit boxes', group: 'Catalogue & stock' },
  { key: 'products.recipes.manage', label: 'Edit box recipes', group: 'Catalogue & stock' },
  { key: 'products.snacks.manage', label: 'Create and edit snacks', group: 'Catalogue & stock' },
  { key: 'warehouse_inventory.adjust', label: 'Adjust and write off warehouse stock', group: 'Catalogue & stock' },
  { key: 'procurement.manage', label: 'Manage suppliers and purchase orders', group: 'Catalogue & stock' },

  // Money
  { key: 'finance.view', label: 'See revenue, withdrawals and reconciliation', group: 'Money' },
  { key: 'finance.withdrawals.approve', label: 'Approve and pay creator withdrawals', group: 'Money' },
  { key: 'finance.reconciliation.resolve', label: 'Resolve payment reconciliation issues', group: 'Money' },
  { key: 'payments.record_manual', label: 'Record an order as already paid', group: 'Money' },
  { key: 'payments.reconcile', label: 'Complete or reconcile stuck payments', group: 'Money' },

  // Customers & marketing
  { key: 'customers.view', label: 'See customers and wallets', group: 'Customers & marketing' },
  { key: 'customers.wallet.adjust', label: 'Adjust customer wallets', group: 'Customers & marketing' },
  { key: 'creators.manage', label: 'Approve, pause and remove creators', group: 'Customers & marketing' },
  { key: 'marketing.campaigns.manage', label: 'Manage campaigns and referral links', group: 'Customers & marketing' },
  { key: 'marketing.discounts.manage', label: 'Manage discount codes', group: 'Customers & marketing' },
  { key: 'marketing.messages.manage', label: 'Write marketing emails and SMS', group: 'Customers & marketing' },
  { key: 'marketing.messages.send', label: 'Send marketing emails and SMS', group: 'Customers & marketing' },
  { key: 'marketing.optouts.manage', label: 'See and add SMS opt-outs', group: 'Customers & marketing' },
  { key: 'marketing.optouts.remove', label: 'Remove an SMS opt-out', group: 'Customers & marketing' },
  { key: 'content.manage', label: 'Manage FAQs and reviews', group: 'Customers & marketing' },
  { key: 'analytics.spend.manage', label: 'Record marketing spend', group: 'Customers & marketing' },

  // Conversations
  { key: 'support.conversations.handle', label: 'Handle customer conversations', group: 'Conversations' },

  // Machines
  { key: 'machines.view', label: 'See machines, slots and machine health', group: 'Machines' },
  { key: 'machines.create', label: 'Register new machines', group: 'Machines' },
  { key: 'machines.credentials.manage', label: 'Rotate or revoke a machine’s screen key', group: 'Machines' },
  { key: 'machines.status.manage', label: 'Change a machine’s status', group: 'Machines' },
  { key: 'machines.relocate', label: 'Move a machine to another location', group: 'Machines' },
  { key: 'machines.commands.issue', label: 'Send commands to a machine (restart, sync)', group: 'Machines' },
  { key: 'machines.test_vend', label: 'Run a test vend', group: 'Machines' },
  { key: 'machines.slots.toggle', label: 'Switch slots on or off', group: 'Machines' },
  { key: 'machines.slots.configure', label: 'Set up slots and slot mapping', group: 'Machines' },
  { key: 'locations.view', label: 'See locations', group: 'Machines' },
  { key: 'locations.manage', label: 'Create and edit locations', group: 'Machines' },
  { key: 'alerts.view', label: 'See machine alerts', group: 'Machines' },
  { key: 'alerts.resolve', label: 'Acknowledge and resolve alerts', group: 'Machines' },
  { key: 'cameras.view', label: 'See cameras and snapshots', group: 'Machines' },
  { key: 'cameras.operate', label: 'Take snapshots and test cameras', group: 'Machines' },
  { key: 'cameras.manage', label: 'Add, configure and disable cameras', group: 'Machines' },

  // Machine stock & catalogue
  { key: 'machine_catalog.manage', label: 'Choose what each machine sells', group: 'Machine stock & catalogue' },
  { key: 'machine_screen.manage', label: 'Edit the customer screen (artwork, product text)', group: 'Machine stock & catalogue' },
  { key: 'pricing.manage', label: 'Change machine prices', group: 'Machine stock & catalogue' },
  { key: 'machine_inventory.adjust', label: 'Correct machine stock counts', group: 'Machine stock & catalogue' },
  { key: 'machine_inventory.export', label: 'Download machine stock movements', group: 'Machine stock & catalogue' },
  { key: 'restock.view', label: 'See restock tasks', group: 'Machine stock & catalogue' },
  { key: 'restock.plan', label: 'Create, approve and cancel restock tasks', group: 'Machine stock & catalogue' },
  { key: 'restock.execute', label: 'Pick, dispatch and receive restocks', group: 'Machine stock & catalogue' },
  { key: 'analytics.vending.view', label: 'See machine sales intelligence', group: 'Machine stock & catalogue' },
  { key: 'recommendations.act', label: 'Generate and act on recommendations', group: 'Machine stock & catalogue' },

  // Machine sales & owners
  { key: 'sales.view', label: 'See machine sales', group: 'Machine sales & owners' },
  { key: 'sales.export', label: 'Download machine sales', group: 'Machine sales & owners' },
  { key: 'sales.review.resolve', label: 'Decide sales under review', group: 'Machine sales & owners' },
  { key: 'sales.refund', label: 'Send refunds to machine customers', group: 'Machine sales & owners' },
  { key: 'owners.view', label: 'See machine owners', group: 'Machine sales & owners' },
  { key: 'owners.manage', label: 'Add and edit machine owners and agreements', group: 'Machine sales & owners' },
  { key: 'owners.export', label: 'Download the machine owner list', group: 'Machine sales & owners' },
  { key: 'owner_finance.view', label: 'See owner wallets, settlements and subscriptions', group: 'Machine sales & owners' },
  { key: 'owner_finance.subscriptions.manage', label: 'Manage owner subscriptions', group: 'Machine sales & owners' },
  { key: 'owner_finance.settlements.manage', label: 'Prepare owner settlements', group: 'Machine sales & owners' },
  { key: 'owner_finance.settlements.finalize', label: 'Finalize settlements (credits the owner)', group: 'Machine sales & owners' },
  { key: 'owner_finance.payouts.request', label: 'Request payouts for owners', group: 'Machine sales & owners' },

  // Manufacturers & integrations
  { key: 'integrations.view', label: 'See manufacturers and machine integrations', group: 'Manufacturers & integrations' },
  { key: 'integrations.manufacturers.manage', label: 'Add and edit manufacturers', group: 'Manufacturers & integrations' },
  { key: 'integrations.models.manage', label: 'Add and edit machine models', group: 'Manufacturers & integrations' },
  { key: 'integrations.certify', label: 'Certify models and run certification', group: 'Manufacturers & integrations' },
  { key: 'integrations.credentials.manage', label: 'Issue, rotate and revoke manufacturer keys', group: 'Manufacturers & integrations' },
  { key: 'integrations.machines.configure', label: 'Connect a machine to its manufacturer', group: 'Manufacturers & integrations' },
  { key: 'integrations.machines.activate', label: 'Activate, suspend and test machine integrations', group: 'Manufacturers & integrations' },
  { key: 'integrations.machines.maintenance', label: 'Put a machine into maintenance', group: 'Manufacturers & integrations' },

  // System
  { key: 'search.use', label: 'Search across the admin', group: 'System' },
  { key: 'audit.view', label: 'See the audit log', group: 'System' },
  { key: 'audit.export', label: 'Download the audit log', group: 'System' },
  { key: 'settings.view', label: 'See settings, jobs and storage', group: 'System' },
  { key: 'ops.jobs.run', label: 'Run scheduled jobs now and rebuild analytics', group: 'System' },
  { key: 'settings.manage', label: 'Change business settings and feature flags', group: 'System' },
  { key: 'settings.storage.manage', label: 'Delete stored files', group: 'System' },
  { key: 'settings.integrations.manage', label: 'Change payment, SMS and WhatsApp credentials', group: 'System' },
  { key: 'settings.notifications.manage', label: 'Edit notification templates', group: 'System' },

  // Staff
  { key: 'users.manage', label: 'Invite staff and change their access', group: 'Staff' },
  { key: 'users.view_as', label: 'View the admin as another role', group: 'Staff' },
] as const satisfies readonly PermissionMeta[];

export type PermissionKey = (typeof PERMISSIONS)[number]['key'];

export const ALL_PERMISSIONS: readonly PermissionKey[] = PERMISSIONS.map((entry) => entry.key);

const KNOWN = new Set<string>(ALL_PERMISSIONS);

export function isPermissionKey(value: unknown): value is PermissionKey {
  return typeof value === 'string' && KNOWN.has(value);
}

/**
 * Which admin section each group belongs to — the areas of the Admin
 * Portal a person can open at all. A person reaches a section if they hold
 * any permission in it.
 */
const SECTION_OF_GROUP: Record<PermissionGroup, AdminSection | null> = {
  'Orders & delivery': 'orders',
  'Catalogue & stock': 'orders',
  Money: 'finance',
  'Customers & marketing': 'marketing',
  Conversations: 'conversations',
  Machines: 'vending',
  'Machine stock & catalogue': 'vending',
  'Machine sales & owners': 'vending',
  'Manufacturers & integrations': 'vending',
  System: 'operations',
  Staff: null,
};

const META = new Map<string, PermissionMeta>(PERMISSIONS.map((entry) => [entry.key, entry]));

/** Permissions that work everywhere and open no section of their own. */
const SECTIONLESS: ReadonlySet<string> = new Set(['search.use']);

export function sectionOfPermission(key: PermissionKey): AdminSection | null {
  if (SECTIONLESS.has(key)) return null;
  const meta = META.get(key);
  return meta ? SECTION_OF_GROUP[meta.group] : null;
}

export function permissionLabel(key: string): string {
  return META.get(key)?.label ?? key;
}

/** Only a super admin gets these by default; anyone else must be given them one by one. */
export const SUPER_ADMIN_ONLY: readonly PermissionKey[] = [
  'orders.contents.edit',
  'payments.record_manual',
  'payments.reconcile',
  'marketing.discounts.manage',
  'marketing.messages.manage',
  'marketing.messages.send',
  'marketing.optouts.remove',
  'settings.integrations.manage',
  'settings.notifications.manage',
  'users.manage',
  'users.view_as',
  'integrations.credentials.manage',
];

export interface RoleTemplate {
  key: string;
  label: string;
  description: string;
  permissions: readonly PermissionKey[];
}

const except = (excluded: readonly PermissionKey[]) => ALL_PERMISSIONS.filter((key) => !excluded.includes(key));

const WAREHOUSE_PERMISSIONS: PermissionKey[] = [
  'orders.status.update',
  'orders.collect_payment',
  'orders.costs.record',
  'logistics.courier.book',
  'warehouse_fulfilment.manage',
  'products.view',
  'machines.view',
  'machines.status.manage',
  'machines.relocate',
  'machines.commands.issue',
  'machines.slots.toggle',
  'locations.view',
  'locations.manage',
  'alerts.view',
  'alerts.resolve',
  'cameras.view',
  'cameras.operate',
  'machine_catalog.manage',
  'machine_screen.manage',
  'machine_inventory.adjust',
  'restock.view',
  'restock.plan',
  'restock.execute',
  'analytics.vending.view',
  'recommendations.act',
  'sales.view',
  'integrations.view',
  'integrations.machines.maintenance',
];

const FINANCE_PERMISSIONS: PermissionKey[] = [
  'machines.view',
  'locations.view',
  'alerts.view',
  'alerts.resolve',
  'cameras.view',
  'cameras.operate',
  'analytics.vending.view',
  'sales.view',
  'sales.export',
  'sales.review.resolve',
  'sales.refund',
  'owners.view',
  'owner_finance.view',
];

// Support can look a machine sale up to answer a customer; deciding it or refunding stays with finance and admins.
const SUPPORT_PERMISSIONS: PermissionKey[] = ['support.conversations.handle', 'logistics.courier.book', 'sales.view'];

/**
 * The bundles people are given. The four that carry a role's name
 * (`admin`, `warehouse`, `finance`, `agent`) reproduce exactly what that
 * role could do before permissions existed, with three deliberate
 * exceptions:
 * - issuing manufacturer keys is super-admin only;
 * - warehouse no longer reads owner wallets and settlements;
 * - finance no longer edits locations.
 * The rest are narrower jobs a super admin can hand out.
 */
export const ROLE_TEMPLATES: readonly RoleTemplate[] = [
  { key: 'super_admin', label: 'Super admin', description: 'Everything, including staff access and credentials.', permissions: ALL_PERMISSIONS },
  { key: 'admin', label: 'Admin', description: 'Runs the whole business day to day. Not staff access, credentials or bulk marketing sends.', permissions: except(SUPER_ADMIN_ONLY) },
  {
    key: 'machine_operations',
    label: 'Machine operations',
    description: 'Runs the machine fleet: setup, catalogue, prices, stock, alerts. Not money or credentials.',
    permissions: [
      ...WAREHOUSE_PERMISSIONS.filter((key) => !key.startsWith('orders.') && key !== 'logistics.courier.book' && key !== 'warehouse_fulfilment.manage' && key !== 'products.view'),
      'products.view',
      'machines.create',
      'machines.credentials.manage',
      'machines.test_vend',
      'machines.slots.configure',
      'pricing.manage',
      'cameras.manage',
      'owners.view',
      'integrations.machines.configure',
      'integrations.machines.activate',
    ],
  },
  { key: 'warehouse', label: 'Warehouse', description: 'Packing, shopping runs and machine restocking.', permissions: WAREHOUSE_PERMISSIONS },
  { key: 'finance', label: 'Finance', description: 'Machine sales, refunds and owner money. Read-only on machines.', permissions: FINANCE_PERMISSIONS },
  { key: 'agent', label: 'Support', description: 'Customer conversations, courier bookings, and looking up machine sales.', permissions: SUPPORT_PERMISSIONS },
  {
    key: 'marketing',
    label: 'Marketing',
    description: 'Campaigns, creators, content and the machine screen. No prices, machines or money.',
    permissions: ['customers.view', 'creators.manage', 'marketing.campaigns.manage', 'marketing.optouts.manage', 'content.manage', 'analytics.spend.manage', 'products.view', 'machine_screen.manage', 'machines.view', 'search.use'],
  },
  {
    key: 'product_manager',
    label: 'Product manager',
    description: 'Boxes, snacks and recipes. No machines, prices or money.',
    permissions: ['products.view', 'products.manage', 'products.recipes.manage', 'products.snacks.manage', 'content.manage', 'orders.view', 'search.use'],
  },
];

export function findTemplate(key: string | null | undefined): RoleTemplate | null {
  return ROLE_TEMPLATES.find((template) => template.key === key) ?? null;
}

/** The template a role starts with when nobody has chosen one. */
export function defaultTemplateForRole(role: string): RoleTemplate | null {
  return findTemplate(role);
}

export interface PermissionSource {
  /** `users/{uid}.roles` — every role the account holds. */
  roles: readonly string[];
  /** A template chosen for this person; absent means "the one their role implies". */
  template?: string | null;
  granted?: readonly string[] | null;
  revoked?: readonly string[] | null;
  /**
   * The older way of narrowing an admin: the Admin Portal sections they may
   * open (`StaffProfile.permissions`). Still honoured for accounts nobody has
   * moved to a template, so no admin gains or loses access on upgrade.
   */
  legacySections?: readonly string[] | null;
}

/**
 * What a person may do: their template's permissions (or their roles'
 * defaults), narrowed to their legacy sections if they have any, plus
 * individual grants, minus individual removals. A super admin always has
 * everything.
 */
export function effectivePermissions(source: PermissionSource): PermissionKey[] {
  if (source.roles.includes('super_admin')) {
    return [...ALL_PERMISSIONS];
  }
  const chosen = findTemplate(source.template);
  let base: Set<PermissionKey>;
  if (chosen) {
    base = new Set(chosen.permissions);
  } else {
    base = new Set(source.roles.flatMap((role) => defaultTemplateForRole(role)?.permissions ?? []));
    const sections = (source.legacySections ?? []).filter(Boolean);
    if (sections.length > 0 && source.roles.includes('admin')) {
      for (const key of [...base]) {
        const section = sectionOfPermission(key);
        if (section !== null && !sections.includes(section)) base.delete(key);
      }
    }
  }
  for (const key of source.granted ?? []) if (isPermissionKey(key)) base.add(key);
  for (const key of source.revoked ?? []) if (isPermissionKey(key)) base.delete(key);
  return ALL_PERMISSIONS.filter((key) => base.has(key));
}

export interface PermissionHolder {
  roles: readonly string[];
  /** Admin sections (legacy narrowing), carried on the session. */
  permissions?: readonly string[];
  /** Computed when the session is verified; absent on sessions built elsewhere (tests, older code paths). */
  effectivePermissions?: readonly string[];
}

/** A holder's permissions: the list computed at sign-in, or their roles' defaults. */
export function effectivePermissionsOf(holder: PermissionHolder): PermissionKey[] {
  return (holder.effectivePermissions ?? effectivePermissions({ roles: holder.roles, legacySections: holder.permissions })).filter(isPermissionKey);
}

/** The one check every staff route makes. */
export function hasPermission(holder: PermissionHolder, key: PermissionKey): boolean {
  return effectivePermissionsOf(holder).includes(key);
}

export function hasAnyPermission(holder: PermissionHolder, keys: readonly PermissionKey[]): boolean {
  return keys.some((key) => hasPermission(holder, key));
}

/** Whether a person can open an admin section at all: they hold at least one permission that belongs to it. */
export function canOpenSection(holder: PermissionHolder, section: AdminSection): boolean {
  if (holder.roles.includes('super_admin') && !holder.effectivePermissions) return true;
  const granted = holder.effectivePermissions ?? effectivePermissions({ roles: holder.roles, legacySections: holder.permissions });
  return granted.some((key) => isPermissionKey(key) && sectionOfPermission(key) === section);
}

export function forbiddenForPermission(key: PermissionKey): Response {
  return Response.json({ error: 'forbidden', permission: key, message: `You don’t have permission to ${permissionLabel(key).toLowerCase()}.` }, { status: 403 });
}
