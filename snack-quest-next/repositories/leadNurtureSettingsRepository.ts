import 'server-only';

import { FieldValue } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase/admin';
import type { NurtureEmail } from '@/lib/leads/nurtureSequence';

/** `leadNurtureSettings/{businessId}` — the email sequence as edited in the admin (§ lead nurture). */
const COLLECTION = 'leadNurtureSettings';

export interface LeadNurtureSettings {
  emails: NurtureEmail[];
  updatedByName: string | null;
}

class LeadNurtureSettingsRepository {
  async find(businessId: string): Promise<LeadNurtureSettings | null> {
    const snapshot = await adminFirestore.collection(COLLECTION).doc(businessId).get();
    return snapshot.exists ? (snapshot.data() as LeadNurtureSettings) : null;
  }

  async save(businessId: string, emails: NurtureEmail[], updatedByName: string | null): Promise<void> {
    await adminFirestore
      .collection(COLLECTION)
      .doc(businessId)
      .set({ emails, updatedByName, updatedAt: FieldValue.serverTimestamp() });
  }
}

export const leadNurtureSettingsRepository = new LeadNurtureSettingsRepository();
