'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

const SUBMISSION_TYPES = [
  { value: 'social_post', label: 'Social post' },
  { value: 'video', label: 'Video' },
  { value: 'photo', label: 'Photo' },
  { value: 'story', label: 'Story' },
  { value: 'other', label: 'Other' },
];

/** A creator submitting proof of a campaign deliverable (§ Creator Portal campaigns browse). */
export function SubmitDeliverableDialog({ campaignId, campaignTitle }: { campaignId: string; campaignTitle: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [submissionType, setSubmissionType] = useState(SUBMISSION_TYPES[0].value);
  const [socialLink, setSocialLink] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setSubmissionType(SUBMISSION_TYPES[0].value);
    setSocialLink('');
    setNotes('');
    setError(null);
  }

  async function onSubmit() {
    if (!socialLink.trim() && !notes.trim()) {
      setError('Add a link to your post or a note describing what you submitted.');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch('/api/creator/campaign-submissions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          campaignId,
          submissionType,
          socialLink: socialLink.trim() || null,
          notes: notes.trim(),
        }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? 'Could not submit your deliverable.');
      }
      setOpen(false);
      reset();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not submit your deliverable.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm">
          <Send aria-hidden="true" />
          Submit
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Submit deliverable</DialogTitle>
          <DialogDescription>{campaignTitle} — proof gets reviewed before it&apos;s approved.</DialogDescription>
        </DialogHeader>

        <div className="mt-4 flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="submissionType">Type</Label>
            <select
              id="submissionType"
              value={submissionType}
              onChange={(event) => setSubmissionType(event.target.value)}
              className="flex h-10 w-full rounded-md border border-border bg-surface px-3 text-sm text-foreground shadow-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              {SUBMISSION_TYPES.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="socialLink">Link to your post</Label>
            <Input
              id="socialLink"
              value={socialLink}
              onChange={(event) => setSocialLink(event.target.value)}
              placeholder="https://instagram.com/p/..."
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="notes">
              Notes <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Textarea id="notes" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Anything else the reviewer should know" />
          </div>

          {error ? <p className="text-sm text-danger">{error}</p> : null}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={onSubmit} loading={submitting}>
            Submit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
