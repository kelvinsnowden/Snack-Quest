import React, { useCallback, useEffect, useState } from 'react';
import { CreatorAuthGate } from '../creator/CreatorAuthGate';
import { CreatorShell } from '../creator/CreatorShell';
import { WithdrawModal } from '../creator/WithdrawModal';
import { SubmitDeliverableModal } from '../creator/SubmitDeliverableModal';
import {
  CreatorAccount,
  Campaign,
  CampaignSubmission,
  WithdrawalRecord,
  clearStoredCreator,
  loadStoredCreator,
  storeCreator,
  fetchCampaigns,
  fetchCampaignSubmissions,
  fetchWithdrawalHistory
} from '../creator/creatorApi';

export const CreatorPortal: React.FC = () => {
  const [creator, setCreator] = useState<CreatorAccount | null>(() => loadStoredCreator());
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [submissions, setSubmissions] = useState<CampaignSubmission[]>([]);
  const [withdrawals, setWithdrawals] = useState<WithdrawalRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [submitCampaign, setSubmitCampaign] = useState<Campaign | null>(null);

  const loadExtras = useCallback(async (creatorId: string) => {
    setLoading(true);
    setError(null);
    try {
      const [campaignsData, submissionsData, withdrawalsData] = await Promise.all([
        fetchCampaigns(),
        fetchCampaignSubmissions(creatorId),
        fetchWithdrawalHistory(creatorId)
      ]);
      setCampaigns(campaignsData);
      setSubmissions(submissionsData);
      setWithdrawals(withdrawalsData);
    } catch (err: any) {
      setError(err.message || 'Something went wrong loading your data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (creator) loadExtras(creator.id);
  }, [creator?.id, loadExtras]);

  const handleSignOut = () => {
    clearStoredCreator();
    setCreator(null);
  };

  const handleCreatorUpdated = (updated: CreatorAccount) => {
    storeCreator(updated);
    setCreator(updated);
  };

  if (!creator) {
    return <CreatorAuthGate onAuthenticated={setCreator} />;
  }

  return (
    <div className="min-h-screen bg-creator-canvas text-creator-ink font-sans antialiased">
      <CreatorShell
        creator={creator}
        campaigns={campaigns}
        submissions={submissions}
        withdrawals={withdrawals}
        loading={loading}
        error={error}
        onRetry={() => loadExtras(creator.id)}
        onSignOut={handleSignOut}
        onCreatorUpdated={handleCreatorUpdated}
        onOpenWithdraw={() => setWithdrawOpen(true)}
        onOpenSubmit={(campaign) => setSubmitCampaign(campaign)}
      />
      <WithdrawModal
        isOpen={withdrawOpen}
        onClose={() => setWithdrawOpen(false)}
        creatorId={creator.id}
        availableCashKes={creator.available_cash}
        defaultPhone={creator.whatsapp_number}
        onSuccess={() => loadExtras(creator.id)}
      />
      <SubmitDeliverableModal
        campaign={submitCampaign}
        creator={creator}
        onClose={() => setSubmitCampaign(null)}
        onSuccess={() => loadExtras(creator.id)}
      />
    </div>
  );
};
