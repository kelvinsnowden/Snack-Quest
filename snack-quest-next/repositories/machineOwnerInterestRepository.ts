import 'server-only';

import { FieldValue } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase/admin';
import type { MachineOwnerInterest } from '@/types/machineOwnerInterest';

const COLLECTION = 'machineOwnerInterests';

export type MachineOwnerInterestInput = Omit<MachineOwnerInterest, 'createdAt' | 'updatedAt' | 'status'>;

class MachineOwnerInterestRepository {
  async create(input: MachineOwnerInterestInput): Promise<string> {
    const now = FieldValue.serverTimestamp();
    const ref = await adminFirestore.collection(COLLECTION).add({
      ...input,
      status: 'new',
      createdAt: now,
      updatedAt: now,
    });
    return ref.id;
  }

  /** Same duplicate-window logic as `investorInterestRepository.findRecentByEmail`, matched on WhatsApp number instead — the one field every applicant has, unlike email which is optional here. */
  async findRecentByWhatsapp(whatsapp: string, since: Date): Promise<{ id: string } | null> {
    const snapshot = await adminFirestore
      .collection(COLLECTION)
      .where('whatsapp', '==', whatsapp)
      .where('createdAt', '>=', since)
      .limit(1)
      .get();
    const doc = snapshot.docs[0];
    return doc ? { id: doc.id } : null;
  }

  /** How many submissions came from one origin recently — the counter behind the rate limit. */
  async countSince(submitterHash: string, since: Date): Promise<number> {
    const snapshot = await adminFirestore
      .collection(COLLECTION)
      .where('submitterHash', '==', submitterHash)
      .where('createdAt', '>=', since)
      .count()
      .get();
    return snapshot.data().count;
  }
}

export const machineOwnerInterestRepository = new MachineOwnerInterestRepository();
export { MachineOwnerInterestRepository };
