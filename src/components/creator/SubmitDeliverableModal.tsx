import React, { useState } from 'react';
import { Modal } from '../common/Modal';
import { FormField } from '../common/FormField';
import { useApp } from '../../context/AppContext';
import { Campaign, CreatorAccount, submitCampaignDeliverable } from './creatorApi';

interface SubmitDeliverableModalProps {
  campaign: Campaign | null;
  creator: CreatorAccount;
  onClose: () => void;
  onSuccess: () => void;
}

const SUBMISSION_TYPES: { value: 'image' | 'video' | 'document' | 'social_link'; label: string }[] = [
  { value: 'social_link', label: 'Social post link' },
  { value: 'image', label: 'Image proof' },
  { value: 'video', label: 'Video proof' },
  { value: 'document', label: 'Document' }
];

export const SubmitDeliverableModal: React.FC<SubmitDeliverableModalProps> = ({ campaign, creator, onClose, onSuccess }) => {
  const { addToast } = useApp();
  const [submissionType, setSubmissionType] = useState<'image' | 'video' | 'document' | 'social_link'>('social_link');
  const [link, setLink] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!campaign) return null;

  const isLinkBased = submissionType === 'social_link';

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      await submitCampaignDeliverable({
        campaign_id: campaign.id,
        creator_id: creator.id,
        creator_name: creator.display_name,
        submission_type: submissionType,
        social_link: isLinkBased ? link : undefined,
        file_url: !isLinkBased ? link : undefined,
        notes
      });
      addToast({ type: 'success', title: 'Submitted', message: `Your deliverable for "${campaign.title}" is in for review.` });
      onSuccess();
      onClose();
    } catch (err: any) {
      addToast({ type: 'error', title: 'Submission failed', message: err.message || 'Please try again.' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal isOpen={!!campaign} onClose={onClose} title="Submit deliverable" description={campaign.title}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <FormField
          as="select"
          label="Submission type"
          value={submissionType}
          onChange={(e) => setSubmissionType((e.target as HTMLSelectElement).value as typeof submissionType)}
        >
          {SUBMISSION_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </FormField>
        <FormField
          label={isLinkBased ? 'Social post URL' : 'File URL'}
          type="url"
          required
          placeholder="https://..."
          value={link}
          onChange={(e) => setLink((e.target as HTMLInputElement).value)}
        />
        <FormField
          as="textarea"
          label="Notes (optional)"
          value={notes}
          onChange={(e) => setNotes((e.target as HTMLTextAreaElement).value)}
        />
        <div className="flex gap-3 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 rounded-creator-control border border-creator-border text-creator-ink-muted hover:text-creator-ink hover:bg-creator-surface-hover text-creator-body font-semibold transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting || !link.trim()}
            className="flex-1 py-2.5 rounded-creator-control bg-creator-brand hover:bg-creator-brand-strong text-creator-brand-ink font-bold text-creator-body transition-colors disabled:opacity-50"
          >
            {submitting ? 'Submitting…' : 'Submit'}
          </button>
        </div>
      </form>
    </Modal>
  );
};
