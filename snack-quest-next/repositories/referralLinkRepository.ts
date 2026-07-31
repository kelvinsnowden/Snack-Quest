import 'server-only';

import { adminFirestore } from '@/lib/firebase/admin';
import type { ReferralLink } from '@/types';

const COLLECTION = 'referralLinks';

class ReferralLinkRepository {
  async findByCode(code: string): Promise<{ id: string; data: ReferralLink } | null> {
    const snapshot = await adminFirestore
      .collection(COLLECTION)
      .where('code', '==', code)
      .where('isActive', '==', true)
      .limit(1)
      .get();
    if (snapshot.empty) {
      return null;
    }
    const doc = snapshot.docs[0];
    return { id: doc.id, data: doc.data() as ReferralLink };
  }
}

export const referralLinkRepository = new ReferralLinkRepository();
