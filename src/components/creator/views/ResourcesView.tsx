import React from 'react';
import { Rocket, FileCheck2, Banknote, Palette, MessageCircle } from 'lucide-react';
import { formatWhatsAppUrl } from '../../../lib/attributionTracker';

interface ResourceSection {
  icon: React.ElementType;
  title: string;
  items: string[];
}

const SECTIONS: ResourceSection[] = [
  {
    icon: Rocket,
    title: 'Getting started',
    items: [
      'Campaign opportunities are shared with you directly — check the Campaigns tab for anything already assigned to you.',
      'Every submission you make is reviewed before it counts toward your earnings; status shows as pending, approved, or rejected.',
      'Your tier (see Achievements) is based on lifetime earnings and referral conversions, and unlocks better commission multipliers.'
    ]
  },
  {
    icon: FileCheck2,
    title: 'Content guidelines',
    items: [
      'Show the product clearly and honestly — no misleading claims about ingredients, pricing, or delivery.',
      'Disclose the partnership (e.g. "#ad" or "Snack Quest partner") wherever the platform you post on requires it.',
      'Keep your referral link or code visible and correct in the caption or bio for the submission to be attributed to you.'
    ]
  },
  {
    icon: Banknote,
    title: 'Payouts',
    items: [
      'Withdrawals go out via M-Pesa to the number you enter on the withdrawal form — double-check it before confirming.',
      'Requests move from pending to paid once processed; you can track status any time in the Payments tab.',
      'There is a minimum withdrawal amount — the form will tell you if your request is below it.'
    ]
  },
  {
    icon: Palette,
    title: 'Brand assets',
    items: [
      "Logo files, packaging shots, and approved brand colors aren't available for self-serve download yet.",
      'Reach out via Support and the team will send over whatever you need for a specific campaign.'
    ]
  }
];

export const ResourcesView: React.FC = () => (
  <div className="space-y-8 max-w-2xl">
    <div>
      <h1 className="text-creator-section-title font-bold text-creator-ink">Resources</h1>
      <p className="text-creator-caption text-creator-ink-muted mt-1">Everything you need to know to run a great campaign.</p>
    </div>

    <div className="space-y-4">
      {SECTIONS.map(({ icon: Icon, title, items }) => (
        <section key={title} className="bg-creator-surface border border-creator-border rounded-creator-card-lg p-6">
          <div className="flex items-center gap-2.5 mb-4">
            <Icon className="h-4 w-4 text-creator-brand" aria-hidden="true" />
            <h2 className="text-creator-body font-bold text-creator-ink">{title}</h2>
          </div>
          <ul className="space-y-2.5">
            {items.map((item) => (
              <li key={item} className="text-creator-caption text-creator-ink-muted pl-4 relative before:content-['·'] before:absolute before:left-0 before:text-creator-ink-faint before:font-bold">
                {item}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>

    <a
      href={formatWhatsAppUrl(undefined, "Hi Snack Quest! I have a question that isn't covered in the Creator Portal resources.")}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-3 p-5 rounded-creator-card-lg bg-creator-surface border border-creator-border hover:border-creator-success/40 hover:bg-creator-surface-hover transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-creator-success/50"
    >
      <span className="w-10 h-10 rounded-creator-control bg-creator-success/10 border border-creator-success/30 flex items-center justify-center shrink-0">
        <MessageCircle className="h-4 w-4 text-creator-success" aria-hidden="true" />
      </span>
      <span>
        <span className="block text-creator-body font-semibold text-creator-ink">Still have a question?</span>
        <span className="block text-creator-caption text-creator-ink-muted">Message the creator team on WhatsApp</span>
      </span>
    </a>
  </div>
);
