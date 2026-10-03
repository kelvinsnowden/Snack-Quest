'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, CheckCircle2, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PERMISSIONS, PERMISSION_GROUPS, ROLE_TEMPLATES, effectivePermissions, permissionLabel, type PermissionKey } from '@/lib/auth/permissions';

export interface AccessEditorMember {
  uid: string;
  displayName: string;
  roles: string[];
  template: string | null;
  grantedPermissions: string[];
  revokedPermissions: string[];
  /** The older section narrowing, still honoured when no template is chosen. */
  legacySections: string[];
}

/**
 * What one person may do. Pick a starting template, then tick or untick
 * single permissions. A tick that differs from the template is an
 * individual grant or removal, labelled as such, so it's always clear
 * why someone can do something. Nothing is saved until the summary of
 * changes has been read and confirmed.
 */
export function AccessEditor({ member, editorPermissions, canEdit, readOnlyReason }: { member: AccessEditorMember; editorPermissions: string[]; canEdit: boolean; readOnlyReason: string | null }) {
  const router = useRouter();
  const [template, setTemplate] = useState<string | null>(member.template);
  const [granted, setGranted] = useState<Set<string>>(new Set(member.grantedPermissions));
  const [revoked, setRevoked] = useState<Set<string>>(new Set(member.revokedPermissions));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const base = useMemo(
    () => new Set<string>(effectivePermissions({ roles: member.roles, template, legacySections: template === null ? member.legacySections : [] })),
    [member.roles, member.legacySections, template],
  );
  const current = useMemo(() => {
    const result = new Set(base);
    granted.forEach((key) => result.add(key));
    revoked.forEach((key) => result.delete(key));
    return result;
  }, [base, granted, revoked]);
  const original = useMemo(
    () => new Set<string>(effectivePermissions({ roles: member.roles, template: member.template, granted: member.grantedPermissions, revoked: member.revokedPermissions, legacySections: member.legacySections })),
    [member],
  );
  const added = [...current].filter((key) => !original.has(key));
  const removed = [...original].filter((key) => !current.has(key));
  const changed = added.length > 0 || removed.length > 0 || template !== member.template;
  const editorHas = new Set(editorPermissions);

  function changeTemplate(next: string | null) {
    setTemplate(next);
    // Individual changes are relative to a template; start clean on a new one.
    setGranted(new Set());
    setRevoked(new Set());
    setSaved(null);
  }

  function toggle(key: string, on: boolean) {
    setSaved(null);
    const nextGranted = new Set(granted);
    const nextRevoked = new Set(revoked);
    if (base.has(key)) {
      if (on) nextRevoked.delete(key);
      else nextRevoked.add(key);
    } else if (on) nextGranted.add(key);
    else nextGranted.delete(key);
    setGranted(nextGranted);
    setRevoked(nextRevoked);
  }

  function toggleGroup(keys: string[], on: boolean) {
    setSaved(null);
    const nextGranted = new Set(granted);
    const nextRevoked = new Set(revoked);
    for (const key of keys) {
      if (on && !base.has(key) && !editorHas.has(key)) continue;
      if (base.has(key)) {
        if (on) nextRevoked.delete(key);
        else nextRevoked.add(key);
      } else if (on) nextGranted.add(key);
      else nextGranted.delete(key);
    }
    setGranted(nextGranted);
    setRevoked(nextRevoked);
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/staff/${encodeURIComponent(member.uid)}/access`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ template, granted: [...granted], revoked: [...revoked] }),
      });
      const data = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(data?.error ?? `Couldn't save (HTTP ${response.status}).`);
      setSaved(`Saved. ${member.displayName}'s access changes on their next page load.`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save.");
    } finally {
      setBusy(false);
    }
  }

  const templateInfo = ROLE_TEMPLATES.find((entry) => entry.key === template) ?? null;
  const defaultLabel = `Default for their role (${member.roles.filter((role) => role !== 'customer' && role !== 'creator').join(', ') || 'none'})`;

  return (
    <div className="flex flex-col gap-6">
      {!canEdit && readOnlyReason ? <p className="rounded-lg bg-border/30 px-4 py-3 text-sm text-foreground">{readOnlyReason}</p> : null}

      <section className="flex flex-col gap-2">
        <label htmlFor="template" className="text-sm font-medium text-foreground">Starting point</label>
        <select
          id="template"
          value={template ?? ''}
          disabled={!canEdit || busy}
          onChange={(event) => changeTemplate(event.target.value || null)}
          className="h-10 max-w-md rounded-lg border border-border bg-background px-3 text-sm disabled:opacity-60"
        >
          <option value="">{defaultLabel}</option>
          {ROLE_TEMPLATES.filter((entry) => entry.key !== 'super_admin').map((entry) => (
            <option key={entry.key} value={entry.key}>{entry.label}</option>
          ))}
        </select>
        <p className="max-w-2xl text-sm text-muted-foreground">
          {templateInfo ? templateInfo.description : member.legacySections.length > 0 ? `Their role's permissions, limited to the admin areas they were given before: ${member.legacySections.join(', ')}.` : 'Everything their role could always do.'}{' '}
          {current.size} of {PERMISSIONS.length} permissions.
        </p>
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {PERMISSION_GROUPS.map((group) => {
          const entries = PERMISSIONS.filter((entry) => entry.group === group);
          const keys = entries.map((entry) => entry.key as string);
          const onCount = keys.filter((key) => current.has(key)).length;
          return (
            <fieldset key={group} className="rounded-lg border border-border p-4">
              <legend className="flex w-full items-center justify-between gap-2 px-1 text-sm font-semibold text-foreground">
                <span>
                  {group} <span className="font-normal text-muted-foreground">({onCount}/{keys.length})</span>
                </span>
              </legend>
              {canEdit ? (
                <div className="mb-2 flex gap-3 text-xs">
                  <button type="button" className="text-primary hover:underline disabled:opacity-50" disabled={busy} onClick={() => toggleGroup(keys, true)}>All</button>
                  <button type="button" className="text-primary hover:underline disabled:opacity-50" disabled={busy} onClick={() => toggleGroup(keys, false)}>None</button>
                </div>
              ) : null}
              <ul className="flex flex-col gap-1.5">
                {entries.map(({ key, label }) => {
                  const on = current.has(key);
                  const fromBase = base.has(key);
                  const locked = !canEdit || busy || (!on && !fromBase && !editorHas.has(key));
                  const tag = granted.has(key) ? 'added' : revoked.has(key) ? 'removed' : null;
                  return (
                    <li key={key}>
                      <label className={`flex items-start gap-2 text-sm ${locked && !on ? 'text-muted-foreground' : 'text-foreground'}`}>
                        <input type="checkbox" className="mt-0.5 size-4 accent-[var(--color-primary)]" checked={on} disabled={locked} onChange={(event) => toggle(key, event.target.checked)} />
                        <span className="flex flex-1 flex-wrap items-center gap-1.5">
                          {label}
                          {tag === 'added' ? <Badge variant="success">added</Badge> : null}
                          {tag === 'removed' ? <Badge variant="danger">removed</Badge> : null}
                          {!on && !fromBase && !editorHas.has(key) && canEdit ? (
                            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                              <Lock className="size-3" aria-hidden="true" />
                              you don’t have this
                            </span>
                          ) : null}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </fieldset>
          );
        })}
      </div>

      {canEdit ? (
        <section className="sticky bottom-0 flex flex-col gap-3 rounded-lg border border-border bg-surface p-4 shadow-sm">
          {changed ? (
            <div className="flex flex-col gap-1 text-sm">
              {template !== member.template ? <p className="text-foreground">Starting point: {ROLE_TEMPLATES.find((entry) => entry.key === member.template)?.label ?? 'role default'} → {templateInfo?.label ?? 'role default'}</p> : null}
              {added.length > 0 ? <p className="text-success">Will be able to: {added.map((key) => permissionLabel(key as PermissionKey).toLowerCase()).join('; ')}</p> : null}
              {removed.length > 0 ? <p className="text-danger">Will no longer be able to: {removed.map((key) => permissionLabel(key as PermissionKey).toLowerCase()).join('; ')}</p> : null}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No changes.</p>
          )}
          {error ? (
            <p role="alert" className="flex items-start gap-2 text-sm text-danger">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              {error}
            </p>
          ) : null}
          {saved ? (
            <p role="status" className="flex items-start gap-2 text-sm text-success">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              {saved}
            </p>
          ) : null}
          <div className="flex gap-2">
            <Button onClick={save} loading={busy} disabled={!changed}>Save access</Button>
            <Button
              variant="outline"
              disabled={!changed || busy}
              onClick={() => {
                setTemplate(member.template);
                setGranted(new Set(member.grantedPermissions));
                setRevoked(new Set(member.revokedPermissions));
                setError(null);
              }}
            >
              Undo changes
            </Button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
