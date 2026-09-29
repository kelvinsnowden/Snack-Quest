import 'server-only';

import { userRepository } from '@/repositories/userRepository';
import type { AuditLog } from '@/types';

/** Display names for the people in a list of audit entries. */
export async function actorNamesFor(logs: { data: AuditLog }[]): Promise<Map<string, string>> {
  const ids = Array.from(new Set(logs.map(({ data }) => data.actorId).filter((id) => id !== 'system')));
  const users = await Promise.all(ids.map((id) => userRepository.findById(id)));
  return new Map(ids.map((id, index) => [id, users[index]?.displayName ?? id]));
}
