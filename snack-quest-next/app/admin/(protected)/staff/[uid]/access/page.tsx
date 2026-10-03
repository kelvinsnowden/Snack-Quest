import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Check, Minus } from 'lucide-react';
import { requireStaffSession } from '@/lib/auth/session';
import { PERMISSION_GROUPS, ROLE_TEMPLATES, explainPermissions, findTemplate, type PermissionKey } from '@/lib/auth/permissions';
import { visibleAdminSections } from '@/lib/auth/adminSections';
import { groupedNavItems, visibleNavItems } from '@/components/admin/adminNav';
import { staffManagementService } from '@/services/staffManagementService';
import { staffRepository } from '@/repositories/staffRepository';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export const metadata: Metadata = { title: 'What can they do?' };

/** Permissions worth reading first: money, costs, prices, access and anything that reaches a machine. */
const SENSITIVE: { key: PermissionKey; plain: string }[] = [
  { key: 'products.cost.view', plain: 'See what Snack Quest pays for stock (landed cost)' },
  { key: 'products.cost.manage', plain: 'Change landed cost' },
  { key: 'products.wholesale.view', plain: 'See the prices owners pay for stock' },
  { key: 'pricing.manage', plain: 'Change machine selling prices' },
  { key: 'finance.view', plain: 'See revenue, withdrawals and reconciliation' },
  { key: 'finance.machine_pnl.view', plain: 'See machine profit and loss' },
  { key: 'sales.refund', plain: 'Refund machine sales' },
  { key: 'owner_finance.view', plain: 'See owners’ wallets and settlements' },
  { key: 'machines.economics.manage', plain: 'Change who owns a machine and on what terms' },
  { key: 'machines.commands.issue', plain: 'Send commands to machines' },
  { key: 'machines.credentials.manage', plain: 'Issue or revoke machine credentials' },
  { key: 'machines.service_codes.issue', plain: 'Issue on-site service codes' },
  { key: 'kiosk.publish', plain: 'Publish customer screen designs' },
  { key: 'advertising.review', plain: 'Approve ads to play on machines' },
  { key: 'users.manage', plain: 'Change anyone’s access' },
  { key: 'integrations.credentials.manage', plain: 'Issue manufacturer API keys' },
];

/**
 * § RBAC UI — "What can this person do?". Built from `explainPermissions`,
 * the same function family the server's permission checks use, so this
 * page can't say someone can do something the server would refuse (or the
 * reverse). `?template=` previews another template without saving.
 * The staff layout already requires `users.manage`.
 */
export default async function WhatCanTheyDoPage({ params, searchParams }: { params: Promise<{ uid: string }>; searchParams: Promise<{ template?: string }> }) {
  const session = await requireStaffSession();
  const { uid } = await params;
  const { template: previewKey } = await searchParams;
  const [member, profile] = await Promise.all([staffManagementService.getStaffMember(session.businessId, uid), staffRepository.findById(uid)]);
  if (!member || !profile) notFound();

  const preview = findTemplate(previewKey);
  const source = preview
    ? { roles: member.roles, template: preview.key }
    : { roles: member.roles, template: member.template, granted: member.grantedPermissions, revoked: member.revokedPermissions, legacySections: profile.permissions };
  const explained = explainPermissions(source);
  const effective = explained.rows.filter((row) => row.effective).map((row) => row.key);
  const sections = visibleAdminSections({ roles: member.roles as Parameters<typeof visibleAdminSections>[0]['roles'], permissions: preview ? [] : profile.permissions, effectivePermissions: effective });
  const pages = groupedNavItems(visibleNavItems(sections, effective));
  const byKey = new Map(explained.rows.map((row) => [row.key, row]));
  const originLabel = explained.origin === 'super_admin' ? 'Super admin — everything' : explained.origin === 'template' ? `Template: ${findTemplate(explained.templateKey)?.label}` : 'Their role’s default set';

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href={`/admin/staff/${encodeURIComponent(uid)}`} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" aria-hidden="true" />
          {member.displayName}
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-foreground">What can {member.displayName} do?</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {preview ? (
            <>
              Preview only — if they had the <strong>{preview.label}</strong> template and nothing else. Nothing is saved.{' '}
              <Link href={`/admin/staff/${encodeURIComponent(uid)}/access`} className="text-primary hover:underline">
                Back to their real access
              </Link>
            </>
          ) : (
            <>
              {originLabel} · {effective.length} permissions. This is exactly what the server checks.
            </>
          )}
        </p>
        <nav aria-label="Preview a template" className="mt-3 flex flex-wrap gap-2 text-sm">
          <span className="text-muted-foreground">Preview as:</span>
          {ROLE_TEMPLATES.map((template) => (
            <Link key={template.key} href={`/admin/staff/${encodeURIComponent(uid)}/access?template=${template.key}`} className={template.key === preview?.key ? 'font-semibold text-foreground' : 'text-primary hover:underline'}>
              {template.label}
            </Link>
          ))}
        </nav>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Money, costs and control</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="flex flex-col gap-2 text-sm">
            {SENSITIVE.map(({ key, plain }) => {
              const row = byKey.get(key);
              return (
                <li key={key} className="flex items-center gap-2">
                  {row?.effective ? <Check className="size-4 text-success" aria-label="Can" /> : <Minus className="size-4 text-muted-foreground" aria-label="Can’t" />}
                  <span className={row?.effective ? 'text-foreground' : 'text-muted-foreground'}>{plain}</span>
                  {row?.grantedDirectly ? <Badge variant="outline">given individually</Badge> : null}
                  {row?.removed ? <Badge variant="outline">removed individually</Badge> : null}
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Pages in their menu</CardTitle>
        </CardHeader>
        <CardContent>
          {pages.length === 0 ? (
            <p className="text-sm text-muted-foreground">No admin pages.</p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {pages.map(({ group, items }) => (
                <div key={group}>
                  <p className="text-caption font-semibold uppercase tracking-wide text-muted-foreground">{group}</p>
                  <ul className="mt-1 text-sm">
                    {items.map((item) => (
                      <li key={item.href}>{item.label}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Every permission, and why</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-caption uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-2">Permission</th>
                <th className="px-4 py-2">From template</th>
                <th className="px-4 py-2">Given individually</th>
                <th className="px-4 py-2">Removed individually</th>
                <th className="px-4 py-2">Has it</th>
              </tr>
            </thead>
            {PERMISSION_GROUPS.map((group) => {
              const rows = explained.rows.filter((row) => row.group === group);
              if (rows.length === 0) return null;
              return (
                <tbody key={group}>
                  <tr className="bg-muted/10">
                    <th colSpan={5} className="px-4 py-2 text-left text-caption font-semibold uppercase tracking-wide text-muted-foreground">
                      {group}
                    </th>
                  </tr>
                  {rows.map((row) => (
                    <tr key={row.key} className="border-b border-border last:border-0">
                      <td className="px-4 py-2">
                        {row.label}
                        <span className="block font-mono text-caption text-muted-foreground">{row.key}</span>
                      </td>
                      <td className="px-4 py-2">{row.superAdmin ? 'super admin' : row.fromTemplate ? 'yes' : '—'}</td>
                      <td className="px-4 py-2">{row.grantedDirectly ? 'yes' : '—'}</td>
                      <td className="px-4 py-2">{row.removed ? 'yes' : '—'}</td>
                      <td className="px-4 py-2 font-medium">{row.effective ? 'Yes' : 'No'}</td>
                    </tr>
                  ))}
                </tbody>
              );
            })}
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
