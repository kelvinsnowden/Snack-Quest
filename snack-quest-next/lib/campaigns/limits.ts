/**
 * Campaign attachment caps (§ campaign attachments) — plain constants,
 * deliberately outside `services/campaignService.ts` (which carries
 * `import 'server-only'`) so client components like `CampaignForm` and
 * `SubmitDeliverableDialog` can import them directly without pulling a
 * server-only module into the client bundle. `campaignService.ts`
 * re-exports both for server-side callers/tests.
 */
export const MAX_CAMPAIGN_IMAGES = 5;
export const MAX_SUBMISSION_IMAGES = 3;
