import Image from 'next/image';
import { FileText, Inbox } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { SubmissionStatusBadge } from '@/components/creator/SubmissionStatusBadge';
import { formatDate } from '@/lib/orders/format';
import type { CampaignSubmission, User } from '@/types';

interface SubmissionRow {
  id: string;
  data: CampaignSubmission;
  creator: User | null;
}

/**
 * Every creator's proof for one campaign (§ Admin: Campaigns
 * submissions) — the view this codebase never had: submission
 * moderation had a full `status`/`adminFeedback` schema with no admin
 * surface reading it at all. Read-only by design; approve/reject
 * actions aren't part of this pass.
 */
export function CampaignSubmissionsList({ submissions }: { submissions: SubmissionRow[] }) {
  if (submissions.length === 0) {
    return (
      <EmptyState
        icon={Inbox}
        title="No submissions yet"
        description="Creator proof for this campaign will show up here as it comes in."
      />
    );
  }

  return (
    <ul className="border-border divide-border bg-surface flex flex-col divide-y overflow-hidden rounded-lg border">
      {submissions.map(({ id, data, creator }) => (
        <li key={id} className="flex flex-col gap-3 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-foreground truncate font-medium">{creator?.displayName ?? `Creator ${data.creatorId}`}</p>
              <p className="text-muted-foreground truncate text-sm">{creator?.email ?? '—'}</p>
              <p className="text-muted-foreground mt-1 text-xs">
                {data.submissionType} · {formatDate(data.createdAt)}
              </p>
            </div>
            <div className="shrink-0">
              <SubmissionStatusBadge status={data.status} />
            </div>
          </div>

          {data.imageUrls.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {data.imageUrls.map((url) => (
                <a
                  key={url}
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  className="relative size-16 overflow-hidden rounded-md border border-border"
                >
                  <Image src={url} alt="" fill sizes="64px" className="object-cover" unoptimized />
                </a>
              ))}
            </div>
          ) : null}

          {data.documentUrl ? (
            <a
              href={data.documentUrl}
              target="_blank"
              rel="noreferrer"
              className="text-primary inline-flex w-fit items-center gap-1.5 text-sm font-medium hover:underline"
            >
              <FileText className="size-4" aria-hidden="true" />
              Document
            </a>
          ) : null}

          {data.socialLink ? (
            <a
              href={data.socialLink}
              target="_blank"
              rel="noreferrer"
              className="text-primary w-fit text-sm font-medium break-all hover:underline"
            >
              {data.socialLink}
            </a>
          ) : null}

          {data.notes ? <p className="text-foreground text-sm">{data.notes}</p> : null}

          {data.adminFeedback ? (
            <p className="text-muted-foreground border-border border-t pt-2 text-sm">{data.adminFeedback}</p>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
