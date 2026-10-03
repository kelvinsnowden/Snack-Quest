export interface CredentialHistoryEntry {
  id: string;
  action: string;
  entityId: string;
  actorId: string;
  at: string | null;
  after: Record<string, unknown> | null;
}

const ACTION_LABELS: Record<string, string> = {
  issue_integration_credential: 'Issued signing key',
  rotate_integration_credential: 'Rotated signing key',
  revoke_integration_credential: 'Revoked signing key',
  set_manufacturer_api_credential: 'Set API key',
  rotate_manufacturer_api_credential: 'Rotated API key',
  roll_back_manufacturer_api_credential: 'Rolled back API key',
  revoke_manufacturer_api_credential: 'Revoked API key',
};

/** Who changed which credential, when — from the audit log. Never contains a secret: entries record key ids and fingerprints only. */
export function CredentialHistory({ entries }: { entries: CredentialHistoryEntry[] }) {
  if (entries.length === 0) {
    return <p className="text-sm text-muted-foreground">No credential changes recorded yet.</p>;
  }
  return (
    <ol className="flex flex-col divide-y divide-border text-sm">
      {entries.map((entry) => (
        <li key={entry.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
          <span>
            <span className="font-medium">{ACTION_LABELS[entry.action] ?? entry.action}</span>{' '}
            <code className="font-mono text-xs text-muted-foreground">{entry.entityId}</code>
            {typeof entry.after?.reason === 'string' ? <span className="text-muted-foreground"> — {entry.after.reason}</span> : null}
          </span>
          <span className="text-muted-foreground">
            {entry.at ? new Date(entry.at).toLocaleString('en-KE', { dateStyle: 'medium', timeStyle: 'short' }) : '—'} · {entry.actorId}
          </span>
        </li>
      ))}
    </ol>
  );
}
