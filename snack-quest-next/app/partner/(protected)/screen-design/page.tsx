import type { Metadata } from 'next';
import { requirePartnerSession } from '@/lib/auth/partnerSession';
import { kioskOwnerDesignService } from '@/services/kioskOwnerDesignService';
import { KioskDesigner } from '@/components/admin/vending/KioskDesigner';

export const metadata: Metadata = { title: 'Screen design' };

/**
 * An owner's design for their own machines' customer screen (§ OWNER
 * SCREEN DESIGN): colours, menu layout, badges, wording and languages.
 * Saving keeps it as a proposal; Snack Quest reviews it before any
 * machine shows it.
 */
export default async function PartnerScreenDesignPage() {
  const session = await requirePartnerSession();
  const state = await kioskOwnerDesignService.ownerState(session.businessId, session.partnerId);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Screen design</h1>
        <p className="max-w-prose text-sm text-muted-foreground">How your machines’ screens look to customers. Change the colours, menu, badges and wording, check the preview, then send it to Snack Quest. It goes on your machines once it’s accepted.</p>
      </div>
      <KioskDesigner
        scope="owner"
        scopeId={session.partnerId}
        initialDraft={state.editing}
        inherited={state.base}
        versions={[]}
        liveVersionNumber={null}
        previewMachines={state.machines}
        canDesign
        canPublish={false}
        owner={{ status: state.proposal?.status ?? null, reviewNote: state.proposal?.reviewNote ?? null }}
      />
    </div>
  );
}
