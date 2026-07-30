import React from 'react';
import { MessageCircle, Mail } from 'lucide-react';
import { formatWhatsAppUrl } from '../../../lib/attributionTracker';

export const SupportView: React.FC = () => (
  <div className="space-y-8 max-w-xl">
    <h1 className="text-creator-section-title font-bold text-creator-ink">Support</h1>
    <p className="text-creator-caption text-creator-ink-muted">
      Questions about a payout, a campaign, or your account? Reach the Snack Quest creator team directly.
    </p>

    <div className="grid sm:grid-cols-2 gap-4">
      <a
        href={formatWhatsAppUrl(undefined, 'Hi Snack Quest! I have a question about my Creator Portal account.')}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-3 p-5 rounded-creator-card-lg bg-creator-surface border border-creator-border hover:border-creator-success/40 hover:bg-creator-surface-hover transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-creator-success/50"
      >
        <span className="w-10 h-10 rounded-creator-control bg-creator-success/10 border border-creator-success/30 flex items-center justify-center shrink-0">
          <MessageCircle className="h-4 w-4 text-creator-success" aria-hidden="true" />
        </span>
        <span>
          <span className="block text-creator-body font-semibold text-creator-ink">WhatsApp</span>
          <span className="block text-creator-caption text-creator-ink-muted">Fastest response, usually under an hour</span>
        </span>
      </a>

      <a
        href="mailto:creators@snackquests.shop"
        className="flex items-center gap-3 p-5 rounded-creator-card-lg bg-creator-surface border border-creator-border hover:border-creator-brand/40 hover:bg-creator-surface-hover transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-creator-brand/50"
      >
        <span className="w-10 h-10 rounded-creator-control bg-creator-brand/10 border border-creator-brand/30 flex items-center justify-center shrink-0">
          <Mail className="h-4 w-4 text-creator-brand" aria-hidden="true" />
        </span>
        <span>
          <span className="block text-creator-body font-semibold text-creator-ink">Email</span>
          <span className="block text-creator-caption text-creator-ink-muted">creators@snackquests.shop</span>
        </span>
      </a>
    </div>
  </div>
);
